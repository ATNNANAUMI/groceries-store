import { useState } from 'react';
import { api } from '../api';
import ErrorBanner from './ErrorBanner';

const EMPTY = { name: '', phone: '', email: '' };

export default function Buyers({ buyers, refreshBuyers }) {
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
    const payload = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() };
    if (!payload.name) return;
    setSaving(true);
    setError('');

    try {
      if (editingId) await api.buyers.update(editingId, payload);
      else await api.buyers.create(payload);
      await refreshBuyers();
      resetForm();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  function handleEdit(buyer) {
    setForm({ name: buyer.name, phone: buyer.phone || '', email: buyer.email || '' });
    setEditingId(buyer.id);
    setError('');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this buyer? Their sales history will remain but show as "Unknown".')) {
      return;
    }
    setError('');
    try {
      await api.buyers.remove(id);
      if (id === editingId) resetForm();
      await refreshBuyers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>{editingId ? 'Edit buyer' : 'Add a buyer'}</h2>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {editingId ? 'Save' : 'Add buyer'}
          </button>
          {editingId && (
            <button className="btn" type="button" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card-header">
        <h2>Buyers</h2>
        <span className="muted">{buyers.length} total</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Email</th><th className="actions-col"></th></tr>
          </thead>
          <tbody>
            {buyers.map(b => (
              <tr key={b.id} className={b.id === editingId ? 'editing' : ''}>
                <td className="strong">{b.name}</td>
                <td>{b.phone || <span className="muted">—</span>}</td>
                <td>{b.email || <span className="muted">—</span>}</td>
                <td className="row-actions">
                  <button className="btn btn-small" onClick={() => handleEdit(b)}>Edit</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(b.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr><td colSpan={4} className="empty">No buyers yet — add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
