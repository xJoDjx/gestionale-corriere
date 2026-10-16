// src/features/mezzi/FlottaMezzi.tsx — Grafica aggiornata, logica API invariata
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { mezziApi, noteApi, taskApi, api } from '../../lib/api';
import type { Mezzo, MezziStats, TipoPossessoMezzo, Nota, TaskItem } from '../../lib/api';
import NuovoMezzoModal from './NuovoMezzoModal';
import type { NuovoMezzo } from './NuovoMezzoModal';
import BulkAssignModal from '../../components/ui/BulkAssignModal';
import '../../components/ui/BulkAssignModal.css';
import BulkContrattoModal from './BulkContrattoModal';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { type AuditEntry, getHumanReadableDescription, fmtDate as fmtDateOra } from '../../lib/auditFormat';
import './FlottaMezzi.css';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
};

const scadenzaCell = (d: string | null | undefined) => {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0)   return { label: `Scaduta`, giorni: `${Math.abs(diff)}gg fa`, cls: 'fm-scad-expired' };
  if (diff <= 7)  return { label: `${diff}gg`,  giorni: `${diff}gg`, cls: 'fm-scad-danger' };
  if (diff <= 30) return { label: `${diff}gg`,  giorni: `${diff}gg`, cls: 'fm-scad-warning' };
  return           { label: `${diff}gg`,         giorni: `${diff}gg`, cls: 'fm-scad-ok' };
};

const kmPercent = (km: number | null | undefined, limite: number | null | undefined) => {
  if (!km || !limite) return null;
  return Math.min(100, Math.round((km / limite) * 100));
};

const kmBarCls = (pct: number) => {
  if (pct >= 90) return 'fm-km-bar-red';
  if (pct >= 70) return 'fm-km-bar-orange';
  if (pct >= 40) return 'fm-km-bar-yellow';
  return 'fm-km-bar-green';
};
const kmTextCls = (pct: number) => {
  if (pct >= 90) return 'fm-km-pct-red';
  if (pct >= 70) return 'fm-km-pct-orange';
  if (pct >= 40) return 'fm-km-pct-yellow';
  return 'fm-km-pct-green';
};

// ─── COSTANTI ─────────────────────────────────────────────────────────────────

const STATO_BADGE: Record<string, { label: string; cls: string }> = {
  ASSEGNATO:      { label: 'Assegnato',     cls: 'fm-badge-assigned'   },
  DISPONIBILE:    { label: 'Disponibile',   cls: 'fm-badge-available'  },
  IN_REVISIONE:   { label: 'In Revisione',  cls: 'fm-badge-revision'   },
  FUORI_SERVIZIO: { label: 'Fuori Servizio',cls: 'fm-badge-fuori'      },
  VENDUTO:        { label: 'Venduto',       cls: 'fm-badge-gray'       },
  DISMESSO:       { label: 'Dismesso',      cls: 'fm-badge-gray'       },
};

const POSSESSO_BADGE: Record<string, { label: string; cls: string }> = {
  PROPRIETA: { label: 'Proprietà', cls: 'fm-tag-green'  },
  NOLEGGIO:  { label: 'Noleggio',  cls: 'fm-tag-blue'   },
  ESTERNO:   { label: 'Esterno',   cls: 'fm-tag-orange' },
};

const ALIMENTAZIONE_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  GASOLIO:      { label: 'Gasolio',        icon: '⛽', cls: 'fm-alim-gasolio'  },
  DIESEL:       { label: 'Diesel',         icon: '⛽', cls: 'fm-alim-gasolio'  },
  GASOLIO_MHEV: { label: 'Gasolio + MHEV', icon: '⛽', cls: 'fm-alim-mhev'     },
  BENZINA:      { label: 'Benzina',        icon: '⛽', cls: 'fm-alim-benzina'  },
  ELETTRICO:    { label: 'Elettrico',      icon: '⚡', cls: 'fm-alim-elettrico'},
  IBRIDO:       { label: 'Ibrido',         icon: '🔋', cls: 'fm-alim-ibrido'   },
  METANO:       { label: 'Metano',         icon: '💧', cls: 'fm-alim-metano'   },
};

const AUDIT_BADGE: Record<string, { label: string; cls: string }> = {
  CREATE:              { label: 'Creato',    cls: 'fm-audit-create'  },
  UPDATE:              { label: 'Modifica',  cls: 'fm-audit-update'  },
  DELETE:              { label: 'Eliminato', cls: 'fm-audit-delete'  },
  ASSEGNA:             { label: 'Assegnato', cls: 'fm-audit-assegna' },
  CHIUDI_ASSEGNAZIONE: { label: 'Disass.',   cls: 'fm-audit-chiudi'  },
  GENERA_CONTRATTO:    { label: 'Contratto', cls: 'fm-audit-update'  },
};

// ─── COLUMN PICKER ────────────────────────────────────────────────────────────

type ColKey = 'tipo' | 'marcaModello' | 'alimentazione' | 'stato' | 'assegnatoA' | 'assicurazione' | 'revisione' | 'km' | 'kmAggiornatiAl' | 'canone' | 'rataPda' | 'fineNoleggio';

