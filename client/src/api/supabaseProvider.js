import { createClient } from '@supabase/supabase-js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function toSession(session) {
  return session ? { user: { id: session.user.id, email: session.user.email } } : null;
}

function crud(client, table, order) {
  return {
    list: async () => {
      let query = client.from(table).select('*');
      for (const [column, ascending] of order) query = query.order(column, { ascending });
      return unwrap(await query);
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

  const sales = crud(client, 'sales', [['sale_date', false], ['created_at', false]]);

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
        if (error) throw new Error(error.message);
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
      create: async ({ buyerId, itemId, quantity, saleDate }) => {
        const item = unwrap(await client.from('items').select('*').eq('id', itemId).single());
        if (quantity > item.stock) {
          throw new Error(`Only ${item.stock} of "${item.name}" in stock`);
        }

        const reserved = unwrap(await client
          .from('items')
          .update({ stock: item.stock - quantity })
          .eq('id', itemId)
          .eq('stock', item.stock)
          .select());
        if (reserved.length === 0) {
          throw new Error('Stock changed while saving — please try again');
        }

        try {
          return await sales.create({
            buyer_id: buyerId,
            item_id: itemId,
            quantity,
            total: Number(item.price) * quantity,
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
