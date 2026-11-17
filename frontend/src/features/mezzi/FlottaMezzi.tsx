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
import {
  Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, Tabs, SegTabs, Dot, Empty, Alert, Th, Icon, C,
  fmtNum, type KpiItem, type Tone,
} from '../../components/ds';
import TaskList from '../../components/ds/TaskList';
import './FlottaMezzi.css';
import './Flotta.css';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : '€ ' + fmtNum(Number(n), 2);

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

const STATO_BADGE: Record<string, { label: string; cls: string; tone: Tone }> = {
  ASSEGNATO:      { label: 'Assegnato',      cls: 'fm-badge-assigned',  tone: 'info' },
  DISPONIBILE:    { label: 'Disponibile',    cls: 'fm-badge-available', tone: 'ok'   },
  IN_REVISIONE:   { label: 'In revisione',   cls: 'fm-badge-revision',  tone: 'warn' },
  FUORI_SERVIZIO: { label: 'Fuori servizio', cls: 'fm-badge-fuori',     tone: 'ko'   },
  VENDUTO:        { label: 'Venduto',        cls: 'fm-badge-gray',      tone: 'na'   },
  DISMESSO:       { label: 'Dismesso',       cls: 'fm-badge-gray',      tone: 'na'   },
};

const POSSESSO_COLOR: Record<string, string> = { PROPRIETA: '#15803D', NOLEGGIO: '#1D4ED8', ESTERNO: '#6D28D9' };

