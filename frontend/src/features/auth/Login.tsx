// src/features/auth/Login.tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import './Login.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Inserisci email e password'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Credenziali non valide');
      }
      const data = await res.json();
      login(data.user, data.token);
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Errore di accesso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">🚚</div>
          <h1 className="login-brand-title">GLS Padroncini</h1>
          <p className="login-brand-sub">Gestionale Corriere</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <h2 className="login-card-title">Accedi</h2>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label className="login-label">Email / Username</label>
              <input
                type="text"
                className="login-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@gestionale.it"
                autoFocus
              />
            </div>

            <div className="login-field">
              <label className="login-label">Password</label>
              <input
                type="password"
                className="login-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="login-error">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
