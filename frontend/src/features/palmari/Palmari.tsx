// src/features/palmari/Palmari.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { palmariApi, noteApi, auditApi, taskApi } from '../../lib/api';
import type { Palmare, PalmariStats, Nota, AuditLogEntry, TaskItem } from '../../lib/api';
import NuovoPalmareModal, { NuovoPalmare } from './NuovoPalmareModal';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import './Palmari.css';

const AUDIT_BADGE: Record<string, { label: string; cls: string }> = {
  CREATE:              { label: 'Creato',       cls: 'pm-audit-create'  },
  UPDATE:              { label: 'Modifica',     cls: 'pm-audit-update'  },
  DELETE:              { label: 'Eliminato',    cls: 'pm-audit-delete'  },
  ASSEGNA:             { label: 'Assegnato',    cls: 'pm-audit-assegna' },
  CHIUDI_ASSEGNAZIONE: { label: 'Disassegnato', cls: 'pm-audit-chiudi'  },
};

const PM_FIELD_LABELS: Record<string, string> = {
  stato: 'Stato', tariffaMensile: 'Tariffa', marca: 'Marca',
  modello: 'Modello', imei: 'IMEI', simNumero: 'SIM', note: 'Note',
};

function describeAudit(log: AuditLogEntry): string {
  const { azione, dataPrima, dataDopo } = log;
  if (azione === 'CREATE') return 'Creato';
  if (azione === 'DELETE') return 'Eliminato';
  if (azione === 'ASSEGNA') {
    const pad = dataDopo?.ragioneSociale ?? dataDopo?.padroncino?.ragioneSociale;
    return pad ? `Assegnato a ${pad}` : 'Assegnato';
  }
  if (azione === 'CHIUDI_ASSEGNAZIONE') {
    // Il backend scrive sempre il padroncino in dataDopo (anche per la chiusura), non in dataPrima
    const pad = dataDopo?.ragioneSociale ?? dataDopo?.padroncino?.ragioneSociale
      ?? dataPrima?.ragioneSociale ?? dataPrima?.padroncino?.ragioneSociale;
    return pad ? `Disassegnato da ${pad}` : 'Disassegnato';
  }
  if (azione === 'UPDATE' && dataPrima && dataDopo) {
    const changes: string[] = [];
    for (const [key, label] of Object.entries(PM_FIELD_LABELS)) {
      if (dataPrima[key] !== undefined && dataDopo[key] !== undefined && dataPrima[key] !== dataDopo[key]) {
        changes.push(`${label}: ${String(dataDopo[key] ?? '—')}`);
      }
    }
    return changes.length > 0 ? changes.slice(0, 2).join(' · ') : 'Modificato';
  }
  return AUDIT_BADGE[azione]?.label ?? azione;
}


const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_BADGE: Record<string, string> = {
  ASSEGNATO:   'pm-badge-assigned',
  DISPONIBILE: 'pm-badge-available',
  GUASTO:      'pm-badge-guasto',
  DISMESSO:    'pm-badge-dismesso',
};
const STATO_LABEL: Record<string, string> = {
  ASSEGNATO:   'Assegnato',
  DISPONIBILE: 'Disponibile',
  GUASTO:      'Guasto',
  DISMESSO:    'Dismesso',
};

