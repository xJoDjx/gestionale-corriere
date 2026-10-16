import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type Section = 'all' | 'padroncini' | 'mezzi' | 'palmari' | 'codici-autisti' | 'acconti' | 'ricariche' | 'conteggi';

type EntityRestoreType = 'mezzo' | 'padroncino' | 'palmare' | 'codice_autista' | 'acconto' | 'conteggio_mensile';

type Action =
  | { kind: 'backup' }
  | { kind: 'reset'; section: Section }
  | { kind: 'cleanup-logs'; giorni: number }
  | { kind: 'list-deleted'; entityType: EntityRestoreType }
  | { kind: 'restore'; entityType: EntityRestoreType; entityId: string; label: string };

const RESET_ITEMS: { section: Section; label: string; icon: string; danger?: 'high' | 'critical' }[] = [
  { section: 'all', label: 'Azzera TUTTO il database', icon: '💥', danger: 'critical' },
  { section: 'padroncini', label: 'Azzera Padroncini', icon: '👷', danger: 'high' },
  { section: 'mezzi', label: 'Azzera Flotta Mezzi', icon: '🚚', danger: 'high' },
  { section: 'palmari', label: 'Azzera Palmari', icon: '📱', danger: 'high' },
  { section: 'codici-autisti', label: 'Azzera Codici Autisti', icon: '🆔', danger: 'high' },
  { section: 'acconti', label: 'Azzera Acconti', icon: '💰' },
  { section: 'ricariche', label: 'Azzera Ricariche Mezzi', icon: '⚡' },
  { section: 'conteggi', label: 'Azzera Conteggi Mensili', icon: '📋', danger: 'high' },
];

const RESTORE_ENTITY_TYPES: { entityType: EntityRestoreType; label: string; icon: string }[] = [
  { entityType: 'mezzo', label: 'Mezzi', icon: '🚚' },
  { entityType: 'padroncino', label: 'Padroncini', icon: '👷' },
  { entityType: 'palmare', label: 'Palmari', icon: '📱' },
  { entityType: 'codice_autista', label: 'Codici Autista', icon: '🆔' },
  { entityType: 'acconto', label: 'Acconti', icon: '💰' },
  { entityType: 'conteggio_mensile', label: 'Conteggi Mensili', icon: '📋' },
];

