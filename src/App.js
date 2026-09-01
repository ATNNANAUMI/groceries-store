import { useState } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import Buyers from './components/Buyers';
import Items from './components/Items';
import Sales from './components/Sales';
import './App.css';

function App() {
  const [buyers, setBuyers] = useLocalStorage('gs-buyers', []);
  const [items, setItems] = useLocalStorage('gs-items', []);
  const [sales, setSales] = useLocalStorage('gs-sales', []);
  const [tab, setTab] = useState('sales');

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="App">
      <header className="AppHeader">
        <h1>Groceries Store — Owner Console</h1>
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
          <Sales sales={sales} setSales={setSales} buyers={buyers} items={items} setItems={setItems} />
        )}
        {tab === 'buyers' && <Buyers buyers={buyers} setBuyers={setBuyers} />}
        {tab === 'items' && <Items items={items} setItems={setItems} />}
      </main>
    </div>
  );
}

export default App;