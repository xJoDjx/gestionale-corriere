// src/features/storico/StoricoAttivita.tsx
// Pagina "lista completa" dei riquadri Ultime Note / Ultime Modifiche / Cose da Fare
// delle pagine Flotta Mezzi, Palmari e Codici Autista, con ricerca.
// Route: /storico/:sezione?tab=note|modifiche|attivita&q=...
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, mezziApi, palmariApi, codiciAutistaApi, noteApi, taskApi } from '../../lib/api';
import type { Nota, TaskItem } from '../../lib/api';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData, TaskRefField } from '../../components/ui/TaskModal';
import '../../components/ui/TaskModal.css';
import { type AuditEntry, getHumanReadableDescription, fmtDate, AZIONE_LABELS } from '../../lib/auditFormat';
import './StoricoAttivita.css';

type Tab = 'note' | 'modifiche' | 'attivita';
interface Ent { id: string; code: string; sub: string }

interface SezioneCfg {
  titolo: string;
  icon: string;
  back: string;
  noteType: string;
  auditTypes: string;
  taskType: string;
  taskId: string;
  codeLabel: string;
  taskField: TaskRefField;
  /** chiavi del payload audit che contengono il codice "umano" dell'entità (per eventi assegnazione_*) */
  auditCodeKeys: string[];
  detail: (id: string) => string;
  loadEntities: () => Promise<Ent[]>;
}

const SEZIONI: Record<string, SezioneCfg> = {
  mezzi: {
    titolo: 'Flotta Mezzi', icon: '🚛', back: '/flotta',
    noteType: 'mezzo', auditTypes: 'mezzo,assegnazione_mezzo',
    taskType: 'flotta', taskId: 'mezzi',
    codeLabel: 'Targa', taskField: 'targa', auditCodeKeys: ['targa'],
    detail: id => `/flotta/${id}`,
    loadEntities: async () => (await mezziApi.list({ limit: '5000' })).data
      .map(m => ({ id: m.id, code: m.targa, sub: `${m.marca ?? ''} ${m.modello ?? ''}`.trim() })),
  },
  palmari: {
    titolo: 'Palmari', icon: '📱', back: '/palmari',
    noteType: 'palmare', auditTypes: 'palmare,assegnazione_palmare',
    taskType: 'palmari', taskId: 'palmari',
    codeLabel: 'Palmare', taskField: 'palmare', auditCodeKeys: ['codicePalmare', 'codice'],
    detail: id => `/palmari/${id}`,
    loadEntities: async () => (await palmariApi.list({ limit: '5000' })).data
      .map((p: any) => ({ id: p.id, code: p.codice, sub: [p.marca, p.modello].filter(Boolean).join(' ') })),
  },
  'codici-autista': {
    titolo: 'Codici Autista', icon: '🏷️', back: '/codici-autista',
    noteType: 'codice_autista', auditTypes: 'codice_autista,assegnazione_codice_autista',
    taskType: 'codici-autista', taskId: 'autisti',
    codeLabel: 'Codice', taskField: 'codiceAutista', auditCodeKeys: ['codiceAutista', 'codice'],
    detail: id => `/codici-autista/${id}`,
    loadEntities: async () => (await codiciAutistaApi.list({ limit: '5000' })).data
      .map((c: any) => ({ id: c.id, code: c.codice, sub: `${c.nome ?? ''} ${c.cognome ?? ''}`.trim() })),
  },
};

const PAGE_SIZE = 50;

const fullName = (u: { nome?: string; cognome?: string } | null | undefined) =>
  u ? `${u.nome ?? ''} ${u.cognome ?? ''}`.trim() : '';

/** Evidenzia le occorrenze della query nel testo */
function hl(text: string, q: string) {
  if (!q.trim() || !text) return text;
  const esc = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'ig'));
  return parts.map((p, i) => p.toLowerCase() === q.trim().toLowerCase() ? <mark key={i}>{p}</mark> : p);
}

/** Tutte le parole della query devono comparire nel testo (ordine libero) */
const matchesAll = (haystack: string, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const h = haystack.toLowerCase();
  return words.every(w => h.includes(w));
};

