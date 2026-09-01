import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Buyers({ buyers, refreshBuyers }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ name: '', phone: '', email: '' });
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from('buyers')
        .update(form)
        .eq('id', editingId);
      if (error) console.error('Error updating buyer:', error.message);
    } else {
      const { error } = await supabase.from('buyers').insert(form);
      if (error) console.error('Error adding buyer:', error.message);
    }

    await refreshBuyers();
    setSaving(false);
    resetForm();
  }

  function handleEdit(buyer) {
    setForm({ name: buyer.name, phone: buyer.phone || '', email: buyer.email || '' });
    setEditingId(buyer.id);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this buyer? Their sales history will remain but show as "Unknown".')) {
      return;
    }
    const { error } = await supabase.from('buyers').delete().eq('id', id);
    if (error) console.error('Error deleting buyer:', error.message);
    await refreshBuyers();
  }

  return (
    <div className="panel">
      <h2>Buyers</h2>

      <form className="inline-form" onSubmit={handleSubmit}>
        <input
          placeholder="Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
        <input
          placeholder="Email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
        <button type="submit" disabled={saving}>
          {editingId ? 'Save' : 'Add Buyer'}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} disabled={saving}>
            Cancel
          </button>
        )}
      </form>

      <table>
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr>
        </thead>
        <tbody>
          {buyers.map(b => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.phone}</td>
              <td>{b.email}</td>
              <td>
                <button onClick={() => handleEdit(b)}>Edit</button>
                <button onClick={() => handleDelete(b.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {buyers.length === 0 && (
            <tr><td colSpan={4}>No buyers yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}