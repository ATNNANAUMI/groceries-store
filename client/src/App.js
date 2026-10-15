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
  { id: 'sales', label: 'Vendas' },
  { id: 'buyers', label: 'Clientes' },
  { id: 'items', label: 'Produtos' },
];

const LOW_STOCK = 5;

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [buyers, setBuyers] = useState([]);
  const [items, setItems] = useState([]);
  // Only the totals are kept here; the Vendas tab loads the history page by page.
  const [salesSummary, setSalesSummary] = useState({ count: 0, total: 0 });
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
  const refreshSales = useCallback(async () => setSalesSummary(await api.sales.summary()), []);

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
    return <div className="center-screen"><div className="spinner" aria-label="Carregando" /></div>;
  }

  if (!session) {
    return <Login />;
  }

  const lowStock = items.filter(i => i.stock <= LOW_STOCK).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">C</span>
            <div>
              <div className="brand-name">Cantina</div>
              <div className="brand-sub">Painel de gestão</div>
            </div>
          </div>
          <div className="topbar-user">
            <span className="user-email">{session.user.email}</span>
            <button className="btn btn-ghost" onClick={handleSignOut}>Sair</button>
          </div>
        </div>
      </header>

      <main className="container">
        {loadError && (
          <ErrorBanner message={`Não foi possível carregar os dados: ${loadError}`} onRetry={loadAll} />
        )}

        <section className="stats" aria-label="Resumo">
          <div className="stat stat-accent">
            <span className="stat-label">Faturamento</span>
            <span className="stat-value">{formatMoney(salesSummary.total)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Vendas</span>
            <span className="stat-value">{salesSummary.count.toLocaleString('pt-BR')}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Clientes</span>
            <span className="stat-value">{buyers.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Produtos</span>
            <span className="stat-value">{items.length}</span>
            {lowStock > 0 && <span className="stat-note">{lowStock} com estoque baixo</span>}
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
          <div className="card center"><div className="spinner" aria-label="Carregando dados" /></div>
        ) : (
          <>
            {tab === 'sales' && (
              <Sales
                summary={salesSummary}
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