const COL_DEFS: { key: ColKey; label: string }[] = [
  { key: 'tipo',          label: 'Tipo possesso'   },
  { key: 'marcaModello',  label: 'Marca / Modello' },
  { key: 'alimentazione', label: 'Alimentazione'   },
  { key: 'stato',         label: 'Stato'           },
  { key: 'assegnatoA',    label: 'Assegnato a'     },
  { key: 'assicurazione', label: 'Assicurazione'   },
  { key: 'revisione',     label: 'Revisione'       },
  { key: 'km',            label: 'KM / Limite'     },
  { key: 'kmAggiornatiAl', label: 'KM Aggiornati al' },
  { key: 'canone',        label: 'Canone noleggio' },
  { key: 'rataPda',       label: 'Rata PDA'        },
  { key: 'fineNoleggio',  label: 'Fine Noleggio'   },
];

const COLS_KEY = 'fm-cols-v4';
const DEFAULT_COLS: Record<ColKey, boolean> = {
  tipo: true, marcaModello: true, alimentazione: true, stato: true, assegnatoA: true,
  assicurazione: true, revisione: true, km: true, kmAggiornatiAl: false, canone: true, rataPda: true, fineNoleggio: true,
};

function loadCols(): Record<ColKey, boolean> {
  try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem(COLS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_COLS }; }
}

// ─── TIPI INTERNI ─────────────────────────────────────────────────────────────


// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────

