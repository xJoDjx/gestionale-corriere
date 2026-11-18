// src/features/ricariche/RicaricheElettriche.tsx
import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { api, mezziApi } from '../../lib/api';
import { parseDecimale, parseDecimaleOr } from '../../lib/numeri';
import './RicaricheElettriche.css';
import '../padroncini/Padroncini2.css';
import './Ricariche2.css';
import { Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SegTabs, SearchBox, Select, Th, Empty, Alert, Icon, BarStrip, C, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';

type SortDir = 'asc' | 'desc';
type AppView = 'dashboard' | 'detail';

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface SessioneDB {
  id?: string;
  targa: string;
  tipoRicarica: 'INTERNA' | 'ESTERNA';
  stazione?: string | null;
  durata?: string | null;
  inizioSessione?: string | null;
  kwh: number;
  costoUnitario: number;
  costoBase: number;
  maggiorazione: number;
  costoFinale: number;
  categoriaMezzo?: string | null;
  padroncino?: string | null;
}

interface Tariffe {
  costoInternoKwh: number | null;
  costoEsternoKwh: number | null;
  fatturaImporto: number | null;
  fatturaKwh: number | null;
}

interface MeseEntry { mese: string; count: number }

/** Statistiche aggregate per un singolo mese (calcolate lato client da sessioni) */
interface MeseStats {
  kwhTot: number;
  kwhInt: number;
  kwhExt: number;
  costoTot: number;
  costoInt: number;
  costoExt: number;
  mezziCount: number;
  /** Solo per il grafico: quota delle sessioni con padroncino (addebitata ai PDA) */
  costoPda: number;
}

interface MezzoInfo {
  id: string;
  targa: string;
  maggiorazioneRicarica: number | null;
  padroncino: string | null;
  utilizzatore: string | null;
  categoria: string | null;
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

interface RigaCSV {
  driver: string; targa: string; sessionId: string;
  durata: string; stazione: string; inizioSessione: string; fineSessione: string;
  energiaKwh: number;
}

function normalizeTarga(value?: string | null): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseEnergy(raw: string): number {
  if (!raw || raw.trim() === '0') return 0;
  return parseDecimaleOr(raw, 0);
}
function isInterna(stazione: string): boolean {
  return stazione.toLowerCase().includes('juice');
}
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): RigaCSV[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  lines[0] = lines[0].replace(/^\uFEFF/, '');
  const sep = lines[0].includes(';') ? ';' : ',';
  return lines.slice(1).map((line) => {
    let cols = splitCsvLine(line, sep);
    if (cols.length === 1 && cols[0].includes(sep)) {
      cols = splitCsvLine(cols[0], sep);
    }
    return {
      driver: cols[1]?.trim() ?? '', targa: cols[2]?.trim() ?? '',
      sessionId: cols[5]?.trim() ?? '', durata: cols[6]?.trim() ?? '',
      stazione: cols[7]?.trim() ?? '', fineSessione: cols[8]?.trim() ?? '',
      inizioSessione: cols[9]?.trim() ?? '',
      energiaKwh: parseEnergy(cols[10]?.trim() ?? '0'),
    };
  }).filter((r) => r.driver && r.driver !== 'Driver' && r.targa && r.energiaKwh > 0);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtE  = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtE4 = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtK  = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function catLabel(cat?: string | null): { label: string; cls: string } {
  if (!cat) return { label: '—', cls: '' };
  const c = cat.toUpperCase();
  if (c.includes('FLOTTA')) return { label: '🏢 Flotta', cls: 'ric-cat-flotta' };
  if (c.includes('AUTO')) return { label: '🚗 Az.', cls: 'ric-cat-auto' };
  return { label: '🚛 Dist.', cls: 'ric-cat-dist' };
}

function getCurrentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

/** Formatta "2026-03" → "Marzo 2026" */
function formatMese(mese: string): string {
  const [year, month] = mese.split('-');
  const nomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  return `${nomi[parseInt(month, 10) - 1] ?? month} ${year}`;
}

// ─── Componente principale ────────────────────────────────────────────────────
export default function RicaricheElettriche() {
  // ── viste ──
  const [appView, setAppView]   = useState<AppView>('detail');

  const [mese, setMese]         = useState(getCurrentMonth());
  const [tab, setTab]           = useState<'riepilogo' | 'dettaglio'>('riepilogo');

  // tariffe
  const [fatturaImporto, setFatturaImporto] = useState('');
  const [fatturaKwh, setFatturaKwh]         = useState('');
  const [costoEsterno, setCostoEsterno]     = useState('0.840');
  const [magDefault, setMagDefault]         = useState('20');

  // DB state
  const [sessioni, setSessioni]             = useState<SessioneDB[]>([]);
  const [tariffe, setTariffe]               = useState<Tariffe | null>(null);
  const [mesiDisp, setMesiDisp]             = useState<MeseEntry[]>([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // CSV & Import
  const [righeAnteprima, setRigheAnteprima] = useState<RigaCSV[]>([]);
  const [nomeFile, setNomeFile]             = useState('');
  const [dragOver, setDragOver]             = useState(false);
  const [showImport, setShowImport]         = useState(false);
  const fileRef                             = useRef<HTMLInputElement>(null);

  // Mezzi
  const [mezziMap, setMezziMap]             = useState<Map<string, MezzoInfo>>(new Map());

  // Filtri dettaglio
  const [filtroTipo, setFiltroTipo]         = useState<'TUTTI' | 'INTERNA' | 'ESTERNA'>('TUTTI');
  const [search, setSearch]                 = useState('');
  const [espansoTarga, setEspansoTarga]     = useState<string | null>(null);

  // Filtri riepilogo (tabella per targa)
  const [searchRiep, setSearchRiep]                 = useState('');
  const [filtroCategoriaRiep, setFiltroCategoriaRiep] = useState<'TUTTI' | 'DISTRIBUZIONE' | 'AUTO_AZIENDALE' | 'FLOTTA'>('TUTTI');

  // Edit inline maggiorazione
  const [editMagTarga, setEditMagTarga]     = useState<string | null>(null);
  const [editMagVal, setEditMagVal]         = useState<string>('');
  const [savingMag, setSavingMag]           = useState(false);

  // Ordinamento
  const [sortRiep, setSortRiep] = useState<{ col: string; dir: SortDir }>({ col: 'costoTot', dir: 'desc' });
  const [sortDett, setSortDett] = useState<{ col: string; dir: SortDir }>({ col: 'inizioSessione', dir: 'desc' });

  // ── Dashboard: statistiche aggregate per tutti i mesi ──
  const [mesiStats, setMesiStats]   = useState<Record<string, MeseStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  // ── carica mezzi ──
  const caricaMezzi = useCallback(async () => {
    try {
      const res = await mezziApi.list({ limit: '500' });
      const map = new Map<string, MezzoInfo>();
      for (const m of res.data) {
        const ass = (m as any).assegnazioni?.find((a: any) => !a.dataFine);
        map.set(normalizeTarga(m.targa), {
          id: m.id, targa: m.targa,
          maggiorazioneRicarica: (m as any).maggiorazioneRicarica ?? null,
          padroncino: ass?.padroncino?.ragioneSociale ?? null,
          utilizzatore: (m as any).utilizzatore ?? null,
          categoria: m.categoria ?? null,
        });
      }
      setMezziMap(map);
    } catch { /* ignora */ }
  }, []);

  // ── carica dati mese dal DB ──
  const caricaMese = useCallback(async (m: string) => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<{ mese: string; tariffe: Tariffe | null; sessioni: SessioneDB[] }>(`/ricariche?mese=${m}`);
      setSessioni(res.sessioni ?? []);
      setTariffe(res.tariffe);
      if (res.tariffe) {
        setFatturaImporto(res.tariffe.fatturaImporto ? String(res.tariffe.fatturaImporto) : '');
        setFatturaKwh(res.tariffe.fatturaKwh ? String(res.tariffe.fatturaKwh) : '');
        setCostoEsterno(res.tariffe.costoEsternoKwh ? String(res.tariffe.costoEsternoKwh) : '0.840');
      }
    } catch (e: any) { setError(e.message ?? 'Errore caricamento'); }
    finally { setLoading(false); }
  }, []);

  const caricaMesi = useCallback(async () => {
    try { setMesiDisp(await api.get<MeseEntry[]>('/ricariche/mesi')); } catch { /* ignora */ }
  }, []);

  /** Carica statistiche aggregate per tutti i mesi (per la dashboard) */
  const caricaSommari = useCallback(async (mesiList: MeseEntry[]) => {
    if (!mesiList.length) return;
    setLoadingStats(true);
    try {
      const results = await Promise.all(
        mesiList.map(m =>
          api.get<{ mese: string; tariffe: Tariffe | null; sessioni: SessioneDB[] }>(`/ricariche?mese=${m.mese}`)
            .then(res => ({ mese: m.mese, sessioni: res.sessioni ?? [] }))
            .catch(() => ({ mese: m.mese, sessioni: [] as SessioneDB[] }))
        )
      );
      const statsMap: Record<string, MeseStats> = {};
      for (const r of results) {
        const int = r.sessioni.filter(s => s.tipoRicarica === 'INTERNA');
        const ext = r.sessioni.filter(s => s.tipoRicarica === 'ESTERNA');
        statsMap[r.mese] = {
          kwhTot:     r.sessioni.reduce((a, s) => a + s.kwh, 0),
          kwhInt:     int.reduce((a, s) => a + s.kwh, 0),
          kwhExt:     ext.reduce((a, s) => a + s.kwh, 0),
          costoTot:   r.sessioni.reduce((a, s) => a + s.costoFinale, 0),
          costoInt:   int.reduce((a, s) => a + s.costoFinale, 0),
          costoExt:   ext.reduce((a, s) => a + s.costoFinale, 0),
          mezziCount: new Set(r.sessioni.map(s => s.targa)).size,
          costoPda:   r.sessioni.filter(s => !!s.padroncino).reduce((a, s) => a + s.costoFinale, 0),
        };
      }
      setMesiStats(statsMap);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { caricaMezzi(); caricaMesi(); }, [caricaMezzi, caricaMesi]);
  useEffect(() => { caricaMese(mese); }, [mese, caricaMese]);
  // Ricarica sommari ogni volta che l'elenco mesi cambia (primo caricamento + dopo import)
  useEffect(() => { if (mesiDisp.length > 0) caricaSommari(mesiDisp); }, [mesiDisp, caricaSommari]);

  const costoInternoKwh = useMemo(() => {
    const imp = parseDecimale(fatturaImporto);
    const kwh = parseDecimale(fatturaKwh);
    if (!imp || !kwh || kwh === 0) return null;
    return imp / kwh;
  }, [fatturaImporto, fatturaKwh]);

  const handleAggiornaTariffe = async () => {
    if (!costoInternoKwh) return alert('Inserisci dati validi per la bolletta (Importo e kWh).');
    setSaving(true);
    try {
      await api.put(`/ricariche/${mese}/tariffe`, {
        fatturaImporto: parseDecimale(fatturaImporto),
        fatturaKwh: parseDecimale(fatturaKwh),
        costoEsternoKwh: parseDecimaleOr(costoEsterno, 0),
      });
      await caricaMese(mese);
      alert('Tariffe aggiornate e sessioni ricalcolate con successo!');
    } catch (e: any) {
      alert('Errore aggiornamento tariffe: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const leggiFile = (f: File) => {
    setNomeFile(f.name);
    const reader = new FileReader();
    reader.onload = (e) => setRigheAnteprima(parseCSV(e.target?.result as string));
    reader.readAsText(f, 'utf-8');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.name.endsWith('.csv')) leggiFile(f);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) leggiFile(f);
    if (e.target) e.target.value = '';
  };

  const handleConfermaImport = async () => {
    if (!costoInternoKwh) {
      return alert('Inserisci importo fattura e kWh per calcolare il costo interno prima di importare.');
    }
    setSaving(true);
    try {
      const costoInt = costoInternoKwh;
      const costoExt = parseDecimaleOr(costoEsterno, 0);
      const magDef   = parseDecimaleOr(magDefault, 20);
      const fatImp   = parseDecimaleOr(fatturaImporto, 0);
      const fatKwh   = parseDecimaleOr(fatturaKwh, 0);

      const sess = righeAnteprima.map((r) => {
        const targaNorm = normalizeTarga(r.targa);
        const tipo: 'INTERNA' | 'ESTERNA' = isInterna(r.stazione) ? 'INTERNA' : 'ESTERNA';
        const mInfo = mezziMap.get(targaNorm);
        const mag   = mInfo?.maggiorazioneRicarica ?? magDef;
        const cu    = tipo === 'INTERNA' ? costoInt : costoExt;
        const base  = r.energiaKwh * cu;
        const tot   = base * (1 + mag / 100);

        return {
          targa:            targaNorm || r.targa.toUpperCase(),
          sessioneId:       r.sessionId,
          tipoRicarica:     tipo,
          stazione:         r.stazione,
          durata:           r.durata,
          inizioSessione:   r.inizioSessione,
          fineSessione:     r.fineSessione,
          kwh:              r.energiaKwh,
          costoUnitario:    cu,
          costoBase:        base,
          maggiorazione:    mag,
          importo:          isFinite(tot) ? tot : 0,
          costoInternoKwh:  costoInt,
          costoEsternoKwh:  costoExt,
          fatturaImporto:   fatImp,
          fatturaKwh:       fatKwh,
        };
      });

      await api.post('/ricariche/importa', { mese, sessioni: sess });

      setShowImport(false);
      setRigheAnteprima([]);
      setNomeFile('');
      await Promise.all([caricaMese(mese), caricaMesi()]);
    } catch (e: any) {
      alert('Errore importazione: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const annullaImport = () => {
    setRigheAnteprima([]);
    setNomeFile('');
  };

  const eliminaMese = async () => {
    if (!confirm(`Eliminare tutti i dati di ${mese}?`)) return;
    try {
      await api.delete(`/ricariche/${mese}`);
      setSessioni([]); setTariffe(null);
      setFatturaImporto(''); setFatturaKwh(''); setCostoEsterno('0.840');
      await caricaMesi();
      setAppView('dashboard');
    } catch (e: any) {
      alert('Errore eliminazione: ' + e.message);
    }
  };

  const salvaMaggiorazione = async (targa: string, nuovaMag: number) => {
    setSavingMag(true);
    try {
      await api.patch(`/ricariche/${mese}/maggiorazione-targa`, { targa, maggiorazione: nuovaMag });
      setSessioni((prev) => prev.map((s) => {
        if (s.targa !== targa) return s;
        const nuovoTot = s.costoBase * (1 + nuovaMag / 100);
        return { ...s, maggiorazione: nuovaMag, costoFinale: nuovoTot };
      }));
      setMezziMap((prev) => {
        const next = new Map(prev);
        const info = next.get(targa);
        if (info) next.set(targa, { ...info, maggiorazioneRicarica: nuovaMag });
        return next;
      });
    } catch (e: any) {
      alert('Errore salvataggio maggiorazione: ' + e.message);
    } finally {
      setSavingMag(false);
      setEditMagTarga(null);
    }
  };

  const sessFiltr = useMemo(() => sessioni.filter((s) => {
    if (filtroTipo !== 'TUTTI' && s.tipoRicarica !== filtroTipo) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.targa.toLowerCase().includes(q) ||
        (s.padroncino ?? '').toLowerCase().includes(q) ||
        (s.stazione ?? '').toLowerCase().includes(q);
    }
    return true;
  }), [sessioni, filtroTipo, search]);

  const stats = useMemo(() => {
    const int = sessioni.filter((s) => s.tipoRicarica === 'INTERNA');
    const ext = sessioni.filter((s) => s.tipoRicarica === 'ESTERNA');
    const costoBaseInt = int.reduce((a, r) => a + r.costoBase, 0);
    const costoBaseExt = ext.reduce((a, r) => a + r.costoBase, 0);
    const costoTot = sessioni.reduce((a, r) => a + r.costoFinale, 0);
    const costoBaseTot = costoBaseInt + costoBaseExt;
    const margine = costoTot - costoBaseTot;
    const marginePct = costoTot > 0 ? (margine / costoTot) * 100 : 0;
    return {
      tot: sessioni.length,
      kwhTot: sessioni.reduce((a, r) => a + r.kwh, 0),
      costoTot,
      kwhInt: int.reduce((a, r) => a + r.kwh, 0), costoInt: int.reduce((a, r) => a + r.costoFinale, 0),
      kwhExt: ext.reduce((a, r) => a + r.kwh, 0), costoExt: ext.reduce((a, r) => a + r.costoFinale, 0),
      // costo reale senza maggiorazione applicata al padroncino
      costoBaseInt, costoBaseExt, costoBaseTot,
      margine, marginePct,
    };
  }, [sessioni]);

  const riepilogo = useMemo(() => {
    const map = new Map<string, {
      targa: string; padroncino: string | null; categoria: string | null;
      kwhInt: number; kwhExt: number; costoInt: number; costoExt: number;
      costoBaseInt: number; costoBaseExt: number;
      costoTot: number; sessioni: SessioneDB[];
    }>();
    for (const s of sessioni) {
      if (!map.has(s.targa)) {
        const infoMezzo = mezziMap.get(s.targa);
        map.set(s.targa, {
          targa: s.targa,
          padroncino: s.padroncino ?? infoMezzo?.padroncino ?? infoMezzo?.utilizzatore ?? null,
          categoria:  s.categoriaMezzo ?? infoMezzo?.categoria ?? null,
          kwhInt: 0, kwhExt: 0, costoInt: 0, costoExt: 0,
          costoBaseInt: 0, costoBaseExt: 0,
          costoTot: 0,
          sessioni: [],
        });
      }
      const e = map.get(s.targa)!;
      if (s.tipoRicarica === 'INTERNA') { e.kwhInt += s.kwh; e.costoInt += s.costoFinale; e.costoBaseInt += s.costoBase; }
      else { e.kwhExt += s.kwh; e.costoExt += s.costoFinale; e.costoBaseExt += s.costoBase; }
      e.costoTot += s.costoFinale;
      e.sessioni.push(s);
    }
    return Array.from(map.values());
  }, [sessioni, mezziMap]);

  const riepilogoFiltrato = useMemo(() => riepilogo.filter((r) => {
    if (filtroCategoriaRiep !== 'TUTTI' && (r.categoria ?? '').toUpperCase() !== filtroCategoriaRiep) return false;
    if (searchRiep) {
      const q = searchRiep.toLowerCase();
      return r.targa.toLowerCase().includes(q) || (r.padroncino ?? '').toLowerCase().includes(q);
    }
    return true;
  }), [riepilogo, filtroCategoriaRiep, searchRiep]);

  const hasDati = sessioni.length > 0;

  const sortedRiepilogo = useMemo(() => {
    const arr = [...riepilogoFiltrato];
    const { col, dir } = sortRiep;
    arr.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (col === 'maggiorazione') {
        va = a.sessioni[0]?.maggiorazione ?? 0;
        vb = b.sessioni[0]?.maggiorazione ?? 0;
      } else {
        va = (a as unknown as Record<string, unknown>)[col] as string | number ?? '';
        vb = (b as unknown as Record<string, unknown>)[col] as string | number ?? '';
      }
      if (typeof va === 'string') { const cmp = va.localeCompare(vb as string, 'it'); return dir === 'asc' ? cmp : -cmp; }
      return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [riepilogoFiltrato, sortRiep]);

  const sortedSessFiltr = useMemo(() => {
    const arr = [...sessFiltr];
    const { col, dir } = sortDett;
    arr.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[col] as string | number ?? '';
      const vb = (b as unknown as Record<string, unknown>)[col] as string | number ?? '';
      if (typeof va === 'string') { const cmp = va.localeCompare(vb as string, 'it'); return dir === 'asc' ? cmp : -cmp; }
      return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [sessFiltr, sortDett]);

  const toggleRiep = (col: string) =>
    setSortRiep(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));
  const toggleDett = (col: string) =>
    setSortDett(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));
  const sortIcon = (col: string, active: { col: string; dir: SortDir }) =>
    active.col === col ? (active.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  const exportReport = () => {
    const headers = ['Targa', 'Padroncino', 'Categoria', 'kWh Int.', 'Costo Int. (€)', 'kWh Ext.', 'Costo Ext. (€)', 'Mag.%', 'Totale (€)', 'N° Sessioni'];
    const toRow = (r: typeof riepilogo[0]) => [
      r.targa, r.padroncino ?? '', r.categoria ?? '',
      r.kwhInt, r.costoInt, r.kwhExt, r.costoExt,
      r.sessioni[0]?.maggiorazione ?? 0, r.costoTot, r.sessioni.length,
    ];
    const dist = sortedRiepilogo.filter(r => !r.categoria?.toUpperCase().includes('AUTO'));
    const auto = sortedRiepilogo.filter(r => r.categoria?.toUpperCase().includes('AUTO'));
    const addTotaleRow = (rows: ReturnType<typeof toRow>[]) => {
      if (rows.length === 0) return rows;
      const totRow = ['TOTALE','','',
        rows.reduce((s,r)=>s+(r[3] as number),0), rows.reduce((s,r)=>s+(r[4] as number),0),
        rows.reduce((s,r)=>s+(r[5] as number),0), rows.reduce((s,r)=>s+(r[6] as number),0),
        '', rows.reduce((s,r)=>s+(r[8] as number),0), rows.reduce((s,r)=>s+(r[9] as number),0),
      ];
      return [...rows, totRow];
    };
    const wb = XLSX.utils.book_new();
    const makeSheet = (data: typeof riepilogo) => {
      const rows = addTotaleRow(data.map(toRow));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [12,28,16,10,14,10,14,8,12,10].map(w => ({ wch: w }));
      return ws;
    };
    XLSX.utils.book_append_sheet(wb, makeSheet(dist), 'Distribuzione');
    XLSX.utils.book_append_sheet(wb, makeSheet(auto), 'Auto Aziendali');
    XLSX.writeFile(wb, `ricariche_${mese}.xlsx`);
  };

  // ── Valori calcolati per dashboard ──────────────────────────────────────────

  const dashStats = useMemo(() => {
    const values = Object.values(mesiStats);
    if (!values.length) return null;
    return {
      totSessioni: mesiDisp.reduce((a, m) => a + m.count, 0),
      totKwh:      values.reduce((a, v) => a + v.kwhTot, 0),
      totCosto:    values.reduce((a, v) => a + v.costoTot, 0),
      totInt:      values.reduce((a, v) => a + v.costoInt, 0),
      totExt:      values.reduce((a, v) => a + v.costoExt, 0),
    };
  }, [mesiStats, mesiDisp]);

  // Mesi ordinati: ascendente (per calcolo trend) e discendente (per display)
  const mesiAsc  = useMemo(() => [...mesiDisp].sort((a,b) => a.mese.localeCompare(b.mese)), [mesiDisp]);
  const mesiDesc = useMemo(() => [...mesiDisp].sort((a,b) => b.mese.localeCompare(a.mese)), [mesiDisp]);

  const meseLabel   = formatMese(mese);
  const mezziCount  = useMemo(() => new Set(sessioni.map(s => s.targa)).size, [sessioni]);
  const topVeicoli  = useMemo(() => [...riepilogo].sort((a,b) => b.costoTot - a.costoTot).slice(0,5), [riepilogo]);

  const apriMese = (m: string) => { setMese(m); setAppView('detail'); };

  // ── dashboard int/ext split (su tutti i mesi) ────────────────────────────
  const splitPct = useMemo(() => {
    if (!dashStats) return { int: 25, ext: 75 };
    const tot = dashStats.totInt + dashStats.totExt;
    const int = tot > 0 ? Math.round(dashStats.totInt / tot * 100) : 25;
    return { int, ext: 100 - int };
  }, [dashStats]);

  // ── Solo visualizzazione ─────────────────────────────────────────────────
  // All'apertura mostra l'ultimo mese con dati (se il mese corrente è vuoto)
  const [autoMese, setAutoMese] = useState(false);
  useEffect(() => {
    if (autoMese || mesiDesc.length === 0) return;
    setAutoMese(true);
    if (!mesiDisp.some((m) => m.mese === mese)) setMese(mesiDesc[0].mese);
  }, [autoMese, mesiDesc, mesiDisp, mese]);
  const costoPda = useMemo(() => sessioni.filter((x) => !!x.padroncino).reduce((a, x) => a + x.costoFinale, 0), [sessioni]);
  const nInt = sessioni.filter((x) => x.tipoRicarica === 'INTERNA').length;
  const nExt = sessioni.length - nInt;
  const idxMese = mesiAsc.findIndex((m) => m.mese === mese);
  const prevStats = idxMese > 0 ? mesiStats[mesiAsc[idxMese - 1].mese] : null;
  const deltaTot = prevStats && prevStats.costoTot ? ((stats.costoTot - prevStats.costoTot) / prevStats.costoTot) * 100 : null;
  const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const trend = mesiAsc.slice(-8).map((m) => {
    const st = mesiStats[m.mese];
    return {
      label: MESI3[parseInt(m.mese.slice(5), 10) - 1], mese: m.mese,
      total: st?.costoTot ?? 0, part: st?.costoPda ?? 0,
      valueLabel: st ? `${fmtNum2(st.costoTot / 1000, 1)}k` : '',
      tip: st ? `${formatMese(m.mese)} · totale ${fmtEur2(st.costoTot)} · addebitato ${fmtEur2(st.costoPda)}` : formatMese(m.mese),
    };
  });
  const mediaMensile = trend.length ? trend.reduce((a, t) => a + t.total, 0) / trend.length : 0;
  const CAT: Record<string, [string, string]> = { DISTRIBUZIONE: ['Distribuzione', C.teal], FLOTTA: ['Flotta', C.blue], AUTO_AZIENDALE: ['Aziendale', C.purple] };
  const catOf = (c?: string | null): [string, string] => {
    const u = (c ?? '').toUpperCase();
    return u.includes('FLOTTA') ? CAT.FLOTTA : u.includes('AUTO') ? CAT.AUTO_AZIENDALE : u ? CAT.DISTRIBUZIONE : ['Senza categoria', '#A1A1AA'];
  };
  const nCat = (k: string) => riepilogo.filter((r) => (r.categoria ?? '').toUpperCase() === k).length;
  const meseOpts = Array.from(new Set([...mesiDesc.map((m) => m.mese), mese])).sort().reverse();
  const kwh = (n: number) => fmtNum2(n, 2);
  const sortObj = (o: { col: string; dir: SortDir }) => ({ key: o.col, dir: o.dir });

  return (
    <Page>
      <PageHeader
        eyebrow="Costi"
        title="Ricariche elettriche"
        sub="Sessioni JuiceBox e rete pubblica, maggiorazione e addebito ai padroncini"
        actions={<>
          <Select label="Mese" value={appView === 'dashboard' ? 'STORICO' : mese}
            onChange={(v) => { if (v === 'STORICO') setAppView('dashboard'); else apriMese(v); }}
            options={[...meseOpts.map((m) => ({ value: m, label: formatMese(m) })), { value: 'STORICO', label: 'Tutti i mesi (storico)' }]} />
          {appView === 'detail' && <>
            <Button icon="download" onClick={exportReport} disabled={!hasDati}>Esporta</Button>
            {hasDati && <Button icon="trash" variant="danger" onClick={eliminaMese}>Elimina mese</Button>}
            <Button icon="upload" variant="primary" onClick={() => setShowImport((v) => !v)}>{hasDati ? 'Sostituisci file del mese' : 'Importa file del mese'}</Button>
          </>}
        </>}
      />

      {appView === 'dashboard' ? (<>
        <Kpis items={[
          { label: 'Sessioni', value: dashStats ? fmtNum2(dashStats.totSessioni) : '—', sub: `${mesiDisp.length} mesi caricati`, color: C.teal, icon: 'ric' },
          { label: 'Energia', value: dashStats ? `${fmtNum2(dashStats.totKwh, 1)} kWh` : '—', sub: 'Tutti i mesi', color: C.blue, icon: 'goccia' },
          { label: 'Ricariche interne', value: dashStats ? fmtEur2(dashStats.totInt) : '—', sub: `${splitPct.int}% del totale`, color: C.green, icon: 'ok' },
          { label: 'Totale storico', value: dashStats ? fmtEur2(dashStats.totCosto) : '—', sub: `Esterne ${dashStats ? fmtEur2(dashStats.totExt) : '—'}`, color: C.orange, icon: 'euro' },
        ]} />
        <Card>
          <CardHead bar title="Mesi caricati" sub={loadingStats ? 'Calcolo in corso…' : 'Clic su un mese per aprirlo'} />
          {mesiDesc.length === 0 ? <Empty>Nessun mese caricato. Scegli un mese e importa il file delle sessioni.</Empty> : (
            <div className="ds-tablewrap">
              <table className="ds-table">
                <thead><tr><Th>Mese</Th><Th right>Sessioni</Th><Th right>kWh</Th><Th right>Interne</Th><Th right>Esterne</Th><Th right>Addebitato ai PDA</Th><Th right>Totale</Th><Th right>Δ mese prima</Th><Th right>Mezzi</Th></tr></thead>
                <tbody>
                  {mesiDesc.map((m) => {
                    const st = mesiStats[m.mese];
                    const i = mesiAsc.findIndex((x) => x.mese === m.mese);
                    const pv = i > 0 ? mesiStats[mesiAsc[i - 1].mese] : null;
                    const d = st && pv && pv.costoTot ? ((st.costoTot - pv.costoTot) / pv.costoTot) * 100 : null;
                    return (
                      <tr key={m.mese} className="is-clickable" onClick={() => apriMese(m.mese)}>
                        <td style={{ fontWeight: 600 }}>{formatMese(m.mese)}</td>
                        <td className="r">{fmtNum2(m.count)}</td>
                        <td className="r">{st ? fmtNum2(st.kwhTot, 1) : '—'}</td>
                        <td className="r">{st ? fmtEur2(st.costoInt) : '—'}</td>
                        <td className="r">{st ? fmtEur2(st.costoExt) : '—'}</td>
                        <td className="r">{st ? fmtEur2(st.costoPda) : '—'}</td>
                        <td className="r" style={{ fontWeight: 600 }}>{st ? fmtEur2(st.costoTot) : '—'}</td>
                        <td className="r" style={{ color: d == null ? '#6B6B73' : d > 0 ? '#B91C1C' : '#15803D', fontWeight: 600 }}>{d == null ? '—' : `${d >= 0 ? '+' : '−'}${fmtNum2(Math.abs(d), 1)}%`}</td>
                        <td className="r">{st?.mezziCount ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>) : (<>
        {hasDati && (
          <Kpis items={[
            { label: 'Sessioni', value: stats.tot, sub: `${nInt} interne · ${nExt} su rete pubblica`, color: C.teal, icon: 'ric',
              seg: [{ w: stats.tot ? (nInt / stats.tot) * 100 : 0, color: C.teal }, { w: stats.tot ? (nExt / stats.tot) * 100 : 0, color: C.orange }] },
            { label: 'Energia', value: `${fmtNum2(stats.kwhTot, 1)} kWh`, sub: `Esterne ${fmtNum2(stats.kwhExt, 1)} kWh`, color: C.blue, icon: 'goccia' },
            { label: 'Costo senza maggiorazione', value: fmtEur2(stats.costoBaseTot), sub: `Interne ${fmtEur2(stats.costoBaseInt)} · esterne ${fmtEur2(stats.costoBaseExt)}`, color: '#71717A', icon: 'euro' },
            { label: 'Totale del mese', value: fmtEur2(stats.costoTot), color: C.green, icon: 'cont',
              sub: `Addebitato ai PDA ${fmtEur2(costoPda)}${deltaTot != null ? ` · ${deltaTot >= 0 ? '+' : '−'}${fmtNum2(Math.abs(deltaTot), 1)}% vs ${formatMese(mesiAsc[idxMese - 1].mese).split(' ')[0].toLowerCase()}` : ''}` },
          ]} />
        )}

        <div className="ds-g4">
          <Card pad className="ds-s2">
            <CardHead title="Andamento" sub={trend.length ? `Media mensile ${fmtEur2(mediaMensile)} · ${formatMese(trend[0].mese).split(' ')[0].toLowerCase()}–${formatMese(trend[trend.length - 1].mese).split(' ')[0].toLowerCase()}` : 'Nessun mese caricato'} />
            {trend.length > 0 && (
              <BarStrip data={trend} palette="green" legend={['Totale', 'Addebitato ai PDA']}
                selected={Math.max(0, trend.findIndex((t) => t.mese === mese))}
                onSelect={(i) => apriMese(trend[i].mese)}
                ariaLabel="Ricariche per mese: totale e quota addebitata ai padroncini" />
            )}
          </Card>
          <Card pad className="ds-s2">
            <CardHead title="Tariffe del mese"
              sub={`Fattura e parametri di calcolo${costoInternoKwh ? ` · costo interno ricavato € ${fmtE4(costoInternoKwh)} al kWh` : ''}`}
              actions={<Button size="sm" icon="check" onClick={handleAggiornaTariffe} disabled={saving || !costoInternoKwh || !hasDati}
                title="Salva le tariffe e ricalcola le sessioni del mese">{saving ? 'Salvataggio…' : 'Salva tariffe'}</Button>} />
            <div className="ric2-grid">
              <label className="ds-field"><span>Importo fattura (€)</span>
                <input className="ds-input" type="text" inputMode="decimal" placeholder="1.250,00" value={fatturaImporto} onChange={(e) => setFatturaImporto(e.target.value)} /></label>
              <label className="ds-field"><span>kWh fatturati</span>
                <input className="ds-input" type="text" inputMode="decimal" placeholder="2850" value={fatturaKwh} onChange={(e) => setFatturaKwh(e.target.value)} /></label>
              <label className="ds-field"><span>Costo kWh esterno (€)</span>
                <input className="ds-input" type="text" inputMode="decimal" placeholder="0,840" value={costoEsterno} onChange={(e) => setCostoEsterno(e.target.value)} /></label>
              <label className="ds-field"><span>% maggiorazione predefinita</span>
                <input className="ds-input" type="text" inputMode="decimal" value={magDefault} onChange={(e) => setMagDefault(e.target.value)} title="Usata all'importazione per i mezzi senza maggiorazione propria" /></label>
              <div className="ds-field"><span>Costo kWh interno</span>
                <span className="ric2-ro">{costoInternoKwh ? `€ ${fmtE4(costoInternoKwh)}` : 'Inserisci fattura e kWh'}</span></div>
              {tariffe && <div className="ds-field"><span>Salvato a sistema</span>
                <span className="ric2-ro" style={{ fontWeight: 500 }}>{tariffe.costoInternoKwh != null ? `int. € ${fmtE4(tariffe.costoInternoKwh)}` : '—'}{tariffe.costoEsternoKwh != null ? ` · est. € ${fmtE4(tariffe.costoEsternoKwh)}` : ''}</span></div>}
            </div>
          </Card>
        </div>

        {showImport && (
          <Card pad>
            <CardHead title={`Importa sessioni di ${meseLabel.toLowerCase()}`} sub="File CSV esportato da JuiceBox"
              actions={<IconButton icon="close" label="Chiudi" onClick={() => { setShowImport(false); annullaImport(); }} />} />
            {righeAnteprima.length === 0 ? (
              <div className={`ric2-drop${dragOver ? ' is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFileChange} />
                <Icon name="upload" size={20} />
                <span style={{ fontWeight: 600 }}>{hasDati ? `Sostituisci i dati di ${meseLabel.toLowerCase()}` : `Carica il CSV di ${meseLabel.toLowerCase()}`}</span>
                <span className="ds-cardsub">Trascina il file o clicca per sceglierlo</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Alert tone="info" title={`${nomeFile}: ${righeAnteprima.length} sessioni rilevate.`}>Controlla le tariffe e conferma l'importazione.</Alert>
                <div className="ric2-grid">
                  <label className="ds-field"><span>Importo fattura (€)</span>
                    <input className="ds-input" type="text" inputMode="decimal" placeholder="1.250,00" value={fatturaImporto} onChange={(e) => setFatturaImporto(e.target.value)} /></label>
                  <label className="ds-field"><span>kWh fatturati</span>
                    <input className="ds-input" type="text" inputMode="decimal" placeholder="2850" value={fatturaKwh} onChange={(e) => setFatturaKwh(e.target.value)} /></label>
                  <div className="ds-field"><span>Costo kWh interno</span><span className="ric2-ro">{costoInternoKwh ? `€ ${fmtE4(costoInternoKwh)} calcolato` : 'Inserisci fattura e kWh'}</span></div>
                  <label className="ds-field"><span>Costo kWh esterno (€)</span>
                    <input className="ds-input" type="text" inputMode="decimal" placeholder="0,840" value={costoEsterno} onChange={(e) => setCostoEsterno(e.target.value)} /></label>
                  <label className="ds-field"><span>% predefinita (se non impostata sul mezzo)</span>
                    <input className="ds-input" type="text" inputMode="decimal" value={magDefault} onChange={(e) => setMagDefault(e.target.value)} /></label>
                </div>
                <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
                  <Button onClick={annullaImport} disabled={saving}>Cambia file</Button>
                  <Button variant="primary" icon="check" onClick={handleConfermaImport} disabled={saving || !costoInternoKwh}>{saving ? 'Salvataggio…' : 'Conferma importazione'}</Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {loading ? <Card pad><Empty>Caricamento…</Empty></Card>
          : error ? <Alert tone="ko" title="Errore di caricamento">{error}</Alert>
          : !hasDati ? (
            <Card pad><Empty>Nessuna sessione per {meseLabel.toLowerCase()}. Usa "Importa file del mese" per caricare il CSV.</Empty></Card>
          ) : (
          <Card>
            <div className="pl2-toolbar">
              <div className="ds-actions" style={{ gap: 14 }}>
                <SegTabs<'riepilogo' | 'dettaglio'> pill value={tab} onChange={setTab} label="Vista"
                  items={[{ value: 'riepilogo', label: 'Riepilogo per targa' }, { value: 'dettaglio', label: 'Dettaglio sessioni' }]} />
                {tab === 'riepilogo' ? (
                  <SegTabs<typeof filtroCategoriaRiep> value={filtroCategoriaRiep} onChange={setFiltroCategoriaRiep} label="Categoria"
                    items={[
                      { value: 'TUTTI', label: 'Tutte', count: riepilogo.length },
                      { value: 'DISTRIBUZIONE', label: 'Distribuzione', count: nCat('DISTRIBUZIONE') },
                      { value: 'FLOTTA', label: 'Flotta', count: nCat('FLOTTA') },
                      { value: 'AUTO_AZIENDALE', label: 'Aziendali', count: nCat('AUTO_AZIENDALE') },
                    ]} />
                ) : (
                  <SegTabs<typeof filtroTipo> value={filtroTipo} onChange={setFiltroTipo} label="Tipo"
                    items={[
                      { value: 'TUTTI', label: 'Tutte', count: sessioni.length },
                      { value: 'INTERNA', label: 'Interne', count: nInt },
                      { value: 'ESTERNA', label: 'Esterne', count: nExt },
                    ]} />
                )}
              </div>
              {tab === 'riepilogo'
                ? <SearchBox value={searchRiep} onChange={setSearchRiep} placeholder="Cerca targa, padroncino…" width={260} />
                : <SearchBox value={search} onChange={setSearch} placeholder="Cerca targa, padroncino, stazione…" width={280} />}
            </div>

            {tab === 'riepilogo' ? (
              <div className="ds-tablewrap">
                <table className="ds-table ric2-table" style={{ minWidth: 1080 }}>
                  <thead><tr>
                    <Th k="targa" sort={sortObj(sortRiep)} onSort={toggleRiep}>Targa</Th>
                    <Th k="categoria" sort={sortObj(sortRiep)} onSort={toggleRiep}>Cat.</Th>
                    <Th k="padroncino" sort={sortObj(sortRiep)} onSort={toggleRiep}>Padroncino</Th>
                    <Th k="kwhInt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>kWh int.</Th>
                    <Th k="costoBaseInt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Base int.</Th>
                    <Th k="costoInt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Costo int.</Th>
                    <Th k="kwhExt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>kWh est.</Th>
                    <Th k="costoBaseExt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Base est.</Th>
                    <Th k="costoExt" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Costo est.</Th>
                    <Th k="maggiorazione" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Magg. %</Th>
                    <Th k="costoTot" sort={sortObj(sortRiep)} onSort={toggleRiep} right>Totale</Th>
                  </tr></thead>
                  <tbody>
                    {sortedRiepilogo.map((r) => {
                      const esp = espansoTarga === r.targa;
                      const [cl, cc] = catOf(r.categoria);
                      const mag = r.sessioni[0]?.maggiorazione ?? 0;
                      return (
                        <Fragment key={r.targa}>
                          <tr className={`is-clickable${esp ? ' is-open' : ''}`} onClick={() => setEspansoTarga(esp ? null : r.targa)} aria-expanded={esp}>
                            <td className="ds-mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}><span className="ric2-caret">{esp ? '▾' : '▸'}</span>{r.targa}</td>
                            <td><span className="ric2-cat"><i style={{ background: cc }} />{cl}</span></td>
                            <td className="ric2-ell" style={{ color: r.padroncino ? undefined : '#71717A', maxWidth: 170 }} title={r.padroncino ?? ''}>{r.padroncino ?? 'Non assegnato'}</td>
                            <td className="r">{kwh(r.kwhInt)}</td>
                            <td className="r" style={{ color: '#6B6B73' }}>{fmtEur2(r.costoBaseInt)}</td>
                            <td className="r">{fmtEur2(r.costoInt)}</td>
                            <td className="r">{kwh(r.kwhExt)}</td>
                            <td className="r" style={{ color: '#6B6B73' }}>{fmtEur2(r.costoBaseExt)}</td>
                            <td className="r">{fmtEur2(r.costoExt)}</td>
                            <td className="r" onClick={(e) => e.stopPropagation()}>
                              {editMagTarga === r.targa ? (
                                <input className="ds-input ric2-mag" autoFocus type="text" inputMode="decimal" disabled={savingMag}
                                  value={editMagVal} onChange={(e) => setEditMagVal(e.target.value)}
                                  onBlur={() => {
                                    const v = parseDecimale(editMagVal);
                                    if (!isNaN(v) && r.sessioni.length > 0 && v !== r.sessioni[0].maggiorazione) salvaMaggiorazione(r.targa, v);
                                    else setEditMagTarga(null);
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditMagTarga(null); }} />
                              ) : (
                                <button type="button" className="ric2-magbtn" title="Clic per modificare la maggiorazione"
                                  onClick={() => { const cur = r.sessioni.length > 0 ? r.sessioni[0].maggiorazione : 0; setEditMagVal(String(cur)); setEditMagTarga(r.targa); }}>
                                  {fmtNum2(mag, mag % 1 ? 1 : 0)}%<Icon name="edit" size={11} />
                                </button>
                              )}
                            </td>
                            <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(r.costoTot)}</td>
                          </tr>
                          {esp && (
                            <tr className="ric2-subrow">
                              <td colSpan={11}>
                                <table className="ric2-sub">
                                  <thead><tr><th>Tipo</th><th>Stazione</th><th>Inizio</th><th>Durata</th><th className="r">kWh</th><th className="r">€/kWh</th><th className="r">Costo base</th><th className="r">Magg.</th><th className="r">Costo finale</th></tr></thead>
                                  <tbody>
                                    {[...r.sessioni].sort((x, y) => (x.inizioSessione ?? '').localeCompare(y.inizioSessione ?? '')).map((x, i) => {
                                      const est = x.tipoRicarica === 'ESTERNA';
                                      return (
                                        <tr key={x.id ?? i}>
                                          <td><span className="ric2-cat" style={{ color: est ? '#C2410C' : '#0F766E', fontWeight: 500 }}><i style={{ background: est ? C.orange : C.teal }} />{est ? 'Esterna' : 'Interna'}</span></td>
                                          <td className="ric2-ell" title={x.stazione ?? ''}>{x.stazione ?? '—'}</td>
                                          <td>{x.inizioSessione ?? '—'}</td>
                                          <td style={{ color: '#52525B' }}>{x.durata ?? '—'}</td>
                                          <td className="r">{fmtNum2(x.kwh, 3)}</td>
                                          <td className="r" style={{ color: '#6B6B73' }}>{fmtE4(x.costoUnitario)}</td>
                                          <td className="r">{fmtEur2(x.costoBase)}</td>
                                          <td className="r" style={{ color: '#52525B' }}>{fmtNum2(x.maggiorazione, 0)}%</td>
                                          <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(x.costoFinale)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <div className="ric2-subfoot">
                                  <span>{r.sessioni.length} session{r.sessioni.length === 1 ? 'e' : 'i'} di {meseLabel.toLowerCase()}</span>
                                  <Button size="sm" onClick={() => { setTab('dettaglio'); setSearch(r.targa); }}>Tutte le sessioni della targa</Button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="is-total">
                      <td colSpan={3}>Totale · {sortedRiepilogo.length} targhe</td>
                      <td className="r">{kwh(sortedRiepilogo.reduce((a, r) => a + r.kwhInt, 0))}</td>
                      <td className="r">{fmtEur2(sortedRiepilogo.reduce((a, r) => a + r.costoBaseInt, 0))}</td>
                      <td className="r">{fmtEur2(sortedRiepilogo.reduce((a, r) => a + r.costoInt, 0))}</td>
                      <td className="r">{kwh(sortedRiepilogo.reduce((a, r) => a + r.kwhExt, 0))}</td>
                      <td className="r">{fmtEur2(sortedRiepilogo.reduce((a, r) => a + r.costoBaseExt, 0))}</td>
                      <td className="r">{fmtEur2(sortedRiepilogo.reduce((a, r) => a + r.costoExt, 0))}</td>
                      <td />
                      <td className="r">{fmtEur2(sortedRiepilogo.reduce((a, r) => a + r.costoTot, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="ds-tablewrap">
                <table className="ds-table ric2-table" style={{ minWidth: 1240 }}>
                  <thead><tr>
                    <Th k="inizioSessione" sort={sortObj(sortDett)} onSort={toggleDett}>Inizio</Th>
                    <Th k="targa" sort={sortObj(sortDett)} onSort={toggleDett}>Targa</Th>
                    <Th k="categoriaMezzo" sort={sortObj(sortDett)} onSort={toggleDett}>Cat.</Th>
                    <Th k="padroncino" sort={sortObj(sortDett)} onSort={toggleDett}>Padroncino</Th>
                    <Th k="stazione" sort={sortObj(sortDett)} onSort={toggleDett}>Stazione</Th>
                    <Th k="tipoRicarica" sort={sortObj(sortDett)} onSort={toggleDett}>Tipo</Th>
                    <Th k="durata" sort={sortObj(sortDett)} onSort={toggleDett}>Durata</Th>
                    <Th k="kwh" sort={sortObj(sortDett)} onSort={toggleDett} right>kWh</Th>
                    <Th k="costoUnitario" sort={sortObj(sortDett)} onSort={toggleDett} right>€/kWh</Th>
                    <Th k="costoBase" sort={sortObj(sortDett)} onSort={toggleDett} right>Costo base</Th>
                    <Th k="maggiorazione" sort={sortObj(sortDett)} onSort={toggleDett} right>Magg.</Th>
                    <Th k="costoFinale" sort={sortObj(sortDett)} onSort={toggleDett} right>Costo finale</Th>
                  </tr></thead>
                  <tbody>
                    {sortedSessFiltr.map((x, i) => {
                      const [cl, cc] = catOf(x.categoriaMezzo ?? mezziMap.get(x.targa)?.categoria);
                      const est = x.tipoRicarica === 'ESTERNA';
                      return (
                        <tr key={x.id ?? i}>
                          <td style={{ color: '#3F3F46', whiteSpace: 'nowrap' }}>{x.inizioSessione ?? '—'}</td>
                          <td className="ds-mono" style={{ fontWeight: 600 }}>{x.targa}</td>
                          <td><span className="ric2-cat"><i style={{ background: cc }} />{cl}</span></td>
                          <td className="ric2-ell" style={{ color: x.padroncino ? undefined : '#71717A' }}>{x.padroncino ?? 'Non assegnato'}</td>
                          <td className="ric2-ell" style={{ color: '#3F3F46' }} title={x.stazione ?? ''}>{x.stazione ?? '—'}</td>
                          <td><span className="ric2-cat"><i style={{ background: est ? C.orange : C.teal }} />{est ? 'Esterna' : 'Interna'}</span></td>
                          <td style={{ color: '#52525B' }}>{x.durata ?? '—'}</td>
                          <td className="r">{fmtNum2(x.kwh, 2)}</td>
                          <td className="r" style={{ color: '#6B6B73' }}>{fmtE4(x.costoUnitario)}</td>
                          <td className="r">{fmtEur2(x.costoBase)}</td>
                          <td className="r" style={{ color: '#52525B' }}>{fmtNum2(x.maggiorazione, 0)}%</td>
                          <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(x.costoFinale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pl2-foot">
              {tab === 'riepilogo'
                ? `Mostrate ${sortedRiepilogo.length} di ${riepilogo.length} targhe · la % di maggiorazione si modifica con un clic e ricalcola le sessioni della targa`
                : `Mostrate ${sortedSessFiltr.length} di ${sessioni.length} sessioni di ${meseLabel.toLowerCase()}`}
            </div>
          </Card>
        )}
      </>)}
    </Page>
  );
}
