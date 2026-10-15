import { createClient } from '@supabase/supabase-js';
import { saleTotal, parseDiscount } from '../lib/sales';

// Supabase reports errors in English; translate the ones the owner can run into.
const MESSAGES = {
  'Invalid login credentials': 'E-mail ou senha incorretos',
  'Email not confirmed': 'E-mail ainda não confirmado',
  'Failed to fetch': 'Sem conexão com o servidor — verifique a internet',
  'TypeError: Failed to fetch': 'Sem conexão com o servidor — verifique a internet',
};

// Missing column / function: the site is newer than the database.
const OUTDATED_SCHEMA = new Set(['42703', '42883', 'PGRST202', 'PGRST204']);

function toError(error) {
  if (OUTDATED_SCHEMA.has(error.code)) {
    return new Error(`O banco de dados está desatualizado — rode os arquivos novos de db/migrations/ no Supabase. (${error.message})`);
  }
  return new Error(MESSAGES[error.message] || error.message);
}

function unwrap({ data, error }) {
  if (error) throw toError(error);
  return data;
}

function toSession(session) {
  return session ? { user: { id: session.user.id, email: session.user.email } } : null;
}

// Supabase caps a response at 1000 rows by default, so lists are fetched page by page.
const PAGE_SIZE = 1000;

// Sales history order (docs/api-contract.md); `id` last keeps paging stable.
const SALES_ORDER = [['sale_date', false], ['sold_at', false], ['created_at', false]];

function ordered(query, order) {
  for (const [column, ascending] of order) query = query.order(column, { ascending, nullsFirst: false });
  return query.order('id');
}

function crud(client, table, order) {
  return {
    list: async () => {
      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const query = ordered(client.from(table).select('*'), order);
        const page = unwrap(await query.range(from, from + PAGE_SIZE - 1));
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    },
    create: async row => unwrap(await client.from(table).insert(row).select().single()),
    update: async (id, row) => unwrap(await client.from(table).update(row).eq('id', id).select().single()),
    remove: async id => { unwrap(await client.from(table).delete().eq('id', id)); },
  };
}

export function createSupabaseProvider() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY — copy client/.env.example to client/.env');
  }
  const client = createClient(url, key);

  const sales = crud(client, 'sales', SALES_ORDER);

  async function countSales({ buyerId, after } = {}) {
    let query = client.from('sales').select('id', { count: 'exact', head: true });
    if (buyerId) query = query.eq('buyer_id', buyerId);
    if (after) query = query.gt('sale_date', after);
    const { count, error } = await query;
    if (error) throw toError(error);
    return count;
  }

  return {
    auth: {
      getSession: async () => toSession(unwrap(await client.auth.getSession()).session),
      onChange: callback => {
        const { data } = client.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
        return () => data.subscription.unsubscribe();
      },
      signIn: async (email, password) => {
        unwrap(await client.auth.signInWithPassword({ email, password }));
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();
        if (error) throw toError(error);
      },
    },

    buyers: crud(client, 'buyers', [['created_at', true]]),
    items: crud(client, 'items', [['created_at', true]]),

    sales: {
      page: async ({ buyerId, offset = 0, limit = 50 } = {}) => {
        let query = client.from('sales').select('*', { count: 'exact' });
        if (buyerId) query = query.eq('buyer_id', buyerId);
        const { data, error, count } = await ordered(query, SALES_ORDER).range(offset, offset + limit - 1);
        // PostgREST rejects a range past the end (e.g. after deleting the last sale of the last page).
        if (error?.code === 'PGRST103') return { rows: [], count: await countSales({ buyerId }) };
        if (error) throw toError(error);
        return { rows: data, count };
      },
      countAfter: ({ date, buyerId }) => countSales({ buyerId, after: date }),
      summary: async ({ buyerId } = {}) => {
        const [row] = unwrap(await client.rpc('sales_summary', { p_buyer_id: buyerId || null }));
        return { count: Number(row?.sales_count ?? 0), total: Number(row?.sales_total ?? 0) };
      },
      remove: sales.remove,
      // Supabase has no multi-statement transaction from the browser, so this
      // reserves stock with a compare-and-set update first (fails if someone
      // else changed the stock meanwhile), then inserts the sale and rolls the
      // stock back if the insert fails. The REST server does this in one
      // SQL transaction instead.
      create: async ({ buyerId, itemId, quantity, saleDate, discount = 0 }) => {
        const pct = parseDiscount(discount);
        if (Number.isNaN(pct)) throw new Error('O desconto deve ficar entre 0 e 100%');
        const item = unwrap(await client.from('items').select('*').eq('id', itemId).single());
        if (quantity > item.stock) {
          throw new Error(`Só há ${item.stock} de "${item.name}" em estoque`);
        }

        const reserved = unwrap(await client
          .from('items')
          .update({ stock: item.stock - quantity })
          .eq('id', itemId)
          .eq('stock', item.stock)
          .select());
        if (reserved.length === 0) {
          throw new Error('O estoque mudou enquanto a venda era salva — tente novamente');
        }

        try {
          return await sales.create({
            buyer_id: buyerId,
            item_id: itemId,
            quantity,
            unit_price: item.price,
            discount: pct,
            total: saleTotal(item.price, quantity, pct),
            sale_date: saleDate,
          });
        } catch (err) {
          await client.from('items').update({ stock: item.stock }).eq('id', itemId);
          throw err;
        }
      },
    },
  };
}
