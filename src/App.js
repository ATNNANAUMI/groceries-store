import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import Buyers from './components/Buyers';
import Items from './components/Items';
import Sales from './components/Sales';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [buyers, setBuyers] = useState([]);
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState('sales');

  // Auth: check session on load, listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshBuyers = useCallback(async () => {
    const { data, error } = await supabase
      .from('buyers')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setBuyers(data);
    else console.error('Error loading buyers:', error.message);
  }, []);

  const refreshItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setItems(data);
    else console.error('Error loading items:', error.message);
  }, []);

  const refreshSales = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false });
    if (!error) setSales(data);
    else console.error('Error loading sales:', error.message);
  }, []);

  useEffect(() => {
    if (!session) return;
    async function loadAll() {
      setDataLoading(true);
      await Promise.all([refreshBuyers(), refreshItems(), refreshSales()]);
      setDataLoading(false);
    }
    loadAll();
  }, [session, refreshBuyers, refreshItems, refreshSales]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (authLoading) {
    return (
      <div className="App">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (dataLoading) {
    return (
      <div className="App">
        <p>Loading data...</p>
      </div>
    );
  }

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <div className="App">
      <header className="AppHeader">
        <div className="header-top">
          <h1>Groceries Store — Owner Console</h1>
          <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
        </div>
        <div className="stats">
          <span>Buyers: {buyers.length}</span>
          <span>Items: {items.length}</span>
          <span>Sales: {sales.length}</span>
          <span>Revenue: ${totalRevenue.toFixed(2)}</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'sales' ? 'active' : ''} onClick={() => setTab('sales')}>Sales</button>
        <button className={tab === 'buyers' ? 'active' : ''} onClick={() => setTab('buyers')}>Buyers</button>
        <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>Items</button>
      </nav>

      <main>
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
          <Items items={items} refreshItems={refreshItems} />
        )}
      </main>
    </div>
  );
}

export default App;