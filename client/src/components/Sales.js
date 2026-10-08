import { useState, useMemo } from 'react';
import { api } from '../api';
import { formatMoney, formatDate, todayLocal } from '../lib/format';
import ErrorBanner from './ErrorBanner';

export default function Sales({ sales, buyers, items, refreshSales, refreshItems }) {
  const [form, setForm] = useState({
    buyerId: '',
    itemId: '',
    quantity: 1,
    date: todayLocal(),
  });
  const [buyerFilter, setBuyerFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedItem = items.find(i => i.id === form.itemId);
  const qty = parseInt(form.quantity, 10) || 0;
  const overStock = selectedItem && qty > selectedItem.stock;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyerId || !selectedItem || qty < 1 || overStock) return;
    setSaving(true);
    setError('');

    try {
      await api.sales.create({
        buyerId: form.buyerId,
        itemId: form.itemId,
        quantity: qty,
        saleDate: form.date,
      });
      setForm(f => ({ ...f, itemId: '', quantity: 1 }));
    } catch (err) {
      setError(err.message);
    }
    // Refresh either way: on a stock conflict the catalog is stale.
    try {
      await Promise.all([refreshSales(), refreshItems()]);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this sale record? Stock is not restored.')) return;
    setError('');
    try {
      await api.sales.remove(id);
      await refreshSales();
    } catch (err) {
      setError(err.message);
    }
  }

  const unknown = <span className="muted">Unknown</span>;
  const buyerName = id => buyers.find(b => b.id === id)?.name || unknown;
  const itemName = id => items.find(i => i.id === id)?.name || unknown;

  const filteredSales = useMemo(() => {
    return buyerFilter ? sales.filter(s => s.buyer_id === buyerFilter) : sales;
  }, [sales, buyerFilter]);

  const filteredTotal = filteredSales.reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <section className="card">
      <div className="card-header">
        <h2>Record a sale</h2>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {(buyers.length === 0 || items.length === 0) && (
        <p className="hint">
          Add at least one {buyers.length === 0 ? 'buyer' : 'item'} before recording a sale.
        </p>
      )}

      <form className="form-grid form-grid-sale" onSubmit={handleSubmit}>
        <label className="field">
          <span>Buyer</span>
          <select
            value={form.buyerId}
            onChange={e => setForm(f => ({ ...f, buyerId: e.target.value }))}
            required
          >
            <option value="">Select buyer</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Item</span>
          <select
            value={form.itemId}
            onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}
            required
          >
            <option value="">Select item</option>
            {items.map(i => (
              <option key={i.id} value={i.id} disabled={i.stock === 0}>
                {i.name} — {formatMoney(i.price)} ({i.stock} in stock)
              </option>
            ))}
          </select>
        </label>

        <label className="field field-narrow">
          <span>Qty</span>
          <input
            type="number"
            min="1"
            max={selectedItem ? selectedItem.stock : undefined}
            step="1"
            inputMode="numeric"
            value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            aria-invalid={overStock || undefined}
            required
          />
        </label>

        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            required
          />
        </label>

        <div className="form-actions">
          <div className="sale-total">
            <span className="muted">Total</span>
            <strong>{formatMoney(selectedItem ? Number(selectedItem.price) * qty : 0)}</strong>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || overStock}>
            {saving ? 'Saving…' : 'Record sale'}
          </button>
        </div>
        {overStock && (
          <p className="field-error form-full">Only {selectedItem.stock} in stock.</p>
        )}
      </form>

      <div className="card-header">
        <h2>Sales history</h2>
        <div className="card-header-tools">
          <span className="muted">{filteredSales.length} sales · {formatMoney(filteredTotal)}</span>
          <select
            className="select-compact"
            value={buyerFilter}
            onChange={e => setBuyerFilter(e.target.value)}
            aria-label="Filter by buyer"
          >
            <option value="">All buyers</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Buyer</th><th>Item</th>
              <th className="num">Qty</th><th className="num">Total</th><th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map(s => (
              <tr key={s.id}>
                <td className="nowrap">{formatDate(s.sale_date)}</td>
                <td className="strong">{buyerName(s.buyer_id)}</td>
                <td>{itemName(s.item_id)}</td>
                <td className="num">{s.quantity}</td>
                <td className="num strong">{formatMoney(s.total)}</td>
                <td className="row-actions">
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filteredSales.length === 0 && (
              <tr><td colSpan={6} className="empty">No sales recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