/** Estrae titolo + sottotitolo leggibili da un record eliminato, a seconda del tipo. */
function describeDeleted(entityType: EntityRestoreType, item: any): { title: string; subtitle: string } {
  switch (entityType) {
    case 'mezzo':
      return { title: `${item.targa} — ${item.marca} ${item.modello}`, subtitle: item.utilizzatore ? `Utilizzatore: ${item.utilizzatore}` : (item.categoria ?? '') };
    case 'padroncino':
      return { title: item.ragioneSociale, subtitle: item.partitaIva ?? item.codiceFiscale ?? '' };
    case 'palmare':
      return { title: item.codice, subtitle: [item.marca, item.modello].filter(Boolean).join(' ') };
    case 'codice_autista':
      return { title: item.codice, subtitle: [item.nome, item.cognome].filter(Boolean).join(' ') };
    case 'acconto':
      return {
        title: `€ ${Number(item.importo ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
        subtitle: [item.codiceAutista?.codice, item.descrizione, item.mese].filter(Boolean).join(' · '),
      };
    case 'conteggio_mensile':
      return { title: item.mese, subtitle: item.padroncino?.ragioneSociale ?? '' };
    default:
      return { title: item.id, subtitle: '' };
  }
}

const RETENTION_OPTIONS = [
  { giorni: 30,  label: 'Ultimi 30 giorni' },
  { giorni: 60,  label: 'Ultimi 60 giorni' },
  { giorni: 90,  label: 'Ultimi 90 giorni' },
  { giorni: 180, label: 'Ultimi 6 mesi' },
  { giorni: 365, label: 'Ultimo anno' },
];

interface LogStats {
  totale: number;
  oldest: string | null;
  eliminabili: { giorni: number; count: number }[];
}

export default function GestioneDb() {
  const user = useAuthStore((s) => s.user);
  const [pending, setPending] = useState<Action | null>(null);
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [retentionDays, setRetentionDays] = useState(90);
  const [deletedType, setDeletedType] = useState<EntityRestoreType>('mezzo');
  const [deletedList, setDeletedList] = useState<any[] | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/db-admin/log-stats`)
      .then((r) => r.json())
      .then(setLogStats)
      .catch(() => {});
  }, []);

  const open = (action: Action) => {
    setPending(action);
    setEmail(user?.email ?? '');
    setPassword('');
    setErr(null);
  };
  const close = () => {
    if (busy) return;
    setPending(null);
    setPassword('');
    setErr(null);
  };

  const confirmLabel = () => {
    if (!pending) return '';
    if (pending.kind === 'backup') return 'Esegui backup';
    if (pending.kind === 'cleanup-logs') return `Elimina log più vecchi di ${pending.giorni} giorni`;
    if (pending.kind === 'list-deleted') return 'Cerca eliminati';
    if (pending.kind === 'restore') return 'Ripristina';
    return pending.section === 'all' ? 'Azzera tutto il DB' : 'Conferma azzeramento';
  };

  const titleLabel = () => {
    if (!pending) return '';
    if (pending.kind === 'backup') return 'Backup database';
    if (pending.kind === 'cleanup-logs') return '🧹 Pulizia log storici';
    if (pending.kind === 'list-deleted') {
      const item = RESTORE_ENTITY_TYPES.find((i) => i.entityType === pending.entityType);
      return `🆘 Cerca ${item?.label ?? ''} eliminati`;
    }
    if (pending.kind === 'restore') return `♻️ Ripristina: ${pending.label}`;
    const item = RESET_ITEMS.find((i) => i.section === pending.section);
    return item?.label ?? 'Conferma';
  };

  const execute = async () => {
    if (!pending) return;
    if (!email.trim()) { setErr('Inserisci l\'email admin'); return; }
    if (!password) { setErr('Inserisci la password'); return; }
    setBusy(true);
    setErr(null);
    try {
      if (pending.kind === 'backup') {
        const res = await fetch(`${API_BASE}/db-admin/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(e.message || 'Errore backup');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `backup-gestionale-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

      } else if (pending.kind === 'cleanup-logs') {
        const res = await fetch(`${API_BASE}/db-admin/cleanup-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, giorni: pending.giorni }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(e.message || 'Errore pulizia log');
        }
        const data = await res.json();
        alert(`✅ Eliminati ${data.eliminati} log più vecchi di ${pending.giorni} giorni.`);
        // Aggiorna le statistiche
        const statsRes = await fetch(`${API_BASE}/db-admin/log-stats`);
        if (statsRes.ok) setLogStats(await statsRes.json());

      } else if (pending.kind === 'list-deleted') {
        const res = await fetch(`${API_BASE}/db-admin/deleted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, entityType: pending.entityType }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(e.message || 'Errore ricerca eliminati');
        }
        const data = await res.json();
        setDeletedType(pending.entityType);
        setDeletedList(data);

      } else if (pending.kind === 'restore') {
        const res = await fetch(`${API_BASE}/db-admin/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, entityType: pending.entityType, entityId: pending.entityId }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(e.message || 'Errore ripristino');
        }
        setDeletedList((list) => list?.filter((x) => x.id !== pending.entityId) ?? null);
        alert(`✅ ${pending.label} ripristinato con successo.`);

      } else {
        const res = await fetch(`${API_BASE}/db-admin/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, section: pending.section }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(e.message || 'Errore azzeramento');
        }
        const sezioniConChecklist: Section[] = ['all', 'padroncini', 'conteggi'];
        if (sezioniConChecklist.includes(pending.section)) {
          const keysDaRimuovere: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('checklist_')) keysDaRimuovere.push(k);
          }
          keysDaRimuovere.forEach((k) => localStorage.removeItem(k));
        }
        alert('Operazione completata con successo.');
      }
      setPending(null);
      setPassword('');
    } catch (e: any) {
      setErr(e.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  // Quanti log verrebbero eliminati con la retention selezionata
  const eliminabiliCount = logStats?.eliminabili.find((e) => e.giorni === retentionDays)?.count ?? 0;

  const fmtDate = (s: string | null) => s
    ? new Date(s).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const confirmBtnClass = () => {
    if (!pending) return 'btn-primary';
    switch (pending.kind) {
      case 'backup': return 'btn-primary';
      case 'cleanup-logs': return 'btn-warning';
      case 'list-deleted': return 'btn-primary';
      case 'restore': return 'btn-success';
      case 'reset': return pending.section === 'all' ? 'btn-critical' : 'btn-warning';
      default: return 'btn-primary';
    }
  };

  return (
    <div className="db-admin">
      <div className="db-admin-intro">
        <h2>🗄️ Gestione Database</h2>
        <p>
          Area riservata agli amministratori. Le operazioni di azzeramento sono <strong>irreversibili</strong>.
          Esegui sempre un backup prima di procedere.
        </p>
      </div>

      {/* ── SEZIONE LOG ── */}
      <div className="db-admin-section-title">📋 Gestione Log Storici</div>
      <div className="db-admin-log-card">
        <div className="db-admin-log-stats">
          <div className="db-admin-log-stat">
            <span className="db-admin-log-stat-val">{logStats?.totale?.toLocaleString('it-IT') ?? '…'}</span>
            <span className="db-admin-log-stat-label">Log totali</span>
          </div>
          <div className="db-admin-log-stat">
            <span className="db-admin-log-stat-val">{fmtDate(logStats?.oldest ?? null)}</span>
            <span className="db-admin-log-stat-label">Log più vecchio</span>
          </div>
          <div className="db-admin-log-stat">
            <span className="db-admin-log-stat-val" style={{ color: eliminabiliCount > 0 ? 'var(--warning, #f59e0b)' : 'var(--text-muted)' }}>
              {eliminabiliCount.toLocaleString('it-IT')}
            </span>
            <span className="db-admin-log-stat-label">Eliminabili ora</span>
          </div>
        </div>

        <div className="db-admin-log-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Mantieni:</span>
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.giorni}
                className={`fm-filter-btn ${retentionDays === opt.giorni ? 'fm-filter-active' : ''}`}
                onClick={() => setRetentionDays(opt.giorni)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            className="btn-warning"
            disabled={eliminabiliCount === 0}
            onClick={() => open({ kind: 'cleanup-logs', giorni: retentionDays })}
            style={{ marginTop: 12 }}
          >
            🧹 Elimina {eliminabiliCount > 0 ? `${eliminabiliCount.toLocaleString('it-IT')} log` : 'log'} più vecchi di {retentionDays} giorni
          </button>
        </div>
      </div>

      {/* ── SEZIONE BACKUP / RESET ── */}
      <div className="db-admin-section-title">⚙️ Backup e Reset</div>
      <div className="db-admin-grid">
        <div className="db-admin-card db-admin-card-safe">
          <div className="db-admin-card-head">
            <span className="db-admin-icon">💾</span>
            <h3>Backup database</h3>
          </div>
          <p>Scarica un file JSON con tutti i dati del database.</p>
          <button className="btn-primary" onClick={() => open({ kind: 'backup' })}>
            Scarica backup
          </button>
        </div>

        {RESET_ITEMS.map((it) => (
          <div
            key={it.section}
            className={`db-admin-card ${
              it.danger === 'critical' ? 'db-admin-card-critical' : 'db-admin-card-danger'
            }`}
          >
            <div className="db-admin-card-head">
              <span className="db-admin-icon">{it.icon}</span>
              <h3>{it.label}</h3>
            </div>
            <p>
              {it.section === 'all'
                ? 'Cancella completamente tutti i dati operativi (utenti esclusi).'
                : 'Cancellazione permanente dei record correlati.'}
            </p>
            <button
              className={it.danger === 'critical' ? 'btn-critical' : 'btn-warning'}
              onClick={() => open({ kind: 'reset', section: it.section })}
            >
              Azzera
            </button>
          </div>
        ))}
      </div>

      {/* ── SEZIONE RIPRISTINO EMERGENZA ── */}
      <div className="db-admin-section-title">🆘 Ripristino Emergenza</div>
      <div className="db-admin-restore-card">
        <p className="db-admin-restore-intro">
          Le eliminazioni nel gestionale sono <strong>reversibili</strong>: il record resta nel database,
          solo nascosto dalle liste. Scegli un tipo per cercare gli elementi eliminati e ripristinarli.
        </p>
        <div className="db-admin-restore-types">
          {RESTORE_ENTITY_TYPES.map((t) => (
            <button
              key={t.entityType}
              className={`fm-filter-btn ${deletedList && deletedType === t.entityType ? 'fm-filter-active' : ''}`}
              onClick={() => open({ kind: 'list-deleted', entityType: t.entityType })}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {deletedList && (
          <div className="db-admin-restore-list">
            {deletedList.length === 0 ? (
              <div className="db-admin-restore-empty">
                Nessun elemento eliminato trovato in questa categoria.
              </div>
            ) : (
              deletedList.map((item) => {
                const { title, subtitle } = describeDeleted(deletedType, item);
                return (
                  <div key={item.id} className="db-admin-restore-item">
                    <div className="db-admin-restore-info">
                      <span className="db-admin-restore-title">{title}</span>
                      {subtitle && <span className="db-admin-restore-subtitle">{subtitle}</span>}
                      <span className="db-admin-restore-meta">Eliminato il {fmtDate(item.deletedAt)}</span>
                    </div>
                    <button
                      className="btn-success"
                      onClick={() => open({ kind: 'restore', entityType: deletedType, entityId: item.id, label: title })}
                    >
                      ♻️ Ripristina
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── MODALE CONFERMA ── */}
      {pending && (
        <div className="imp-modal-backdrop" onClick={close}>
          <div className="imp-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{titleLabel()}</h2>
            {pending.kind === 'cleanup-logs' && (
              <div className="db-admin-warning">
                Verranno eliminati <strong>{eliminabiliCount.toLocaleString('it-IT')} log</strong> precedenti al{' '}
                {fmtDate(new Date(Date.now() - pending.giorni * 86400000).toISOString())}.
                I log più recenti ({pending.giorni} giorni) saranno conservati.
              </div>
            )}
            {pending.kind === 'reset' && (
              <div className="db-admin-warning">
                ⚠️ Questa operazione è <strong>irreversibile</strong>. Tutti i record verranno eliminati.
              </div>
            )}
            {pending.kind === 'list-deleted' && (
              <div className="db-admin-info">
                Verranno mostrati gli ultimi elementi eliminati in questa categoria, con la data di eliminazione.
              </div>
            )}
            {pending.kind === 'restore' && (
              <div className="db-admin-info">
                ♻️ <strong>{pending.label}</strong> tornerà visibile in tutte le liste e i conteggi, come prima
                dell'eliminazione.
              </div>
            )}
            <div className="imp-field">
              <label>Email admin</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@gestionale.it"
                autoComplete="username"
              />
            </div>
            <div className="imp-field">
              <label>Password admin</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') execute(); }}
                placeholder="Password"
                autoComplete="current-password"
              />
            </div>
            {err && <div className="db-admin-error">{err}</div>}
            <div className="imp-modal-actions">
              <button className="btn-outline" onClick={close} disabled={busy}>
                Annulla
              </button>
              <button
                className={confirmBtnClass()}
                onClick={execute}
                disabled={busy}
              >
                {busy ? 'Attendere...' : confirmLabel()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
