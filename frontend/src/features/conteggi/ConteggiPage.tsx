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
import './ConteggiPage.css';

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

  return (
    <div className="cp-page">
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
      <div className="cp-header">
        <div className="cp-header-left">
          <h1>📋 Conteggi Mensili</h1>
          <span className="cp-mese-label">{formatMese(mese)}</span>
        </div>
        <div className="cp-header-right">
          <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} className="cp-month-input" />
          <button
            className="btn-outline"
            onClick={() => !applicando && fileInputRef.current?.click()}
            disabled={applicando}
            title="Carica il file Fattura Proforma e aggiorna automaticamente il fatturato di tutti i padroncini presenti"
          >
            {applicando ? '⏳ Importando...' : '📂 Importa Fattura Proforma'}
          </button>
          <button
            className="btn-outline"
            onClick={handleExportExcel}
            disabled={exportandoExcel || righe.length === 0}
            title="Esporta un file Excel con un foglio Riepilogo e un foglio per ogni padroncino con conteggio nel mese"
          >
            {exportandoExcel ? '⏳ Esportando...' : '📊 Esporta Excel'}
          </button>
          <button
            className="btn-outline"
            onClick={handleApriDuplicaBulk}
            disabled={duplicaBulkLoading}
            title="Duplica le voci manuali di un altro mese su TUTTI i padroncini attivi"
          >
            {duplicaBulkLoading ? '⏳ Duplicando...' : '📋 Duplica Bulk da...'}
          </button>
        </div>
      </div>

      {duplicaBulkOpen && (
        <div
          className="cp-modal-overlay"
          onClick={() => !duplicaBulkLoading && setDuplicaBulkOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            className="cp-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated, #fff)', padding: 24, borderRadius: 8,
              minWidth: 380, maxWidth: 520, boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>📋 Duplica Bulk Conteggi</h2>
            <p style={{ color: 'var(--text-secondary, #666)', fontSize: 14 }}>
              Duplica le voci manuali (fatturato, addebiti vari, fine mese) di un altro
              mese su <strong>tutti i padroncini attivi</strong> nel mese{' '}
              <strong>{formatMese(mese)}</strong>.
            </p>
            <label style={{ display: 'block', margin: '16px 0 6px', fontWeight: 600 }}>
              Mese sorgente
            </label>
            <select
              value={duplicaBulkSorgente}
              onChange={(e) => setDuplicaBulkSorgente(e.target.value)}
              style={{ width: '100%', padding: 8, fontSize: 14 }}
              disabled={duplicaBulkLoading}
            >
              {mesiSorgenteDisponibili.map((m) => (
                <option key={m} value={m}>{formatMese(m)}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <button
                className="btn-outline"
                onClick={() => setDuplicaBulkOpen(false)}
                disabled={duplicaBulkLoading}
              >
                Annulla
              </button>
              <button
                className="btn-primary"
                onClick={handleConfermaDuplicaBulk}
                disabled={duplicaBulkLoading || !duplicaBulkSorgente}
              >
                {duplicaBulkLoading ? '⏳ Duplicando...' : 'Duplica per tutti'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cp-stats">
        <div className="cp-stat cp-stat--blue">
          <span className="cp-stat-label">Padroncini Attivi</span>
          <span className="cp-stat-value">{stats.tot}</span>
          <span className="cp-stat-sub">nel mese</span>
        </div>
        <div className="cp-stat cp-stat--alert">
          <span className="cp-stat-label">In Lavorazione</span>
          <span className="cp-stat-value cp-warn">{stats.inCorso}</span>
          <span className="cp-stat-sub">bozze aperte</span>
        </div>
        <div className="cp-stat cp-stat--green">
          <span className="cp-stat-label">Completati</span>
          <span className="cp-stat-value cp-suc">{stats.completati}</span>
          <span className="cp-stat-sub">fattura ricevuta</span>
        </div>
        <div className="cp-stat cp-stat--purple">
          <span className="cp-stat-label">Netto Totale da Bonificare</span>
          <span className="cp-stat-value">{eur(stats.totaleFatturato)}</span>
          <span className="cp-stat-sub">somma netti conteggi</span>
        </div>
        <div
          className="cp-stat cp-stat--teal cp-stat--editable"
          onClick={() => !editingCompetenze && handleStartEditCompetenze()}
          title="Clicca per modificare"
        >
          <span className="cp-stat-label">Competenze Attive ✏️</span>
          {editingCompetenze ? (
            <input
              autoFocus
              className="cp-stat-edit-input"
              type="number"
              step="0.01"
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
            <span className="cp-stat-value">{eur(competenzeAttive)}</span>
          )}
          <span className="cp-stat-sub">{savingCompetenze ? 'salvataggio…' : 'inserito manualmente'}</span>
        </div>
      </div>

      <div className="cp-panels-row">
        {/* Pannello Addebiti sospesi del mese */}
        <div className="cp-panel">
          <div className="cp-panel-head" onClick={toggleSospesiOpen}>
            <span className="cp-panel-title">
              💳 Addebiti sospesi
              {sospesi.length > 0 && <span className="cp-panel-count">{sospesi.length}</span>}
            </span>
            <span className={`cp-panel-chevron ${sospesiOpen ? 'cp-panel-chevron-open' : ''}`}>▾</span>
          </div>
          {sospesiOpen && (
            <div className="cp-panel-body">
              {sospesiLoading ? (
                <div className="cp-panel-empty">⏳ Caricamento...</div>
              ) : sospesi.length === 0 ? (
                <div className="cp-panel-empty">Nessun addebito sospeso per {formatMese(mese)}</div>
              ) : (
                <div className="dc-sospesi-list">
                  {sospesi.map((s) => (
                    <div key={s.id} className="dc-sospesi-item">
                      {s.tipo === 'MEMO' ? <span title="Promemoria">📝</span> : null}
                      <span className="dc-sospesi-desc" title={s.padroncino?.ragioneSociale}>
                        {s.padroncino?.ragioneSociale ? `${s.padroncino.ragioneSociale} — ` : ''}{s.descrizione}
                      </span>
                      {s.importo != null && (
                        <span className="dc-sospesi-importo">{eur(s.importo)}</span>
                      )}
                      {s.meseOrigine && <span className="dc-sospesi-origine">da {s.meseOrigine}</span>}
                      <button
                        className="dc-sospesi-evadi"
                        title={s.tipo === 'MEMO' ? 'Segna come fatto' : 'Segna come evaso'}
                        onClick={() => handleEvadiSospeso(s.id)}
                      >
                        ✓ {s.tipo === 'MEMO' ? 'Fatto' : 'Evadi'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="cp-panel-footer">
                <button className="cp-panel-link" onClick={() => navigate('/addebiti-sospesi')}>
                  Gestisci tutti gli addebiti sospesi →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pannello Cose da fare */}
        <div className="cp-panel">
          <div className="cp-panel-head" onClick={toggleTodoOpen}>
            <span className="cp-panel-title">
              ✅ Cose da fare
              {tasks.filter(t => !t.completata).length > 0 && (
                <span className="cp-panel-count">{tasks.filter(t => !t.completata).length}</span>
              )}
            </span>
            <div className="cp-panel-head-actions">
              <button
                className="cp-nota-toggle"
                onClick={(e) => { e.stopPropagation(); handleOpenNewTask(); }}
              >
                + attività
              </button>
              <span className={`cp-panel-chevron ${todoOpen ? 'cp-panel-chevron-open' : ''}`} onClick={toggleTodoOpen}>▾</span>
            </div>
          </div>
          {todoOpen && (
            <div className="cp-panel-body">
              {tasks.length === 0 ? (
                <div className="cp-panel-empty">Nessuna attività registrata</div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} className={`task-list-item ${t.completata ? 'task-done' : ''}`} onClick={() => handleOpenEditTask(t)}>
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={t.completata}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleTask(t)}
                    />
                    <div className="task-body">
                      {t.padroncino && <span className="task-tag task-tag-pad">🏢 {t.padroncino}</span>}
                      <span className="task-text" title={t.testo}>{t.testo}</span>
                    </div>
                    <button className="task-remove" onClick={(e) => { e.stopPropagation(); handleRemoveTask(t.id); }} title="Elimina">✕</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        editingTask={editingTask}
      />

      <div className="cp-filters">
        <div className="cp-search-wrap">
          <span className="cp-search-icon">🔍</span>
          <input className="cp-search" placeholder="Cerca padroncino..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="cp-tabs">
          {STATI.map((s) => (
            <button key={s} className={`cp-tab ${filtroStato === s ? 'cp-tab-active' : ''}`} onClick={() => setFiltroStato(s)}>
              {STATI_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-table-wrap">
        {loading ? (
          <div className="cp-loading">⏳ Caricamento...</div>
        ) : error ? (
          <div className="cp-error">❌ {error} <button onClick={loadData}>Riprova</button></div>
        ) : (
          <table className="cp-table">
            <thead>
              <tr>
                <ThSort label="Padroncino" col="nome" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ThSort label="Stato" col="stato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 110 }} />
                <ThSort label="Mezzi" col="mezzi" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 64, textAlign: 'center' }} />
                <ThSort label="Palmari" col="palmari" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 64, textAlign: 'center' }} />
                <ThSort label="Fatturato c/IVA" col="fatturato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 130, textAlign: 'right' }} />
                <ThSort label="Addebiti" col="addebiti" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 120, textAlign: 'right' }} />
                <ThSort label="Comp." col="compensazioni" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 110, textAlign: 'right' }} />
                <ThSort label="Bonificato" col="netto" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 130, textAlign: 'right' }} />
                <ThSort label="📄" col="distribuzioneInviata" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 54, textAlign: 'center' }} title="Distribuzione inviata" />
                <ThSort label="📋" col="pdfAddebitiCreato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 54, textAlign: 'center' }} title="PDF Addebiti creato" />
                <ThSort label="🧾" col="fatturaCreata" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 54, textAlign: 'center' }} title="Fattura emessa da te" />
                <ThSort label="✅" col="fatturaRicevuta" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 54, textAlign: 'center' }} title="Fattura ricevuta dal padroncino" />
                <ThSort label="Progresso" col="progresso" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 120, textAlign: 'right' }} />
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={14} className="cp-empty-row">Nessun padroncino trovato</td></tr>
              ) : (
                sorted.map(({ padroncino: p, conteggio: c, checklist }) => {
                  const checksDone = Object.values(checklist).filter(Boolean).length;
                  const fin = c?.righe?.length ? calcolaRighe(c.righe) : null;
                  return (
                    <tr key={p.id} className="cp-row" onClick={() => navigate(`/conteggi/${p.id}?mese=${mese}`)}>
                      <td>
                        <div className="cp-padroncino-cell">
                          <span className="cp-padroncino-avatar" style={p.attivo === false ? { opacity: 0.5 } : undefined}>
                            {p.ragioneSociale.charAt(0)}
                          </span>
                          <div>
                            <div className="cp-padroncino-name" style={p.attivo === false ? { color: 'var(--text-muted)' } : undefined}>
                              {p.ragioneSociale}
                              {p.attivo === false && (
                                <span style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: 'rgba(239,68,68,.12)',
                                  color: '#dc2626',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  verticalAlign: 'middle',
                                }}>DISMESSO</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><StatoBadge stato={c?.stato ?? null} /></td>
                      <td className="cp-center">
                        <span className="cp-pill cp-pill-purple">{p.mezziAssegnati?.length ?? 0}</span>
                      </td>
                      <td className="cp-center">
                        <span className="cp-pill cp-pill-blue">{p.palmariAssegnati?.length ?? 0}</span>
                      </td>
                      {/* ── Colonne finanziarie ── */}
                      <td className="cp-right cp-netto" style={{ color: 'var(--primary)' }}>
                        {fin ? eur(fin.fatturato) : '—'}
                      </td>
                      <td className="cp-right cp-netto" style={{ color: '#ea580c' }}>
                        {fin ? eur(fin.addebiti) : '—'}
                      </td>
                      <td className="cp-right cp-netto" style={{ color: '#9333ea' }}>
                        {fin ? eur(fin.compensazioni) : '—'}
                      </td>
                      <td className="cp-right cp-netto">
                        {c?.netto != null ? (
                          <span className={c.netto >= 0 ? 'cp-pos' : 'cp-neg'}>{eur(c.netto)}</span>
                        ) : '—'}
                      </td>
        
                      {/* ── Colonne spunta (icona, ridotte) ── */}
                      <td className="cp-center"><CheckIcon done={checklist.distribuzioneInviata} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.pdfAddebitiCreato} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.fatturaCreata} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.fatturaRicevuta} /></td>
                      <td className="cp-right"><ProgressBar done={checksDone} total={4} /></td>
                      <td className="cp-center" onClick={(e) => e.stopPropagation()}>
                        <button className="cp-btn-open" onClick={() => navigate(`/conteggi/${p.id}?mese=${mese}`)}>→</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="cp-totals-row">
                  <td>Totale</td>
                  <td></td>
                  <td className="cp-center cp-netto">{totaliTabella.mezzi}</td>
                  <td className="cp-center cp-netto">{totaliTabella.palmari}</td>
                  <td className="cp-right cp-netto" style={{ color: 'var(--primary)' }}>{eur(totaliTabella.fatturato)}</td>
                  <td className="cp-right cp-netto" style={{ color: '#ea580c' }}>{eur(totaliTabella.addebiti)}</td>
                  <td className="cp-right cp-netto" style={{ color: '#9333ea' }}>{eur(totaliTabella.compensazioni)}</td>
                  <td className="cp-right cp-netto">
                    <span className={totaliTabella.netto >= 0 ? 'cp-pos' : 'cp-neg'}>{eur(totaliTabella.netto)}</span>
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}