export default function StoricoAttivita() {
  const { sezione = 'mezzi' } = useParams();
  const cfg = SEZIONI[sezione];
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'note';
  const q = params.get('q') ?? '';

  const setTab = (t: Tab) => setParams(p => { p.set('tab', t); return p; }, { replace: true });
  const setQ   = (v: string) => setParams(p => { if (v) p.set('q', v); else p.delete('q'); return p; }, { replace: true });

  const [entities, setEntities] = useState<Ent[]>([]);
  const entMap = useMemo(() => new Map(entities.map(e => [e.id, e])), [entities]);
  const entByCode = useMemo(() => new Map(entities.map(e => [e.code, e])), [entities]);

  useEffect(() => {
    if (!cfg) return;
    cfg.loadEntities().then(setEntities).catch(() => setEntities([]));
  }, [cfg]);

  if (!cfg) {
    return <div className="st-page"><div className="st-empty">Sezione "{sezione}" non trovata.</div></div>;
  }

  return (
    <div className="st-page">
      <div className="st-header">
        <Link to={cfg.back} className="st-back">← {cfg.titolo}</Link>
        <h1>{cfg.icon} Storico {cfg.titolo}</h1>
        <p className="st-sub">Lista completa di note, modifiche e attività, con ricerca per {cfg.codeLabel.toLowerCase()}, testo o utente.</p>
      </div>

      <div className="st-tabs">
        <button className={`st-tab ${tab === 'note' ? 'st-tab-active' : ''}`}      onClick={() => setTab('note')}>📝 Note</button>
        <button className={`st-tab ${tab === 'modifiche' ? 'st-tab-active' : ''}`} onClick={() => setTab('modifiche')}>🕐 Modifiche</button>
        <button className={`st-tab ${tab === 'attivita' ? 'st-tab-active' : ''}`}  onClick={() => setTab('attivita')}>✅ Cose da fare</button>
      </div>

      <div className="st-searchbar">
        <span className="st-search-icon">🔍</span>
        <input
          className="st-search"
          autoFocus
          placeholder={`Cerca per ${cfg.codeLabel.toLowerCase()}, testo, utente…`}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        {q && <button className="st-search-clear" onClick={() => setQ('')}>✕</button>}
      </div>

      {tab === 'note'      && <TabNote      cfg={cfg} q={q} entMap={entMap} navigate={navigate} />}
      {tab === 'modifiche' && <TabModifiche cfg={cfg} q={q} entMap={entMap} entByCode={entByCode} navigate={navigate} />}
      {tab === 'attivita'  && <TabAttivita  cfg={cfg} q={q} entities={entities} entByCode={entByCode} navigate={navigate} />}
    </div>
  );
}

// ─── NOTE ─────────────────────────────────────────────────────────────────────