export default function FlottaMezzi() {
  const navigate = useNavigate();

  const [mezzi,   setMezzi]   = useState<Mezzo[]>([]);
  const [stats,   setStats]   = useState<MezziStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [tutteLeNote, setTutteLeNote] = useState<Nota[]>([]);
  const [ultimiLog,  setUltimiLog]  = useState<AuditEntry[]>([]);

  const [search,          setSearch]          = useState('');
  const [filtroStato,     setFiltroStato]     = useState('ATTIVI');
  const [filtroPossesso,  setFiltroPossesso]  = useState<'TUTTI' | TipoPossessoMezzo>('TUTTI');
  const [filtroCategoria, setFiltroCategoria] = useState<'TUTTI' | 'DISTRIBUZIONE' | 'AUTO_AZIENDALE' | 'FLOTTA'>('TUTTI');

  type SortField = 'targa' | 'tipo' | 'marca' | 'alimentazione' | 'stato' | 'padroncino' | 'assicurazione' | 'revisione' | 'canone' | 'rata' | 'kmPct' | 'kmAggiornatiAl' | 'fineNoleggio';
  const [sortField, setSortField] = useState<SortField>('targa');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  type ScadenzaTipo = 'Fine Noleggio' | 'Revisione' | 'Assicurazione';
  const [scadenzaTab, setScadenzaTab] = useState<ScadenzaTipo>('Fine Noleggio');

  const [nuovoOpen,         setNuovoOpen]         = useState(false);
  const [importando,        setImportando]        = useState(false);
  const [importResult,      setImportResult]      = useState<{ creati: number; saltati: number; errori: string[] } | null>(null);
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [bulkModalOpen,     setBulkModalOpen]     = useState(false);
  const [bulkContrattoOpen, setBulkContrattoOpen] = useState(false);
  const [cols,              setCols]              = useState<Record<ColKey, boolean>>(loadCols);
  const [colPickerOpen,     setColPickerOpen]     = useState(false);
  const [notaForm,          setNotaForm]          = useState({ open: false, mezzoId: '', testo: '' });
  const [notaSaving,        setNotaSaving]        = useState(false);

  const [tasks,         setTasks]         = useState<TaskItem[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask,   setEditingTask]   = useState<TaskItem | null>(null);
  const [taskSaving,    setTaskSaving]    = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const colPickerRef   = useRef<HTMLDivElement>(null);

  const mezziMap = useMemo(() => Object.fromEntries(mezzi.map(m => [m.id, m])), [mezzi]);

  const targheOptions = useMemo(() => Array.from(new Set(mezzi.map(m => m.targa))).sort(), [mezzi]);

  const ultimeNote = useMemo(() => tutteLeNote.slice(0, 5), [tutteLeNote]);

  const noteMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      acc[n.entityId] = (acc[n.entityId] ?? '') + ' ' + n.contenuto.toLowerCase();
      return acc;
    }, {}),
  [tutteLeNote]);

  const filtered = useMemo(() => mezzi.filter(m => {
    const s = search.toLowerCase();
    const matchSearch =
      m.targa.toLowerCase().includes(s) ||
      m.marca.toLowerCase().includes(s) ||
      m.modello.toLowerCase().includes(s) ||
      (m.alimentazione ?? '').toLowerCase().includes(s) ||
      (m.societaNoleggio ?? m.proprietario ?? '').toLowerCase().includes(s) ||
      (m.assegnazioni?.[0]?.padroncino.ragioneSociale ?? '').toLowerCase().includes(s) ||
      (m.utilizzatore ?? '').toLowerCase().includes(s);
    const statoUpper     = m.stato.toUpperCase();
    const matchStato     = filtroStato === 'TUTTI'  ? true
                          : filtroStato === 'ATTIVI' ? statoUpper !== 'DISMESSO' && statoUpper !== 'VENDUTO'
                          : statoUpper === filtroStato;
    const matchPossesso  = filtroPossesso  === 'TUTTI' || (m.tipoPossesso ?? 'NOLEGGIO') === filtroPossesso;
    const matchCategoria = filtroCategoria === 'TUTTI' || (m.categoria ?? 'DISTRIBUZIONE') === filtroCategoria;
    return matchSearch && matchStato && matchPossesso && matchCategoria;
  }), [mezzi, search, filtroStato, filtroPossesso, filtroCategoria]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va: any, vb: any;
    switch (sortField) {
      case 'targa':   va = a.targa; vb = b.targa; break;
      case 'tipo':
        va = POSSESSO_BADGE[(a.tipoPossesso as string) ?? 'NOLEGGIO']?.label ?? a.tipoPossesso ?? '';
        vb = POSSESSO_BADGE[(b.tipoPossesso as string) ?? 'NOLEGGIO']?.label ?? b.tipoPossesso ?? '';
        break;
      case 'marca':   va = a.marca + a.modello; vb = b.marca + b.modello; break;
      case 'alimentazione':
        va = ALIMENTAZIONE_BADGE[a.alimentazione]?.label ?? a.alimentazione ?? '';
        vb = ALIMENTAZIONE_BADGE[b.alimentazione]?.label ?? b.alimentazione ?? '';
        break;
      case 'stato':   va = a.stato; vb = b.stato; break;
      case 'padroncino':
        va = a.assegnazioni?.find(x => !x.dataFine)?.padroncino.ragioneSociale ?? a.utilizzatore ?? '';
        vb = b.assegnazioni?.find(x => !x.dataFine)?.padroncino.ragioneSociale ?? b.utilizzatore ?? '';
        break;
      case 'assicurazione':
        va = a.scadenzaAssicurazione ? new Date(a.scadenzaAssicurazione).getTime() : Infinity;
        vb = b.scadenzaAssicurazione ? new Date(b.scadenzaAssicurazione).getTime() : Infinity;
        break;
      case 'revisione':
        va = a.scadenzaRevisione ? new Date(a.scadenzaRevisione).getTime() : Infinity;
        vb = b.scadenzaRevisione ? new Date(b.scadenzaRevisione).getTime() : Infinity;
        break;
      case 'canone':
        va = a.canoneNoleggio != null ? Number(a.canoneNoleggio) : -Infinity;
        vb = b.canoneNoleggio != null ? Number(b.canoneNoleggio) : -Infinity;
        break;
      case 'rata':
        va = a.rataNoleggio != null ? Number(a.rataNoleggio) : -Infinity;
        vb = b.rataNoleggio != null ? Number(b.rataNoleggio) : -Infinity;
        break;
      case 'kmPct':
        va = kmPercent(a.kmAttuali, a.kmLimite) ?? -1;
        vb = kmPercent(b.kmAttuali, b.kmLimite) ?? -1;
        break;
      case 'kmAggiornatiAl':
        va = a.kmAttualiAl ? new Date(a.kmAttualiAl).getTime() : -Infinity;
        vb = b.kmAttualiAl ? new Date(b.kmAttualiAl).getTime() : -Infinity;
        break;
      case 'fineNoleggio': va = a.fineNoleggio ?? ''; vb = b.fineNoleggio ?? ''; break;
      default: va = ''; vb = '';
    }
    if (typeof va === 'string') return sortOrder === 'asc' ? va.localeCompare(vb, 'it') : vb.localeCompare(va, 'it');
    return sortOrder === 'asc' ? va - vb : vb - va;
  }), [filtered, sortField, sortOrder]);

  const prossimeScadenze = useMemo(() => {
    const items: { targa: string; id: string; tipo: ScadenzaTipo; giorni: number }[] = [];
    // Un mezzo dismesso/venduto è fuori flotta: le sue scadenze non interessano
    // più, altrimenti restano per sempre in lista come dati obsoleti. Non si usa
    // `filtered` perché quello segue il tab/filtri della tabella (es. solo
    // DISPONIBILE): qui vogliamo tutti i mezzi ancora in flotta, indipendentemente
    // dal filtro selezionato dall'utente.
    mezzi
      .filter(m => m.stato.toUpperCase() !== 'DISMESSO' && m.stato.toUpperCase() !== 'VENDUTO')
      .forEach(m => {
        const ass = daysDiff(m.scadenzaAssicurazione);
        const rev = daysDiff(m.scadenzaRevisione);
        const fn  = daysDiff(m.fineNoleggio);
        if (ass !== null && ass <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Assicurazione', giorni: ass });
        if (rev !== null && rev <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Revisione',     giorni: rev });
        if (fn  !== null && fn  <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Fine Noleggio',  giorni: fn });
      });
    return items.sort((a, b) => a.giorni - b.giorni);
  }, [mezzi]);

  const scadenzeFiltrate = useMemo(() => {
    return prossimeScadenze.filter(s => s.tipo === scadenzaTab).slice(0, 5);
  }, [prossimeScadenze, scadenzaTab]);

  const selectedMezzi    = useMemo(() => mezzi.filter(m => selectedIds.has(m.id)), [mezzi, selectedIds]);
  const hasActiveAssignments = selectedMezzi.some(m => m.assegnazioni?.some(a => !a.dataFine));

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };
  const si = (f: SortField) => sortField === f ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ' ↕';

  const toggleCol = (key: ColKey) => setCols(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem(COLS_KEY, JSON.stringify(next));
    return next;
  });

  const toggleSelect    = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds(selectedIds.size === sorted.length ? new Set() : new Set(sorted.map(m => m.id)));
  const clearSelection  = () => setSelectedIds(new Set());

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([mezziApi.list({ limit: '200' }), mezziApi.stats()]);
      setMezzi(listResp.data); setStats(statsResp);
    } catch (e: any) { setError(e.message || 'Errore caricamento dati'); }
    finally { setLoading(false); }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const [noteResp, auditResp] = await Promise.all([
        noteApi.list('mezzo', undefined, 500),
        api.get<{ data: AuditEntry[] }>('/audit?entityType=mezzo,assegnazione_mezzo&limit=5'),
      ]);
      setTutteLeNote(noteResp); setUltimiLog(auditResp.data ?? []);
    } catch {}
  }, []);

  const loadTasks = useCallback(async () => {
    try { setTasks(await taskApi.list('flotta', 'mezzi')); } catch {}
  }, []);

  useEffect(() => { loadData(); },    [loadData]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTasks(); },   [loadTasks]);

  useEffect(() => {
    if (!colPickerOpen) return;
    const h = (e: MouseEvent) => { if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [colPickerOpen]);

  const handleBulkAssegna = useCallback(async (padroncinoId: string, dataInizio: string) => {
    const errors: string[] = []; let ok = 0;
    await Promise.allSettled(selectedMezzi.map(async m => {
      try { await mezziApi.assegna(m.id, { padroncinoId, dataInizio }); ok++; }
      catch (e: any) { errors.push(`${m.targa}: ${e.message}`); }
    }));
    await loadData(); clearSelection(); return { ok, errors };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMezzi, loadData]);

  const handleBulkRimuovi = useCallback(async () => {
    const errors: string[] = []; let ok = 0;
    await Promise.allSettled(selectedMezzi.map(async m => {
      const attiva = m.assegnazioni?.find(a => !a.dataFine); if (!attiva) return;
      try { await mezziApi.chiudiAssegnazione(attiva.id); ok++; }
      catch (e: any) { errors.push(`${m.targa}: ${e.message}`); }
    }));
    await loadData(); clearSelection(); return { ok, errors };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMezzi, loadData]);

  const handleCreate = async (form: NuovoMezzo) => {
    try {
      const isNoleggio = form.tipoPossesso === 'NOLEGGIO';
      await mezziApi.create({
        targa: form.targa.toUpperCase(), marca: form.marca, modello: form.modello,
        tipo: form.tipo, alimentazione: form.alimentazione, categoria: form.categoria,
        tipoPossesso: form.tipoPossesso,
        kmAttuali: form.kmAttuali ? parseInt(form.kmAttuali) : undefined,
        kmAttualiAl: form.kmAttualiAl || undefined,
        kmLimite: form.kmLimite ? parseInt(form.kmLimite) : undefined,
        rataNoleggio:   isNoleggio && form.rataNoleggio   ? parseFloat(form.rataNoleggio)   : undefined,
        canoneNoleggio: isNoleggio && form.canoneNoleggio ? parseFloat(form.canoneNoleggio) : undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione || undefined,
        scadenzaRevisione:     form.scadenzaRevisione     || undefined,
        scadenzaBollo:         form.scadenzaBollo         || undefined,
        proprietario:   isNoleggio ? (form.societaNoleggio || undefined) : undefined,
        inizioNoleggio: isNoleggio ? (form.inizioNoleggio  || undefined) : undefined,
        fineNoleggio:   isNoleggio ? (form.fineNoleggio    || undefined) : undefined,
        note: form.note || undefined, maggiorazioneRicarica: 20,
      });
      await loadData();
    } catch (e: any) { alert('Errore creazione mezzo: ' + e.message); }
  };

  const handleImportaExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportando(true);
    try { const result = await mezziApi.importaExcel(file); setImportResult(result); await loadData(); }
    catch (err: any) { alert('Errore importazione: ' + (err.message ?? 'Errore sconosciuto')); }
    finally { setImportando(false); if (importInputRef.current) importInputRef.current.value = ''; }
  };

  const handleAddNota = async () => {
    if (!notaForm.mezzoId || !notaForm.testo.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'mezzo', entityId: notaForm.mezzoId, contenuto: notaForm.testo.trim() });
      setNotaForm({ open: false, mezzoId: '', testo: '' });
      const fresh = await noteApi.list('mezzo', undefined, 500);
      setTutteLeNote(fresh);
    } catch (e: any) { alert('Errore salvataggio nota: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const handleOpenNewTask  = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'flotta', entityId: 'mezzi', ...data });
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

  if (loading) return (
    <div className="fm-page"><div className="fm-loading"><div className="fm-spinner" /><span>Caricamento flotta...</span></div></div>
  );
  if (error) return (
    <div className="fm-page"><div className="fm-error"><span>⚠️ {error}</span><button className="fm-btn-primary fm-btn-sm" onClick={loadData}>Riprova</button></div></div>
  );

  const statTotali      = stats?.totali      ?? mezzi.length;
  const statAssegnati   = stats?.assegnati   ?? 0;
  const statDisponibili = stats?.disponibili ?? 0;
  const statCanone      = stats?.entrateNoleggio ?? null;
  const statRate        = stats?.sommaRate ?? null;
  const statMargine     = stats?.margine ?? null;

  return (
    <div className="fm-page">

      {/* ── HEADER ── */}
      <div className="fm-header">
        <div>
          <h1 className="fm-title">Flotta Mezzi</h1>
          <span className="fm-subtitle">Gestione veicoli, scadenze e assegnazioni padroncini</span>
        </div>
        <div className="fm-header-actions">
          {prossimeScadenze.length > 0 && (
            <span className="fm-scad-alert">⚠️ {prossimeScadenze.length} scadenze entro 30gg</span>
          )}
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportaExcel} />
          <button className="fm-btn-outline" onClick={() => importInputRef.current?.click()} disabled={importando}>
            {importando ? '⏳ Importazione...' : '📥 Importa Excel'}
          </button>
          <button className="fm-btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo Mezzo</button>
        </div>
      </div>

      {/* ── KPI ROW ── */}
      <div className="fm-kpi-row">
        <div className="fm-kpi-card fm-kpi-blue">
          <span className="fm-kpi-label">Totali</span>
          <span className="fm-kpi-val">{statTotali}</span>
          <span className="fm-kpi-sub">{statAssegnati} assegnati</span>
        </div>
        <div className="fm-kpi-card fm-kpi-green">
          <span className="fm-kpi-label">Disponibili</span>
          <span className="fm-kpi-val fm-kpi-val-green">{statDisponibili}</span>
          <span className="fm-kpi-sub">pronti all'assegnazione</span>
        </div>
        <div className="fm-kpi-card fm-kpi-amber">
          <span className="fm-kpi-label">Canone Noleggio</span>
          <span className="fm-kpi-val fm-kpi-val-amber">{fmtEur(statCanone)}</span>
          <span className="fm-kpi-sub">costo mensile</span>
        </div>
        <div className="fm-kpi-card fm-kpi-purple">
          <span className="fm-kpi-label">Rate PDA</span>
          <span className="fm-kpi-val fm-kpi-val-purple">{fmtEur(statRate)}</span>
          <span className="fm-kpi-sub">incasso mensile</span>
        </div>
        <div className={`fm-kpi-card ${(statMargine ?? 0) >= 0 ? 'fm-kpi-green' : 'fm-kpi-red'}`}>
          <span className="fm-kpi-label">Margine</span>
          <span className={`fm-kpi-val ${(statMargine ?? 0) >= 0 ? 'fm-kpi-val-green' : 'fm-kpi-val-red'}`}>{fmtEur(statMargine)}</span>
          <span className="fm-kpi-sub">netto mensile</span>
        </div>
      </div>

      {/* ── INFO PANELS ── */}
      <div className="fm-info-row">

        {/* Scadenze */}
        <div className="fm-info-panel">
          <div className="fm-info-panel-head">
            <span className="fm-info-panel-title">⚠️ Scadenze Imminenti</span>
            {prossimeScadenze.length > 0 && (
              <span className="fm-info-count">{prossimeScadenze.length}</span>
            )}
          </div>
          <div className="fm-scad-tabs">
            {(['Fine Noleggio', 'Revisione', 'Assicurazione'] as const).map(tab => {
              const count = prossimeScadenze.filter(s => s.tipo === tab).length;
              return (
                <button
                  key={tab}
                  className={`fm-scad-tab ${scadenzaTab === tab ? 'active' : ''}`}
                  onClick={() => setScadenzaTab(tab)}
                >
                  {tab}{count > 0 && <span className="fm-scad-tab-count">{count}</span>}
                </button>
              );
            })}
          </div>
          {scadenzeFiltrate.length === 0
            ? <div className="fm-info-empty">Nessuna scadenza nei prossimi 30 giorni</div>
            : scadenzeFiltrate.map((s, i) => (
              <div key={i} className="fm-info-row-item" onClick={() => navigate(`/flotta/${s.id}`)}>
                <span className="fm-info-targa">{s.targa}</span>
                <span className="fm-info-nome">{s.tipo}</span>
                <span className={`fm-scad-pill ${s.giorni < 0 ? 'pill-red' : s.giorni <= 7 ? 'pill-orange' : 'pill-yellow'}`}>
                  {s.giorni < 0 ? `${Math.abs(s.giorni)}gg fa` : `${s.giorni}gg`}
                </span>
              </div>
            ))}
        </div>

        {/* Note */}
        <div className="fm-info-panel">
          <div className="fm-info-panel-head">
            <span className="fm-info-panel-title">📝 Ultime Note</span>
            <button className="fm-nota-toggle" onClick={() => setNotaForm(f => ({ ...f, open: !f.open }))}>
              {notaForm.open ? '✕ chiudi' : '+ nota'}
            </button>
          </div>
          {notaForm.open && (
            <div className="fm-nota-form">
              <select className="fm-nota-select" value={notaForm.mezzoId} onChange={e => setNotaForm(f => ({ ...f, mezzoId: e.target.value }))}>
                <option value="">— Seleziona mezzo —</option>
                {mezzi.map(m => <option key={m.id} value={m.id}>{m.targa} – {m.marca} {m.modello}</option>)}
              </select>
              <textarea className="fm-nota-textarea" rows={2} placeholder="Testo nota..." value={notaForm.testo} onChange={e => setNotaForm(f => ({ ...f, testo: e.target.value }))} />
              <div className="fm-nota-actions">
                <button className="fm-btn-outline fm-btn-sm" onClick={() => setNotaForm({ open: false, mezzoId: '', testo: '' })}>Annulla</button>
                <button className="fm-btn-primary fm-btn-sm" onClick={handleAddNota} disabled={notaSaving || !notaForm.mezzoId || !notaForm.testo.trim()}>
                  {notaSaving ? 'Salvo...' : 'Salva nota'}
                </button>
              </div>
            </div>
          )}
          {ultimeNote.length === 0
            ? <div className="fm-info-empty">Nessuna nota registrata</div>
            : ultimeNote.map(n => {
              const m = mezziMap[n.entityId];
              return (
                <div key={n.id} className="fm-info-row-item" onClick={() => navigate(`/flotta/${n.entityId}`)}>
                  <span className="fm-info-targa">{m?.targa ?? '—'}</span>
                  <span className="fm-info-nota" title={n.contenuto}>{n.contenuto}</span>
                  <span className="fm-info-ago">{n.user ? `${n.user.nome[0]}.${n.user.cognome[0]}.` : '—'} · {fmt(n.createdAt)}</span>
                </div>
              );
            })}
        </div>

        {/* Log */}
        <div className="fm-info-panel">
          <div className="fm-info-panel-head">
            <span className="fm-info-panel-title">🕐 Ultime Modifiche</span>
          </div>
          {ultimiLog.length === 0
            ? <div className="fm-info-empty">Nessuna modifica recente</div>
            : ultimiLog.map(l => {
              // Gli eventi di assegnazione/fine-assegnazione hanno entityType
              // 'assegnazione_mezzo' ed entityId = id dell'assegnazione, non del
              // mezzo: risolviamo il mezzo per targa per collegare la riga giusta.
              const relatedTarga = l.dataDopo?.targa ?? l.dataPrima?.targa;
              const relatedMezzo = mezziMap[l.entityId]
                ?? (relatedTarga ? mezzi.find(m => m.targa === relatedTarga) : undefined);
              const targa = relatedMezzo?.targa ?? relatedTarga ?? '—';
              const descrizione = getHumanReadableDescription({ ...l, entityType: l.entityType ?? 'mezzo' }, { hideIdentifier: true });
              return (
                <div key={l.id} className="fm-info-row-item" onClick={() => navigate(`/flotta/${relatedMezzo?.id ?? l.entityId}`)}>
                  <span className="fm-info-targa">{targa}</span>
                  <span className="fm-info-desc" title={descrizione}>{descrizione}</span>
                  <span className="fm-info-ago">{l.user ? `${l.user.nome[0]}.${l.user.cognome[0]}.` : '—'} · {fmtDateOra(l.createdAt)}</span>
                </div>
              );
            })}
        </div>

        {/* Cose da fare */}
        <div className="fm-info-panel">
          <div className="fm-info-panel-head">
            <span className="fm-info-panel-title">✅ Cose da Fare</span>
            <button className="fm-nota-toggle" onClick={handleOpenNewTask}>+ attività</button>
          </div>
          {tasks.length === 0
            ? <div className="fm-info-empty">Nessuna attività registrata</div>
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
        fieldKey="targa"
        fieldLabel="Targa"
        refOptions={targheOptions}
        editingTask={editingTask}
      />

      {/* ── TOOLBAR ── */}
      <div className="fm-toolbar">
        <div className="fm-search-wrap">
          <span style={{ fontSize: 14, color: '#94a3b8' }}>🔍</span>
          <input className="fm-search" placeholder="Cerca targa, marca, padroncino…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="fm-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <select className="fm-select" value={filtroPossesso} onChange={e => setFiltroPossesso(e.target.value as any)}>
          <option value="TUTTI">Tutti i tipi</option>
          <option value="PROPRIETA">Proprietà</option>
          <option value="NOLEGGIO">Noleggio</option>
          <option value="ESTERNO">Esterno</option>
        </select>
        <select className="fm-select" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value as any)}>
          <option value="TUTTI">Tutte le categorie</option>
          <option value="DISTRIBUZIONE">Distribuzione</option>
          <option value="AUTO_AZIENDALE">Auto Aziendale</option>
          <option value="FLOTTA">Flotta</option>
        </select>
        <div className="fm-col-picker-wrap" ref={colPickerRef}>
          <button className="fm-btn-outline" onClick={() => setColPickerOpen(o => !o)}>Colonne ▾</button>
          {colPickerOpen && (
            <div className="fm-col-picker-dropdown">
              {COL_DEFS.map(({ key, label }) => (
                <label key={key} className="fm-col-option">
                  <input type="checkbox" checked={cols[key]} onChange={() => toggleCol(key)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="fm-filters">
          {(['ATTIVI', 'TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'IN_REVISIONE', 'FUORI_SERVIZIO', 'VENDUTO', 'DISMESSO'] as const).map(s => (
            <button key={s} className={`fm-filter-btn ${filtroStato === s ? 'fm-filter-active' : ''}`} onClick={() => setFiltroStato(s)}>
              {s === 'ATTIVI' ? 'Attivi' : s === 'TUTTI' ? 'Tutti (storico)' : STATO_BADGE[s]?.label ?? s}
            </button>
          ))}
          <span className="fm-result-count">{filtered.length} mezzi</span>
        </div>
      </div>

      {/* ── BULK BAR ── */}
      {selectedIds.size > 0 && (
        <div className="fm-bulk-bar">
          <span className="fm-bulk-count">☑ {selectedIds.size} selezionati</span>
          <button className="fm-btn-primary fm-btn-sm" onClick={() => setBulkModalOpen(true)}>⚡ Azione massiva</button>
          <button className="fm-btn-primary fm-btn-sm" onClick={() => setBulkContrattoOpen(true)}>📄 Crea Contratti</button>
          <button className="fm-bulk-deselect" onClick={clearSelection}>✕ Deseleziona</button>
        </div>
      )}

      {/* ── IMPORT RESULT ── */}
      {importResult && (
        <div className="fm-import-result">
          <span>Importazione completata: <strong>{importResult.creati}</strong> creati, <strong>{importResult.saltati}</strong> saltati.</span>
          {importResult.errori.length > 0 && (
            <details><summary>{importResult.errori.length} errori</summary>
              <ul>{importResult.errori.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
          <button className="fm-import-close" onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}

      {/* ── TABELLA ── */}
      <div className="fm-table-wrap">
        <div style={{ overflowX: 'auto' }}>
          <table className="fm-table">
            <thead>
              <tr className="fm-thead-row">
                <th className="fm-th fm-th-cb">
                  <input type="checkbox" className="fm-checkbox" checked={sorted.length > 0 && selectedIds.size === sorted.length} onChange={toggleSelectAll} />
                </th>
                <th className="fm-th-sort" onClick={() => handleSort('targa')}>TARGA{si('targa')}</th>
                {cols.tipo         && <th className="fm-th-sort" onClick={() => handleSort('tipo')}>TIPO{si('tipo')}</th>}
                {cols.marcaModello && <th className="fm-th-sort" onClick={() => handleSort('marca')}>MARCA / MODELLO{si('marca')}</th>}
                {cols.alimentazione && <th className="fm-th-sort" onClick={() => handleSort('alimentazione')}>ALIMENTAZIONE{si('alimentazione')}</th>}
                {cols.stato        && <th className="fm-th-sort" onClick={() => handleSort('stato')}>STATO{si('stato')}</th>}
                {cols.assegnatoA   && <th className="fm-th-sort" onClick={() => handleSort('padroncino')}>ASSEGNATO A{si('padroncino')}</th>}
                {cols.assicurazione && <th className="fm-th-sort" onClick={() => handleSort('assicurazione')}>ASSICURAZIONE{si('assicurazione')}</th>}
                {cols.revisione    && <th className="fm-th-sort" onClick={() => handleSort('revisione')}>REVISIONE{si('revisione')}</th>}
                {cols.km           && <th className="fm-th fm-th-sort" onClick={() => handleSort('kmPct')}>KM / LIMITE{si('kmPct')}</th>}
                {cols.kmAggiornatiAl && <th className="fm-th fm-th-sort" onClick={() => handleSort('kmAggiornatiAl')}>KM AGGIORNATI AL{si('kmAggiornatiAl')}</th>}
                {cols.canone       && <th className="fm-th fm-th-purple fm-th-sort" style={{ textAlign: 'right' }} onClick={() => handleSort('canone')}>CANONE NLG{si('canone')}</th>}
                {cols.rataPda      && <th className="fm-th fm-th-amber fm-th-sort" style={{ textAlign: 'right' }} onClick={() => handleSort('rata')}>RATA PDA{si('rata')}</th>}
                {cols.fineNoleggio  && <th className="fm-th fm-th-sort" onClick={() => handleSort('fineNoleggio')}>FINE NLG{si('fineNoleggio')}</th>}
                <th className="fm-th" style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={20} className="fm-empty-row">Nessun mezzo trovato</td></tr>
              )}
              {sorted.map(m => {
                const attiva      = m.assegnazioni?.find(a => !a.dataFine);
                const padroncino  = attiva?.padroncino;
                const possesso    = POSSESSO_BADGE[(m.tipoPossesso as string) ?? 'NOLEGGIO'] ?? POSSESSO_BADGE['NOLEGGIO'];
                const statoBadge  = STATO_BADGE[m.stato.toUpperCase()] ?? { label: m.stato, cls: 'fm-badge-gray' };
                const assicInfo   = scadenzaCell(m.scadenzaAssicurazione);
                const revInfo     = scadenzaCell(m.scadenzaRevisione);
                const pct         = kmPercent(m.kmAttuali, m.kmLimite);
                const societa     = m.societaNoleggio ?? m.proprietario ?? null;

                return (
                  <tr
                    key={m.id}
                    className={`fm-row${selectedIds.has(m.id) ? ' fm-row-selected' : ''}`}
                    onClick={() => navigate(`/flotta/${m.id}`)}
                    style={{ cursor: 'pointer' }}
                  >

                    <td className="fm-td fm-td-cb" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="fm-checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                    </td>

                    {/* TARGA */}
                    <td className="fm-td">
                      <div className="fm-targa-cell">
                        <span className="fm-targa">{m.targa}</span>
                        {societa && <span className="fm-societa">{societa}</span>}
                      </div>
                    </td>

                    {/* TIPO */}
                    {cols.tipo && (
                      <td className="fm-td">
                        <span className={`fm-cat-tag ${possesso.cls}`}>{possesso.label}</span>
                      </td>
                    )}

                    {/* MARCA / MODELLO */}
                    {cols.marcaModello && (
                      <td className="fm-td">
                        <span className="fm-marca-modello">{m.marca} {m.modello}</span>
                      </td>
                    )}

                    {/* ALIMENTAZIONE */}
                    {cols.alimentazione && (
                      <td className="fm-td">
                        {m.alimentazione
                          ? (() => {
                              const alim = ALIMENTAZIONE_BADGE[m.alimentazione] ?? { label: m.alimentazione, icon: '', cls: 'fm-alim-altro' };
                              return <span className={`fm-alimentazione ${alim.cls}`}>{alim.icon} {alim.label}</span>;
                            })()
                          : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* STATO */}
                    {cols.stato && (
                      <td className="fm-td">
                        <span className={`fm-badge ${statoBadge.cls}`}>{statoBadge.label}</span>
                      </td>
                    )}

                    {/* ASSEGNATO A */}
                    {cols.assegnatoA && (
                      <td className="fm-td" style={{ maxWidth: 160 }}>
                        {padroncino
                          ? <span className="fm-padroncino">{padroncino.ragioneSociale}</span>
                          : m.utilizzatore
                            ? <span className="fm-padroncino">{m.utilizzatore}</span>
                            : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* ASSICURAZIONE */}
                    {cols.assicurazione && (
                      <td className="fm-td">
                        {assicInfo
                          ? <span className={`fm-scad-val ${assicInfo.cls}`}>{assicInfo.giorni}</span>
                          : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* REVISIONE */}
                    {cols.revisione && (
                      <td className="fm-td">
                        {revInfo
                          ? <span className={`fm-scad-val ${revInfo.cls}`}>{revInfo.giorni}</span>
                          : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* KM */}
                    {cols.km && (
                      <td className="fm-td">
                        {m.kmAttuali != null ? (
                          <div className="fm-km-cell">
                            <div className="fm-km-top">
                              <span className="fm-km-val">{m.kmAttuali.toLocaleString('it-IT')} km</span>
                              {pct != null && <span className={`fm-km-pct ${kmTextCls(pct)}`}>{pct}%</span>}
                            </div>
                            <div className="fm-km-bar-bg">
                              {pct != null && <div className={`fm-km-bar-fill ${kmBarCls(pct)}`} style={{ width: `${pct}%` }} />}
                            </div>
                            <span className="fm-km-limite">
                              {m.kmLimite ? `limite ${m.kmLimite.toLocaleString('it-IT')} km` : 'nessun limite'}
                            </span>
                          </div>
                        ) : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* KM AGGIORNATI AL */}
                    {cols.kmAggiornatiAl && (
                      <td className="fm-td">
                        {m.kmAttualiAl
                          ? <span className="fm-data">{fmt(m.kmAttualiAl)}</span>
                          : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* CANONE */}
                    {cols.canone && (
                      <td className="fm-td fm-td-purple" style={{ textAlign: 'right' }}>
                        {m.canoneNoleggio != null ? <span className="fm-num">{fmtEur(m.canoneNoleggio)}</span> : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* RATA PDA */}
                    {cols.rataPda && (
                      <td className="fm-td fm-td-amber" style={{ textAlign: 'right' }}>
                        {m.rataNoleggio != null ? <span className="fm-rata">{fmtEur(m.rataNoleggio)}</span> : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* FINE NOLEGGIO */}
                    {cols.fineNoleggio && (
                      <td className="fm-td">
                        {m.fineNoleggio
                          ? (() => { const info = scadenzaCell(m.fineNoleggio); return info ? <span className={`fm-scad-val ${info.cls}`}>{fmt(m.fineNoleggio)}</span> : <span className="fm-data">{fmt(m.fineNoleggio)}</span>; })()
                          : <span className="fm-empty">—</span>}
                      </td>
                    )}

                    {/* AZIONI */}
                    <td className="fm-td" onClick={e => e.stopPropagation()}>
                      <button className="fm-btn-primary fm-btn-sm" onClick={() => navigate(`/flotta/${m.id}`)}>Dettaglio</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="fm-table-footer">
          <span>{filtered.length} di {mezzi.length} mezzi</span>
          <span className="fm-footer-date">Aggiornato: oggi</span>
        </div>
      </div>

      <NuovoMezzoModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleCreate} />
      <BulkContrattoModal open={bulkContrattoOpen} onClose={() => setBulkContrattoOpen(false)} mezzi={selectedMezzi} />
      <BulkAssignModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        selectedCount={selectedIds.size}
        entityLabel="mezzi"
        hasActiveAssignments={hasActiveAssignments}
        onAssegna={handleBulkAssegna}
        onRimuovi={handleBulkRimuovi}
      />
    </div>
  );
}
