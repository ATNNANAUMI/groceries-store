import { useState } from 'react';
import { api } from '../api';
import { formatMoney } from '../lib/format';
import ErrorBanner from './ErrorBanner';

const EMPTY = { name: '', price: '', stock: '' };

export default function Items({ items, refreshItems, lowStock }) {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      price: Math.max(0, parseFloat(form.price) || 0),
      stock: Math.max(0, parseInt(form.stock, 10) || 0),
    };
    if (!payload.name) return;
    setSaving(true);
    setError('');

    try {
      if (editingId) await api.items.update(editingId, payload);
      else await api.items.create(payload);
      await refreshItems();
      resetForm();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  function handleEdit(item) {
    setForm({ name: item.name, price: String(item.price), stock: String(item.stock) });
    setEditingId(item.id);
    setError('');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this item? Past sales will remain but show as "Unknown".')) return;
    setError('');
    try {
      await api.items.remove(id);
      if (id === editingId) resetForm();
      await refreshItems();
    } catch (err) {
      setError(err.message);
    }
  }

  function stockBadge(stock) {
    if (stock === 0) return <span className="badge badge-danger">Out of stock</span>;
    if (stock <= lowStock) return <span className="badge badge-warn">Low</span>;
    return null;
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>{editingId ? 'Edit item' : 'Add an item'}</h2>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Item name</span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Stock</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={form.stock}
            onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {editingId ? 'Save' : 'Add item'}
          </button>
          {editingId && (
            <button className="btn" type="button" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card-header">
        <h2>Catalog</h2>
        <span className="muted">{items.length} items</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th className="num">Price</th><th className="num">Stock</th><th className="actions-col"></th></tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className={i.id === editingId ? 'editing' : ''}>
                <td className="strong">{i.name}</td>
                <td className="num">{formatMoney(i.price)}</td>
                <td className="num">
                  {stockBadge(i.stock)} {i.stock}
                </td>
                <td className="row-actions">
                  <button className="btn btn-small" onClick={() => handleEdit(i)}>Edit</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(i.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="empty">No items yet — add your first product above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