function TabNote({ cfg, q, entMap, navigate }: {
  cfg: SezioneCfg; q: string; entMap: Map<string, Ent>; navigate: (to: string) => void;
}) {
  const [note, setNote] = useState<Nota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    setNote(null); setError(null);
    noteApi.list(cfg.noteType, undefined, 10000).then(setNote).catch(e => setError(e.message ?? 'Errore'));
  }, [cfg]);
  useEffect(() => { setShown(PAGE_SIZE); }, [q]);

  const filtered = useMemo(() => (note ?? []).filter(n => {
    if (!q.trim()) return true;
    const e = entMap.get(n.entityId);
    return matchesAll(`${n.contenuto} ${e?.code ?? ''} ${e?.sub ?? ''} ${fullName(n.user)} ${new Date(n.createdAt).toLocaleDateString('it-IT')}`, q);
  }), [note, q, entMap]);

  if (error) return <div className="st-error">⚠️ {error}</div>;
  if (!note) return <div className="st-loading">Caricamento note…</div>;

  return (
    <div className="st-card">
      <div className="st-count">{filtered.length} note{q && ` su ${note.length}`}</div>
      {filtered.length === 0
        ? <div className="st-empty">Nessuna nota trovata</div>
        : (
          <table className="st-table">
            <thead><tr><th style={{ width: 110 }}>Data</th><th style={{ width: 170 }}>{cfg.codeLabel}</th><th>Nota</th><th style={{ width: 140 }}>Utente</th></tr></thead>
            <tbody>
              {filtered.slice(0, shown).map(n => {
                const e = entMap.get(n.entityId);
                return (
                  <tr key={n.id} className="st-row" onClick={() => navigate(cfg.detail(n.entityId))}>
                    <td className="st-date">{new Date(n.createdAt).toLocaleDateString('it-IT')}</td>
                    <td><span className="st-code">{hl(e?.code ?? '—', q)}</span>{e?.sub && <div className="st-code-sub">{hl(e.sub, q)}</div>}</td>
                    <td className="st-text">{hl(n.contenuto, q)}</td>
                    <td className="st-user" title={fullName(n.user)}>{hl(fullName(n.user) || '—', q)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      {filtered.length > shown && (
        <button className="st-more" onClick={() => setShown(s => s + PAGE_SIZE)}>
          Mostra altre ({filtered.length - shown} rimanenti)
        </button>
      )}
    </div>
  );
}

// ─── MODIFICHE (audit log, paginato e cercato lato server) ────────────────────

function TabModifiche({ cfg, q, entMap, entByCode, navigate }: {
  cfg: SezioneCfg; q: string; entMap: Map<string, Ent>; entByCode: Map<string, Ent>; navigate: (to: string) => void;
}) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [debQ, setDebQ] = useState(q);

  useEffect(() => { const t = setTimeout(() => setDebQ(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [debQ]);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    const qs = new URLSearchParams({ entityType: cfg.auditTypes, page: String(page), limit: String(PAGE_SIZE) });
    if (debQ.length >= 2) qs.set('search', debQ);
    api.get<{ data: AuditEntry[]; total: number; totalPages: number }>(`/audit?${qs.toString()}`)
      .then(r => { if (!alive) return; setRows(r.data ?? []); setTotal(r.total ?? 0); setTotalPages(Math.max(1, r.totalPages ?? 1)); })
      .catch(e => alive && setError(e.message ?? 'Errore'));
    return () => { alive = false; };
  }, [cfg, page, debQ]);

  if (error) return <div className="st-error">⚠️ {error}</div>;

  return (
    <div className="st-card">
      <div className="st-count">{rows ? `${total} modifiche` : 'Caricamento…'}{debQ.length === 1 && ' — scrivi almeno 2 caratteri per cercare'}</div>
      {rows && rows.length === 0 && <div className="st-empty">Nessuna modifica trovata</div>}
      {rows && rows.length > 0 && (
        <table className="st-table">
          <thead><tr><th style={{ width: 140 }}>Data</th><th style={{ width: 170 }}>{cfg.codeLabel}</th><th style={{ width: 130 }}>Azione</th><th>Descrizione</th><th style={{ width: 140 }}>Utente</th></tr></thead>
          <tbody>
            {rows.map(l => {
              // eventi assegnazione_*: entityId = id dell'assegnazione → risolvo il parent per codice
              const relatedCode = cfg.auditCodeKeys.map(k => l.dataDopo?.[k] ?? l.dataPrima?.[k]).find(Boolean) as string | undefined;
              const ent = entMap.get(l.entityId) ?? (relatedCode ? entByCode.get(relatedCode) : undefined);
              const code = ent?.code ?? relatedCode ?? '—';
              const desc = getHumanReadableDescription(l, { hideIdentifier: true });
              const azione = AZIONE_LABELS[l.azione] ?? l.azione;
              return (
                <tr key={l.id} className="st-row" onClick={() => navigate(cfg.detail(ent?.id ?? l.entityId))}>
                  <td className="st-date">{fmtDate(l.createdAt)}</td>
                  <td><span className="st-code">{hl(code, q)}</span>{ent?.sub && <div className="st-code-sub">{ent.sub}</div>}</td>
                  <td><span className={`st-azione st-azione-${l.azione}`}>{azione}</span></td>
                  <td className="st-text">{hl(desc, q)}</td>
                  <td className="st-user">{fullName(l.user) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {totalPages > 1 && (
        <div className="st-pager">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prec.</button>
          <span>Pagina {page} di {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Succ. →</button>
        </div>
      )}
    </div>
  );
}

// ─── COSE DA FARE ─────────────────────────────────────────────────────────────

function TabAttivita({ cfg, q, entities, entByCode, navigate }: {
  cfg: SezioneCfg; q: string; entities: Ent[]; entByCode: Map<string, Ent>; navigate: (to: string) => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stato, setStato] = useState<'aperte' | 'completate' | 'tutte'>('aperte');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await taskApi.list(cfg.taskType, cfg.taskId)); }
    catch (e: any) { setError(e.message ?? 'Errore'); }
  }, [cfg]);
  useEffect(() => { setTasks(null); load(); }, [load]);

  const refOptions = useMemo(() => entities.map(e => e.code).sort(), [entities]);

  const filtered = useMemo(() => (tasks ?? []).filter(t => {
    if (stato === 'aperte' && t.completata) return false;
    if (stato === 'completate' && !t.completata) return false;
    if (!q.trim()) return true;
    return matchesAll([t.testo, t.targa, t.codiceAutista, t.palmare, t.padroncino, fullName(t.user)].filter(Boolean).join(' '), q);
  }), [tasks, stato, q]);

  const nAperte = (tasks ?? []).filter(t => !t.completata).length;
  const nCompl  = (tasks ?? []).length - nAperte;

  const handleSubmit = async (data: TaskModalSubmitData) => {
    setSaving(true);
    try {
      if (editing) await taskApi.update(editing.id, data);
      else await taskApi.create({ entityType: cfg.taskType, entityId: cfg.taskId, ...data });
      setModalOpen(false); setEditing(null);
      await load();
    } catch (e: any) { alert('Errore salvataggio attività: ' + e.message); }
    finally { setSaving(false); }
  };
  const toggle = async (t: TaskItem) => {
    setTasks(prev => prev?.map(x => x.id === t.id ? { ...x, completata: !x.completata } : x) ?? null);
    try { await taskApi.toggle(t.id, !t.completata); } catch (e: any) { alert('Errore: ' + e.message); load(); }
  };
  const remove = async (t: TaskItem) => {
    if (!confirm(`Eliminare l'attività "${t.testo}"?`)) return;
    setTasks(prev => prev?.filter(x => x.id !== t.id) ?? null);
    try { await taskApi.remove(t.id); } catch (e: any) { alert('Errore: ' + e.message); load(); }
  };

  if (error) return <div className="st-error">⚠️ {error}</div>;
  if (!tasks) return <div className="st-loading">Caricamento attività…</div>;

  return (
    <div className="st-card">
      <div className="st-task-toolbar">
        <div className="st-chips">
          <button className={`st-chip ${stato === 'aperte' ? 'st-chip-active' : ''}`}     onClick={() => setStato('aperte')}>Da fare ({nAperte})</button>
          <button className={`st-chip ${stato === 'completate' ? 'st-chip-active' : ''}`} onClick={() => setStato('completate')}>Completate ({nCompl})</button>
          <button className={`st-chip ${stato === 'tutte' ? 'st-chip-active' : ''}`}      onClick={() => setStato('tutte')}>Tutte ({tasks.length})</button>
        </div>
        <button className="st-btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>+ attività</button>
      </div>
      {filtered.length === 0
        ? <div className="st-empty">Nessuna attività trovata</div>
        : (
          <table className="st-table">
            <thead><tr><th style={{ width: 36 }}></th><th>Attività</th><th style={{ width: 110 }}>Creata</th><th style={{ width: 110 }}>Completata</th><th style={{ width: 140 }}>Utente</th><th style={{ width: 36 }}></th></tr></thead>
            <tbody>
              {filtered.map(t => {
                const ref = t[cfg.taskField] as string | null;
                const ent = ref ? entByCode.get(ref) : undefined;
                return (
                  <tr key={t.id} className={`st-row ${t.completata ? 'st-row-done' : ''}`} onClick={() => { setEditing(t); setModalOpen(true); }}>
                    <td><input type="checkbox" className="task-checkbox" checked={t.completata} onClick={e => e.stopPropagation()} onChange={() => toggle(t)} /></td>
                    <td>
                      <div className="st-task-tags">
                        {t.targa && <span className="task-tag">🚚 {hl(t.targa, q)}</span>}
                        {t.codiceAutista && <span className="task-tag">👤 {hl(t.codiceAutista, q)}</span>}
                        {t.palmare && <span className="task-tag">📱 {hl(t.palmare, q)}</span>}
                        {t.padroncino && <span className="task-tag task-tag-pad">🏢 {hl(t.padroncino, q)}</span>}
                        {ent && <button className="st-link" onClick={e => { e.stopPropagation(); navigate(cfg.detail(ent.id)); }}>apri scheda →</button>}
                      </div>
                      <div className="st-text st-task-text">{hl(t.testo, q)}</div>
                    </td>
                    <td className="st-date">{new Date(t.createdAt).toLocaleDateString('it-IT')}</td>
                    <td className="st-date">{t.completedAt ? new Date(t.completedAt).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="st-user">{fullName(t.user) || '—'}</td>
                    <td><button className="st-remove" title="Elimina" onClick={e => { e.stopPropagation(); remove(t); }}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        saving={saving}
        fieldKey={cfg.taskField}
        fieldLabel={cfg.codeLabel}
        refOptions={refOptions}
        editingTask={editing}
      />
    </div>
  );
}

