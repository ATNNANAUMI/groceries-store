import { createClient } from '@supabase/supabase-js';
import { saleTotal, parseDiscount } from '../lib/sales';

// Supabase reports errors in English; translate the ones the owner can run into.
const MESSAGES = {
  'Invalid login credentials': 'E-mail ou senha incorretos',
  'Email not confirmed': 'E-mail ainda não confirmado',
  'Failed to fetch': 'Sem conexão com o servidor — verifique a internet',
  'TypeError: Failed to fetch': 'Sem conexão com o servidor — verifique a internet',
};

function toError(error) {
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

function crud(client, table, order) {
  return {
    list: async () => {
      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(table).select('*');
        for (const [column, ascending] of order) query = query.order(column, { ascending, nullsFirst: false });
        const page = unwrap(await query.order('id').range(from, from + PAGE_SIZE - 1));
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

  const sales = crud(client, 'sales', [['sale_date', false], ['sold_at', false], ['created_at', false]]);

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
      list: sales.list,
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
