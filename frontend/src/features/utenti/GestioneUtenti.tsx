// src/features/utenti/GestioneUtenti.tsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { navItems } from '../../components/layout/Sidebar';
import { Icon, Page, PageHeader, Card, CardHead, Button, IconButton, Alert, Empty, Th, useSort } from '../../components/ds';
import '../impostazioni/Impostazioni2.css';
import './Utenti2.css';
import { useAuthStore } from '../../stores/auth.store';

// Sezioni disponibili (derivate dalla sidebar, escludendo i divider)
const SEZIONI = navItems.map(({ key, label, icon }) => ({ key, label, icon }));

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: 'ADMIN' | 'OPERATORE' | 'VIEWER';
  attivo: boolean;
  createdAt: string;
  sezioniVisibili: string[];
}

interface NuovoUtenteForm {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  ruolo: 'ADMIN' | 'OPERATORE' | 'VIEWER';
  sezioni: string[];
}

const RUOLO_META = {
  ADMIN:     { label: 'Amministratore', color: '#7C5CF0' },
  OPERATORE: { label: 'Operatore',      color: '#3D63F0' },
  VIEWER:    { label: 'Solo lettura',   color: '#A1A1AA' },
};

const fmt = (d: string) => new Date(d).toLocaleDateString('it-IT');

