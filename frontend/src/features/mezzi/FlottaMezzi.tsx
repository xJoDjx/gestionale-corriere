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
  Page, PageHeader, Button, IconButton, Tabs, SegTabs, Empty, Alert, Th, Icon, C,
  fmtNum, type Tone, type IconName,
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

/** Percentuale km sul limite senza tetto (serve per vedere chi l'ha superato). */
const kmPercent0 = (km: number | null | undefined, limite: number | null | undefined) =>
  !km || !limite ? null : Math.round((km / limite) * 100);

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

type ColKey = 'tipo' | 'tipoMezzo' | 'marcaModello' | 'alimentazione' | 'stato' | 'assegnatoA' | 'assicurazione' | 'revisione' | 'km' | 'kmAggiornatiAl' | 'canone' | 'rataPda' | 'fineNoleggio' | 'inseritoIl';

const COL_DEFS: { key: ColKey; label: string }[] = [
  { key: 'marcaModello',  label: 'Marca / modello' },
  { key: 'tipoMezzo',     label: 'Tipo'            },
  { key: 'tipo',          label: 'Possesso'        },
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
  { key: 'inseritoIl',    label: 'Inserito il'     },
];

const COLS_KEY = 'fm-cols-v5';
const DEFAULT_COLS: Record<ColKey, boolean> = {
  tipoMezzo: true, tipo: true, marcaModello: true, alimentazione: true, stato: true, assegnatoA: true,
  assicurazione: true, revisione: true, km: true, kmAggiornatiAl: false, canone: true, rataPda: true, fineNoleggio: true, inseritoIl: true,
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
  const [filtroAlim, setFiltroAlim] = useState<string>('TUTTE');
  const [pannello, setPannello] = useState<null | 'attivita' | 'note' | 'modifiche'>(null);
  const [scadTab90, setScadTab90] = useState<string>('Tutte');
  // Riepilogo (scadenze e composizione) richiudibile; la scelta resta salvata nel browser
  const [riepChiuso, setRiepChiuso] = useState<boolean>(() => { try { return localStorage.getItem('flotta_riepilogo_chiuso') !== '0'; } catch { return true; } });
  const toggleRiep = () => setRiepChiuso((v) => { try { localStorage.setItem('flotta_riepilogo_chiuso', v ? '0' : '1'); } catch { /* ignora */ } return !v; });

  type SortField = 'targa' | 'tipo' | 'tipoMezzo' | 'marca' | 'alimentazione' | 'stato' | 'padroncino' | 'assicurazione' | 'revisione' | 'canone' | 'rata' | 'kmPct' | 'kmAggiornatiAl' | 'fineNoleggio' | 'inseritoIl';
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
    const matchAlim      = filtroAlim === 'TUTTE' || (m.alimentazione ?? '') === filtroAlim;
    return matchSearch && matchStato && matchPossesso && matchCategoria && matchAlim;
  }), [mezzi, search, filtroStato, filtroPossesso, filtroCategoria, filtroAlim]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va: any, vb: any;
    switch (sortField) {
      case 'targa':   va = a.targa; vb = b.targa; break;
      case 'tipo':
        va = POSSESSO_BADGE[(a.tipoPossesso as string) ?? 'NOLEGGIO']?.label ?? a.tipoPossesso ?? '';
        vb = POSSESSO_BADGE[(b.tipoPossesso as string) ?? 'NOLEGGIO']?.label ?? b.tipoPossesso ?? '';
        break;
      case 'marca':   va = a.marca + a.modello; vb = b.marca + b.modello; break;
      case 'tipoMezzo': va = a.tipo ?? ''; vb = b.tipo ?? ''; break;
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
      case 'inseritoIl':
        va = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
        vb = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
        break;
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

  // ─── Dati per i riquadri (solo visualizzazione) ─────────────────────────
  const inFlotta = mezzi.filter(m => m.stato.toUpperCase() !== 'DISMESSO' && m.stato.toUpperCase() !== 'VENDUTO');
  const nDismessi = mezzi.length - inFlotta.length;
  const statTotali = stats?.totali ?? mezzi.length;
  const statAssegnati = stats?.assegnati ?? 0;
  const statDisponibili = stats?.disponibili ?? 0;
  const conta = (f: (m: Mezzo) => boolean) => inFlotta.filter(f).length;
  const nNol = conta(m => (m.tipoPossesso ?? 'NOLEGGIO') === 'NOLEGGIO');
  const nProp = conta(m => m.tipoPossesso === 'PROPRIETA');
  const nEst = conta(m => m.tipoPossesso === 'ESTERNO');
  const isDiesel = (a: string) => ['GASOLIO', 'DIESEL', 'GASOLIO_MHEV'].includes((a ?? '').toUpperCase());
  const nGas = conta(m => isDiesel(m.alimentazione));
  const nEle = conta(m => (m.alimentazione ?? '').toUpperCase() === 'ELETTRICO');
  const nAltro = inFlotta.length - nGas - nEle;
  const perc = (n: number) => (inFlotta.length ? Math.round((n / inFlotta.length) * 100) : 0);

  const TONO: Record<string, [string, string]> = { ko: ['#B91C1C', '#E5484D'], warn: ['#C2410C', '#EA6A2A'], na: ['#52525B', '#A1A1AA'], ok: ['#15803D', '#15A06A'], nn: ['#3F3F46', '#D4D4D8'], info: ['#1D4ED8', '#3D63F0'] };
  const dataIt = (iso: string) => fmt(iso);

  // Avvisi chilometri
  const kmRows = inFlotta.map(m => ({ m, p: kmPercent0(m.kmAttuali, m.kmLimite) })).filter(x => x.p !== null) as { m: Mezzo; p: number }[];
  const oltre = kmRows.filter(x => x.p > 100).sort((a, b) => b.p - a.p);
  const vicini = kmRows.filter(x => x.p >= 90 && x.p <= 100).sort((a, b) => b.p - a.p);
  const POSS_LABEL: Record<string, string> = { PROPRIETA: 'di proprietà', NOLEGGIO: 'a noleggio', ESTERNO: 'esterno' };
  const avvisi = [
    ...oltre.map(x => ({ key: x.m.id, tono: 'ko', t: `${x.m.targa} ha superato il limite chilometrico.`, s: `${fmtNum(x.m.kmAttuali)} km su ${fmtNum(x.m.kmLimite)} · ${(STATO_BADGE[x.m.stato.toUpperCase()]?.label ?? x.m.stato).toLowerCase()}, ${POSS_LABEL[x.m.tipoPossesso ?? 'NOLEGGIO'] ?? ''}`, cta: 'Apri mezzo', go: () => navigate(`/flotta/${x.m.id}`) })),
    ...(vicini.length ? [{ key: 'vicini', tono: 'warn', t: `${vicini.length} ${vicini.length === 1 ? 'mezzo sopra' : 'mezzi sopra'} il 90% del limite km.`, s: vicini.map(x => `${x.m.targa} ${x.p}%`).join(' · '), cta: 'Mostra', go: () => { setSortField('kmPct'); setSortOrder('desc'); document.getElementById('fl-tabella')?.scrollIntoView({ behavior: 'smooth' }); } }] : []),
  ];

  // Scadenze: scadute e nei prossimi 90 giorni, per tipo
  type TipoScad = 'Assicurazione' | 'Revisione' | 'Bollo' | 'Fine noleggio' | 'Tachigrafo';
  const SCAD_DEF: { t: TipoScad; campo: keyof Mezzo; tile: string; icon: IconName }[] = [
    { t: 'Assicurazione', campo: 'scadenzaAssicurazione', tile: C.red, icon: 'scudo' },
    { t: 'Revisione', campo: 'scadenzaRevisione', tile: C.orange, icon: 'cal' },
    { t: 'Bollo', campo: 'scadenzaBollo', tile: C.purple, icon: 'euro' },
    { t: 'Fine noleggio', campo: 'fineNoleggio', tile: C.blue, icon: 'doc' },
    { t: 'Tachigrafo', campo: 'scadenzaTachigrafo', tile: C.teal, icon: 'cal' },
  ];
  const scad90 = SCAD_DEF.map(d => ({
    ...d,
    items: inFlotta
      .map(m => ({ m, iso: m[d.campo] as string | null | undefined }))
      .filter(x => !!x.iso)
      .map(x => ({ ...x, g: daysDiff(x.iso)! }))
      .filter(x => x.g <= 90)
      .sort((a, b) => a.g - b.g),
  }));
  const scad90Tot = scad90.reduce((n, d) => n + d.items.filter(x => x.g < 0).length, 0);
  const tagScad = (g: number): [string, string] => (g < 0 ? ['ko', `Scaduta da ${-g} gg`] : g <= 30 ? ['warn', `Tra ${g} giorni`] : ['nn', `Tra ${g} giorni`]);
  const padDi = (m: Mezzo) => m.assegnazioni?.find(a => !a.dataFine)?.padroncino.ragioneSociale ?? null;
  const modello = (m: Mezzo) => `${m.marca} ${m.modello}`.trim();
  let righeScad: { key: string; tile: string; icon: IconName; t: string; sub: string; tono: string; tag: string; data: string; to?: string }[] = [];
  let notaScad = '';
  if (scadTab90 === 'Tutte') {
    for (const d of scad90) {
      const scad = d.items.filter(x => x.g < 0);
      if (scad.length) {
        const anni = Array.from(new Set(scad.map(x => x.iso!.slice(0, 4)))).sort();
        const date = Array.from(new Set(scad.map(x => dataIt(x.iso!))));
        const assic = d.t === 'Assicurazione';
        righeScad.push({ key: d.t + 'scad', tile: d.tile, icon: d.icon, t: `${d.t} · ${scad.length} ${scad.length === 1 ? 'mezzo' : 'mezzi'}`,
          sub: assic && anni.length > 1 ? `Date ferme tra il ${anni[0]} e il ${anni[anni.length - 1]}: da aggiornare` : `${scad.slice(0, 6).map(x => x.m.targa).join(', ')}${scad.length > 6 ? ` e altri ${scad.length - 6}` : ''}`,
          tono: 'ko', tag: assic && anni.length > 1 ? 'Da aggiornare' : 'Scaduto', data: date.length === 1 ? date[0] : '—' });
      }
      const perData = new Map<string, typeof d.items>();
      d.items.filter(x => x.g >= 0).forEach(x => { const k = dataIt(x.iso!); perData.set(k, [...(perData.get(k) ?? []), x]); });
      perData.forEach((xs, data) => {
        const [tono, tag] = tagScad(xs[0].g);
        const pads = Array.from(new Set(xs.map(x => padDi(x.m)).filter(Boolean))) as string[];
        righeScad.push({ key: d.t + data, tile: d.tile, icon: d.icon,
          t: `${d.t} · ${xs.length <= 3 ? xs.map(x => x.m.targa).join(', ') : `${xs.length} mezzi`}`,
          sub: xs.length <= 3 ? `${Array.from(new Set(xs.map(x => modello(x.m)))).join(', ')} · ${pads.length ? pads.map(p => p.replace(/ (S\.?R\.?L\.?S?\.?|SAS|SRL|SRLS)$/i, '')).join(', ') : 'non assegnati'}` : `${modello(xs[0].m)} ${xs.slice(0, 3).map(x => x.m.targa).join(', ')} e altri ${xs.length - 3}`,
          tono, tag, data, to: xs.length === 1 ? `/flotta/${xs[0].m.id}` : undefined });
      });
    }
    const ord = (r: typeof righeScad[number]) => (r.tag === 'Scaduto' ? -1e6 : r.tag === 'Da aggiornare' ? -5e5 : Number(r.tag.replace(/\D/g, '')) || 0);
    righeScad.sort((a, b) => ord(a) - ord(b));
  } else {
    const d = scad90.find(x => x.t === scadTab90)!;
    righeScad = d.items.map(x => { const [tono, tag] = tagScad(x.g); return { key: x.m.id, tile: d.tile, icon: d.icon, t: `${x.m.targa} · ${modello(x.m)}`, sub: padDi(x.m) ?? 'Non assegnato', tono, tag, data: dataIt(x.iso!), to: `/flotta/${x.m.id}` }; });
    if (!righeScad.length) notaScad = 'Nessuna scadenza nei prossimi 90 giorni';
  }

  const VISTE: { value: string; label: string }[] = [
    { value: 'ATTIVI', label: 'Attivi' },
    { value: 'ASSEGNATO', label: 'Assegnati' },
    { value: 'DISPONIBILE', label: 'Disponibili' },
    { value: 'DISMESSO', label: 'Dismessi' },
    { value: 'FUORI_SERVIZIO', label: 'Fuori servizio' },
    { value: 'IN_REVISIONE', label: 'In revisione' },
    { value: 'VENDUTO', label: 'Venduti' },
    { value: 'TUTTI', label: 'Tutti' },
  ];
  const contaVista = (v: string) => mezzi.filter(m => {
    const st = m.stato.toUpperCase();
    return v === 'TUTTI' ? true : v === 'ATTIVI' ? st !== 'DISMESSO' && st !== 'VENDUTO' : st === v;
  }).length;
  const sortState = { key: sortField, dir: sortOrder };
  const alimentazioni = Array.from(new Set(mezzi.map(m => m.alimentazione).filter(Boolean))).sort();
  const nColVisibili = COL_DEFS.filter(c => cols[c.key]).length;
  const SORT_LABEL: Record<string, string> = { targa: 'targa', tipo: 'possesso', tipoMezzo: 'tipo', marca: 'marca', alimentazione: 'alimentazione', stato: 'stato', padroncino: 'assegnatario', assicurazione: 'assicurazione', revisione: 'revisione', canone: 'canone', rata: 'rata', kmPct: 'km', kmAggiornatiAl: 'data km', fineNoleggio: 'fine noleggio', inseritoIl: 'data di inserimento' };
  const AVC = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
  const padIdx = (nome: string) => { let h = 0; for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVC[h % AVC.length]; };
  const iniziali = (s2: string) => s2.replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dotData = (iso: string | null | undefined) => {
    if (!iso) return <span className="fl-empty">Non inserita</span>;
    const g = daysDiff(iso)!;
    const tono = g < 0 ? 'ko' : g <= 30 ? 'warn' : 'nn';
    return <span className="fl-dot" style={{ color: tono === 'nn' ? '#0B0B0C' : TONO[tono][0] }} title={g < 0 ? `Scaduta da ${-g} giorni` : `Tra ${g} giorni`}><i style={{ background: TONO[tono][1] }} />{fmt(iso)}</span>;
  };
  const apriContratti = () => {
    if (selectedIds.size === 0) { alert('Seleziona prima i mezzi dalla tabella (casella a sinistra di ogni riga).'); document.getElementById('fl-tabella')?.scrollIntoView({ behavior: 'smooth' }); return; }
    setBulkContrattoOpen(true);
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Risorse"
        title="Flotta mezzi"
        sub={`${inFlotta.length} mezzi · ${nNol} a noleggio, ${nProp} di proprietà, ${nEst} ${nEst === 1 ? 'esterno' : 'esterni'}`}
        actions={<>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportaExcel} />
          <Button icon="doc" onClick={() => navigate('/flotta/verbali')}>Verbali e addebiti</Button>
          <Button icon="check" onClick={() => setPannello('attivita')}>Promemoria{tasks.filter(t => !t.completata).length ? ` · ${tasks.filter(t => !t.completata).length}` : ''}</Button>
          <Button icon="upload" onClick={() => importInputRef.current?.click()} disabled={importando}>{importando ? 'Importazione…' : 'Importa Excel'}</Button>
          <Button icon="doc" onClick={apriContratti}>Contratto multiplo</Button>
          <Button icon="plus" variant="primary" onClick={() => setNuovoOpen(true)}>Nuovo mezzo</Button>
        </>}
      />

      <section aria-label="Indicatori flotta" className="ds-g4">
        {[
          { c: C.teal, i: 'mezzi' as IconName, l: 'Mezzi', v: fmtNum(statTotali), seg: [[statAssegnati, C.green], [statDisponibili, C.blue], [nDismessi, '#A1A1AA']] as [number, string][], s: `${statAssegnati} assegnati · ${statDisponibili} disponibili · ${nDismessi} dismessi` },
          { c: C.red, i: 'euro' as IconName, l: 'Canoni noleggio', v: fmtEur(stats?.entrateNoleggio ?? null), s: 'Costo mensile' },
          { c: C.green, i: 'euro' as IconName, l: 'Rate PDA', v: fmtEur(stats?.sommaRate ?? null), s: 'Incasso mensile' },
          { c: C.purple, i: 'marg' as IconName, l: 'Margine', v: fmtEur(stats?.margine ?? null), s: 'Canoni − rate, calcolo attuale' },
        ].map(k => (
          <div key={k.l} className="ds-kpi">
            <div className="ds-kpi-top">
              <span aria-hidden="true" className="ds-tile" style={{ background: k.c }}><Icon name={k.i} size={11} stroke={2.6} /></span>
              <span className="ds-kpi-label">{k.l}</span>
            </div>
            <span className="ds-kpi-value fl-kpi-big">{k.v}</span>
            {k.seg && (
              <div aria-hidden="true" className="ds-seg">
                {k.seg.map(([n, col], i) => <span key={i} style={{ width: `${(n / (statTotali + nDismessi || 1)) * 100}%`, background: col }} />)}
              </div>
            )}
            <span className="ds-kpi-sub">{k.s}</span>
          </div>
        ))}
      </section>

      {(oltre.length > 0 || vicini.length > 0) && (
        <div className={`fl-avviso fl-avviso-${oltre.length ? 'ko' : 'warn'} fl-kmbar`}>
          <i aria-hidden="true" />
          <strong>Limite km</strong>
          <span className="fl-kmsub">
            {oltre.length > 0 && `${oltre.length} ${oltre.length === 1 ? 'superato' : 'superati'}`}
            {oltre.length > 0 && vicini.length > 0 && ' · '}
            {vicini.length > 0 && `${vicini.length} sopra il 90%`}
          </span>
          <span className="fl-kmchips">
            {[...oltre.map(x => ({ ...x, ko: true })), ...vicini.map(x => ({ ...x, ko: false }))].map(x => (
              <button key={x.m.id} type="button" className={`fl-kmchip${x.ko ? ' is-ko' : ''}`}
                title={`${x.m.targa}: ${fmtNum(x.m.kmAttuali)} km su ${fmtNum(x.m.kmLimite)} · ${(STATO_BADGE[x.m.stato.toUpperCase()]?.label ?? x.m.stato).toLowerCase()}, ${POSS_LABEL[x.m.tipoPossesso ?? 'NOLEGGIO'] ?? ''}`}
                onClick={() => navigate(`/flotta/${x.m.id}`)}>
                {x.m.targa} <b>{x.p}%</b>
              </button>
            ))}
          </span>
          <button type="button" className="fl-avviso-btn" onClick={() => { setSortField('kmPct'); setSortOrder('desc'); document.getElementById('fl-tabella')?.scrollIntoView({ behavior: 'smooth' }); }}>Mostra in tabella</button>
        </div>
      )}

      <div className="fl-riep-toggle">
        <button type="button" className="fl-riep-pill" aria-expanded={!riepChiuso} onClick={() => toggleRiep()}>
          <Icon name="cal" size={15} />
          {riepChiuso ? 'Scadenze e composizione' : 'Nascondi scadenze e composizione'}
          {scad90Tot > 0 && <span className="fl-riep-badge">{scad90Tot} {scad90Tot === 1 ? 'scaduta' : 'scadute'}</span>}
          <Icon name={riepChiuso ? 'chevDown' : 'chevUp'} size={14} />
        </button>
        <button type="button" className="fl-riep-link" onClick={() => document.getElementById('fl-tabella')?.scrollIntoView({ behavior: 'smooth' })}>
          Vai all'elenco mezzi <Icon name="chevDown" size={13} />
        </button>
      </div>

      {!riepChiuso && <div className="ds-g4">
        <section className="ds-card ds-s3" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ds-cardhead" style={{ padding: '16px 18px 10px' }}>
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Scadenze</h2>
              <span className="ds-cardsub">Scadute e nei prossimi 90 giorni, per tipo</span>
            </div>
          </div>
          <div style={{ padding: '0 18px 10px' }}>
            <SegTabs
              items={['Tutte', ...SCAD_DEF.map(d => d.t)].map(t => ({ value: t, label: t, count: t === 'Tutte' ? '' : scad90.find(x => x.t === t)!.items.length }))}
              value={scadTab90}
              onChange={setScadTab90}
              label="Tipo di scadenza"
            />
          </div>
          <div className="fl-scroll" tabIndex={0} aria-label="Elenco scadenze">
            {righeScad.map(r => (
              <div key={r.key} className={`fl-scadrow${r.to ? ' is-link' : ''}`} onClick={r.to ? () => navigate(r.to!) : undefined}>
                <span aria-hidden="true" className="fl-scadtile" style={{ background: r.tile }}><Icon name={r.icon} size={13} stroke={2.4} /></span>
                <span className="fl-scadtext"><strong>{r.t}</strong><span>{r.sub}</span></span>
                <span className="fl-scadtag" style={{ color: TONO[r.tono][0] }}><i style={{ background: TONO[r.tono][1] }} />{r.tag}</span>
                <span className="fl-scaddata">{r.data}</span>
              </div>
            ))}
          </div>
          {notaScad && <div className="fl-scadnote">{notaScad}</div>}
        </section>

        <section className="ds-card ds-card-pad">
          <div className="ds-cardhead-text">
            <h2 className="ds-h2">Composizione</h2>
            <span className="ds-cardsub">Per alimentazione e possesso</span>
          </div>
          {[
            { t: 'Alimentazione', v: [['Gasolio e diesel', nGas, '#52525B'], ['Elettrico', nEle, C.teal], ['Benzina, ibrido, metano', nAltro, C.yellow]] as [string, number, string][] },
            { t: 'Possesso', v: [['Noleggio', nNol, C.blue], ['Proprietà', nProp, C.green], ['Esterni', nEst, C.purple]] as [string, number, string][] },
          ].map(g => (
            <div key={g.t} className="fl-comp">
              <span className="fl-comp-t">{g.t}</span>
              <div aria-hidden="true" className="fl-comp-bar">{g.v.filter(x => x[1] > 0).map(([l, n, c]) => <span key={l} style={{ width: `${perc(n)}%`, background: c }} />)}</div>
              {g.v.map(([l, n, c]) => (
                <div key={l} className="fl-comp-row"><i style={{ background: c }} /><span>{l}</span><strong>{n}</strong><small>{perc(n)}%</small></div>
              ))}
            </div>
          ))}
        </section>
      </div>}

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

      {/* ── TABELLA ── */}
      <section className="ds-card" id="fl-tabella">
        <div className="ds-cardhead" style={{ padding: '16px 18px 6px' }}>
          <div className="ds-cardhead-text">
            <h2 className="ds-h2">Tutti i mezzi</h2>
            <span className="ds-cardsub">Clic su un'intestazione per ordinare · clic di nuovo per invertire</span>
          </div>
          <div className="ds-actions">
            <label className="ds-search" style={{ minWidth: 300 }}>
              <Icon name="search" size={13} />
              <span className="sr-only">Cerca targa, marca, padroncino</span>
              <input placeholder="Cerca targa, marca, padroncino…" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <label className="ds-btn ds-btn-sm fl-dd"><span className="sr-only">Possesso</span>
              <select value={filtroPossesso} onChange={e => setFiltroPossesso(e.target.value as any)}>
                <option value="TUTTI">Possesso</option>
                <option value="PROPRIETA">Proprietà</option>
                <option value="NOLEGGIO">Noleggio</option>
                <option value="ESTERNO">Esterno</option>
              </select><Icon name="chevDown" size={12} />
            </label>
            <label className="ds-btn ds-btn-sm fl-dd"><span className="sr-only">Categoria</span>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value as any)}>
                <option value="TUTTI">Categoria</option>
                <option value="DISTRIBUZIONE">Distribuzione</option>
                <option value="AUTO_AZIENDALE">Auto aziendale</option>
                <option value="FLOTTA">Flotta</option>
              </select><Icon name="chevDown" size={12} />
            </label>
            <label className="ds-btn ds-btn-sm fl-dd"><span className="sr-only">Alimentazione</span>
              <select value={filtroAlim} onChange={e => setFiltroAlim(e.target.value)}>
                <option value="TUTTE">Alimentazione</option>
                {alimentazioni.map(a => <option key={a} value={a}>{ALIMENTAZIONE_BADGE[a]?.label ?? a}</option>)}
              </select><Icon name="chevDown" size={12} />
            </label>
            <div className="ds-pop" ref={colPickerRef}>
              <Button size="sm" icon="columns" aria-expanded={colPickerOpen} onClick={() => setColPickerOpen(o => !o)}>Colonne {nColVisibili + 1}/{COL_DEFS.length + 1}</Button>
              {colPickerOpen && (
                <div className="ds-popmenu" role="menu">
                  <span style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-muted)' }}>Colonne visibili</span>
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
        </div>
        <div style={{ padding: '4px 18px 10px' }}>
          <SegTabs items={VISTE.map(v => ({ value: v.value, label: v.label, count: contaVista(v.value) }))} value={filtroStato} onChange={setFiltroStato} label="Filtra per stato" />
        </div>

        {selectedIds.size > 0 && (
          <div className="fl-bulk" role="region" aria-label="Azioni sui mezzi selezionati">
            <span style={{ fontWeight: 600, flex: '1 1 auto' }}>{selectedIds.size} {selectedIds.size === 1 ? 'mezzo selezionato' : 'mezzi selezionati'}</span>
            <button type="button" onClick={() => setBulkModalOpen(true)}><Icon name="userAdd" size={13} />Assegna o rimuovi padroncino</button>
            <button type="button" onClick={() => setBulkContrattoOpen(true)}><Icon name="doc" size={13} />Crea contratti</button>
            <button type="button" aria-label="Annulla selezione" className="fl-bulk-x" onClick={clearSelection}><Icon name="close" size={14} /></button>
          </div>
        )}

        <div className="ds-tablewrap">
          <table className="ds-table fl-table">
            <thead>
              <tr>
                <th style={{ width: 20 }}>
                  <input type="checkbox" className="ds-check" aria-label="Seleziona tutti" checked={sorted.length > 0 && selectedIds.size === sorted.length} onChange={toggleSelectAll} />
                </th>
                <Th k="targa" sort={sortState} onSort={handleSort}>Targa</Th>
                {cols.marcaModello  && <Th k="marca" sort={sortState} onSort={handleSort}>Marca / modello</Th>}
                {cols.tipoMezzo     && <Th k="tipoMezzo" sort={sortState} onSort={handleSort}>Tipo</Th>}
                {cols.tipo          && <Th k="tipo" sort={sortState} onSort={handleSort}>Possesso</Th>}
                {cols.alimentazione && <Th k="alimentazione" sort={sortState} onSort={handleSort}>Alimentazione</Th>}
                {cols.stato         && <Th k="stato" sort={sortState} onSort={handleSort}>Stato</Th>}
                {cols.assegnatoA    && <Th k="padroncino" sort={sortState} onSort={handleSort}>Assegnato a</Th>}
                {cols.assicurazione && <Th k="assicurazione" sort={sortState} onSort={handleSort}>Assicurazione</Th>}
                {cols.revisione     && <Th k="revisione" sort={sortState} onSort={handleSort}>Revisione</Th>}
                {cols.km            && <Th k="kmPct" sort={sortState} onSort={handleSort}>Km / limite</Th>}
                {cols.kmAggiornatiAl && <Th k="kmAggiornatiAl" sort={sortState} onSort={handleSort}>Km agg. al</Th>}
                {cols.canone        && <Th k="canone" sort={sortState} onSort={handleSort} right>Canone</Th>}
                {cols.rataPda       && <Th k="rata" sort={sortState} onSort={handleSort} right>Rata PDA</Th>}
                {cols.fineNoleggio  && <Th k="fineNoleggio" sort={sortState} onSort={handleSort}>Fine noleggio</Th>}
                {cols.inseritoIl    && <Th k="inseritoIl" sort={sortState} onSort={handleSort}>Inserito il</Th>}
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
                const pct         = kmPercent0(m.kmAttuali, m.kmLimite);
                const elettrico   = (m.alimentazione ?? '').toUpperCase() === 'ELETTRICO';
                const dismesso    = ['DISMESSO', 'VENDUTO'].includes(m.stato.toUpperCase());
                const autocarro   = /autocarro|camion/i.test(m.tipo ?? '');
                const alim        = m.alimentazione ? (ALIMENTAZIONE_BADGE[m.alimentazione]?.label ?? m.alimentazione) : null;
                const statoTono   = statoBadge.tone === 'info' ? 'ok' : statoBadge.tone === 'ok' ? 'info' : statoBadge.tone;
                const nomePad     = padroncino?.ragioneSociale ?? m.utilizzatore ?? null;
                return (
                  <tr key={m.id} className={`is-clickable${selectedIds.has(m.id) ? ' is-open' : ''}`} onClick={() => navigate(`/flotta/${m.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="ds-check" aria-label={`Seleziona ${m.targa}`} checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                    </td>
                    <td><span className="ds-mono fl-targa-link">{m.targa}</span></td>
                    {cols.marcaModello && (
                      <td>
                        <span className="fl-mm">
                          <span aria-hidden="true" className="fl-mmtile" style={{ background: elettrico ? C.teal : dismesso ? '#A1A1AA' : '#52525B' }}>
                            <Icon name={elettrico ? 'ric' : autocarro ? 'mezzi' : 'mezzi'} size={12} stroke={2.4} />
                          </span>
                          <span>{modello(m)}</span>
                        </span>
                      </td>
                    )}
                    {cols.tipoMezzo && <td>{m.tipo ? m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase() : <span className="fl-empty">—</span>}</td>}
                    {cols.tipo && (
                      <td><span className="fl-dot" style={{ color: POSSESSO_COLOR[possKey] ?? '#1D4ED8', fontWeight: 500, fontSize: 12 }}><i style={{ background: possKey === 'PROPRIETA' ? C.green : possKey === 'ESTERNO' ? C.purple : C.blue, borderRadius: 2 }} />{possesso.label}</span></td>
                    )}
                    {cols.alimentazione && <td style={{ color: elettrico ? '#0B7A7A' : (m.alimentazione ?? '').toUpperCase() === 'METANO' ? '#8A6100' : undefined }}>{alim ?? <span className="fl-empty">—</span>}</td>}
                    {cols.stato && <td><span className="fl-dot" style={{ color: TONO[statoTono][0], fontWeight: 500, fontSize: 12 }}><i style={{ background: TONO[statoTono][1] }} />{statoBadge.label}</span></td>}
                    {cols.assegnatoA && (
                      <td className="fl-ellipsis" title={nomePad ?? undefined}>
                        {padroncino ? (
                          <span className="fl-pad"><span aria-hidden="true" className="fl-padav" style={{ background: padIdx(padroncino.ragioneSociale) }}>{iniziali(padroncino.ragioneSociale)}</span>{padroncino.ragioneSociale}</span>
                        ) : m.utilizzatore ? <span>{m.utilizzatore}</span> : <span className="fl-empty">—</span>}
                      </td>
                    )}
                    {cols.assicurazione && <td>{dotData(m.scadenzaAssicurazione)}</td>}
                    {cols.revisione && <td>{dotData(m.scadenzaRevisione)}</td>}
                    {cols.km && (
                      <td>
                        {m.kmAttuali != null ? (
                          <span className="fl-km">
                            <span style={{ color: pct != null && pct >= 90 ? '#B91C1C' : undefined }}>{fmtNum(m.kmAttuali)}{m.kmLimite ? ` / ${fmtNum(m.kmLimite)}` : ''}</span>
                            {pct != null && <span className="fl-km-bar"><i style={{ width: `${Math.min(100, pct)}%`, background: pct >= 90 ? '#E5484D' : pct >= 75 ? C.orange : C.teal }} /></span>}
                          </span>
                        ) : <span className="fl-empty">Non inseriti</span>}
                      </td>
                    )}
                    {cols.kmAggiornatiAl && <td>{m.kmAttualiAl ? fmt(m.kmAttualiAl) : <span className="fl-empty">—</span>}</td>}
                    {cols.canone && <td className="r">{m.canoneNoleggio != null ? fmtEur(m.canoneNoleggio) : <span className="fl-empty">—</span>}</td>}
                    {cols.rataPda && <td className="r" style={{ fontWeight: 600 }}>{m.rataNoleggio != null ? fmtEur(m.rataNoleggio) : <span className="fl-empty">—</span>}</td>}
                    {cols.fineNoleggio && <td>{m.fineNoleggio ? fmt(m.fineNoleggio) : <span className="fl-empty">—</span>}</td>}
                    {cols.inseritoIl && <td title={m.createdAt ? new Date(m.createdAt).toLocaleString('it-IT') : undefined}>{m.createdAt ? fmt(m.createdAt) : <span className="fl-empty">—</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ds-foot">Mostrati {filtered.length} di {mezzi.length} mezzi · ordinati per {SORT_LABEL[sortField] ?? sortField}</div>
      </section>

      {/* Pannello laterale: promemoria, note e modifiche (come prima nei riquadri della pagina) */}
      {pannello && (
        <div className="fl-drawer-wrap" onClick={() => setPannello(null)}>
          <aside className="fl-drawer" role="dialog" aria-label="Promemoria, note e modifiche" onClick={e => e.stopPropagation()}>
            <div className="fl-drawer-head">
              <h2 className="ds-h2" style={{ fontSize: 16 }}>Flotta: promemoria e note</h2>
              <IconButton icon="close" label="Chiudi" onClick={() => setPannello(null)} />
            </div>
            <div style={{ padding: '0 18px' }}>
              <Tabs
                items={[
                  { value: 'attivita', label: 'Cose da fare', count: tasks.filter(t => !t.completata).length },
                  { value: 'note', label: 'Ultime note', count: ultimeNote.length },
                  { value: 'modifiche', label: 'Ultime modifiche' },
                ]}
                value={pannello}
                onChange={v => setPannello(v as typeof pannello)}
              />
            </div>
            <button type="button" className="fl-drawer-all" onClick={() => navigate(`/storico/mezzi?tab=${pannello}`)}>
              Elenco completo con ricerca <Icon name="chevRight" size={12} />
            </button>
            <div className="fl-drawer-body">
              {pannello === 'attivita' && (
                <>
                  <div style={{ padding: '12px 18px' }}><Button size="sm" variant="primary" icon="plus" onClick={handleOpenNewTask}>Nuova attività</Button></div>
                  <TaskList tasks={tasks} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />
                </>
              )}
              {pannello === 'note' && (
                <>
                  <div className="fl-form">
                    <label className="ds-field"><span>Mezzo</span>
                      <select className="ds-input" value={notaForm.mezzoId} onChange={e => setNotaForm(f => ({ ...f, mezzoId: e.target.value }))}>
                        <option value="">Scegli un mezzo…</option>
                        {mezzi.map(m => <option key={m.id} value={m.id}>{m.targa} – {m.marca} {m.modello}</option>)}
                      </select>
                    </label>
                    <label className="ds-field"><span>Nuova nota</span>
                      <textarea className="ds-input" rows={2} value={notaForm.testo} onChange={e => setNotaForm(f => ({ ...f, testo: e.target.value }))} />
                    </label>
                    <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="blue" onClick={handleAddNota} disabled={notaSaving || !notaForm.mezzoId || !notaForm.testo.trim()}>{notaSaving ? 'Salvo…' : 'Salva nota'}</Button>
                    </div>
                  </div>
                  <div className="ds-list">
                    {ultimeNote.length === 0 ? <Empty>Nessuna nota registrata</Empty> : ultimeNote.map(n => {
                      const m = mezziMap[n.entityId];
                      return (
                        <button key={n.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate(`/flotta/${n.entityId}`)}>
                          <span className="fl-line"><span className="ds-mono fl-targa">{m?.targa ?? '—'}</span><span className="fl-meta">{n.user ? `${n.user.nome} ${n.user.cognome[0]}.` : '—'} · {fmt(n.createdAt)}</span></span>
                          <span className="fl-text" title={n.contenuto}>{n.contenuto}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {pannello === 'modifiche' && (
                <div className="ds-list">
                  {ultimiLog.length === 0 ? <Empty>Nessuna modifica recente</Empty> : ultimiLog.map(l => {
                    // Gli eventi di assegnazione hanno entityId = id dell'assegnazione: risolviamo il mezzo per targa.
                    const relatedTarga = l.dataDopo?.targa ?? l.dataPrima?.targa;
                    const relatedMezzo = mezziMap[l.entityId] ?? (relatedTarga ? mezzi.find(m => m.targa === relatedTarga) : undefined);
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
              )}
            </div>
          </aside>
        </div>
      )}

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
