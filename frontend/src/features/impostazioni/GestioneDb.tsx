import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { Card, CardHead, Button, IconButton, Alert, Empty, Icon, C } from '../../components/ds';

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
  { section: 'mezzi', label: 'Azzera Flotta mezzi', icon: '🚚', danger: 'high' },
  { section: 'palmari', label: 'Azzera Palmari', icon: '📱', danger: 'high' },
  { section: 'codici-autisti', label: 'Azzera Codici autista', icon: '🆔', danger: 'high' },
  { section: 'acconti', label: 'Azzera Acconti', icon: '💰' },
  { section: 'ricariche', label: 'Azzera Ricariche mezzi', icon: '⚡' },
  { section: 'conteggi', label: 'Azzera Conteggi mensili', icon: '📋', danger: 'high' },
];

const RESTORE_ENTITY_TYPES: { entityType: EntityRestoreType; label: string; icon: string }[] = [
  { entityType: 'mezzo', label: 'Mezzi', icon: '🚚' },
  { entityType: 'padroncino', label: 'Padroncini', icon: '👷' },
  { entityType: 'palmare', label: 'Palmari', icon: '📱' },
  { entityType: 'codice_autista', label: 'Codici autista', icon: '🆔' },
  { entityType: 'acconto', label: 'Acconti', icon: '💰' },
  { entityType: 'conteggio_mensile', label: 'Conteggi mensili', icon: '📋' },
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
        alert(`Eliminati ${data.eliminati} log più vecchi di ${pending.giorni} giorni.`);
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
        alert(`${pending.label} ripristinato con successo.`);

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

  const RESET_SUB: Record<Section, string> = {
    all: 'Tutti i dati operativi, utenti esclusi', padroncini: 'Padroncini e relativi collegamenti', mezzi: 'Mezzi e assegnazioni',
    palmari: 'Palmari e assegnazioni', 'codici-autisti': 'Codici e assegnazioni', acconti: 'Tutti gli acconti',
    ricariche: 'Sessioni di ricarica', conteggi: 'Conteggi e righe',
  };
  const dangerBtn = pending && (pending.kind === 'reset' || pending.kind === 'cleanup-logs');

  return (
    <div className="db2">
      <div className="ds-g3">
        <Card pad className="db2-card">
          <div className="db2-h"><span className="db2-ic" style={{ background: C.blue }}><Icon name="db" size={13} /></span><CardHead title="Backup" sub="Copia completa in un file JSON" /></div>
          <div className="db2-kv"><span>Contenuto</span><b>Tutti i dati del database</b></div>
          <div className="db2-kv"><span>Conferma</span><b>Email e password admin</b></div>
          <Button variant="primary" icon="download" onClick={() => open({ kind: 'backup' })}>Scarica backup</Button>
        </Card>
        <Card pad className="db2-card">
          <div className="db2-h"><span className="db2-ic" style={{ background: C.purple }}><Icon name="clock" size={13} /></span><CardHead title="Pulizia storico modifiche" sub="Elimina gli eventi più vecchi del periodo scelto" /></div>
          <div className="db2-kv"><span>Eventi totali · dal</span><b>{logStats ? Number(logStats.totale).toLocaleString('it-IT') : '…'} · {fmtDate(logStats?.oldest ?? null)}</b></div>
          <div role="group" aria-label="Conserva" className="db2-ret">
            {RETENTION_OPTIONS.map((opt) => (
              <button key={opt.giorni} type="button" aria-pressed={retentionDays === opt.giorni} className={retentionDays === opt.giorni ? 'is-on' : ''} onClick={() => setRetentionDays(opt.giorni)}>
                Conserva {opt.label.replace(/^Ultim[io] /, '')}
              </button>
            ))}
          </div>
          <div className="db2-kv"><span>Eliminabili ora</span><b style={{ color: eliminabiliCount > 0 ? '#B91C1C' : '#A1A1AA' }}>{eliminabiliCount > 0 ? `${Number(eliminabiliCount).toLocaleString('it-IT')} eventi` : 'nessuno'}</b></div>
          <Button size="sm" icon="trash" disabled={eliminabiliCount === 0} onClick={() => open({ kind: 'cleanup-logs', giorni: retentionDays })}>Elimina eventi più vecchi</Button>
        </Card>
        <Card pad className="db2-card">
          <div className="db2-h"><span className="db2-ic" style={{ background: C.green }}><Icon name="restore" size={13} /></span><CardHead title="Record eliminati" sub="Si possono ripristinare uno per uno" /></div>
          <div className="db2-del">
            {RESTORE_ENTITY_TYPES.map((t) => {
              const on = !!deletedList && deletedType === t.entityType;
              return (
                <button key={t.entityType} type="button" className={on ? 'is-on' : ''} onClick={() => open({ kind: 'list-deleted', entityType: t.entityType })}>
                  <span>{t.label}</span>
                  <em>{on ? `${deletedList!.length} eliminati` : 'Cerca'}</em>
                  <Icon name="chevRight" size={12} />
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {deletedList && (
        <Card>
          <div style={{ padding: '14px 18px 10px' }}><CardHead title={`${RESTORE_ENTITY_TYPES.find((t) => t.entityType === deletedType)?.label ?? ''} eliminati`} sub="Il record torna visibile in tutte le liste e i conteggi" actions={<IconButton icon="close" label="Chiudi" onClick={() => setDeletedList(null)} />} /></div>
          {deletedList.length === 0 ? <Empty>Nessun elemento eliminato trovato in questa categoria.</Empty> : (
            <div className="db2-list">
              {deletedList.map((item) => {
                const { title, subtitle } = describeDeleted(deletedType, item);
                return (
                  <div key={item.id} className="db2-item">
                    <div><b>{title}</b>{subtitle && <span>{subtitle}</span>}</div>
                    <span className="ds-cardsub">Eliminato il {fmtDate(item.deletedAt)}</span>
                    <Button size="sm" icon="restore" onClick={() => open({ kind: 'restore', entityType: deletedType, entityId: item.id, label: title })}>Ripristina</Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <section className="db2-danger">
        <div className="db2-dh"><CardHead title="Zona pericolosa" sub="Azzera un archivio. Operazione irreversibile: scarica prima un backup. Serve la conferma con email e password admin." /></div>
        {RESET_ITEMS.map((it) => (
          <div key={it.section} className="db2-row">
            <i style={{ background: it.danger === 'critical' ? C.red : C.orange }} />
            <span style={{ fontWeight: it.section === 'all' ? 600 : 400 }}>{it.section === 'all' ? 'Tutto il database' : it.label.replace(/^Azzera /, '')}</span>
            <em>{RESET_SUB[it.section]}</em>
            <button type="button" className={it.section === 'all' ? 'is-crit' : ''} onClick={() => open({ kind: 'reset', section: it.section })}>Azzera</button>
          </div>
        ))}
      </section>

      {pending && (
        <div className="ds-modal-backdrop db2-backdrop" onClick={close}>
          <div className="ds-card db2-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2>{titleLabel().replace(/^[^\p{L}]+/u, '')}</h2>
            {pending.kind === 'cleanup-logs' && (
              <Alert tone="warn">Verranno eliminati <strong>{eliminabiliCount.toLocaleString('it-IT')} eventi</strong> precedenti al {fmtDate(new Date(Date.now() - pending.giorni * 86400000).toISOString())}. Quelli degli ultimi {pending.giorni} giorni restano.</Alert>
            )}
            {pending.kind === 'reset' && <Alert tone="ko">Questa operazione è <strong>irreversibile</strong>. Tutti i record verranno eliminati.</Alert>}
            {pending.kind === 'list-deleted' && <Alert tone="info">Verranno mostrati gli ultimi elementi eliminati in questa categoria, con la data di eliminazione.</Alert>}
            {pending.kind === 'restore' && <Alert tone="info"><strong>{pending.label}</strong> tornerà visibile in tutte le liste e i conteggi, come prima dell'eliminazione.</Alert>}
            <label className="db2-field"><span>Email admin</span>
              <input className="ds-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@gestionale.it" autoComplete="username" />
            </label>
            <label className="db2-field"><span>Password admin</span>
              <input className="ds-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') execute(); }} placeholder="Password" autoComplete="current-password" />
            </label>
            {err && <Alert tone="ko">{err}</Alert>}
            <div className="db2-actions">
              <Button onClick={close} disabled={busy}>Annulla</Button>
              <Button variant={dangerBtn ? 'danger' : 'primary'} onClick={execute} disabled={busy}>{busy ? 'Attendere…' : confirmLabel()}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
