import { useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';

export default function Sales({ sales, buyers, items, refreshSales, refreshItems }) {
  const [form, setForm] = useState({
    buyerId: '',
    itemId: '',
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
  });
  const [buyerFilter, setBuyerFilter] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyerId || !form.itemId) return;

    const item = items.find(i => i.id === form.itemId);
    if (!item) return;

    const qty = parseInt(form.quantity, 10) || 1;
    const total = Number(item.price) * qty;
    setSaving(true);

    const { error: saleError } = await supabase.from('sales').insert({
      buyer_id: form.buyerId,
      item_id: form.itemId,
      quantity: qty,
      total,
      sale_date: form.date,
    });

    if (saleError) {
      console.error('Error recording sale:', saleError.message);
      setSaving(false);
      return;
    }

    const { error: stockError } = await supabase
      .from('items')
      .update({ stock: Math.max(0, item.stock - qty) })
      .eq('id', item.id);

    if (stockError) console.error('Error updating stock:', stockError.message);

    await Promise.all([refreshSales(), refreshItems()]);
    setSaving(false);
    setForm({ ...form, itemId: '', quantity: 1 });
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this sale record?')) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) console.error('Error deleting sale:', error.message);
    await refreshSales();
  }

  const buyerName = id => buyers.find(b => b.id === id)?.name || 'Unknown';
  const itemName = id => items.find(i => i.id === id)?.name || 'Unknown';

  const filteredSales = useMemo(() => {
    return buyerFilter ? sales.filter(s => s.buyer_id === buyerFilter) : sales;
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
              {i.name} (${Number(i.price).toFixed(2)}, stock: {i.stock})
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

        <button type="submit" disabled={saving}>Record Sale</button>
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
              <td>{s.sale_date}</td>
              <td>{buyerName(s.buyer_id)}</td>
              <td>{itemName(s.item_id)}</td>
              <td>{s.quantity}</td>
              <td>${Number(s.total).toFixed(2)}</td>
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