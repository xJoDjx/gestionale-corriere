// src/features/conteggi/ConteggiPage.tsx
// Lista padroncini attivi nel mese — dati reali dal backend
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { padronciniApi, taskApi, conteggiApi as conteggiStatsApi } from '../../lib/api';
import type { Padroncino, TaskItem, AndamentoMese } from '../../lib/api';
import { conteggiApi } from '../../lib/conteggi.api';
import type { ConteggioMensile } from '../../lib/conteggi.api';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import type { AddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { generaExcelConteggi } from './generaExcelConteggi';
import Modal from '../../components/ui/Modal';
import {
  Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SegTabs, Dot, Empty, Alert, Th, Icon, C, fmtEur, SegBar,
  type KpiItem, type Tone,
} from '../../components/ds';
import TaskList from '../../components/ds/TaskList';
import './ConteggiPage.css';
import './ConteggiPage2.css';

// Stato aperto/chiuso dei due pannelli richiudibili, persistito tra sessioni
const PANEL_KEY = (nome: string) => `cp_panel_${nome}_open`;
function loadPanelOpen(nome: string, def = true): boolean {
  try {
    const raw = localStorage.getItem(PANEL_KEY(nome));
    if (raw != null) return raw === '1';
  } catch {}
  return def;
}
function savePanelOpen(nome: string, open: boolean) {
  try { localStorage.setItem(PANEL_KEY(nome), open ? '1' : '0'); } catch {}
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMese(m: string) {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}

const eur = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

// Checklist locale per padroncino+mese (localStorage)
const CHECKLIST_KEY = (padroncinoId: string, mese: string) =>
  `checklist_${padroncinoId}_${mese}`;

function loadChecklist(padroncinoId: string, mese: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY(padroncinoId, mese));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false };
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="cp-progress-wrap">
      <div className="cp-progress-bar">
        <div className="cp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cp-progress-label">{done}/{total}</span>
    </div>
  );
}

function StatoBadge({ stato }: { stato: string | null }) {
  if (!stato) return <span className="cp-badge cp-badge-gray">Nessuno</span>;
  const map: Record<string, string> = { BOZZA: 'cp-badge-warning', CHIUSO: 'cp-badge-info', CONFERMATO: 'cp-badge-success' };
  const labels: Record<string, string> = { BOZZA: 'Bozza', CHIUSO: 'Chiuso', CONFERMATO: 'Confermato' };
  return <span className={`cp-badge ${map[stato] ?? 'cp-badge-gray'}`}>{labels[stato] ?? stato}</span>;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span className={`cp-check ${done ? 'cp-check-done' : 'cp-check-pending'}`}>
      {done ? '✓' : '○'}
    </span>
  );
}

