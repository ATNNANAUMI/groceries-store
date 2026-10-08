import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { formatMoney } from './lib/format';
import Login from './components/Login';
import Buyers from './components/Buyers';
import Items from './components/Items';
import Sales from './components/Sales';
import ErrorBanner from './components/ErrorBanner';
import './App.css';

const TABS = [
  { id: 'sales', label: 'Sales' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'items', label: 'Items' },
];

const LOW_STOCK = 5;

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [buyers, setBuyers] = useState([]);
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('sales');

  // Auth: check session on load, listen for changes
  useEffect(() => {
    api.auth.getSession()
      .then(setSession)
      .catch(err => console.error('Error reading session:', err.message))
      .finally(() => setAuthLoading(false));

    return api.auth.onChange(setSession);
  }, []);

  const refreshBuyers = useCallback(async () => setBuyers(await api.buyers.list()), []);
  const refreshItems = useCallback(async () => setItems(await api.items.list()), []);
  const refreshSales = useCallback(async () => setSales(await api.sales.list()), []);

  const loadAll = useCallback(async () => {
    setDataLoading(true);
    setLoadError('');
    try {
      await Promise.all([refreshBuyers(), refreshItems(), refreshSales()]);
    } catch (err) {
      setLoadError(err.message);
    }
    setDataLoading(false);
  }, [refreshBuyers, refreshItems, refreshSales]);

  // Key on the user id, not the session object: the session is replaced on
  // every token refresh, which would otherwise reload everything and wipe
  // any half-filled form.
  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) loadAll();
  }, [userId, loadAll]);

  async function handleSignOut() {
    try {
      await api.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err.message);
    }
  }

  if (authLoading) {
    return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  }

  if (!session) {
    return <Login />;
  }

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const lowStock = items.filter(i => i.stock <= LOW_STOCK).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">G</span>
            <div>
              <div className="brand-name">Groceries Store</div>
              <div className="brand-sub">Owner console</div>
            </div>
          </div>
          <div className="topbar-user">
            <span className="user-email">{session.user.email}</span>
            <button className="btn btn-ghost" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="container">
        {loadError && (
          <ErrorBanner message={`Could not load data: ${loadError}`} onRetry={loadAll} />
        )}

        <section className="stats" aria-label="Summary">
          <div className="stat stat-accent">
            <span className="stat-label">Revenue</span>
            <span className="stat-value">{formatMoney(totalRevenue)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Sales</span>
            <span className="stat-value">{sales.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Buyers</span>
            <span className="stat-value">{buyers.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Items</span>
            <span className="stat-value">{items.length}</span>
            {lowStock > 0 && <span className="stat-note">{lowStock} low on stock</span>}
          </div>
        </section>

        <nav className="tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {dataLoading ? (
          <div className="card center"><div className="spinner" aria-label="Loading data" /></div>
        ) : (
          <>
            {tab === 'sales' && (
              <Sales
                sales={sales}
                buyers={buyers}
                items={items}
                refreshSales={refreshSales}
                refreshItems={refreshItems}
              />
            )}
            {tab === 'buyers' && (
              <Buyers buyers={buyers} refreshBuyers={refreshBuyers} />
            )}
            {tab === 'items' && (
              <Items items={items} refreshItems={refreshItems} lowStock={LOW_STOCK} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
