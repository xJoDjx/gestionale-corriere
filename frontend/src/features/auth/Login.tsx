// src/features/auth/Login.tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { Icon } from '../../components/ds';
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
    <main className="lg-page">
      <div className="lg-box">
        <div className="lg-brand">
          <span className="lg-tile"><Icon name="mezzi" size={18} /></span>
          <div><strong>Gestionale</strong><span>Corriere · padroncini, flotta e conteggi</span></div>
        </div>

        <form className="lg-card" onSubmit={handleSubmit} noValidate>
          <h1>Accedi</h1>
          <p className="lg-sub">Usa il tuo utente personale: ogni modifica resta registrata a tuo nome.</p>

          <label className="lg-field">
            <span>Email o nome utente</span>
            <input type="text" className="ds-input" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nome@azienda.it" autoFocus autoComplete="username" />
          </label>

          <label className="lg-field">
            <span>Password</span>
            <input type="password" className="ds-input" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" autoComplete="current-password" />
          </label>

          {error && <div className="lg-error" role="alert"><Icon name="alert" size={14} />{error}</div>}

          <button type="submit" className="lg-submit" disabled={loading}>
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </main>
  );
}
