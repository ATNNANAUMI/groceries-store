// Client for the future self-hosted REST API (server/). It follows
// docs/api-contract.md; enable it with REACT_APP_API_PROVIDER=rest.
const TOKEN_KEY = 'groceries.token';

export function createRestProvider() {
  const baseUrl = (process.env.REACT_APP_API_URL || '/api').replace(/\/$/, '');
  const listeners = new Set();
  let session = null;

  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function writeToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable — session lasts for this tab only */ }
  }

  function setSession(next) {
    session = next;
    listeners.forEach(listener => listener(session));
  }

  async function request(method, path, body) {
    const token = readToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).catch(() => {
      throw new Error('Sem conexão com o servidor — verifique a internet');
    });

    if (res.status === 401 && path !== '/auth/login') {
      writeToken(null);
      setSession(null);
    }
    if (res.status === 204) return null;

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Falha na requisição (${res.status})`);
    return data;
  }

  // Query string from an object, skipping empty values.
  function query(params) {
    return new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ).toString();
  }

  function crud(resource) {
    return {
      list: () => request('GET', `/${resource}`),
      create: row => request('POST', `/${resource}`, row),
      update: (id, row) => request('PATCH', `/${resource}/${id}`, row),
      remove: id => request('DELETE', `/${resource}/${id}`),
    };
  }

  const sales = crud('sales');

  return {
    auth: {
      getSession: async () => {
        if (!readToken()) return null;
        try {
          session = { user: await request('GET', '/auth/me') };
        } catch {
          session = null;
        }
        return session;
      },
      onChange: callback => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      signIn: async (email, password) => {
        const { token, user } = await request('POST', '/auth/login', { email, password });
        writeToken(token);
        setSession({ user });
      },
      signOut: async () => {
        writeToken(null);
        setSession(null);
      },
    },

    buyers: crud('buyers'),
    items: crud('items'),

    sales: {
      page: ({ buyerId, offset = 0, limit = 50 } = {}) =>
        request('GET', `/sales?${query({ offset, limit, buyer_id: buyerId })}`),
      countAfter: async ({ date, buyerId }) =>
        (await request('GET', `/sales/count?${query({ after: date, buyer_id: buyerId })}`)).count,
      summary: async ({ buyerId } = {}) => {
        const { count, total } = await request('GET', `/sales/summary?${query({ buyer_id: buyerId })}`);
        return { count: Number(count), total: Number(total) };
      },
      remove: sales.remove,
      create: ({ buyerId, itemId, quantity, saleDate, discount = 0 }) =>
        sales.create({ buyer_id: buyerId, item_id: itemId, quantity, discount, sale_date: saleDate }),
    },
  };
}
