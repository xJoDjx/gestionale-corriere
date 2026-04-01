// src/features/utenti/GestioneUtenti.tsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: 'ADMIN' | 'OPERATORE' | 'VIEWER';
  attivo: boolean;
  createdAt: string;
}

interface NuovoUtenteForm {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  ruolo: 'ADMIN' | 'OPERATORE' | 'VIEWER';
}

const RUOLO_META = {
  ADMIN:     { label: 'Admin',     cls: 'badge-red',   icon: '🔑' },
  OPERATORE: { label: 'Operatore', cls: 'badge-blue',  icon: '👤' },
  VIEWER:    { label: 'Viewer',    cls: 'badge-gray',  icon: '👁️' },
};

const fmt = (d: string) => new Date(d).toLocaleDateString('it-IT');

function NuovoUtenteModal({
  open, onClose, onSave,
}: { open: boolean; onClose: () => void; onSave: (f: NuovoUtenteForm) => Promise<void> }) {
  const [form, setForm] = useState<NuovoUtenteForm>({ email: '', password: '', nome: '', cognome: '', ruolo: 'OPERATORE' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = (k: keyof NuovoUtenteForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.email || !form.password || !form.nome || !form.cognome) {
      alert('Compila tutti i campi obbligatori');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setForm({ email: '', password: '', nome: '', cognome: '', ruolo: 'OPERATORE' });
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28, width: 440, boxShadow: '0 20px 40px rgba(0,0,0,.3)',
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>👤 Nuovo Utente</h2>

        {[
          { label: 'Nome *', key: 'nome' as const, type: 'text' },
          { label: 'Cognome *', key: 'cognome' as const, type: 'text' },
          { label: 'Email *', key: 'email' as const, type: 'email' },
          { label: 'Password *', key: 'password' as const, type: 'password' },
        ].map(({ label, key, type }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>Ruolo *</label>
          <select
            value={form.ruolo}
            onChange={(e) => set('ruolo', e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}
          >
            <option value="OPERATORE">Operatore</option>
            <option value="ADMIN">Admin</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
          >Annulla</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >{saving ? 'Creazione...' : 'Crea Utente'}</button>
        </div>
      </div>
    </div>
  );
}

function CambioPasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [pwd, setPwd] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!pwd || pwd.length < 6) { alert('Password di almeno 6 caratteri'); return; }
    setSaving(true);
    try {
      await api.put(`/users/${userId}/password`, { password: pwd });
      alert('Password aggiornata!');
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 360, boxShadow: '0 20px 40px rgba(0,0,0,.3)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>🔒 Cambia Password</h3>
        <input
          type="password"
          placeholder="Nuova password (min. 6 caratteri)"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Salvo...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GestioneUtenti() {
  const [utenti, setUtenti] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNuovo, setShowNuovo] = useState(false);
  const [cambioPasswordId, setCambioPasswordId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<User[]>('/users');
      setUtenti(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCrea = async (form: NuovoUtenteForm) => {
    await api.post('/users', form);
    await load();
  };

  const handleToggleAttivo = async (id: string) => {
    try {
      await api.put(`/users/${id}/toggle-attivo`, {});
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const handleCambioRuolo = async (id: string, ruolo: string) => {
    try {
      await api.put(`/users/${id}`, { ruolo });
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const handleElimina = async (id: string, nome: string) => {
    if (!confirm(`Eliminare l'utente ${nome}? L'operazione non è reversibile.`)) return;
    try {
      await api.delete(`/users/${id}`);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Caricamento utenti...
    </div>
  );

  if (error) return (
    <div style={{ padding: 32 }}>
      <div style={{ color: '#dc2626', marginBottom: 12 }}>⚠️ {error}</div>
      <button onClick={load} style={{ padding: '6px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Riprova</button>
    </div>
  );

  const attivi = utenti.filter(u => u.attivo).length;

  return (
    <div style={{ padding: 24 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>👥 Gestione Utenti</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            {attivi} attivi · {utenti.length} totali
          </p>
        </div>
        <button
          onClick={() => setShowNuovo(true)}
          style={{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >+ Nuovo Utente</button>
      </div>

      {/* ── Stats pills ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {(['ADMIN', 'OPERATORE', 'VIEWER'] as const).map((r) => {
          const count = utenti.filter(u => u.ruolo === r).length;
          const m = RUOLO_META[r];
          return (
            <div key={r} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 18px',
            }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tabella ── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['UTENTE', 'EMAIL', 'RUOLO', 'STATO', 'CREATO', 'AZIONI'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {utenti.map((u) => {
              const rm = RUOLO_META[u.ruolo];
              return (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: u.attivo ? 1 : 0.55,
                    transition: 'background .1s',
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: u.attivo ? 'var(--primary)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
                      }}>
                        {u.nome[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome} {u.cognome}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      value={u.ruolo}
                      onChange={(e) => handleCambioRuolo(u.id, e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                        color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                    >
                      <option value="ADMIN">🔑 Admin</option>
                      <option value="OPERATORE">👤 Operatore</option>
                      <option value="VIEWER">👁️ Viewer</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      background: u.attivo ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)',
                      color: u.attivo ? '#16a34a' : '#64748b',
                    }}>
                      {u.attivo ? 'Attivo' : 'Disattivo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(u.createdAt)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleToggleAttivo(u.id)}
                        style={{
                          padding: '5px 10px', fontSize: 11, fontWeight: 600,
                          borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)',
                          background: u.attivo ? '#fef3c7' : 'rgba(34,197,94,.1)',
                          color: u.attivo ? '#92400e' : '#16a34a',
                        }}
                      >
                        {u.attivo ? 'Disattiva' : 'Attiva'}
                      </button>
                      <button
                        onClick={() => setCambioPasswordId(u.id)}
                        style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >🔒 Pwd</button>
                      <button
                        onClick={() => handleElimina(u.id, u.nome + ' ' + u.cognome)}
                        style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626' }}
                      >✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {utenti.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Nessun utente trovato
          </div>
        )}
      </div>

      <NuovoUtenteModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleCrea} />
      {cambioPasswordId && (
        <CambioPasswordModal userId={cambioPasswordId} onClose={() => setCambioPasswordId(null)} />
      )}
    </div>
  );
}
