import { useState } from 'react';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function Items({ items, setItems }) {
  const [form, setForm] = useState({ name: '', price: '', stock: '' });
  const [editingId, setEditingId] = useState(null);

  function resetForm() {
    setForm({ name: '', price: '', stock: '' });
    setEditingId(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock, 10) || 0,
    };

    if (editingId) {
      setItems(items.map(i => (i.id === editingId ? { ...i, ...payload } : i)));
    } else {
      setItems([...items, { id: uid(), ...payload }]);
    }
    resetForm();
  }

  function handleEdit(item) {
    setForm({ name: item.name, price: item.price, stock: item.stock });
    setEditingId(item.id);
  }

  function handleDelete(id) {
    if (window.confirm('Delete this item?')) {
      setItems(items.filter(i => i.id !== id));
    }
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
        <button type="submit">{editingId ? 'Save' : 'Add Item'}</button>
        {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
      </form>

      <table>
        <thead>
          <tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>${i.price.toFixed(2)}</td>
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