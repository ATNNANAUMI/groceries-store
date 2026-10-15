import { useState, useMemo } from 'react';
import { api } from '../api';
import { matchesSearch, sortByName } from '../lib/search';
import ErrorBanner from './ErrorBanner';

const EMPTY = { name: '', phone: '', email: '' };

export default function Buyers({ buyers, refreshBuyers }) {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const shownBuyers = useMemo(
    () => sortByName(buyers).filter(b => matchesSearch(search, b.name, b.phone, b.email)),
    [buyers, search],
  );

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
    if (!window.confirm('Excluir este cliente? O histórico de vendas continua, mas aparece como "Desconhecido".')) {
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
        <h2>{editingId ? 'Editar cliente' : 'Adicionar cliente'}</h2>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nome</span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Telefone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {editingId ? 'Salvar' : 'Adicionar cliente'}
          </button>
          {editingId && (
            <button className="btn" type="button" onClick={resetForm} disabled={saving}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="card-header">
        <h2>Clientes</h2>
        <div className="card-header-tools">
          <span className="muted">
            {search ? `${shownBuyers.length} de ${buyers.length}` : `${buyers.length} no total`}
          </span>
          <input
            type="search"
            className="select-compact search-box"
            placeholder="Buscar por nome, telefone ou e-mail…"
            aria-label="Buscar cliente"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th className="actions-col"></th></tr>
          </thead>
          <tbody>
            {shownBuyers.map(b => (
              <tr key={b.id} className={b.id === editingId ? 'editing' : ''}>
                <td className="strong">{b.name}</td>
                <td>{b.phone || <span className="muted">—</span>}</td>
                <td>{b.email || <span className="muted">—</span>}</td>
                <td className="row-actions">
                  <button className="btn btn-small" onClick={() => handleEdit(b)}>Editar</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(b.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {shownBuyers.length === 0 && (
              <tr><td colSpan={4} className="empty">
                {buyers.length === 0
                  ? 'Nenhum cliente ainda — adicione o primeiro acima.'
                  : `Nenhum cliente encontrado para "${search}".`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
