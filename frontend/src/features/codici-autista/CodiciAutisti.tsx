// src/features/codici-autista/CodiciAutisti.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { codiciAutistaApi, noteApi, auditApi, taskApi } from '../../lib/api';
import type { CodiceAutista, CodiciAutistaStats, Nota, AuditLogEntry, TaskItem } from '../../lib/api';
import NuovoCodiceAutistaModal, { NuovoCodiceAutista } from './NuovoCodiceAutistaModal';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { getHumanReadableDescription } from '../../lib/auditFormat';
import './CodiciAutisti.css';

function describeAudit(log: AuditLogEntry): string {
  return getHumanReadableDescription(
    { ...log, entityType: log.entityType ?? 'codiceAutista' } as any,
    { hideIdentifier: true },
  );
}


const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

type SortDir = 'asc' | 'desc';
function SortTh({ label, col, sortKey, sortDir, onSort, className }: {
  label: string; col: string; sortKey: string; sortDir: SortDir;
  onSort: (c: string) => void; className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={className ?? 'ca-th-sort'}
      onClick={() => onSort(col)}
    >
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function CodiciAutisti() {
  const navigate = useNavigate();

  const [autisti,    setAutisti]    = useState<CodiceAutista[]>([]);
  const [stats,      setStats]      = useState<CodiciAutistaStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filtro,     setFiltro]     = useState<'TUTTI' | 'DISPONIBILE' | 'ASSEGNATO' | 'DISMESSO'>('TUTTI');
  const [nuovoOpen,  setNuovoOpen]  = useState(false);
  const [sortKey,    setSortKey]    = useState('codice');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [tutteLeNote, setTutteLeNote] = useState<Nota[]>([]);
  const [ultimiLog,  setUltimiLog]  = useState<AuditLogEntry[]>([]);
  const [notaForm,   setNotaForm]   = useState({ open: false, entityId: '', testo: '' });
  const [notaSaving, setNotaSaving] = useState(false);

  const [tasks,         setTasks]         = useState<TaskItem[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask,   setEditingTask]   = useState<TaskItem | null>(null);
  const [taskSaving,    setTaskSaving]    = useState(false);

  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [listResp, statsResp, noteResp, logResp, taskResp] = await Promise.all([
        codiciAutistaApi.list({ limit: '200' }),
        codiciAutistaApi.stats(),
        noteApi.list('codice_autista', undefined, 500),
        auditApi.list({ entityType: 'codice_autista,assegnazione_codice_autista', limit: 5 }),
        taskApi.list('codici-autista', 'autisti'),
      ]);
      setAutisti(listResp.data); setStats(statsResp); setTutteLeNote(noteResp);
      setUltimiLog(logResp.data); setTasks(taskResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ultimeNote = useMemo(() => tutteLeNote.slice(0, 5), [tutteLeNote]);

  const codiciOptions = useMemo(() => Array.from(new Set(autisti.map(c => c.codice))).sort(), [autisti]);

  // Mappa entityId → testo note concatenate (per ricerca)
  const noteMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      acc[n.entityId] = (acc[n.entityId] ?? '') + ' ' + n.contenuto.toLowerCase();
      return acc;
    }, {}),
  [tutteLeNote]);

  // Mappa entityId → testo dell'ultima nota (tutteLeNote è già ordinata desc per data)
  const ultimaNotaMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      if (!(n.entityId in acc)) acc[n.entityId] = n.contenuto;
      return acc;
    }, {}),
  [tutteLeNote]);

  const filtered = useMemo(() => {
    const list = autisti.filter(c => {
      const attiva = c.assegnazioni?.find(a => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        c.codice.toLowerCase().includes(s) ||
        (c.nome ?? '').toLowerCase().includes(s) ||
        (c.cognome ?? '').toLowerCase().includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s) ||
        (c.zone ?? '').toLowerCase().includes(s) ||
        (c.note ?? '').toLowerCase().includes(s) ||
        (noteMap[c.id] ?? '').includes(s);
      if (filtro === 'DISPONIBILE') return matchSearch && !attiva && c.attivo;
      if (filtro === 'ASSEGNATO')   return matchSearch && !!attiva && c.attivo;
      if (filtro === 'DISMESSO')    return matchSearch && !c.attivo;
      return matchSearch;
    });
    list.sort((a, b) => {
      const attA = a.assegnazioni?.find(x => !x.dataFine);
      const attB = b.assegnazioni?.find(x => !x.dataFine);
      const statoA = !a.attivo ? 'DISMESSO' : attA ? 'ASSEGNATO' : 'DISPONIBILE';
      const statoB = !b.attivo ? 'DISMESSO' : attB ? 'ASSEGNATO' : 'DISPONIBILE';
      let va: any, vb: any;
      switch (sortKey) {
        case 'codice':        va = a.codice; vb = b.codice; break;
        case 'stato':         va = statoA; vb = statoB; break;
        case 'padroncino':    va = attA?.ragioneSociale ?? ''; vb = attB?.ragioneSociale ?? ''; break;
        case 'tariffaFissa':  va = a.tariffaFissa ?? -1; vb = b.tariffaFissa ?? -1; break;
        case 'tariffaRitiro': va = a.tariffaRitiro ?? -1; vb = b.tariffaRitiro ?? -1; break;
        case 'target':        va = a.target ?? -1; vb = b.target ?? -1; break;
        case 'zone':          va = a.zone ?? ''; vb = b.zone ?? ''; break;
        case 'note':          va = ultimaNotaMap[a.id] ?? ''; vb = ultimaNotaMap[b.id] ?? ''; break;
        default:              va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [autisti, search, filtro, sortKey, sortDir, tutteLeNote, ultimaNotaMap]);

  const handleAddNota = async () => {
    if (!notaForm.entityId || !notaForm.testo.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'codice_autista', entityId: notaForm.entityId, contenuto: notaForm.testo.trim() });
      setNotaForm({ open: false, entityId: '', testo: '' });
      setTutteLeNote(await noteApi.list('codice_autista', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const loadTasks = async () => {
    try { setTasks(await taskApi.list('codici-autista', 'autisti')); } catch {}
  };

  const handleOpenNewTask  = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'codici-autista', entityId: 'autisti', ...data });
      setTaskModalOpen(false); setEditingTask(null);
      await loadTasks();
    } catch (e: any) { alert('Errore salvataggio attività: ' + e.message); }
    finally { setTaskSaving(false); }
  };

  const handleToggleTask = async (t: TaskItem) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, completata: !x.completata } : x));
    try { await taskApi.toggle(t.id, !t.completata); }
    catch (e: any) { alert('Errore aggiornamento attività: ' + e.message); await loadTasks(); }
  };

  const handleRemoveTask = async (id: string) => {
    setTasks(prev => prev.filter(x => x.id !== id));
    try { await taskApi.remove(id); }
    catch (e: any) { alert('Errore eliminazione attività: ' + e.message); await loadTasks(); }
  };

  const handleCreate = async (form: NuovoCodiceAutista) => {
    try {
      await codiciAutistaApi.create({
        codice: form.codice,
        nome:           form.nome           || undefined,
        cognome:        form.cognome        || undefined,
        note:           form.note           || undefined,
        tariffaFissa:   form.tariffaFissa   ? parseFloat(form.tariffaFissa)   : undefined,
        tariffaRitiro:  form.tariffaRitiro  ? parseFloat(form.tariffaRitiro)  : undefined,
        target:         form.target         ? parseInt(form.target)            : undefined,
        bonus:          form.bonus          ? parseFloat(form.bonus)          : undefined,
        malus:          form.malus          ? parseFloat(form.malus)          : undefined,
        zone:           form.zone           || undefined,
      });
      await load();
    } catch (e: any) { alert('Errore creazione codice autista: ' + e.message); }
  };

  if (loading) return (
    <div className="ca-page">
      <div className="ca-loading"><div className="ca-spinner" /><span>Caricamento...</span></div>
    </div>
  );
  if (error) return (
    <div className="ca-page">
      <div className="ca-error">⚠️ {error} <button className="ca-btn-primary ca-btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="ca-page">

      {/* ── HEADER ── */}
      <div className="ca-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Cod. Autisti</h1>
          <span className="ca-subtitle">{autisti.length} codici totali</span>
        </div>
        <div className="ca-header-actions">
          <button className="ca-btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo</button>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="ca-kpi-row">
        <div className="ca-kpi-card ca-kpi-blue">
          <span className="ca-kpi-label">TOTALI</span>
          <span className="ca-kpi-val">{stats?.totali ?? autisti.length}</span>
          <span className="ca-kpi-sub">{stats?.assegnati ?? 0} assegnati</span>
        </div>
        <div className="ca-kpi-card ca-kpi-green">
          <span className="ca-kpi-label">DISPONIBILI</span>
          <span className="ca-kpi-val ca-kpi-val-green">{stats?.disponibili ?? 0}</span>
          <span className="ca-kpi-sub">pronti</span>
        </div>
        <div className="ca-kpi-card ca-kpi-purple">
          <span className="ca-kpi-label">TARIFFA FISSA MEDIA</span>
          <span className="ca-kpi-val ca-kpi-val-purple">{fmtEur(stats?.tariffaFissaMedia)}</span>
          <span className="ca-kpi-sub">media</span>
        </div>
        <div className="ca-kpi-card ca-kpi-amber">
          <span className="ca-kpi-label">TARIFFA RITIRO MEDIA</span>
          <span className="ca-kpi-val ca-kpi-val-amber">{fmtEur(stats?.tariffaRitiroMedia)}</span>
          <span className="ca-kpi-sub">per ritiro</span>
        </div>
      </div>

      {/* ── INFO PANEL NOTE ── */}
      <div className="ca-info-row">
        <div className="ca-info-panel">
          <div className="ca-info-panel-head">
            <span className="ca-info-panel-title">📝 Ultime Note</span>
            <button
              className="ca-nota-toggle"
              onClick={() => setNotaForm(f => ({ ...f, open: !f.open }))}
            >
              {notaForm.open ? '✕ chiudi' : '+ nota'}
            </button>
          </div>
          {notaForm.open && (
            <div className="ca-nota-form">
              <select
                className="ca-nota-select"
                value={notaForm.entityId}
                onChange={e => setNotaForm(f => ({ ...f, entityId: e.target.value }))}
              >
                <option value="">— Seleziona autista —</option>
                {autisti.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.codice}{c.nome ? ' – ' + c.nome + ' ' + (c.cognome ?? '') : ''}
                  </option>
                ))}
              </select>
              <textarea
                className="ca-nota-textarea"
                rows={2}
                placeholder="Testo nota…"
                value={notaForm.testo}
                onChange={e => setNotaForm(f => ({ ...f, testo: e.target.value }))}
              />
              <div className="ca-nota-actions">
                <button
                  className="ca-btn-outline ca-btn-sm"
                  onClick={() => setNotaForm({ open: false, entityId: '', testo: '' })}
                >
                  Annulla
                </button>
                <button
                  className="ca-btn-primary ca-btn-sm"
                  onClick={handleAddNota}
                  disabled={notaSaving || !notaForm.entityId || !notaForm.testo.trim()}
                >
                  {notaSaving ? 'Salvo…' : 'Salva nota'}
                </button>
              </div>
            </div>
          )}
          {ultimeNote.length === 0
            ? <div className="ca-info-empty">Nessuna nota registrata</div>
            : ultimeNote.map(n => {
                const aut = autisti.find(a => a.id === n.entityId);
                return (
                  <div
                    key={n.id}
                    className="ca-info-row-item"
                    onClick={() => navigate('/codici-autista/' + n.entityId)}
                  >
                    <span className="ca-info-codice">{aut?.codice ?? '—'}</span>
                    <div className="ca-info-body">
                      <span className="ca-info-nome">
                        {[aut?.nome, aut?.cognome].filter(Boolean).join(' ') || aut?.codice || '—'}
                      </span>
                      <span className="ca-info-nota">
                        {n.contenuto.length > 55 ? n.contenuto.slice(0, 55) + '…' : n.contenuto}
                      </span>
                    </div>
                    <span className="ca-info-ago">
                      {n.user ? n.user.nome[0] + '.' + n.user.cognome[0] + '.' : '—'}
                      {' · '}
                      {new Date(n.createdAt).toLocaleDateString('it-IT')}
                    </span>
                  </div>
                );
              })
          }
        </div>

        {/* Ultime Modifiche */}
        <div className="ca-info-panel">
          <div className="ca-info-panel-head">
            <span className="ca-info-panel-title">🕐 Ultime Modifiche</span>
          </div>
          {ultimiLog.length === 0
            ? <div className="ca-info-empty">Nessuna modifica recente</div>
            : ultimiLog.map(l => {
                // Gli eventi di assegnazione/fine-assegnazione hanno entityType
                // 'assegnazione_codice_autista' ed entityId = id dell'assegnazione,
                // non del codice autista: il payload porta solo "codiceAutista"
                // (il codice testuale), quindi risolviamo l'autista per codice.
                const relatedCodice = l.dataDopo?.codiceAutista ?? l.dataPrima?.codiceAutista;
                const aut = autisti.find(a => a.id === l.entityId)
                  ?? (relatedCodice ? autisti.find(a => a.codice === relatedCodice) : undefined);
                const codice = aut?.codice ?? relatedCodice ?? l.dataDopo?.codice ?? l.dataPrima?.codice ?? '—';
                const desc = describeAudit(l);
                const ms = Date.now() - new Date(l.createdAt).getTime();
                const h = Math.floor(ms / 3_600_000);
                const d = Math.floor(h / 24);
                const ago = h < 1 ? 'Adesso' : d === 0 ? h + 'h fa' : d === 1 ? 'Ieri' : d + 'gg fa';
                return (
                  <div
                    key={l.id}
                    className="ca-info-row-item"
                    onClick={() => navigate('/codici-autista/' + (aut?.id ?? l.entityId))}
                  >
                    <span className="ca-info-codice">{codice}</span>
                    <div className="ca-info-body">
                      <span className="ca-info-nota" title={desc}>{desc}</span>
                    </div>
                    <span className="ca-info-ago">
                      {l.user ? l.user.nome?.[0] + '.' + l.user.cognome?.[0] + '.' : '—'}{' · '}{ago}
                    </span>
                  </div>
                );
              })
          }
        </div>

        {/* Cose da fare */}
        <div className="ca-info-panel">
          <div className="ca-info-panel-head">
            <span className="ca-info-panel-title">✅ Cose da Fare</span>
            <button className="ca-nota-toggle" onClick={handleOpenNewTask}>+ attività</button>
          </div>
          {tasks.length === 0
            ? <div className="ca-info-empty">Nessuna attività registrata</div>
            : tasks.map(t => (
              <div key={t.id} className={`task-list-item ${t.completata ? 'task-done' : ''}`} onClick={() => handleOpenEditTask(t)}>
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked={t.completata}
                  onClick={e => e.stopPropagation()}
                  onChange={() => handleToggleTask(t)}
                />
                <div className="task-body">
                  {t.targa && <span className="task-tag">🚚 {t.targa}</span>}
                  {t.codiceAutista && <span className="task-tag">👤 {t.codiceAutista}</span>}
                  {t.palmare && <span className="task-tag">📱 {t.palmare}</span>}
                  {t.padroncino && <span className="task-tag task-tag-pad">🏢 {t.padroncino}</span>}
                  <span className="task-text" title={t.testo}>{t.testo}</span>
                </div>
                <button className="task-remove" onClick={e => { e.stopPropagation(); handleRemoveTask(t.id); }} title="Elimina">✕</button>
              </div>
            ))}
        </div>
      </div>

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        fieldKey="codiceAutista"
        fieldLabel="Cod. Autista"
        refOptions={codiciOptions}
        editingTask={editingTask}
      />

      {/* ── TOOLBAR ── */}
      <div className="ca-toolbar">
        <div className="ca-search-wrap">
          <span>🔍</span>
          <input
            className="ca-search"
            placeholder="Cerca codice, nome, padroncino, zone, note..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ca-filters">
          {(['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'DISMESSO'] as const).map(s => (
            <button
              key={s}
              className={'ca-filter-btn' + (filtro === s ? ' ca-filter-active' : '')}
              onClick={() => setFiltro(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABELLA ── */}
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead>
            <tr className="ca-thead-row">
              <SortTh label="CODICE"         col="codice"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="STATO"          col="stato"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="PADRONCINO"     col="padroncino"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="TARIFFA FISSA"  col="tariffaFissa"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="ca-th-sort ca-th-purple" />
              <SortTh label="TARIFFA RITIRO" col="tariffaRitiro" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="ca-th-sort ca-th-amber" />
              <SortTh label="TARGET"         col="target"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="ca-th">BONUS</th>
              <th className="ca-th">MALUS</th>
              <SortTh label="ZONE" col="zone" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="NOTE" col="note" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="ca-th"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="ca-empty-row">Nessun codice autista trovato</td>
              </tr>
            )}
            {filtered.map(c => {
              const attiva = c.assegnazioni?.find(a => !a.dataFine);
              const stato = !c.attivo ? 'DISMESSO' : attiva ? 'ASSEGNATO' : 'DISPONIBILE';
              const badgeCls =
                stato === 'ASSEGNATO'   ? 'ca-badge-assigned'  :
                stato === 'DISPONIBILE' ? 'ca-badge-available' : 'ca-badge-dismesso';
              return (
                <tr key={c.id} className="ca-row">
                  <td className="ca-td">
                    <span className="ca-codice">{c.codice}</span>
                    {(c.nome || c.cognome) && (
                      <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                        {[c.nome, c.cognome].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </td>
                  <td className="ca-td">
                    <span className={'ca-badge ' + badgeCls}>{stato}</span>
                  </td>
                  <td className="ca-td">
                    {attiva
                      ? <span className="ca-padroncino">{attiva.ragioneSociale}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td ca-td-purple">
                    {c.tariffaFissa != null
                      ? <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>{fmtEur(c.tariffaFissa)}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td ca-td-amber">
                    {c.tariffaRitiro != null
                      ? <span style={{ fontWeight: 700, color: '#d97706', fontSize: 13 }}>{fmtEur(c.tariffaRitiro)}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    {c.target != null
                      ? <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.target}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    {c.bonus != null
                      ? <span style={{ fontWeight: 600, color: '#16a34a' }}>{fmtEur(c.bonus)}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    {c.malus != null
                      ? <span style={{ fontWeight: 600, color: '#dc2626' }}>-{fmtEur(c.malus)}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    {c.zone
                      ? <span style={{ fontSize: 12, color: '#0f172a' }}>{c.zone}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    {ultimaNotaMap[c.id]
                      ? <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{ultimaNotaMap[c.id]}</span>
                      : <span className="ca-empty">—</span>
                    }
                  </td>
                  <td className="ca-td">
                    <div className="ca-row-actions">
                      <button
                        className="ca-btn-primary ca-btn-sm"
                        onClick={() => navigate('/codici-autista/' + c.id)}
                      >
                        Dettagli
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="ca-table-footer">
          {filtered.length} di {autisti.length} codici autisti
        </div>
      </div>

      <NuovoCodiceAutistaModal
        open={nuovoOpen}
        onClose={() => setNuovoOpen(false)}
        onSave={handleCreate}
      />
    </div>
  );
}