/** Tono della scadenza: scaduta o entro 7 giorni rosso, entro 30 arancio. */
const scadTone = (d: string | null | undefined): Tone => {
  const g = daysDiff(d);
  if (g === null) return 'na';
  return g <= 7 ? 'ko' : g <= 30 ? 'warn' : 'na';
};
const scadTip = (d: string | null | undefined) => {
  const g = daysDiff(d);
  return g === null ? undefined : g < 0 ? `Scaduta da ${-g} giorni` : `Tra ${g} giorni`;
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

  type ScadenzaTipo = 'Fine Noleggio' | 'Revisione' | 'Assicurazione' | 'Bollo';
  const [scadenzaTab, setScadenzaTab] = useState<ScadenzaTipo>('Assicurazione');

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
        const bol = daysDiff(m.scadenzaBollo);
        if (bol !== null && bol <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Bollo', giorni: bol });
        if (ass !== null && ass <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Assicurazione', giorni: ass });
        if (rev !== null && rev <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Revisione',     giorni: rev });
        if (fn  !== null && fn  <= 30) items.push({ targa: m.targa, id: m.id, tipo: 'Fine Noleggio',  giorni: fn });
      });
    return items.sort((a, b) => a.giorni - b.giorni);
  }, [mezzi]);

  const scadenzeFiltrate = useMemo(() => {
    return prossimeScadenze.filter(s => s.tipo === scadenzaTab);
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

  if (loading) return <Page><Empty>Caricamento flotta…</Empty></Page>;
  if (error) return (
    <Page><Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={loadData}>Riprova</Button>}>{error}</Alert></Page>
  );

  const statTotali      = stats?.totali      ?? mezzi.length;
  const statAssegnati   = stats?.assegnati   ?? 0;
  const statDisponibili = stats?.disponibili ?? 0;
  const statCanone      = stats?.entrateNoleggio ?? null;
  const statRate        = stats?.sommaRate ?? null;
  const statMargine     = stats?.margine ?? null;

  const kpis: KpiItem[] = [
    { label: 'Mezzi', value: fmtNum(statTotali), color: C.teal, icon: 'mezzi', sub: `${statAssegnati} assegnati · ${statDisponibili} disponibili`,
      seg: statTotali ? [{ w: (statAssegnati / statTotali) * 100, color: C.blue }, { w: (statDisponibili / statTotali) * 100, color: C.green }] : undefined },
    { label: 'Canone noleggio', value: fmtEur(statCanone), color: C.orange, icon: 'euro', sub: 'Costo mensile della flotta' },
    { label: 'Rate PDA', value: fmtEur(statRate), color: C.purple, icon: 'cont', sub: 'Incasso mensile dai padroncini' },
    { label: 'Margine', value: fmtEur(statMargine), color: (statMargine ?? 0) >= 0 ? C.green : C.red, icon: 'marg', sub: 'Netto mensile (canoni − rate)',
      subColor: (statMargine ?? 0) >= 0 ? undefined : '#B91C1C' },
  ];

  const VISTE: { value: string; label: string }[] = [
    { value: 'ATTIVI', label: 'Attivi' },
    { value: 'ASSEGNATO', label: 'Assegnati' },
    { value: 'DISPONIBILE', label: 'Disponibili' },
    { value: 'IN_REVISIONE', label: 'In revisione' },
    { value: 'FUORI_SERVIZIO', label: 'Fuori servizio' },
    { value: 'VENDUTO', label: 'Venduti' },
    { value: 'DISMESSO', label: 'Dismessi' },
    { value: 'TUTTI', label: 'Tutti (storico)' },
  ];
  const contaVista = (v: string) => mezzi.filter(m => {
    const st = m.stato.toUpperCase();
    return v === 'TUTTI' ? true : v === 'ATTIVI' ? st !== 'DISMESSO' && st !== 'VENDUTO' : st === v;
  }).length;
  const sortState = { key: sortField, dir: sortOrder };
  const SCAD_TIPI: ScadenzaTipo[] = ['Assicurazione', 'Revisione', 'Bollo', 'Fine Noleggio'];

  return (
    <Page>
      <PageHeader
        eyebrow="Risorse"
        title="Flotta mezzi"
        sub="Veicoli, scadenze e assegnazioni ai padroncini"
        actions={<>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportaExcel} />
          <Button icon="upload" onClick={() => importInputRef.current?.click()} disabled={importando}>
            {importando ? 'Importazione…' : 'Importa Excel'}
          </Button>
          <Button icon="plus" variant="primary" onClick={() => setNuovoOpen(true)}>Nuovo mezzo</Button>
        </>}
      />

      <Kpis items={kpis} />

      <div className="ds-g4">
        {/* Scadenze per tipo, con elenco scorrevole */}
        <Card>
          <CardHead bar title="Scadenze" sub={prossimeScadenze.length ? `${prossimeScadenze.length} entro 30 giorni o scadute` : 'Nessuna entro 30 giorni'}
            tile={{ color: C.orange, icon: 'cal' }} />
          <div style={{ padding: '0 14px 8px' }}>
            <SegTabs
              items={SCAD_TIPI.map(t => ({ value: t, label: t === 'Fine Noleggio' ? 'Fine noleggio' : t, count: prossimeScadenze.filter(s => s.tipo === t).length || '' }))}
              value={scadenzaTab}
              onChange={setScadenzaTab}
              label="Tipo di scadenza"
            />
          </div>
          <div className="fl-scroll" tabIndex={0} aria-label="Elenco scadenze">
            {scadenzeFiltrate.length === 0
              ? <Empty>Nessuna scadenza di questo tipo</Empty>
              : scadenzeFiltrate.map((s, i) => (
                <button key={i} type="button" className="ds-listrow fl-rowbtn" onClick={() => navigate(`/flotta/${s.id}`)}>
                  <span className="ds-mono fl-targa">{s.targa}</span>
                  <span style={{ flex: '1 1 auto' }} />
                  <Dot tone={s.giorni < 0 || s.giorni <= 7 ? 'ko' : 'warn'}>{s.giorni < 0 ? `Scaduta da ${Math.abs(s.giorni)} gg` : `Tra ${s.giorni} gg`}</Dot>
                </button>
              ))}
          </div>
        </Card>

        {/* Note */}
        <Card>
          <CardHead bar title="Ultime note" tile={{ color: C.blue, icon: 'note' }}
            actions={<Button size="sm" icon={notaForm.open ? 'close' : 'plus'} onClick={() => setNotaForm(f => ({ ...f, open: !f.open }))}>{notaForm.open ? 'Chiudi' : 'Nota'}</Button>} />
          {notaForm.open && (
            <div className="fl-form">
              <label className="ds-field"><span>Mezzo</span>
                <select className="ds-input" value={notaForm.mezzoId} onChange={e => setNotaForm(f => ({ ...f, mezzoId: e.target.value }))}>
                  <option value="">Scegli un mezzo…</option>
                  {mezzi.map(m => <option key={m.id} value={m.id}>{m.targa} – {m.marca} {m.modello}</option>)}
                </select>
              </label>
              <label className="ds-field"><span>Testo</span>
                <textarea className="ds-input" rows={2} value={notaForm.testo} onChange={e => setNotaForm(f => ({ ...f, testo: e.target.value }))} />
              </label>
              <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" onClick={() => setNotaForm({ open: false, mezzoId: '', testo: '' })}>Annulla</Button>
                <Button size="sm" variant="blue" onClick={handleAddNota} disabled={notaSaving || !notaForm.mezzoId || !notaForm.testo.trim()}>
                  {notaSaving ? 'Salvo…' : 'Salva nota'}
                </Button>
              </div>
            </div>
          )}
          <div className="ds-list fl-scroll">
            {ultimeNote.length === 0
              ? <Empty>Nessuna nota registrata</Empty>
              : ultimeNote.map(n => {
                const m = mezziMap[n.entityId];
                return (
                  <button key={n.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate(`/flotta/${n.entityId}`)}>
                    <span className="fl-line"><span className="ds-mono fl-targa">{m?.targa ?? '—'}</span><span className="fl-meta">{n.user ? `${n.user.nome} ${n.user.cognome[0]}.` : '—'} · {fmt(n.createdAt)}</span></span>
                    <span className="fl-text" title={n.contenuto}>{n.contenuto}</span>
                  </button>
                );
              })}
          </div>
        </Card>

        {/* Ultime modifiche */}
        <Card>
          <CardHead bar title="Ultime modifiche" tile={{ color: C.purple, icon: 'stor' }} />
          <div className="ds-list fl-scroll">
            {ultimiLog.length === 0
              ? <Empty>Nessuna modifica recente</Empty>
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
                  <button key={l.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate(`/flotta/${relatedMezzo?.id ?? l.entityId}`)}>
                    <span className="fl-line"><span className="ds-mono fl-targa">{targa}</span><span className="fl-meta">{l.user ? `${l.user.nome} ${l.user.cognome[0]}.` : '—'} · {fmtDateOra(l.createdAt)}</span></span>
                    <span className="fl-text" title={descrizione}>{descrizione}</span>
                  </button>
                );
              })}
          </div>
        </Card>

        {/* Cose da fare */}
        <Card>
          <CardHead bar title="Cose da fare" tile={{ color: C.green, icon: 'check' }}
            actions={<Button size="sm" icon="plus" onClick={handleOpenNewTask}>Attività</Button>} />
          <div className="fl-scroll">
            <TaskList tasks={tasks} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />
          </div>
        </Card>
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

      {importResult && (
        <Alert tone="ok" title={`Importazione completata: ${importResult.creati} creati, ${importResult.saltati} saltati`}
          actions={<IconButton icon="close" label="Chiudi" onClick={() => setImportResult(null)} />}>
          {importResult.errori.length > 0 && (
            <details><summary>{importResult.errori.length} errori</summary>
              <ul style={{ margin: '6px 0 0 18px' }}>{importResult.errori.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </Alert>
      )}

      {selectedIds.size > 0 && (
        <div className="ds-bulkbar" role="region" aria-label="Azioni sui mezzi selezionati">
          <strong>{selectedIds.size} selezionati</strong>
          <Button size="sm" icon="swap" onClick={() => setBulkModalOpen(true)}>Assegna o rimuovi</Button>
          <Button size="sm" icon="doc" onClick={() => setBulkContrattoOpen(true)}>Crea contratti</Button>
          <span style={{ flex: '1 1 auto' }} />
          <Button size="sm" icon="close" onClick={clearSelection}>Deseleziona</Button>
        </div>
      )}

      {/* ── TABELLA ── */}
      <Card>
        <div style={{ padding: '6px 18px 0' }}>
          <Tabs items={VISTE.map(v => ({ value: v.value, label: v.label, count: contaVista(v.value) }))} value={filtroStato} onChange={setFiltroStato} label="Vista" />
        </div>
        <div className="fl-toolbar">
          <label className="ds-search" style={{ minWidth: 260 }}>
            <Icon name="search" size={13} />
            <span className="sr-only">Cerca targa, marca, padroncino</span>
            <input placeholder="Cerca targa, marca, padroncino…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button type="button" className="ds-iconbtn" style={{ width: 22, height: 22 }} aria-label="Cancella ricerca" onClick={() => setSearch('')}><Icon name="close" size={12} /></button>}
          </label>
          <label className="ds-select ds-select-sm"><span>Possesso</span>
            <select value={filtroPossesso} onChange={e => setFiltroPossesso(e.target.value as any)}>
              <option value="TUTTI">Tutti</option>
              <option value="PROPRIETA">Proprietà</option>
              <option value="NOLEGGIO">Noleggio</option>
              <option value="ESTERNO">Esterno</option>
            </select>
          </label>
          <label className="ds-select ds-select-sm"><span>Categoria</span>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value as any)}>
              <option value="TUTTI">Tutte</option>
              <option value="DISTRIBUZIONE">Distribuzione</option>
              <option value="AUTO_AZIENDALE">Auto aziendale</option>
              <option value="FLOTTA">Flotta</option>
            </select>
          </label>
          <span style={{ flex: '1 1 auto' }} />
          <span className="ds-cardsub">{filtered.length} mezzi</span>
          <div className="ds-pop" ref={colPickerRef}>
            <Button size="sm" icon="columns" aria-expanded={colPickerOpen} onClick={() => setColPickerOpen(o => !o)}>Colonne</Button>
            {colPickerOpen && (
              <div className="ds-popmenu" role="menu">
                {COL_DEFS.map(({ key, label }) => (
                  <label key={key}>
                    <input type="checkbox" checked={cols[key]} onChange={() => toggleCol(key)} />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ds-tablewrap">
          <table className="ds-table fl-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input type="checkbox" className="ds-check" aria-label="Seleziona tutti" checked={sorted.length > 0 && selectedIds.size === sorted.length} onChange={toggleSelectAll} />
                </th>
                <Th k="targa" sort={sortState} onSort={handleSort}>Targa</Th>
                {cols.tipo          && <Th k="tipo" sort={sortState} onSort={handleSort}>Possesso</Th>}
                {cols.marcaModello  && <Th k="marca" sort={sortState} onSort={handleSort}>Marca e modello</Th>}
                {cols.alimentazione && <Th k="alimentazione" sort={sortState} onSort={handleSort}>Alimentazione</Th>}
                {cols.stato         && <Th k="stato" sort={sortState} onSort={handleSort}>Stato</Th>}
                {cols.assegnatoA    && <Th k="padroncino" sort={sortState} onSort={handleSort}>Assegnato a</Th>}
                {cols.assicurazione && <Th k="assicurazione" sort={sortState} onSort={handleSort}>Assicurazione</Th>}
                {cols.revisione     && <Th k="revisione" sort={sortState} onSort={handleSort}>Revisione</Th>}
                {cols.km            && <Th k="kmPct" sort={sortState} onSort={handleSort}>Km / limite</Th>}
                {cols.kmAggiornatiAl && <Th k="kmAggiornatiAl" sort={sortState} onSort={handleSort}>Km al</Th>}
                {cols.canone        && <Th k="canone" sort={sortState} onSort={handleSort} right>Canone</Th>}
                {cols.rataPda       && <Th k="rata" sort={sortState} onSort={handleSort} right>Rata PDA</Th>}
                {cols.fineNoleggio  && <Th k="fineNoleggio" sort={sortState} onSort={handleSort}>Fine noleggio</Th>}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={20}><Empty>Nessun mezzo trovato</Empty></td></tr>
              )}
              {sorted.map(m => {
                const attiva      = m.assegnazioni?.find(a => !a.dataFine);
                const padroncino  = attiva?.padroncino;
                const possKey     = (m.tipoPossesso as string) ?? 'NOLEGGIO';
                const possesso    = POSSESSO_BADGE[possKey] ?? POSSESSO_BADGE['NOLEGGIO'];
                const statoBadge  = STATO_BADGE[m.stato.toUpperCase()] ?? { label: m.stato, cls: '', tone: 'na' as Tone };
                const pct         = kmPercent(m.kmAttuali, m.kmLimite);
                const societa     = m.societaNoleggio ?? m.proprietario ?? null;
                const alim        = m.alimentazione ? (ALIMENTAZIONE_BADGE[m.alimentazione]?.label ?? m.alimentazione) : null;

                return (
                  <tr key={m.id} className={`is-clickable${selectedIds.has(m.id) ? ' is-open' : ''}`} onClick={() => navigate(`/flotta/${m.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="ds-check" aria-label={`Seleziona ${m.targa}`} checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                    </td>
                    <td>
                      <div className="fl-cellstack">
                        <span className="ds-mono fl-targa">{m.targa}</span>
                        {societa && <span className="fl-meta">{societa}</span>}
                      </div>
                    </td>
                    {cols.tipo && (
                      <td><span className="fl-poss" style={{ color: POSSESSO_COLOR[possKey] ?? '#1D4ED8' }}><i style={{ background: POSSESSO_COLOR[possKey] ?? '#1D4ED8' }} />{possesso.label}</span></td>
                    )}
                    {cols.marcaModello && <td className="nowrap">{m.marca} {m.modello}</td>}
                    {cols.alimentazione && <td className="nowrap">{alim ?? <span className="fl-empty">—</span>}</td>}
                    {cols.stato && <td><Dot tone={statoBadge.tone}>{statoBadge.label}</Dot></td>}
                    {cols.assegnatoA && (
                      <td className="fl-ellipsis" title={padroncino?.ragioneSociale ?? m.utilizzatore ?? undefined}>
                        {padroncino ? padroncino.ragioneSociale : m.utilizzatore ? m.utilizzatore : <span className="fl-empty">—</span>}
                      </td>
                    )}
                    {cols.assicurazione && (
                      <td>{m.scadenzaAssicurazione ? <Dot tone={scadTone(m.scadenzaAssicurazione)} title={scadTip(m.scadenzaAssicurazione)}>{fmt(m.scadenzaAssicurazione)}</Dot> : <span className="fl-empty">—</span>}</td>
                    )}
                    {cols.revisione && (
                      <td>{m.scadenzaRevisione ? <Dot tone={scadTone(m.scadenzaRevisione)} title={scadTip(m.scadenzaRevisione)}>{fmt(m.scadenzaRevisione)}</Dot> : <span className="fl-empty">—</span>}</td>
                    )}
                    {cols.km && (
                      <td>
                        {m.kmAttuali != null ? (
                          <div className="fl-km" title={m.kmLimite ? `Limite ${fmtNum(m.kmLimite)} km` : 'Nessun limite'}>
                            <span className="fl-km-top"><span>{fmtNum(m.kmAttuali)} km</span>{pct != null && <strong style={{ color: pct >= 90 ? '#B91C1C' : pct >= 70 ? '#C2410C' : '#52525B' }}>{pct}%</strong>}</span>
                            <span className="fl-km-bar"><i style={{ width: `${pct ?? 0}%`, background: pct == null ? 'transparent' : pct >= 90 ? C.red : pct >= 70 ? C.orange : C.teal }} /></span>
                          </div>
                        ) : <span className="fl-empty">—</span>}
                      </td>
                    )}
                    {cols.kmAggiornatiAl && <td className="nowrap">{m.kmAttualiAl ? fmt(m.kmAttualiAl) : <span className="fl-empty">—</span>}</td>}
                    {cols.canone && <td className="r nowrap">{m.canoneNoleggio != null ? fmtEur(m.canoneNoleggio) : <span className="fl-empty">—</span>}</td>}
                    {cols.rataPda && <td className="r nowrap" style={{ fontWeight: 600 }}>{m.rataNoleggio != null ? fmtEur(m.rataNoleggio) : <span className="fl-empty">—</span>}</td>}
                    {cols.fineNoleggio && (
                      <td>{m.fineNoleggio ? <Dot tone={scadTone(m.fineNoleggio)} title={scadTip(m.fineNoleggio)}>{fmt(m.fineNoleggio)}</Dot> : <span className="fl-empty">—</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ds-foot">{filtered.length} di {mezzi.length} mezzi · clic su una riga per aprire la scheda</div>
      </Card>

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
    </Page>
  );
}