// ── Componente selezione sezioni ──────────────────────────────────────────────
function SezioniChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);

  const allSelected = SEZIONI.every(s => selected.includes(s.key));
  const toggleAll = () => onChange(allSelected ? [] : SEZIONI.map(s => s.key));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Sezioni visibili *</span>
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {allSelected ? 'Deseleziona tutto' : 'Seleziona tutto'}
        </button>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        padding: '10px 12px',
        background: 'var(--bg-tertiary, var(--bg-secondary))',
        border: '1px solid var(--border)',
        borderRadius: 8,
        maxHeight: 220,
        overflowY: 'auto',
      }}>
        {SEZIONI.map(({ key, label, icon }) => (
          <label
            key={key}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              cursor: disabled ? 'default' : 'pointer',
              fontSize: 12,
              userSelect: 'none',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() => toggle(key)}
              disabled={disabled}
              style={{ accentColor: 'var(--primary)', cursor: disabled ? 'default' : 'pointer' }}
            />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name={icon} size={14} /> {label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Modal nuovo utente ────────────────────────────────────────────────────────
function NuovoUtenteModal({
  open, onClose, onSave,
}: { open: boolean; onClose: () => void; onSave: (f: NuovoUtenteForm) => Promise<void> }) {
  const [form, setForm] = useState<NuovoUtenteForm>({
    email: '', password: '', nome: '', cognome: '', ruolo: 'OPERATORE',
    sezioni: SEZIONI.map(s => s.key), // default: tutte le sezioni
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = (k: keyof NuovoUtenteForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.password || !form.nome || !form.cognome) {
      alert('Compila tutti i campi obbligatori (Nome, Cognome, Password)');
      return;
    }
    // Se l'email è vuota, genera un identificatore univoco
    const emailEffettiva = form.email.trim() ||
      `${form.nome.toLowerCase().replace(/\s+/g, '.')}.${form.cognome.toLowerCase().replace(/\s+/g, '')}${Date.now()}@interno.local`;
    setSaving(true);
    try {
      await onSave({ ...form, email: emailEffettiva });
      setForm({ email: '', password: '', nome: '', cognome: '', ruolo: 'OPERATORE', sezioni: SEZIONI.map(s => s.key) });
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="um-back">
      <div className="ds-card um-modal" style={{ width: 480 }} role="dialog" aria-modal="true">
        <h2 className="um-h">Nuovo utente</h2>

        {[
          { label: 'Nome *', key: 'nome' as const, type: 'text' },
          { label: 'Cognome *', key: 'cognome' as const, type: 'text' },
          { label: 'Email / Username', key: 'email' as const, type: 'text' },
          { label: 'Password *', key: 'password' as const, type: 'password' },
        ].map(({ label, key, type }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label className="um-lbl">{label}</label>
            <input
              type={type}
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
              className="ds-input um-in"
            />
            {key === 'email' && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                Facoltativa — se vuota viene generata automaticamente
              </span>
            )}
          </div>
        ))}

        <div style={{ marginBottom: 16 }}>
          <label className="um-lbl">Ruolo *</label>
          <select
            value={form.ruolo}
            onChange={(e) => set('ruolo', e.target.value)}
            className="ds-input um-in"
          >
            <option value="OPERATORE">Operatore</option>
            <option value="ADMIN">Amministratore</option>
            <option value="VIEWER">Solo lettura</option>
          </select>
        </div>

        {form.ruolo !== 'ADMIN' && (
          <div style={{ marginBottom: 20 }}>
            <SezioniChecklist selected={form.sezioni} onChange={v => set('sezioni', v)} />
          </div>
        )}

        {form.ruolo === 'ADMIN' && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            Gli amministratori hanno accesso a tutte le sezioni automaticamente.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Creazione…' : 'Crea utente'}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal modifica sezioni utente esistente ────────────────────────────────────
function SezioniModal({
  user,
  onClose,
  onSave,
}: { user: User; onClose: () => void; onSave: (sezioni: string[]) => Promise<void> }) {
  const [sezioni, setSezioni] = useState<string[]>(user.sezioniVisibili ?? []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sezioni);
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="um-back">
      <div className="ds-card um-modal" style={{ width: 440 }} role="dialog" aria-modal="true">
        <h3 className="um-h">
          Sezioni visibili: {user.nome} {user.cognome}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          Seleziona le sezioni visibili nella barra laterale.
          {user.sezioniVisibili.length === 0 && ' (attualmente: nessuna restrizione)'}
        </p>

        <div style={{ marginBottom: 20 }}>
          <SezioniChecklist selected={sezioni} onChange={setSezioni} />
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          Con la lista vuota non ci sono restrizioni (backward compat). Per bloccare l'accesso disattiva l'utente.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvo...' : 'Salva'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal modifica utente (nome, cognome, email) ──────────────────────────────
function ModificaUtenteModal({
  user,
  onClose,
  onSave,
}: { user: User; onClose: () => void; onSave: (data: { nome: string; cognome: string; email: string }) => Promise<void> }) {
  const [form, setForm] = useState({ nome: user.nome, cognome: user.cognome, email: user.email });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nome.trim() || !form.cognome.trim()) { alert('Nome e cognome sono obbligatori'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="um-back">
      <div className="ds-card um-modal" style={{ width: 420 }} role="dialog" aria-modal="true">
        <h3 className="um-h">Modifica utente</h3>

        {[
          { label: 'Nome *', key: 'nome' as const },
          { label: 'Cognome *', key: 'cognome' as const },
          { label: 'Email / Username', key: 'email' as const },
        ].map(({ label, key }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label className="um-lbl">{label}</label>
            <input
              type="text"
              value={form[key]}
              onChange={e => set(key, e.target.value)}
              className="ds-input um-in"
            />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvo...' : 'Salva'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal cambio password ──────────────────────────────────────────────────────
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
    <div className="um-back">
      <div className="ds-card um-modal" style={{ width: 360 }} role="dialog" aria-modal="true">
        <h3 className="um-h">Cambia password</h3>
        <input
          type="password"
          placeholder="Nuova password (min. 6 caratteri)"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="ds-input um-in" style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvo...' : 'Salva'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal mostra password (solo ADMIN) ────────────────────────────────────────
function MostraPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    api.get<{ passwordPlain: string | null }>(`/users/${user.id}/password-plain`)
      .then(r => setPassword(r.passwordPlain))
      .catch(() => setPassword(null))
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="um-back">
      <div className="ds-card um-modal" style={{ width: 380 }} role="dialog" aria-modal="true">
        <h3 className="um-h">Password: {user.nome} {user.cognome}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Caricamento...</p>
        ) : password === null ? (
          <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            Password non disponibile — impostata prima di questo aggiornamento o mai salvata in chiaro.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              flex: 1, padding: '10px 14px', background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 15, letterSpacing: visible ? 0 : '0.25em',
              color: 'var(--text-primary)', userSelect: visible ? 'text' : 'none',
            }}>
              {visible ? password : '•'.repeat(password.length)}
            </div>
            <button
              onClick={() => setVisible(v => !v)}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 16 }}
              title={visible ? 'Nascondi' : 'Mostra'}
            >
              <Icon name={visible ? 'hide' : 'eye'} size={15} />
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GestioneUtenti() {
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.ruolo === 'ADMIN';

  const [utenti, setUtenti] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNuovo, setShowNuovo] = useState(false);
  const [cambioPasswordId, setCambioPasswordId] = useState<string | null>(null);
  const [sezioniUser, setSezioniUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [modificaUser, setModificaUser] = useState<User | null>(null);

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
    const created = await api.post<{ id: string }>('/users', {
      email: form.email,
      password: form.password,
      nome: form.nome,
      cognome: form.cognome,
      ruolo: form.ruolo,
    });
    // Salva le sezioni se non è ADMIN
    if (form.ruolo !== 'ADMIN' && form.sezioni.length > 0) {
      await api.put(`/users/${created.id}/sezioni`, { sezioni: form.sezioni });
    }
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

  const handleSalvaSezioni = async (userId: string, sezioni: string[]) => {
    await api.put(`/users/${userId}/sezioni`, { sezioni });
    await load();
  };

  const handleModifica = async (id: string, data: { nome: string; cognome: string; email: string }) => {
    await api.put(`/users/${id}`, data);
    await load();
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

  const [stats, setStats] = useState<{ totale: number; perUtente: { userId: string | null; nome: string; count: number }[]; ultimoAccesso: Record<string, string | null> } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [sezDraft, setSezDraft] = useState<string[] | null>(null);
  const [savingSez, setSavingSez] = useState(false);
  useEffect(() => { api.get<any>('/audit/stats').then(setStats).catch(() => {}); }, []);

  type K = 'n' | 'a' | 'r' | 'p' | 'l' | 's';
  const ultimo = (u: User) => stats?.ultimoAccesso?.[u.id] ?? null;
  const { sorted, sort, toggle } = useSort<User, K>(utenti, (u, k) =>
    k === 'n' ? `${u.nome} ${u.cognome}` : k === 'a' ? u.email : k === 'r' ? RUOLO_META[u.ruolo].label
      : k === 'p' ? (u.ruolo === 'ADMIN' ? 999 : u.sezioniVisibili.length || 998) : k === 'l' ? (ultimo(u) ?? '') : (u.attivo ? 0 : 1), { key: 'n', dir: 'asc' });

  if (loading) return <Page><Card pad><Empty>Caricamento utenti…</Empty></Card></Page>;
  if (error) return <Page><Alert tone="ko" title="Errore" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></Page>;

  const attivi = utenti.filter(u => u.attivo).length;
  const sel = utenti.find((u) => u.id === selId) ?? utenti.find((u) => u.ruolo !== 'ADMIN') ?? utenti[0];
  const selSez = sezDraft ?? sel?.sezioniVisibili ?? [];
  const isSelAdmin = sel?.ruolo === 'ADMIN';
  const top = stats?.perUtente[0];
  const topPct = stats && top && stats.totale ? Math.round(top.count / stats.totale * 100) : 0;
  const maiEntrati = stats ? utenti.filter((u) => u.attivo && !ultimo(u)) : [];
  const scegli = (u: User) => { setSelId(u.id); setSezDraft(null); };
  const salvaSezioni = async () => {
    if (!sel) return;
    setSavingSez(true);
    try { await handleSalvaSezioni(sel.id, selSez); setSezDraft(null); }
    catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSavingSez(false); }
  };
  const fmtAcc = (d: string | null) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : 'Mai';

  return (
    <Page>
      <PageHeader eyebrow="Sistema" title="Utenti" sub="Accessi al gestionale, ruoli e sezioni visibili" />

      {stats && (topPct > 60 || maiEntrati.length > 0) && (
        <Alert tone="warn" title={topPct > 60 ? `Il ${topPct}% delle modifiche risulta fatto da ${top?.nome}` : `${maiEntrati.length} utenti non hanno mai fatto accesso`}>
          {maiEntrati.length > 0 && `${maiEntrati.map((u) => u.nome).join(', ')} non ${maiEntrati.length === 1 ? 'ha' : 'hanno'} mai fatto accesso col proprio utente. `}
          Con un accesso personale per ognuno lo storico dice chi ha cambiato cosa.
        </Alert>
      )}

      <div className="ds-g4">
        <Card className="ds-s3">
          <div className="um-head">
            <CardHead title="Utenti" sub={`${attivi} attivi · ${utenti.length - attivi} disattivati`} />
            <Button variant="primary" size="sm" icon="plus" onClick={() => setShowNuovo(true)}>Nuovo utente</Button>
          </div>
          <div className="ds-tablewrap">
            <table className="ds-table um-table">
              <colgroup><col /><col style={{ width: '15%' }} /><col style={{ width: 136 }} /><col style={{ width: 76 }} /><col style={{ width: 122 }} /><col style={{ width: 88 }} /><col style={{ width: 128 }} /></colgroup>
              <thead><tr>
                <Th k="n" sort={sort} onSort={toggle}>Nome</Th>
                <Th k="a" sort={sort} onSort={toggle}>Accesso</Th>
                <Th k="r" sort={sort} onSort={toggle}>Ruolo</Th>
                <Th k="p" sort={sort} onSort={toggle}>Sezioni</Th>
                <Th k="l" sort={sort} onSort={toggle}>Ultimo accesso</Th>
                <Th k="s" sort={sort} onSort={toggle}>Stato</Th>
                <th />
              </tr></thead>
              <tbody>
                {sorted.map((u) => {
                  const rm = RUOLO_META[u.ruolo];
                  const on = sel?.id === u.id;
                  const acc = ultimo(u);
                  return (
                    <tr key={u.id} className={`is-clickable${on ? ' is-open' : ''}`} style={{ opacity: u.attivo ? 1 : 0.55 }} onClick={() => scegli(u)}>
                      <td style={{ fontWeight: 600 }} className="um-ell">{u.nome} {u.cognome}</td>
                      <td className="um-ell um-mono" title={u.email}>{u.email}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className="um-role"><i style={{ background: rm.color }} />
                          <select value={u.ruolo} onChange={(e) => handleCambioRuolo(u.id, e.target.value)} aria-label={`Ruolo di ${u.nome}`}>
                            <option value="ADMIN">Amministratore</option>
                            <option value="OPERATORE">Operatore</option>
                            <option value="VIEWER">Solo lettura</option>
                          </select>
                        </span>
                      </td>
                      <td style={{ color: '#52525B' }}>{u.ruolo === 'ADMIN' ? 'Tutte' : u.sezioniVisibili.length === 0 ? 'Nessun limite' : `${u.sezioniVisibili.length} di ${SEZIONI.length}`}</td>
                      <td style={{ color: acc ? '#3F3F46' : '#A1A1AA', whiteSpace: 'nowrap' }}>{stats ? fmtAcc(acc) : '…'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" role="switch" aria-checked={u.attivo} className={`imp2-tog${u.attivo ? ' is-on' : ''}`} onClick={() => handleToggleAttivo(u.id)}><i />{u.attivo ? 'Attivo' : 'Disattivo'}</button>
                      </td>
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        <span className="um-acts">
                          <IconButton icon="edit" label="Modifica nome, cognome, email" onClick={() => setModificaUser(u)} />
                          <IconButton icon="lock" label="Cambia password" onClick={() => setCambioPasswordId(u.id)} />
                          {isAdmin && <IconButton icon="eye" label="Visualizza password" onClick={() => setPasswordUser(u)} />}
                          <IconButton icon="trash" danger label="Elimina utente" onClick={() => handleElimina(u.id, u.nome + ' ' + u.cognome)} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {utenti.length === 0 && <Empty>Nessun utente trovato</Empty>}
        </Card>

        <Card pad className="um-perm">
          <CardHead title="Sezioni visibili" sub={sel ? `${sel.nome} ${sel.cognome} · ${RUOLO_META[sel.ruolo].label}` : ''} />
          <span className="ds-cardsub">Gli amministratori vedono tutto. Per operatori e lettori si sceglie sezione per sezione; con la lista vuota non ci sono limiti.</span>
          {sel && (<>
            <div className="um-checks">
              {SEZIONI.map(({ key, label }) => {
                const on = isSelAdmin || selSez.includes(key);
                return (
                  <label key={key} className={on ? 'is-on' : ''}>
                    <input type="checkbox" checked={on} disabled={isSelAdmin}
                      onChange={() => setSezDraft(selSez.includes(key) ? selSez.filter((k) => k !== key) : [...selSez, key])} />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            {!isSelAdmin && (
              <div className="um-permfoot">
                <button type="button" className="um-link" onClick={() => setSezDraft(SEZIONI.every((x) => selSez.includes(x.key)) ? [] : SEZIONI.map((x) => x.key))}>
                  {SEZIONI.every((x) => selSez.includes(x.key)) ? 'Deseleziona tutto' : 'Seleziona tutto'}
                </button>
                <Button size="sm" icon="check" onClick={salvaSezioni} disabled={savingSez || sezDraft === null}>{savingSez ? 'Salvataggio…' : 'Salva permessi'}</Button>
              </div>
            )}
          </>)}
        </Card>
      </div>

      <NuovoUtenteModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleCrea} />

      {sezioniUser && (
        <SezioniModal
          user={sezioniUser}
          onClose={() => setSezioniUser(null)}
          onSave={(sezioni) => handleSalvaSezioni(sezioniUser.id, sezioni)}
        />
      )}

      {cambioPasswordId && (
        <CambioPasswordModal userId={cambioPasswordId} onClose={() => setCambioPasswordId(null)} />
      )}

      {passwordUser && (
        <MostraPasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} />
      )}

      {modificaUser && (
        <ModificaUtenteModal
          user={modificaUser}
          onClose={() => setModificaUser(null)}
          onSave={(data) => handleModifica(modificaUser.id, data)}
        />
      )}
    </Page>
  );
}
