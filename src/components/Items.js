import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Items({ items, refreshItems }) {
  const [form, setForm] = useState({ name: '', price: '', stock: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ name: '', price: '', stock: '' });
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name,
      price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock, 10) || 0,
    };

    if (editingId) {
      const { error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', editingId);
      if (error) console.error('Error updating item:', error.message);
    } else {
      const { error } = await supabase.from('items').insert(payload);
      if (error) console.error('Error adding item:', error.message);
    }

    await refreshItems();
    setSaving(false);
    resetForm();
  }

  function handleEdit(item) {
    setForm({ name: item.name, price: item.price, stock: item.stock });
    setEditingId(item.id);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this item?')) return;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) console.error('Error deleting item:', error.message);
    await refreshItems();
  }

  return (
    <div className="panel">
      <h2>Items</h2>

      <form className="inline-form" onSubmit={handleSubmit}>
        <input
          placeholder="Item name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Price"
          value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="number"
          placeholder="Stock"
          value={form.stock}
          onChange={e => setForm({ ...form, stock: e.target.value })}
        />
        <button type="submit" disabled={saving}>
          {editingId ? 'Save' : 'Add Item'}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} disabled={saving}>
            Cancel
          </button>
        )}
      </form>

      <table>
        <thead>
          <tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>${Number(i.price).toFixed(2)}</td>
              <td>{i.stock}</td>
              <td>
                <button onClick={() => handleEdit(i)}>Edit</button>
                <button onClick={() => handleDelete(i.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4}>No items yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}