type SortDir = 'asc' | 'desc';
function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: string; sortKey: string; sortDir: SortDir; onSort: (c: string) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="pm-th-sort" onClick={() => onSort(col)}>
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function Palmari() {
  const navigate = useNavigate();

  const [palmari,    setPalmari]    = useState<Palmare[]>([]);
  const [stats,      setStats]      = useState<PalmariStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [nuovoOpen,  setNuovoOpen]  = useState(false);
  const [tutteLeNote, setTutteLeNote] = useState<Nota[]>([]);
  const [ultimiLog,  setUltimiLog]  = useState<AuditLogEntry[]>([]);
  const [notaForm,   setNotaForm]   = useState({ open: false, entityId: '', testo: '' });
  const [notaSaving, setNotaSaving] = useState(false);
  const [sortKey,    setSortKey]    = useState('codice');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');

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
        palmariApi.list({ limit: '200' }),
        palmariApi.stats(),
        noteApi.list('palmare', undefined, 500),
        auditApi.list({ entityType: 'palmare,assegnazione_palmare', limit: 5 }),
        taskApi.list('palmari', 'palmari'),
      ]);
      setPalmari(listResp.data); setStats(statsResp); setTutteLeNote(noteResp);
      setUltimiLog(logResp.data); setTasks(taskResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ultimeNote = useMemo(() => tutteLeNote.slice(0, 5), [tutteLeNote]);

  const codiciOptions = useMemo(() => Array.from(new Set(palmari.map(p => p.codice))).sort(), [palmari]);

  const noteMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      acc[n.entityId] = (acc[n.entityId] ?? '') + ' ' + n.contenuto.toLowerCase();
      return acc;
    }, {}),
  [tutteLeNote]);

  const ultimaNotaMap = useMemo(() => {
    const map: Record<string, Nota> = {};
    tutteLeNote.forEach(n => { if (!map[n.entityId]) map[n.entityId] = n; });
    return map;
  }, [tutteLeNote]);

  const filtered = useMemo(() => {
    const list = palmari.filter(p => {
      const attiva = p.assegnazioni?.find(a => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        p.codice.toLowerCase().includes(s) ||
        (p.marca ?? '').toLowerCase().includes(s) ||
        (p.modello ?? '').toLowerCase().includes(s) ||
        (p.imei ?? '').includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s) ||
        (p.note ?? '').toLowerCase().includes(s) ||
        (noteMap[p.id] ?? '').includes(s);
      const matchStato = filtroStato === 'TUTTI' || p.stato === filtroStato;
      return matchSearch && matchStato;
    });
    list.sort((a, b) => {
      const attA = a.assegnazioni?.find(x => !x.dataFine);
      const attB = b.assegnazioni?.find(x => !x.dataFine);
      let va: any, vb: any;
      switch (sortKey) {
        case 'codice':     va = a.codice; vb = b.codice; break;
        case 'stato':      va = a.stato;  vb = b.stato;  break;
        case 'padroncino': va = attA?.ragioneSociale ?? ''; vb = attB?.ragioneSociale ?? ''; break;
        case 'tariffa':    va = a.tariffaMensile ?? -1; vb = b.tariffaMensile ?? -1; break;
        case 'dataAss':    va = attA?.dataInizio ?? ''; vb = attB?.dataInizio ?? ''; break;
        default:           va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [palmari, search, filtroStato, sortKey, sortDir]);

  const handleAddNota = async () => {
    if (!notaForm.entityId || !notaForm.testo.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'palmare', entityId: notaForm.entityId, contenuto: notaForm.testo.trim() });
      setNotaForm({ open: false, entityId: '', testo: '' });
      setTutteLeNote(await noteApi.list('palmare', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const loadTasks = async () => {
    try { setTasks(await taskApi.list('palmari', 'palmari')); } catch {}
  };

  const handleOpenNewTask  = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'palmari', entityId: 'palmari', ...data });
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

  const handleCreate = async (form: NuovoPalmare) => {
    try {
      await palmariApi.create({
        codice: form.codice,
        modello: form.modello || undefined,
        imei: form.seriale || undefined,
        simNumero: form.sim || undefined,
        tariffaMensile: form.tariffa ? parseFloat(form.tariffa) : undefined,
        note: form.note || undefined,
      });
      await load();
    } catch (e: any) { alert('Errore creazione palmare: ' + e.message); }
  };

  const handleDelete = async (id: string, codice: string) => {
    if (!confirm('Eliminare il palmare "' + codice + '"? L\'operazione è irreversibile.')) return;
    try {
      await palmariApi.delete(id);
      await load();
    } catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  const STATI_FILTRO = ['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'GUASTO', 'DISMESSO'];

  if (loading) return (
    <div className="pm-page">
      <div className="pm-loading"><div className="pm-spinner" /><span>Caricamento palmari...</span></div>
    </div>
  );
  if (error) return (
    <div className="pm-page">
      <div className="pm-error">⚠️ {error} <button className="pm-btn-primary pm-btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="pm-page">

      {/* ── HEADER ── */}
      <div className="pm-header">
        <div>
          <h1 className="pm-title">Palmari</h1>
          <span className="pm-subtitle">{palmari.length} dispositivi totali</span>
        </div>
        <div className="pm-header-actions">
          <button className="pm-btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo Palmare</button>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="pm-kpi-row">
        <div className="pm-kpi-card pm-kpi-blue">
          <span className="pm-kpi-label">DISPONIBILI</span>
          <span className="pm-kpi-val pm-kpi-val-blue">{stats?.disponibili ?? 0}</span>
          <span className="pm-kpi-sub">pronti</span>
        </div>
        <div className="pm-kpi-card pm-kpi-purple">
          <span className="pm-kpi-label">ASSEGNATI</span>
          <span className="pm-kpi-val pm-kpi-val-purple">{stats?.assegnati ?? 0}</span>
          <span className="pm-kpi-sub">in uso</span>
        </div>
        <div className="pm-kpi-card pm-kpi-red">
          <span className="pm-kpi-label">GUASTI</span>
          <span className="pm-kpi-val pm-kpi-val-red">{stats?.guasti ?? 0}</span>
          <span className="pm-kpi-sub">da riparare</span>
        </div>
        <div className="pm-kpi-card pm-kpi-green">
          <span className="pm-kpi-label">ENTRATE MENSILI</span>
          <span className="pm-kpi-val pm-kpi-val-green">{fmtEur(stats?.entrateMensili)}</span>
          <span className="pm-kpi-sub">tariffe</span>
        </div>
      </div>

      {/* ── INFO PANELS ── */}
      <div className="pm-info-row">

        {/* Ultime Note */}
        <div className="pm-info-panel">
          <div className="pm-info-panel-head">
            <span className="pm-info-panel-title">📝 Ultime Note</span>
            <button
              className="pm-nota-toggle"
              onClick={() => setNotaForm(f => ({ ...f, open: !f.open }))}
            >
              {notaForm.open ? '✕ chiudi' : '+ nota'}
            </button>
          </div>
          {notaForm.open && (
            <div className="pm-nota-form">
              <select
                className="pm-nota-select"
                value={notaForm.entityId}
                onChange={e => setNotaForm(f => ({ ...f, entityId: e.target.value }))}
              >
                <option value="">— Seleziona palmare —</option>
                {palmari.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.codice}{p.marca ? ' – ' + p.marca + ' ' + (p.modello ?? '') : ''}
                  </option>
                ))}
              </select>
              <textarea
                className="pm-nota-textarea"
                rows={2}
                placeholder="Testo nota…"
                value={notaForm.testo}
                onChange={e => setNotaForm(f => ({ ...f, testo: e.target.value }))}
              />
              <div className="pm-nota-actions">
                <button
                  className="pm-btn-outline pm-btn-sm"
                  onClick={() => setNotaForm({ open: false, entityId: '', testo: '' })}
                >
                  Annulla
                </button>
                <button
                  className="pm-btn-primary pm-btn-sm"
                  onClick={handleAddNota}
                  disabled={notaSaving || !notaForm.entityId || !notaForm.testo.trim()}
                >
                  {notaSaving ? 'Salvo…' : 'Salva nota'}
                </button>
              </div>
            </div>
          )}
          {ultimeNote.length === 0
            ? <div className="pm-info-empty">Nessuna nota registrata</div>
            : ultimeNote.map(n => {
                const p = palmari.find(x => x.id === n.entityId);
                return (
                  <div
                    key={n.id}
                    className="pm-info-row-item"
                    onClick={() => navigate('/palmari/' + n.entityId)}
                  >
                    <span className="pm-info-codice">{p?.codice ?? '—'}</span>
                    <div className="pm-info-body">
                      <span className="pm-info-nome">
                        {[p?.marca, p?.modello].filter(Boolean).join(' ') || p?.codice || '—'}
                      </span>
                      <span className="pm-info-nota">
                        {n.contenuto.length > 55 ? n.contenuto.slice(0, 55) + '…' : n.contenuto}
                      </span>
                    </div>
                    <span className="pm-info-ago">
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
        <div className="pm-info-panel">
          <div className="pm-info-panel-head">
            <span className="pm-info-panel-title">🕐 Ultime Modifiche</span>
          </div>
          {ultimiLog.length === 0
            ? <div className="pm-info-empty">Nessuna modifica recente</div>
            : ultimiLog.map(l => {
                // Gli eventi di assegnazione/fine-assegnazione hanno entityType
                // 'assegnazione_palmare' ed entityId = id dell'assegnazione, non del
                // palmare: il payload porta solo il "codicePalmare", quindi risolviamo
                // il palmare per codice per poter mostrare/collegare quello giusto.
                const relatedCodice = l.dataDopo?.codicePalmare ?? l.dataPrima?.codicePalmare;
                const pal = palmari.find(p => p.id === l.entityId)
                  ?? (relatedCodice ? palmari.find(p => p.codice === relatedCodice) : undefined);
                const codice = pal?.codice ?? relatedCodice ?? l.dataDopo?.codice ?? l.dataPrima?.codice ?? '—';
                const desc = describeAudit(l);
                const ms = Date.now() - new Date(l.createdAt).getTime();
                const h = Math.floor(ms / 3_600_000);
                const d = Math.floor(h / 24);
                const ago = h < 1 ? 'Adesso' : d === 0 ? h + 'h fa' : d === 1 ? 'Ieri' : d + 'gg fa';
                return (
                  <div
                    key={l.id}
                    className="pm-info-row-item"
                    onClick={() => navigate('/palmari/' + (pal?.id ?? l.entityId))}
                  >
                    <span className="pm-info-codice">{codice}</span>
                    <div className="pm-info-body">
                      <span className="pm-info-nota" title={desc}>{desc}</span>
                    </div>
                    <span className="pm-info-ago">
                      {l.user ? l.user.nome?.[0] + '.' + l.user.cognome?.[0] + '.' : '—'}{' · '}{ago}
                    </span>
                  </div>
                );
              })
          }
        </div>

        {/* Cose da fare */}
        <div className="pm-info-panel">
          <div className="pm-info-panel-head">
            <span className="pm-info-panel-title">✅ Cose da Fare</span>
            <button className="pm-nota-toggle" onClick={handleOpenNewTask}>+ attività</button>
          </div>
          {tasks.length === 0
            ? <div className="pm-info-empty">Nessuna attività registrata</div>
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
        fieldKey="palmare"
        fieldLabel="Palmare"
        refOptions={codiciOptions}
        editingTask={editingTask}
      />

      {/* ── TOOLBAR ── */}
      <div className="pm-toolbar">
        <div className="pm-search-wrap">
          <span>🔍</span>
          <input
            className="pm-search"
            placeholder="Cerca seriale, modello, padroncino..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="pm-filters">
          {STATI_FILTRO.map(s => (
            <button
              key={s}
              className={'pm-filter-btn' + (filtroStato === s ? ' pm-filter-active' : '')}
              onClick={() => setFiltroStato(s)}
            >
              {s === 'TUTTI' ? 'TUTTI' : STATO_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABELLA ── */}
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <SortTh label="SERIALE / MODELLO" col="codice"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="STATO"              col="stato"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="PADRONCINO"         col="padroncino" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="pm-th-sort pm-th-purple" onClick={() => handleSort('tariffa')}>TARIFFA {sortKey === 'tariffa' ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}</th>
              <SortTh label="DATA ASSEGNAZIONE"  col="dataAss"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="pm-th">NOTE</th>
              <th className="pm-th"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="pm-empty-row">Nessun palmare trovato</td>
              </tr>
            )}
            {filtered.map(p => {
              const attiva = p.assegnazioni?.find(a => !a.dataFine);
              const badgeCls = STATO_BADGE[p.stato] ?? 'pm-badge-dismesso';
              return (
                <tr key={p.id} className="pm-row">
                  <td className="pm-td">
                    <div className="pm-codice-cell">
                      <span className="pm-codice">{p.codice}</span>
                      {(p.marca || p.modello) && (
                        <span className="pm-modello-sub">
                          {[p.marca, p.modello].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="pm-td">
                    <span className={'pm-badge ' + badgeCls}>
                      {(STATO_LABEL[p.stato] ?? p.stato).toUpperCase()}
                    </span>
                  </td>
                  <td className="pm-td">
                    {attiva
                      ? <span className="pm-padroncino">{attiva.ragioneSociale}</span>
                      : <span className="pm-empty">—</span>
                    }
                  </td>
                  <td className="pm-td pm-td-purple">
                    {p.tariffaMensile != null
                      ? <span className="pm-tariffa">{fmtEur(p.tariffaMensile)}</span>
                      : <span className="pm-empty">—</span>
                    }
                  </td>
                  <td className="pm-td">
                    {attiva ? fmt(attiva.dataInizio) : <span className="pm-empty">—</span>}
                  </td>
                  <td className="pm-td">
                    {ultimaNotaMap[p.id]
                      ? <span className="pm-note-cell" title={ultimaNotaMap[p.id].contenuto}>
                          {ultimaNotaMap[p.id].contenuto.length > 40
                            ? ultimaNotaMap[p.id].contenuto.slice(0, 40) + '…'
                            : ultimaNotaMap[p.id].contenuto}
                        </span>
                      : <span className="pm-empty">—</span>}
                  </td>
                  <td className="pm-td" style={{ textAlign: 'right' }}>
                    <button
                      className="pm-btn-primary pm-btn-sm"
                      onClick={() => navigate('/palmari/' + p.id)}
                    >
                      Dettaglio
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pm-table-footer">
          {filtered.length} di {palmari.length} palmari
        </div>
      </div>

      <NuovoPalmareModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleCreate} />

    </div>
  );
}
