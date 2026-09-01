import { useState } from 'react';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function Buyers({ buyers, setBuyers }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [editingId, setEditingId] = useState(null);

  function resetForm() {
    setForm({ name: '', phone: '', email: '' });
    setEditingId(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (editingId) {
      setBuyers(buyers.map(b => (b.id === editingId ? { ...b, ...form } : b)));
    } else {
      setBuyers([...buyers, { id: uid(), ...form }]);
    }
    resetForm();
  }

  function handleEdit(buyer) {
    setForm({ name: buyer.name, phone: buyer.phone, email: buyer.email });
    setEditingId(buyer.id);
  }

  function handleDelete(id) {
    if (window.confirm('Delete this buyer? Their sales history will remain but show as "Unknown".')) {
      setBuyers(buyers.filter(b => b.id !== id));
    }
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
        <button type="submit">{editingId ? 'Save' : 'Add Buyer'}</button>
        {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
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