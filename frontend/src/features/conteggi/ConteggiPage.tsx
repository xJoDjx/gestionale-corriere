// src/features/conteggi/ConteggiPage.tsx
// Lista padroncini attivi nel mese — dati reali dal backend
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { padronciniApi, taskApi } from '../../lib/api';
import type { Padroncino, TaskItem } from '../../lib/api';
import { conteggiApi } from '../../lib/conteggi.api';
import type { ConteggioMensile } from '../../lib/conteggi.api';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import type { AddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { generaExcelConteggi } from './generaExcelConteggi';
import Modal from '../../components/ui/Modal';
import {
  Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SegTabs, Dot, Empty, Alert, Th, Icon, C, fmtEur, fmtNum,
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

  const STATO_TONE: Record<string, Tone> = { BOZZA: 'warn', CHIUSO: 'info', CONFERMATO: 'ok' };
  const contaStato = (st: string) => righe.filter(({ conteggio: c }) => {
    const x = c?.stato ?? null;
    return st === 'TUTTI' || (st === 'NESSUNO' && !x) || x === st;
  }).length;
  const sortState = { key: sortKey, dir: sortDir };
  const conAperti = tasks.filter(t => !t.completata).length;

  const kpis: KpiItem[] = [
    { label: 'Padroncini nel mese', value: fmtNum(stats.tot), color: C.blue, icon: 'pad', sub: `${righe.filter(r => r.conteggio).length} con conteggio` },
    { label: 'In lavorazione', value: fmtNum(stats.inCorso), color: C.orange, icon: 'edit', sub: 'Bozze aperte' },
    { label: 'Netto totale', value: fmtEur(stats.totaleFatturato), color: C.green, icon: 'euro', sub: 'Somma dei netti dei conteggi' },
  ];

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
        title={`Conteggi di ${formatMese(mese).toLowerCase()}`}
        sub="Un conteggio per padroncino: fatturato, addebiti, compensazioni e netto da bonificare"
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

      <section aria-label="Indicatori" className="ds-g4">
        <Kpis items={kpis} className="cp2-contents" />
        <div className="ds-kpi cp2-editable" role="button" tabIndex={0}
          onClick={() => !editingCompetenze && handleStartEditCompetenze()}
          onKeyDown={(e) => { if (e.key === 'Enter' && !editingCompetenze) handleStartEditCompetenze(); }}
          title="Clic per modificare">
          <div className="ds-kpi-top">
            <span aria-hidden="true" className="ds-tile" style={{ background: C.teal }}><Icon name="edit" size={11} stroke={2.6} /></span>
            <span className="ds-kpi-label">Competenze attive</span>
          </div>
          {editingCompetenze ? (
            <input
              autoFocus
              className="ds-input"
              type="number"
              step="0.01"
              aria-label="Competenze attive"
              value={competenzeInput}
              onChange={(e) => setCompetenzeInput(e.target.value)}
              onBlur={handleSaveCompetenze}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingCompetenze(false);
              }}
              onClick={(e) => e.stopPropagation()}
              disabled={savingCompetenze}
            />
          ) : (
            <span className="ds-kpi-value">{competenzeAttive == null ? '—' : fmtEur(competenzeAttive)}</span>
          )}
          <span className="ds-kpi-sub">{savingCompetenze ? 'Salvataggio…' : 'Inserito a mano · clic per modificare'}</span>
        </div>
      </section>

      <Card>
        <div className="cp2-toolbar">
          <SegTabs
            items={STATI.map(st => ({ value: st, label: STATI_LABELS[st], count: contaStato(st) }))}
            value={filtroStato}
            onChange={setFiltroStato}
            label="Stato del conteggio"
          />
          <label className="ds-search" style={{ minWidth: 240 }}>
            <Icon name="search" size={13} />
            <span className="sr-only">Cerca padroncino</span>
            <input placeholder="Cerca padroncino…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        {loading ? (
          <Empty>Caricamento…</Empty>
        ) : error ? (
          <div style={{ padding: '0 18px 16px' }}>
            <Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={loadData}>Riprova</Button>}>{error}</Alert>
          </div>
        ) : (
          <div className="ds-tablewrap">
            <table className="ds-table">
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
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={8}><Empty>Nessun padroncino trovato</Empty></td></tr>
                ) : (
                  sorted.map(({ padroncino: p, conteggio: c }) => {
                    const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
                    const dismesso = p.attivo === false;
                    return (
                      <tr key={p.id} className="is-clickable" onClick={() => navigate(`/conteggi/${p.id}?mese=${mese}`)}>
                        <td>
                          <div className="cp2-name">
                            <span aria-hidden="true" className="cp2-avatar" style={dismesso ? { opacity: 0.5 } : undefined}>{p.ragioneSociale.charAt(0)}</span>
                            <span style={{ fontWeight: 500, color: dismesso ? 'var(--text-muted)' : undefined }}>{p.ragioneSociale}</span>
                            {dismesso && <Dot tone="ko">Dismesso</Dot>}
                          </div>
                        </td>
                        <td>{c?.stato ? <Dot tone={STATO_TONE[c.stato] ?? 'na'}>{STATI_LABELS[c.stato] ?? c.stato}</Dot> : <Dot tone="na">Nessuno</Dot>}</td>
                        <td className="r">{p.mezziAssegnati?.length ?? 0}</td>
                        <td className="r">{p.palmariAssegnati?.length ?? 0}</td>
                        <td className="r">{fin ? fmtEur(fin.fatturato) : '—'}</td>
                        <td className="r" style={{ color: fin && fin.addebiti ? '#B91C1C' : undefined }}>{fin ? fmtEur(fin.addebiti) : '—'}</td>
                        <td className="r" style={{ color: fin && fin.compensazioni ? '#6D28D9' : undefined }}>{fin ? fmtEur(fin.compensazioni) : '—'}</td>
                        <td className="r" style={{ fontWeight: 600, color: c?.netto != null && c.netto < 0 ? '#B91C1C' : undefined }}>
                          {c?.netto != null ? fmtEur(c.netto) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="is-total">
                    <td>Totale</td>
                    <td></td>
                    <td className="r">{totaliTabella.mezzi}</td>
                    <td className="r">{totaliTabella.palmari}</td>
                    <td className="r">{fmtEur(totaliTabella.fatturato)}</td>
                    <td className="r">{fmtEur(totaliTabella.addebiti)}</td>
                    <td className="r">{fmtEur(totaliTabella.compensazioni)}</td>
                    <td className="r">{fmtEur(totaliTabella.netto)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <div className="ds-foot">{filtered.length} padroncini · clic su una riga per aprire il conteggio</div>
      </Card>

      <div className="ds-g2">
        {/* Cose da fare del mese */}
        <Card>
          <CardHead bar title="Cose da fare" sub={conAperti ? `${conAperti} da fare a ${formatMese(mese).toLowerCase()}` : `Attività create a ${formatMese(mese).toLowerCase()}`}
            tile={{ color: C.green, icon: 'check' }}
            actions={<>
              <Button size="sm" icon="plus" onClick={handleOpenNewTask}>Attività</Button>
              <IconButton icon={todoOpen ? 'chevUp' : 'chevDown'} label={todoOpen ? 'Riduci' : 'Espandi'} onClick={toggleTodoOpen} />
            </>} />
          {todoOpen && <TaskList tasks={tasks} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />}
        </Card>

        {/* Addebiti sospesi del mese */}
        <Card>
          <CardHead bar title="Addebiti sospesi" sub={sospesi.length ? `${sospesi.length} da inserire a ${formatMese(mese).toLowerCase()}` : 'Nessuno da inserire'}
            tile={{ color: C.orange, icon: 'sospesi' }}
            actions={<IconButton icon={sospesiOpen ? 'chevUp' : 'chevDown'} label={sospesiOpen ? 'Riduci' : 'Espandi'} onClick={toggleSospesiOpen} />} />
          {sospesiOpen && (
            <>
              <div className="ds-list">
                {sospesiLoading ? <Empty>Caricamento…</Empty>
                  : sospesi.length === 0 ? <Empty>Nessun addebito sospeso per {formatMese(mese)}</Empty>
                  : sospesi.map((s) => (
                    <div key={s.id} className="ds-listrow">
                      {s.tipo === 'MEMO' && <span className="ds-chip">Memo</span>}
                      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontWeight: 500 }}>{s.descrizione}</span>
                        <span className="ds-cardsub" style={{ fontSize: 12 }}>
                          {[s.padroncino?.ragioneSociale, s.meseOrigine ? `da ${s.meseOrigine}` : ''].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      {s.importo != null && <strong className="ds-num">{fmtEur(s.importo)}</strong>}
                      <Button size="sm" icon="tick" onClick={() => handleEvadiSospeso(s.id)} title={s.tipo === 'MEMO' ? 'Segna come fatto' : 'Segna come evaso'}>
                        {s.tipo === 'MEMO' ? 'Fatto' : 'Evadi'}
                      </Button>
                    </div>
                  ))}
              </div>
              <div className="ds-foot"><button type="button" className="cp2-link" onClick={() => navigate('/addebiti-sospesi')}>Gestisci tutti gli addebiti sospesi →</button></div>
            </>
          )}
        </Card>
      </div>

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        editingTask={editingTask}
      />
    </Page>
  );
}
