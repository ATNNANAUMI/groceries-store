import { useState } from 'react';
import { api } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.auth.signIn(email, password);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="center-screen login-screen">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">G</span>
          <div>
            <div className="brand-name">Groceries Store</div>
            <div className="brand-sub">Owner console</div>
          </div>
        </div>
        <h1 className="login-title">Sign in</h1>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="field-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
