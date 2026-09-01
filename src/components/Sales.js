import { useState, useMemo } from 'react';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function Sales({ sales, setSales, buyers, items, setItems }) {
  const [form, setForm] = useState({
    buyerId: '',
    itemId: '',
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
  });
  const [buyerFilter, setBuyerFilter] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyerId || !form.itemId) return;

    const item = items.find(i => i.id === form.itemId);
    const qty = parseInt(form.quantity, 10) || 1;
    if (!item) return;

    const total = item.price * qty;

    setSales([
      ...sales,
      {
        id: uid(),
        buyerId: form.buyerId,
        itemId: form.itemId,
        quantity: qty,
        date: form.date,
        total,
      },
    ]);

    // decrement stock
    setItems(items.map(i => (i.id === item.id ? { ...i, stock: Math.max(0, i.stock - qty) } : i)));

    setForm({ ...form, itemId: '', quantity: 1 });
  }

  function handleDelete(id) {
    if (window.confirm('Delete this sale record?')) {
      setSales(sales.filter(s => s.id !== id));
    }
  }

  const buyerName = id => buyers.find(b => b.id === id)?.name || 'Unknown';
  const itemName = id => items.find(i => i.id === id)?.name || 'Unknown';

  const filteredSales = useMemo(() => {
    const sorted = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    return buyerFilter ? sorted.filter(s => s.buyerId === buyerFilter) : sorted;
  }, [sales, buyerFilter]);

  return (
    <div className="panel">
      <h2>Record a Sale</h2>

      <form className="inline-form" onSubmit={handleSubmit}>
        <select
          value={form.buyerId}
          onChange={e => setForm({ ...form, buyerId: e.target.value })}
          required
        >
          <option value="">Select buyer</option>
          {buyers.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <select
          value={form.itemId}
          onChange={e => setForm({ ...form, itemId: e.target.value })}
          required
        >
          <option value="">Select item</option>
          {items.map(i => (
            <option key={i.id} value={i.id}>
              {i.name} (${i.price.toFixed(2)}, stock: {i.stock})
            </option>
          ))}
        </select>

        <input
          type="number"
          min="1"
          value={form.quantity}
          onChange={e => setForm({ ...form, quantity: e.target.value })}
        />

        <input
          type="date"
          value={form.date}
          onChange={e => setForm({ ...form, date: e.target.value })}
        />

        <button type="submit">Record Sale</button>
      </form>

      <h2>Sales History</h2>
      <select value={buyerFilter} onChange={e => setBuyerFilter(e.target.value)}>
        <option value="">All buyers</option>
        {buyers.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      <table>
        <thead>
          <tr><th>Date</th><th>Buyer</th><th>Item</th><th>Qty</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>
          {filteredSales.map(s => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{buyerName(s.buyerId)}</td>
              <td>{itemName(s.itemId)}</td>
              <td>{s.quantity}</td>
              <td>${s.total.toFixed(2)}</td>
              <td><button onClick={() => handleDelete(s.id)}>Delete</button></td>
            </tr>
          ))}
          {filteredSales.length === 0 && (
            <tr><td colSpan={6}>No sales recorded yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}