type SortDir = 'asc' | 'desc';
function ThSort({ label, col, sortKey, sortDir, onSort, style, title }: {
  label: string; col: string; sortKey: string; sortDir: SortDir;
  onSort: (c: string) => void; style?: { [k: string]: string | number }; title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      style={{ ...style, cursor: 'pointer', userSelect: 'none' }}
      title={title}
      onClick={() => onSort(col)}
    >
      {label}{' '}
      <span style={{ opacity: active ? 0.9 : 0.3, fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

/** Calcola fatturato lordo c/IVA, addebiti (PALMARE×1.22 + NOLEGGIO/RICARICA/ADDEBITO già ivati + bollo)
 *  e compensazioni (FINE_MESE + ACCONTO + ACCREDITO + BONUS) dalle righe del conteggio.
 *  Allineato con calcolaTotali nel backend: FINE_MESE è nelle compensazioni, non negli addebiti. */
function calcolaRighe(righe: import('../../lib/conteggi.api').ConteggiRiga[]) {
  const SOGLIA_BOLLO = 77.47;
  const COSTO_BOLLO = 2.00;

  // TRATTENUTA ha importo negativo → riduce il lordo (consegne doppie, malus, ecc.)
  const fattLordo = righe
    .filter((r) => r.tipo === 'FATTURATO' || r.tipo === 'TRATTENUTA')
    .reduce((s, r) => s + Number(r.importo), 0);

  const palmare = righe
    .filter((r) => r.tipo === 'PALMARE')
    .reduce((s, r) => s + Number(r.importo) * 1.22, 0);

  // FINE_MESE escluso dagli addebiti: viene compensato sulla distribuzione (vedi compensazioni sotto)
  const addebitiAltri = righe
    .filter((r) => ['NOLEGGIO', 'RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  const esentiImponibile = righe
    .filter((r) => ['RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => {
      const iva = (r as any).percIva != null ? Number((r as any).percIva) : 22;
      if (iva === 22) return s;
      return s + Number(r.importo) / (1 + iva / 100);
    }, 0);
  const bollo = esentiImponibile >= SOGLIA_BOLLO ? COSTO_BOLLO : 0;

  // FINE_MESE incluso nelle compensazioni (fattura fine mese compensata sulla distribuzione)
  const compensazioni = righe
    .filter((r) => ['ACCREDITO', 'BONUS', 'ACCONTO', 'FINE_MESE'].includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  return {
    fatturato: Math.round(fattLordo * 1.22 * 100) / 100,
    addebiti:  Math.round((palmare + addebitiAltri + bollo) * 100) / 100,
    compensazioni: Math.round(compensazioni * 100) / 100,
  };
}

interface RigaPadroncino {
  padroncino: Padroncino;
  conteggio: ConteggioMensile | null;
  checklist: Record<string, boolean>;
}

const MESE_KEY = 'conteggi_mese_selezionato';

export default function ConteggiPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Legge il mese da sessionStorage (persiste nella navigazione interna, si azzera chiudendo il tab)
  const [mese, setMeseState] = useState<string>(() => {
    return sessionStorage.getItem(MESE_KEY) || getCurrentMonth();
  });

  const setMese = (newMese: string) => {
    sessionStorage.setItem(MESE_KEY, newMese);
    setMeseState(newMese);
  };

  const [search, setSearch] = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [sortKey, setSortKey] = useState('nome');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [righe, setRighe] = useState<RigaPadroncino[]>([]);
  const [applicando, setApplicando] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [duplicaBulkOpen, setDuplicaBulkOpen] = useState(false);
  const [duplicaBulkSorgente, setDuplicaBulkSorgente] = useState<string>('');
  const [duplicaBulkLoading, setDuplicaBulkLoading] = useState(false);
  const [mesiSorgenteDisponibili, setMesiSorgenteDisponibili] = useState<string[]>([]);

  // ─── Pannello "Addebiti sospesi del mese" ──────────────────────────────
  const [sospesiOpen, setSospesiOpen] = useState(() => loadPanelOpen('sospesi'));
  const [sospesi, setSospesi] = useState<AddebitoSospeso[]>([]);
  const [sospesiLoading, setSospesiLoading] = useState(false);

  const toggleSospesiOpen = () => setSospesiOpen(prev => { savePanelOpen('sospesi', !prev); return !prev; });

  const loadSospesi = useCallback(async () => {
    setSospesiLoading(true);
    try {
      setSospesi(await addebitivSospesoApi.list({ meseTarget: mese, stato: 'PENDENTE' }));
    } catch { /* pannello informativo: errore silenzioso, non blocca la pagina */ }
    finally { setSospesiLoading(false); }
  }, [mese]);

  useEffect(() => { loadSospesi(); }, [loadSospesi]);

  const handleEvadiSospeso = async (id: string) => {
    setSospesi(prev => prev.filter(s => s.id !== id));
    try { await addebitivSospesoApi.evadi(id); }
    catch (e: any) { alert('Errore: ' + e.message); await loadSospesi(); }
  };

  // ─── KPI editabile "Competenze Attive" (valore manuale per mese) ───────
  const [competenzeAttive, setCompetenzeAttive] = useState<number | null>(null);
  const [editingCompetenze, setEditingCompetenze] = useState(false);
  const [competenzeInput, setCompetenzeInput] = useState('');
  const [savingCompetenze, setSavingCompetenze] = useState(false);

  const loadCompetenzeAttive = useCallback(async () => {
    try {
      const res = await conteggiApi.getCompetenzeAttive(mese);
      setCompetenzeAttive(res.valore);
    } catch { /* KPI informativa: errore silenzioso */ }
  }, [mese]);

  useEffect(() => { loadCompetenzeAttive(); }, [loadCompetenzeAttive]);

  const handleStartEditCompetenze = () => {
    setCompetenzeInput(competenzeAttive != null ? String(competenzeAttive) : '');
    setEditingCompetenze(true);
  };

  const handleSaveCompetenze = async () => {
    const raw = competenzeInput.replace(',', '.').trim();
    const valore = raw === '' ? null : Number(raw);
    if (raw !== '' && (valore == null || isNaN(valore))) {
      alert('Valore non valido');
      return;
    }
    setSavingCompetenze(true);
    try {
      const res = await conteggiApi.setCompetenzeAttive(mese, valore);
      setCompetenzeAttive(res.valore);
      setEditingCompetenze(false);
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSavingCompetenze(false);
    }
  };

  // ─── Pannello "Cose da fare" ────────────────────────────────────────────
  // Le attività sono legate al mese in cui vengono create: il pannello mostra
  // solo quelle il cui createdAt ricade nel mese attualmente selezionato.
  const [todoOpen, setTodoOpen] = useState(() => loadPanelOpen('todo'));
  const [tasksAll, setTasksAll] = useState<TaskItem[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);

  const tasks = useMemo(
    () => tasksAll.filter(t => t.createdAt.slice(0, 7) === mese),
    [tasksAll, mese],
  );

  const toggleTodoOpen = () => setTodoOpen(prev => { savePanelOpen('todo', !prev); return !prev; });

  const loadTasks = useCallback(async () => {
    try { setTasksAll(await taskApi.list('conteggi', 'conteggi')); } catch { /* pannello informativo */ }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleOpenNewTask = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'conteggi', entityId: 'conteggi', ...data });
      setTaskModalOpen(false); setEditingTask(null);
      await loadTasks();
    } finally { setTaskSaving(false); }
  };

  const handleToggleTask = async (t: TaskItem) => {
    setTasksAll(prev => prev.map(x => x.id === t.id ? { ...x, completata: !x.completata } : x));
    try { await taskApi.toggle(t.id, !t.completata); }
    catch (e: any) { alert('Errore aggiornamento attività: ' + e.message); await loadTasks(); }
  };

  const handleRemoveTask = async (id: string) => {
    setTasksAll(prev => prev.filter(x => x.id !== id));
    try { await taskApi.remove(id); }
    catch (e: any) { alert('Errore eliminazione attività: ' + e.message); await loadTasks(); }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [padResp, conteggiList] = await Promise.all([
        padronciniApi.list({ limit: '200' }),
        conteggiApi.list(mese),
      ]);
      const conteggioMap = new Map<string, ConteggioMensile>(
        conteggiList.map((c: ConteggioMensile) => [c.padroncinoId, c])
      );
      const result: RigaPadroncino[] = padResp.data
        // Attivi sempre presenti; dismessi solo se hanno un conteggio in questo mese
        .filter((p: Padroncino) => p.attivo !== false || conteggioMap.has(p.id))
        .map((p: Padroncino) => ({
          padroncino: p,
          conteggio: conteggioMap.get(p.id) ?? null,
          checklist: loadChecklist(p.id, mese),
        }));
      setRighe(result);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [mese]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApriDuplicaBulk = async () => {
    try {
      // Recupera tutti i mesi con almeno un conteggio (esclusi quello corrente)
      const tutti = await conteggiApi.list();
      const TIPI_DUPLICABILI = ['FATTURATO', 'ADDEBITO', 'FINE_MESE'];
      const mesiUnici = Array.from(
        new Set(
          tutti
            .filter((c) =>
              c.mese !== mese &&
              (c.righe ?? []).some((r) => TIPI_DUPLICABILI.includes(r.tipo))
            )
            .map((c) => c.mese)
        )
      ).sort((a, b) => b.localeCompare(a));
      if (mesiUnici.length === 0) {
        alert('Nessun altro mese con voci duplicabili (fatturato / addebiti vari / fine mese).');
        return;
      }
      setMesiSorgenteDisponibili(mesiUnici);
      setDuplicaBulkSorgente(mesiUnici[0]);
      setDuplicaBulkOpen(true);
    } catch (e: any) {
      alert('Errore caricamento mesi: ' + (e?.message ?? e));
    }
  };

  const handleConfermaDuplicaBulk = async () => {
    if (!duplicaBulkSorgente) return;
    const conferma = confirm(
      `Duplicare in ${formatMese(mese)} le voci manuali di ${formatMese(duplicaBulkSorgente)}\n` +
      `per TUTTI i padroncini attivi?\n\n` +
      `Verranno copiate solo: Fatturato distribuzione, Addebiti vari, Fatture fine mese.\n` +
      `Le voci manuali già presenti nel mese di destinazione verranno sostituite.\n` +
      `I conteggi CONFERMATI verranno saltati.`
    );
    if (!conferma) return;
    setDuplicaBulkLoading(true);
    try {
      const risultati = await conteggiApi.duplicaBulk(duplicaBulkSorgente, mese);
      const duplicati = risultati.filter((r) => r.stato === 'duplicato').length;
      const saltati = risultati.filter((r) => r.stato === 'saltato').length;
      const errori = risultati.filter((r) => r.stato === 'errore');
      let msg = `✅ Duplicazione bulk completata\n\n`
        + `Duplicati: ${duplicati}\n`
        + `Saltati: ${saltati}`;
      if (errori.length > 0) {
        msg += `\nErrori: ${errori.length}\n\n`
          + errori.map((r) => `• ${r.padroncino}: ${r.errore}`).join('\n');
      }
      alert(msg);
      setDuplicaBulkOpen(false);
      await loadData();
    } catch (e: any) {
      alert('❌ Errore duplicazione bulk: ' + (e?.message ?? e));
    } finally {
      setDuplicaBulkLoading(false);
    }
  };

  const handleApplicaFattura = async (file: File) => {
    setApplicando(true);
    try {
      const result = await conteggiApi.applicaFatturaProforma(file, mese);
      const nonTrovati = result.risultati
        .filter((r) => r.azione === 'non_trovato')
        .map((r) => `• ${r.fornitore}`)
        .join('\n');
      let msg = `✅ Fattura Proforma applicata per ${formatMese(mese)}\n\n`
        + `Processati: ${result.processati}\n`
        + `Saltati: ${result.saltati}`;
      if (nonTrovati) msg += `\n\nFornitore non trovato:\n${nonTrovati}`;
      alert(msg);
      await loadData();
    } catch (e: any) {
      alert('Errore importazione: ' + (e.message ?? 'Errore sconosciuto'));
    } finally {
      setApplicando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = async () => {
    setExportandoExcel(true);
    try {
      await generaExcelConteggi(righe, mese);
    } catch (e: any) {
      alert('Errore esportazione Excel: ' + (e?.message ?? e));
    } finally {
      setExportandoExcel(false);
    }
  };

  const filtered = useMemo(() => {
    return righe.filter(({ padroncino: p, conteggio: c }) => {
      const matchSearch = p.ragioneSociale.toLowerCase().includes(search.toLowerCase());
      const stato = c?.stato ?? null;
      const matchStato =
        filtroStato === 'TUTTI' ||
        (filtroStato === 'NESSUNO' && !stato) ||
        stato === filtroStato;
      return matchSearch && matchStato;
    });
  }, [righe, search, filtroStato]);

  const getSortValue = (row: RigaPadroncino, key: string): string | number => {
    const { padroncino: p, conteggio: c, checklist } = row;
    const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
    switch (key) {
      case 'nome': return p.ragioneSociale.toLowerCase();
      case 'stato': return c?.stato ?? '';
      case 'mezzi': return p.mezziAssegnati?.length ?? 0;
      case 'palmari': return p.palmariAssegnati?.length ?? 0;
      case 'fatturato': return fin?.fatturato ?? 0;
      case 'addebiti': return fin?.addebiti ?? 0;
      case 'compensazioni': return fin?.compensazioni ?? 0;
      case 'netto': return c?.netto ?? 0;
      case 'distribuzioneInviata': return checklist.distribuzioneInviata ? 1 : 0;
      case 'pdfAddebitiCreato': return checklist.pdfAddebitiCreato ? 1 : 0;
      case 'fatturaCreata': return checklist.fatturaCreata ? 1 : 0;
      case 'fatturaRicevuta': return checklist.fatturaRicevuta ? 1 : 0;
      case 'progresso': return Object.values(checklist).filter(Boolean).length;
      default: return 0;
    }
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'it')
        : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totaliTabella = useMemo(() => {
    return filtered.reduce((acc, { padroncino: p, conteggio: c }) => {
      const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
      acc.mezzi += p.mezziAssegnati?.length ?? 0;
      acc.palmari += p.palmariAssegnati?.length ?? 0;
      acc.fatturato += fin?.fatturato ?? 0;
      acc.addebiti += fin?.addebiti ?? 0;
      acc.compensazioni += fin?.compensazioni ?? 0;
      acc.netto += c?.netto ?? 0;
      return acc;
    }, { mezzi: 0, palmari: 0, fatturato: 0, addebiti: 0, compensazioni: 0, netto: 0 });
  }, [filtered]);

  const stats = useMemo(() => ({
    tot: righe.length,
    completati: righe.filter((r) => r.checklist.fatturaRicevuta).length,
    inCorso: righe.filter((r) => r.conteggio?.stato === 'BOZZA').length,
    totaleFatturato: righe.reduce((s, r) => s + (r.conteggio?.netto ?? 0), 0),
  }), [righe]);

  const STATI = ['TUTTI', 'BOZZA', 'CHIUSO', 'CONFERMATO', 'NESSUNO'];
  const STATI_LABELS: Record<string, string> = {
    TUTTI: 'Tutti', BOZZA: 'Bozza', CHIUSO: 'Chiuso', CONFERMATO: 'Confermato', NESSUNO: 'Senza conteggio',
  };

  // ─── Dati di contorno per il riepilogo (solo lettura) ────────────────────
  const [andamento, setAndamento] = useState<AndamentoMese[]>([]);
  const [compPrecedenti, setCompPrecedenti] = useState<{ mese: string; valore: number | null }[]>([]);
  const [taskDefaultPad, setTaskDefaultPad] = useState<string | undefined>(undefined);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    conteggiStatsApi.andamento(12).then(setAndamento).catch(() => {});
  }, []);

  useEffect(() => {
    const prev = (m: string, k: number) => {
      const [y, mo] = m.split('-').map(Number);
      const d = new Date(y, mo - 1 - k, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    Promise.all([1, 2].map(k => conteggiApi.getCompetenzeAttive(prev(mese, k)).catch(() => ({ mese: prev(mese, k), valore: null }))))
      .then(setCompPrecedenti);
  }, [mese]);

  const STATO_TONE: Record<string, Tone> = { BOZZA: 'warn', CHIUSO: 'na', CONFERMATO: 'info' };
  const AVATAR = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
  const contaStato = (st: string) => righe.filter(({ conteggio: c }) => {
    const x = c?.stato ?? null;
    return st === 'TUTTI' || (st === 'NESSUNO' && !x) || x === st;
  }).length;
  const sortState = { key: sortKey, dir: sortDir };
  const meseLow = formatMese(mese).toLowerCase();
  const meseNome = meseLow.split(' ')[0];

  // Totali del mese su tutti i padroncini (stessa funzione calcolaRighe della tabella)
  const totMese = useMemo(() => righe.reduce((acc, { conteggio: c }) => {
    const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
    acc.fatturato += fin?.fatturato ?? 0;
    acc.addebiti += fin?.addebiti ?? 0;
    acc.compensazioni += fin?.compensazioni ?? 0;
    acc.netto += c?.netto ?? 0;
    return acc;
  }, { fatturato: 0, addebiti: 0, compensazioni: 0, netto: 0 }), [righe]);

  // Addebiti per tipo: stessa logica di calcolaRighe, solo divisa per voce
  const addebitiPerTipo = useMemo(() => {
    const out = { noleggi: 0, ricariche: 0, palmari: 0, vari: 0 };
    for (const { conteggio: c } of righe) {
      if (!c?.righe?.length) continue;
      const sum = (t: string) => c.righe.filter(r => r.tipo === t).reduce((s2, r) => s2 + Number(r.importo), 0);
      const nol = sum('NOLEGGIO'), ric = sum('RICARICA'), pal = sum('PALMARE') * 1.22;
      const tot = calcolaRighe(c.righe).addebiti;
      out.noleggi += nol; out.ricariche += ric; out.palmari += pal;
      out.vari += tot - nol - ric - pal; // addebiti vari + bollo
    }
    return out;
  }, [righe]);
  const addTot = addebitiPerTipo.noleggi + addebitiPerTipo.ricariche + addebitiPerTipo.palmari + addebitiPerTipo.vari;

  // Variazione sul mese prima e andamento (dai dati mensili del server)
  const idxMese = andamento.findIndex(a => a.mese === mese);
  const prevA = idxMese > 0 ? andamento[idxMese - 1] : null;
  const curA = idxMese >= 0 ? andamento[idxMese] : null;
  const pct = (a?: number | null, b?: number | null) => (a != null && b ? ((a - b) / b) * 100 : null);
  const nettoA = (a: AndamentoMese) => Number(a.bonifici || 0) + Number(a.daBonificare || 0);
  const deltaNode = (d: number | null, good: boolean) => d === null ? null : (
    <><span style={{ fontWeight: 600, color: good ? '#15803D' : '#52525B' }}>{d >= 0 ? '+' : '−'}{Math.abs(d).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</span> vs {prevA ? formatMese(prevA.mese).split(' ')[0].toLowerCase() : 'mese prima'}</>
  );
  const serie = (f: (a: AndamentoMese) => number) => andamento.slice(0, idxMese >= 0 ? idxMese + 1 : undefined).slice(-8).map(f);
  const dNetto = curA && prevA ? pct(nettoA(curA), nettoA(prevA)) : null;
  const dFatt = curA && prevA ? pct(Number(curA.fatturato), Number(prevA.fatturato)) : null;
  const dAdd = curA && prevA ? pct(Number(curA.addebiti), Number(prevA.addebiti)) : null;

  const kpis: KpiItem[] = [
    { label: 'Netto da bonificare', value: fmtEur(totMese.netto), color: C.green, icon: 'euro',
      sub: deltaNode(dNetto, (dNetto ?? 0) >= 0) ?? 'Somma dei netti dei conteggi', spark: andamento.length ? serie(nettoA) : undefined },
    { label: 'Fatturato c/IVA', value: fmtEur(totMese.fatturato), color: C.blue, icon: 'trend',
      sub: deltaNode(dFatt, (dFatt ?? 0) >= 0) ?? 'Distribuzione con IVA', spark: andamento.length ? serie(a => Number(a.fatturato)) : undefined },
    { label: 'Addebiti', value: fmtEur(totMese.addebiti), color: C.red, icon: 'cont', sub: deltaNode(dAdd, false) ?? 'Noleggi, ricariche, palmari, vari' },
    { label: 'Compensazioni', value: fmtEur(totMese.compensazioni), color: C.purple, icon: 'swap', sub: 'Fatture fine mese, acconti, accrediti, bonus' },
  ];

  const conConteggio = righe.filter(r => r.conteggio);
  const bozze = conConteggio.filter(r => r.conteggio!.stato === 'BOZZA').length;
  const chiusi = conConteggio.filter(r => r.conteggio!.stato === 'CHIUSO').length;
  const confermati = conConteggio.filter(r => r.conteggio!.stato === 'CONFERMATO').length;
  const senza = righe.length - conConteggio.length;

  // Cose da fare: quelle del mese, più quelle ancora aperte dei mesi prima
  const taskDelMese = tasksAll.filter(t => t.createdAt.slice(0, 7) === mese);
  const taskAperteVecchie = tasksAll.filter(t => !t.completata && t.createdAt.slice(0, 7) < mese);
  const taskFatteVecchie = tasksAll.filter(t => t.completata && t.createdAt.slice(0, 7) < mese);
  const aperteTot = taskDelMese.filter(t => !t.completata).length + taskAperteVecchie.length;

  const handleChiudiDaLista = async (c: ConteggioMensile, nome: string) => {
    if (!confirm(
      `Chiudere il conteggio di ${formatMese(mese)} per ${nome}?\n\n` +
      `⚠️ Un conteggio CHIUSO non aggiornerà più automaticamente i mezzi assegnati.\n` +
      `Potrai comunque modificarlo manualmente finché non lo CONFERMI.`
    )) return;
    try { await conteggiApi.updateStato(c.id, 'CHIUSO'); await loadData(); }
    catch (e: any) { alert('Errore: ' + e.message); }
  };

  const handleEliminaDaLista = async (c: ConteggioMensile, nome: string) => {
    if (!confirm(
      `Eliminare il conteggio di ${formatMese(mese)} per ${nome}?\n` +
      `Tutte le righe verranno cancellate. Operazione irreversibile.`
    )) return;
    try { await conteggiApi.remove(c.id); await loadData(); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  return (
    <Page>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleApplicaFattura(file);
        }}
      />
      <PageHeader
        eyebrow="Operativo"
        title="Conteggi mensili"
        sub="Un conteggio per padroncino al mese · gli importi sono calcolati dall'app come prima"
        actions={<>
          <label className="ds-select">
            <span>Mese</span>
            <input type="month" value={mese} onChange={(e) => e.target.value && setMese(e.target.value)} className="cp2-month" />
          </label>
          <Button icon="copy" onClick={handleApriDuplicaBulk} disabled={duplicaBulkLoading}
            title="Duplica le voci manuali di un altro mese su TUTTI i padroncini attivi">
            {duplicaBulkLoading ? 'Duplicazione…' : 'Duplica in blocco'}
          </Button>
          <Button icon="download" onClick={handleExportExcel} disabled={exportandoExcel || righe.length === 0}
            title="Esporta un file Excel con un foglio Riepilogo e un foglio per ogni padroncino con conteggio nel mese">
            {exportandoExcel ? 'Esportazione…' : 'Esporta Excel'}
          </Button>
          <Button icon="upload" variant="primary" onClick={() => !applicando && fileInputRef.current?.click()} disabled={applicando}
            title="Carica il file Fattura Proforma e aggiorna automaticamente il fatturato di tutti i padroncini presenti">
            {applicando ? 'Importazione…' : 'Importa fattura proforma'}
          </Button>
        </>}
      />

      <Modal open={duplicaBulkOpen} onClose={() => !duplicaBulkLoading && setDuplicaBulkOpen(false)} title="Duplica in blocco" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Copia le voci manuali (fatturato, addebiti vari, fine mese) di un altro mese su <strong>tutti i padroncini attivi</strong> in <strong>{formatMese(mese)}</strong>.
          </p>
          <label className="ds-field"><span>Mese da copiare</span>
            <select className="ds-input" value={duplicaBulkSorgente} onChange={(e) => setDuplicaBulkSorgente(e.target.value)} disabled={duplicaBulkLoading}>
              {mesiSorgenteDisponibili.map((m) => <option key={m} value={m}>{formatMese(m)}</option>)}
            </select>
          </label>
          <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => setDuplicaBulkOpen(false)} disabled={duplicaBulkLoading}>Annulla</Button>
            <Button variant="primary" onClick={handleConfermaDuplicaBulk} disabled={duplicaBulkLoading || !duplicaBulkSorgente}>
              {duplicaBulkLoading ? 'Duplicazione…' : 'Duplica per tutti'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stato del mese */}
      <div className="cp2-banner">
        <span aria-hidden="true" className="ds-tile ds-tile-md" style={{ background: C.blue, flexBasis: 28, height: 28, borderRadius: 7 }}><Icon name="cont" size={14} stroke={2.2} /></span>
        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>
            {formatMese(mese)} · {conConteggio.length} {conConteggio.length === 1 ? 'conteggio' : 'conteggi'}
            {conConteggio.length > 0 && (bozze === 0 ? (confermati === conConteggio.length ? ', tutti confermati' : chiusi + confermati === conConteggio.length ? ', tutti chiusi' : '') : '')}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {[chiusi && `${chiusi} chiusi`, confermati && `${confermati} confermati`, bozze && `${bozze} in bozza`, senza && `${senza} padroncini senza conteggio`].filter(Boolean).join(' · ') || 'Nessun conteggio creato per questo mese'}
          </span>
        </div>
        {bozze === 0 ? <Dot tone="ok">Nessuna bozza aperta</Dot> : <Dot tone="warn">{bozze} {bozze === 1 ? 'bozza aperta' : 'bozze aperte'}</Dot>}
      </div>

      <Kpis items={kpis} />

      <div className="ds-g4 cp2-main">
        <Card className="ds-s3 cp2-tablecard">
          <div className="cp2-toolbar">
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Conteggi di {meseNome}</h2>
              <span className="ds-cardsub">Clic sul nome per aprire il conteggio, sulle intestazioni per ordinare</span>
            </div>
            <label className="ds-search" style={{ minWidth: 220 }}>
              <Icon name="search" size={13} />
              <span className="sr-only">Cerca padroncino</span>
              <input placeholder="Cerca padroncino…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
          <div style={{ padding: '0 18px 10px' }}>
            <SegTabs
              items={STATI.map(st => ({ value: st, label: STATI_LABELS[st], count: contaStato(st) }))}
              value={filtroStato}
              onChange={setFiltroStato}
              label="Stato del conteggio"
            />
          </div>
          {loading ? (
            <Empty>Caricamento…</Empty>
          ) : error ? (
            <div style={{ padding: '0 18px 16px' }}>
              <Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={loadData}>Riprova</Button>}>{error}</Alert>
            </div>
          ) : (
            <div className="ds-tablewrap">
              <table className="ds-table cp2-table">
                <thead>
                  <tr>
                    <Th k="nome" sort={sortState} onSort={handleSort}>Padroncino</Th>
                    <Th k="stato" sort={sortState} onSort={handleSort}>Stato</Th>
                    <Th k="mezzi" sort={sortState} onSort={handleSort} right>Mezzi</Th>
                    <Th k="palmari" sort={sortState} onSort={handleSort} right>Palmari</Th>
                    <Th k="fatturato" sort={sortState} onSort={handleSort} right>Fatturato c/IVA</Th>
                    <Th k="addebiti" sort={sortState} onSort={handleSort} right>Addebiti</Th>
                    <Th k="compensazioni" sort={sortState} onSort={handleSort} right>Compensazioni</Th>
                    <Th k="netto" sort={sortState} onSort={handleSort} right>Netto</Th>
                    <Th>Quota del netto</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={10}><Empty>Nessun padroncino trovato</Empty></td></tr>
                  ) : (
                    sorted.map(({ padroncino: p, conteggio: c }) => {
                      const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
                      const dismesso = p.attivo === false;
                      const idx = righe.findIndex(r => r.padroncino.id === p.id);
                      const quota = c?.netto != null && totMese.netto > 0 ? Math.max(0, (c.netto / totMese.netto) * 100) : null;
                      const apri = () => navigate(`/conteggi/${p.id}?mese=${mese}`);
                      return (
                        <tr key={p.id} className="is-clickable" onClick={apri}>
                          <td>
                            <div className="cp2-name">
                              <span aria-hidden="true" className="cp2-avatar" style={{ background: AVATAR[idx % AVATAR.length], opacity: dismesso ? 0.45 : 1 }}>
                                {p.ragioneSociale.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: dismesso ? 'var(--text-muted)' : undefined }}>{p.ragioneSociale}</span>
                                {dismesso && <span style={{ fontSize: 12, color: 'var(--st-ko)' }}>Dismesso</span>}
                              </span>
                            </div>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            {c?.stato ? (
                              c.stato === 'BOZZA'
                                ? <button type="button" className="cp2-pill" title="Clic per chiudere il conteggio" onClick={() => handleChiudiDaLista(c, p.ragioneSociale)}>
                                    <Dot tone="warn">Bozza</Dot>
                                  </button>
                                : <span className="cp2-pill is-static"><Dot tone={STATO_TONE[c.stato] ?? 'na'}>{STATI_LABELS[c.stato] ?? c.stato}</Dot></span>
                            ) : (
                              <button type="button" className="cp2-pill" title="Apri per creare il conteggio" onClick={apri}><Dot tone="na">Da creare</Dot></button>
                            )}
                          </td>
                          <td className="r">{p.mezziAssegnati?.length ?? 0}</td>
                          <td className="r">{p.palmariAssegnati?.length ?? 0}</td>
                          <td className="r">{fin ? fmtEur(fin.fatturato) : '—'}</td>
                          <td className="r" style={{ color: fin && fin.addebiti ? '#B91C1C' : undefined }}>{fin ? fmtEur(fin.addebiti) : '—'}</td>
                          <td className="r" style={{ color: fin && fin.compensazioni ? '#1D4ED8' : undefined }}>{fin ? fmtEur(fin.compensazioni) : '—'}</td>
                          <td className="r" style={{ fontWeight: 600, color: c?.netto != null && c.netto < 0 ? '#B91C1C' : undefined }}>
                            {c?.netto != null ? fmtEur(c.netto) : '—'}
                          </td>
                          <td>
                            {quota !== null ? (
                              <span className="cp2-quota">
                                <span aria-hidden="true"><i style={{ width: `${Math.min(100, quota)}%` }} /></span>
                                <small>{quota.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small>
                              </span>
                            ) : <span style={{ color: '#A1A1AA' }}>—</span>}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                              <IconButton icon="check" label={`Attività su ${p.ragioneSociale}`} onClick={() => { setTaskDefaultPad(p.ragioneSociale); handleOpenNewTask(); }} />
                              {c && <IconButton icon="trash" danger label={`Elimina conteggio di ${p.ragioneSociale}`} onClick={() => handleEliminaDaLista(c, p.ragioneSociale)} />}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="is-total">
                      <td>Totale {meseNome}</td>
                      <td></td>
                      <td className="r">{totaliTabella.mezzi}</td>
                      <td className="r">{totaliTabella.palmari}</td>
                      <td className="r">{fmtEur(totaliTabella.fatturato)}</td>
                      <td className="r">{fmtEur(totaliTabella.addebiti)}</td>
                      <td className="r">{fmtEur(totaliTabella.compensazioni)}</td>
                      <td className="r">{fmtEur(totaliTabella.netto)}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        <div className="cp2-side">
          <Card pad>
            <CardHead title="Addebiti per tipo" sub={`${meseNome.charAt(0).toUpperCase() + meseNome.slice(1)}, con IVA`} />
            {addTot > 0 ? (
              <>
                <SegBar parts={[
                  { value: addebitiPerTipo.noleggi, color: C.teal },
                  { value: addebitiPerTipo.ricariche, color: C.green },
                  { value: addebitiPerTipo.palmari, color: C.blue },
                  { value: addebitiPerTipo.vari, color: C.purple },
                ]} />
                {[
                  ['Noleggi mezzi', addebitiPerTipo.noleggi, C.teal],
                  ['Ricariche', addebitiPerTipo.ricariche, C.green],
                  ['Palmari', addebitiPerTipo.palmari, C.blue],
                  ['Addebiti vari e bolli', addebitiPerTipo.vari, C.purple],
                ].map(([l, v, col]) => (
                  <div key={l as string} className="cp2-legrow">
                    <i style={{ background: col as string }} />
                    <span>{l}</span>
                    <strong>{fmtEur(v as number)}</strong>
                    <small>{Math.round(((v as number) / addTot) * 100)}%</small>
                  </div>
                ))}
              </>
            ) : <span className="ds-cardsub">Nessun addebito nel mese</span>}
          </Card>

          <Card pad style={{ flex: '1 1 auto' }}>
            <CardHead title="Competenze attive" tile={{ color: C.purple, icon: 'edit' }} />
            <label className="ds-field"><span>Valore di {meseLow}</span>
              {editingCompetenze ? (
                <input
                  autoFocus
                  className="ds-input"
                  type="number"
                  step="0.01"
                  value={competenzeInput}
                  onChange={(e) => setCompetenzeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCompetenze();
                    if (e.key === 'Escape') setEditingCompetenze(false);
                  }}
                  disabled={savingCompetenze}
                />
              ) : (
                <button type="button" className="ds-input cp2-valbtn" onClick={handleStartEditCompetenze}>
                  {competenzeAttive != null ? fmtEur(competenzeAttive) : <span style={{ color: 'var(--text-muted)' }}>Da inserire</span>}
                </button>
              )}
            </label>
            {editingCompetenze ? (
              <div className="ds-actions">
                <Button size="sm" onClick={() => setEditingCompetenze(false)} disabled={savingCompetenze}>Annulla</Button>
                <Button size="sm" variant="primary" onClick={handleSaveCompetenze} disabled={savingCompetenze} style={{ flex: '1 1 auto', justifyContent: 'center' }}>
                  {savingCompetenze ? 'Salvataggio…' : 'Salva'}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="primary" onClick={handleStartEditCompetenze} style={{ justifyContent: 'center' }}>Modifica</Button>
            )}
            <div className="cp2-prev">
              {compPrecedenti.map(cp => (
                <div key={cp.mese}><span>{formatMese(cp.mese).split(' ')[0]}</span><strong>{cp.valore != null ? fmtEur(cp.valore) : '—'}</strong></div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="ds-g2">
        {/* Cose da fare */}
        <Card>
          <CardHead bar title="Cose da fare" sub={aperteTot ? `${aperteTot} da fare · restano qui finché non le segni come fatte` : 'Niente da fare'}
            tile={{ color: C.green, icon: 'check' }}
            actions={<Button size="sm" variant="primary" icon="plus" onClick={() => { setTaskDefaultPad(undefined); handleOpenNewTask(); }}>Attività</Button>} />
          <div className="cp2-group">Create a {meseLow}</div>
          <TaskList tasks={taskDelMese} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} empty={`Nessuna attività creata a ${meseLow}`} />
          {taskAperteVecchie.length > 0 && (
            <>
              <div className="cp2-group">Ancora aperte dai mesi precedenti · {taskAperteVecchie.length}</div>
              <TaskList tasks={taskAperteVecchie} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />
            </>
          )}
          {showDone && taskFatteVecchie.length > 0 && (
            <>
              <div className="cp2-group">Completate nei mesi precedenti · {taskFatteVecchie.length}</div>
              <TaskList tasks={taskFatteVecchie} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />
            </>
          )}
          {taskFatteVecchie.length > 0 && (
            <div style={{ padding: '4px 18px 14px' }}>
              <button type="button" className="cp2-soft" onClick={() => setShowDone(v => !v)}>
                {showDone ? 'Nascondi completate' : `Mostra completate (${taskFatteVecchie.length})`}
              </button>
            </div>
          )}
        </Card>

        {/* Sospesi del mese */}
        <Card>
          <CardHead bar title={`Sospesi per ${meseNome}`} sub="Addebiti e promemoria da inserire nei conteggi"
            actions={sospesi.length ? <Dot tone="warn">{sospesi.length} in attesa</Dot> : <Dot tone="ok">Nessuno in attesa</Dot>} />
          <div className="ds-list">
            {sospesiLoading ? <Empty>Caricamento…</Empty>
              : sospesi.length === 0 ? <Empty>Nessun addebito sospeso per {formatMese(mese)}</Empty>
              : sospesi.map((s, i) => {
                const nome = s.padroncino?.ragioneSociale ?? '';
                const pIdx = righe.findIndex(r => r.padroncino.ragioneSociale === nome);
                const memo = s.tipo === 'MEMO';
                return (
                  <div key={s.id} className="ds-listrow" style={{ padding: '10px 18px', flexWrap: 'wrap' }}>
                    <span aria-hidden="true" className="cp2-avatar" style={{ background: AVATAR[(pIdx >= 0 ? pIdx : i) % AVATAR.length] }}>
                      {nome.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'}
                    </span>
                    <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{s.descrizione}</span>
                      <span className="ds-cardsub" style={{ fontSize: 12 }}>{[nome, s.meseOrigine ? `dal conteggio di ${formatMese(s.meseOrigine).toLowerCase()}` : ''].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span style={{ flex: '0 0 96px' }}><Dot tone={memo ? 'info' : 'ko'}>{memo ? 'Promemoria' : 'Addebito'}</Dot></span>
                    <strong className="ds-num" style={{ flex: '0 0 90px', textAlign: 'right' }}>{s.importo != null ? fmtEur(s.importo) : '—'}</strong>
                    <Button size="sm" onClick={() => handleEvadiSospeso(s.id)} title={memo ? 'Segna come fatto' : 'Segna come evaso'}>
                      {memo ? 'Fatto' : 'Evadi'}
                    </Button>
                  </div>
                );
              })}
          </div>
          <div className="ds-foot"><button type="button" className="cp2-link" onClick={() => navigate('/addebiti-sospesi')}>Gestisci tutti gli addebiti sospesi →</button></div>
        </Card>
      </div>

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        editingTask={editingTask}
        defaultPadroncino={taskDefaultPad}
      />
    </Page>
  );
}
