// src/features/ricariche/RicaricheElettriche.tsx
import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { api, mezziApi } from '../../lib/api';
import './RicaricheElettriche.css';

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
  return parseFloat(raw.replace(',', '.')) || 0;
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
  const [appView, setAppView]   = useState<AppView>('dashboard');

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
    const imp = parseFloat(fatturaImporto.replace(',', '.'));
    const kwh = parseFloat(fatturaKwh.replace(',', '.'));
    if (!imp || !kwh || kwh === 0) return null;
    return imp / kwh;
  }, [fatturaImporto, fatturaKwh]);

  const handleAggiornaTariffe = async () => {
    if (!costoInternoKwh) return alert('Inserisci dati validi per la bolletta (Importo e kWh).');
    setSaving(true);
    try {
      await api.put(`/ricariche/${mese}/tariffe`, {
        fatturaImporto: parseFloat(fatturaImporto.replace(',', '.')),
        fatturaKwh: parseFloat(fatturaKwh.replace(',', '.')),
        costoEsternoKwh: parseFloat(costoEsterno.replace(',', '.')),
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
      const costoExt = parseFloat(costoEsterno.replace(',', '.')) || 0;
      const magDef   = parseFloat(magDefault) || 20;
      const fatImp   = parseFloat(fatturaImporto.replace(',', '.')) || 0;
      const fatKwh   = parseFloat(fatturaKwh.replace(',', '.')) || 0;

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

  // ════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="ric-page">

      {/* ══════════════ DASHBOARD VIEW ══════════════ */}
      {appView === 'dashboard' && (
        <>
          {/* ── Header ── */}
          <div className="ric-header">
            <div>
              <h1>⚡ Ricariche Elettriche</h1>
              <span className="ric-sub">Gestione e storico ricariche mensili</span>
            </div>
            <div className="ric-header-actions">
              <button className="btn-primary" onClick={() => { setAppView('detail'); setShowImport(true); }}>
                📂 Importa CSV
              </button>
            </div>
          </div>

          {/* ── Aggregated KPI row ── */}
          {dashStats && (
            <div className="ric-dash-kpi-row">
              <div className="ric-kpi-card ric-kpi-blue">
                <span className="ric-kpi-label">Mesi Archiviati</span>
                <span className="ric-kpi-val">{mesiDisp.length}</span>
                <span className="ric-kpi-sub">dati caricati</span>
              </div>
              <div className="ric-kpi-card ric-kpi-teal">
                <span className="ric-kpi-label">Sessioni Totali</span>
                <span className="ric-kpi-val">{dashStats.totSessioni.toLocaleString('it-IT')}</span>
                <span className="ric-kpi-sub">tutti i mesi</span>
              </div>
              <div className="ric-kpi-card ric-kpi-green">
                <span className="ric-kpi-label">Energia Totale</span>
                <span className="ric-kpi-val">{fmtK(dashStats.totKwh)}</span>
                <span className="ric-kpi-sub">kWh distribuiti</span>
              </div>
              <div className="ric-kpi-card ric-kpi-purple">
                <span className="ric-kpi-label">Costo Totale</span>
                <span className="ric-kpi-val">€ {fmtE(dashStats.totCosto)}</span>
                <span className="ric-kpi-sub">tutti i mesi</span>
              </div>
              <div className="ric-kpi-card ric-kpi-amber">
                <span className="ric-kpi-label">Media Mensile</span>
                <span className="ric-kpi-val">€ {fmtE(dashStats.totCosto / mesiDisp.length)}</span>
                <span className="ric-kpi-sub">per mese</span>
              </div>
            </div>
          )}
          {loadingStats && !dashStats && (
            <div className="ric-loading"><div className="ric-spinner" /><span>Caricamento statistiche…</span></div>
          )}

          {/* ── Empty state ── */}
          {mesiDisp.length === 0 && !loadingStats && (
            <div className="ric-empty-state">
              <span className="ric-empty-icon">⚡</span>
              <div className="ric-empty-title">Nessun dato ancora</div>
              <div className="ric-empty-hint">
                <button className="btn-primary" onClick={() => { setAppView('detail'); setShowImport(true); }}>
                  📂 Importa il primo CSV
                </button>
              </div>
            </div>
          )}

          {/* ── Month list + sidebar ── */}
          {mesiDisp.length > 0 && (
            <div className="ric-dash-grid">

              {/* Storico mensile */}
              <div className="ric-dash-panel">
                <div className="ric-dash-panel-hd">
                  <span>📅 Storico Mensile</span>
                  <span className="ric-dash-panel-sub">{mesiDisp.length} mesi · clicca per aprire</span>
                </div>
                <div className="ric-month-col-hd">
                  <span>MESE</span>
                  <span>DISTRIBUZIONE kWh</span>
                  <span style={{ textAlign: 'center' }}>TREND</span>
                  <span style={{ textAlign: 'right' }}>ADDEBITATO PDA</span>
                  <span></span>
                </div>
                {mesiDesc.map((m) => {
                  const st = mesiStats[m.mese];
                  const idx = mesiAsc.findIndex(x => x.mese === m.mese);
                  const prev = idx > 0 ? mesiStats[mesiAsc[idx - 1].mese] : null;
                  const trend = st && prev && prev.costoTot > 0
                    ? ((st.costoTot - prev.costoTot) / prev.costoTot * 100)
                    : null;
                  const intPct = st && st.kwhTot > 0 ? Math.round(st.kwhInt / st.kwhTot * 100) : 0;
                  const extPct = 100 - intPct;

                  return (
                    <div key={m.mese} className="ric-month-row" onClick={() => apriMese(m.mese)}>
                      <div>
                        <div className="ric-month-name">{formatMese(m.mese)}</div>
                        <div className="ric-month-sub-label">
                          {m.count} sessioni{st ? ` · ${st.mezziCount} mezzi` : ''}
                        </div>
                      </div>
                      <div>
                        {st ? (
                          <>
                            <div className="ric-kwh-bar-wrap">
                              <div className="ric-kwh-bar-int" style={{ width: `${intPct}%` }}></div>
                              <div className="ric-kwh-bar-ext" style={{ width: `${extPct}%` }}></div>
                            </div>
                            <div className="ric-kwh-bar-labels">
                              <span className="ric-kwh-int-label">⚡ {intPct}%</span>
                              <span className="ric-kwh-ext-label">🔌 {extPct}%</span>
                              <span className="ric-kwh-total-label">{fmtK(st.kwhTot)} kWh</span>
                            </div>
                          </>
                        ) : (
                          <div className="ric-loading" style={{ padding: '4px 0', justifyContent: 'flex-start' }}>
                            <div className="ric-spinner" style={{ width: 14, height: 14 }} />
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        {trend !== null ? (
                          <span className={`ric-trend-badge ${trend > 0 ? 'ric-trend-up' : 'ric-trend-down'}`}>
                            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="ric-trend-badge ric-trend-neutral">1° mese</span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {st ? (
                          <>
                            <span className="ric-month-cost">€ {fmtE(st.costoTot)}</span>
                            <span className="ric-month-cost-sub">totale</span>
                          </>
                        ) : <span className="ric-month-cost-sub">—</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="ric-apri-btn">Apri →</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sidebar */}
              <div className="ric-dash-sidebar">

                {/* Top veicoli (dal mese corrente caricato, se disponibile) */}
                {topVeicoli.length > 0 && (
                  <div className="ric-sidebar-panel">
                    <div className="ric-dash-panel-hd">
                      <span>🏆 Top Veicoli</span>
                      <span className="ric-dash-panel-sub">costo · {meseLabel}</span>
                    </div>
                    {topVeicoli.map((v) => {
                      const cat = catLabel(v.categoria);
                      return (
                        <div key={v.targa} className="ric-top-vehicle">
                          <span className="ric-top-vehicle-targa">{v.targa}</span>
                          <div className="ric-top-vehicle-info">
                            <span className="ric-top-vehicle-name">{v.padroncino ?? '—'}</span>
                            <span className="ric-top-vehicle-cat">{cat.label}</span>
                          </div>
                          <span className="ric-top-vehicle-cost">€ {fmtE(v.costoTot)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ripartizione int/ext */}
                {dashStats && (
                  <div className="ric-sidebar-panel">
                    <div className="ric-dash-panel-hd">
                      <span>📊 Ripartizione Costi</span>
                      <span className="ric-dash-panel-sub">tutti i mesi</span>
                    </div>
                    <div className="ric-split-body">
                      <div className="ric-split-bar-wrap">
                        <div className="ric-split-bar-int" style={{ flex: splitPct.int }}></div>
                        <div className="ric-split-bar-ext" style={{ flex: splitPct.ext }}></div>
                      </div>
                      <div className="ric-split-row">
                        <div className="ric-split-legend">
                          <div className="ric-split-dot" style={{ background: '#2563eb' }}></div>
                          <span className="ric-split-legend-label">⚡ Interne (JuiceBox)</span>
                        </div>
                        <span className="ric-split-pct-blue">{splitPct.int}%</span>
                      </div>
                      <div className="ric-split-row">
                        <div className="ric-split-legend">
                          <div className="ric-split-dot" style={{ background: '#d97706' }}></div>
                          <span className="ric-split-legend-label">🔌 Esterne (rete pubbl.)</span>
                        </div>
                        <span className="ric-split-pct-amber">{splitPct.ext}%</span>
                      </div>
                      <div className="ric-split-totals">
                        <div className="ric-split-total-row">
                          <span className="ric-split-total-label">Costo interno tot.</span>
                          <span className="ric-split-total-val-blue">€ {fmtE(dashStats.totInt)}</span>
                        </div>
                        <div className="ric-split-total-row">
                          <span className="ric-split-total-label">Costo esterno tot.</span>
                          <span className="ric-split-total-val-amber">€ {fmtE(dashStats.totExt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ DETAIL VIEW ══════════════ */}
      {appView === 'detail' && (
        <>
          {/* ── Header ── */}
          <div className="ric-header">
            <div className="ric-header-left">
              <button className="ric-back-btn btn-outline btn-sm" onClick={() => setAppView('dashboard')}>
                ← Storico
              </button>
              <div>
                <h1>⚡ {meseLabel}</h1>
                <span className="ric-sub">Dettaglio ricariche · {mezziCount} mezzi coinvolti</span>
              </div>
            </div>
            <div className="ric-header-actions">
              <div className="ric-mese-wrap">
                <label>Mese</label>
                <input type="month" className="ric-mese-input" value={mese} onChange={(e) => setMese(e.target.value)} />
              </div>
              {hasDati && <button className="btn-outline btn-sm ric-del-mese" onClick={eliminaMese}>🗑 Elimina</button>}
              {hasDati && (
                <button className="btn-outline btn-sm ric-export-btn" onClick={exportReport}>
                  📊 Esporta Report
                </button>
              )}
              <button className="btn-primary" onClick={() => setShowImport((v) => !v)}>
                {showImport ? '✕ Chiudi' : '📂 Importa CSV'}
              </button>
            </div>
          </div>

          {/* ── Pannello modifica tariffe ── */}
          {hasDati && !showImport && (
            <div className="ric-tariffe-edit-panel">
              <div className="ric-panel-title">📝 Modifica tariffe mese</div>
              <div className="ric-edit-grid">
                <div className="ric-config-field">
                  <label>Importo fattura (€)</label>
                  <input className="ric-input" type="number" step="0.01" placeholder="1250.00"
                    value={fatturaImporto} onChange={(e) => setFatturaImporto(e.target.value)} />
                </div>
                <div className="ric-config-field">
                  <label>kWh fatturati</label>
                  <input className="ric-input" type="number" step="0.001" placeholder="2850"
                    value={fatturaKwh} onChange={(e) => setFatturaKwh(e.target.value)} />
                </div>
                <div className="ric-config-field">
                  <label>€/kWh esterno</label>
                  <input className="ric-input" type="number" step="0.001" placeholder="0.840"
                    value={costoEsterno} onChange={(e) => setCostoEsterno(e.target.value)} />
                </div>
                <div className="ric-config-field" style={{ justifyContent: 'flex-end' }}>
                  {costoInternoKwh && (
                    <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 4 }}>
                      Interno calcolato: <strong>{fmtE4(costoInternoKwh)} €/kWh</strong>
                    </div>
                  )}
                  <button className="btn-primary" onClick={handleAggiornaTariffe} disabled={saving || !costoInternoKwh}>
                    {saving ? '⏳ Salvataggio...' : '🔄 Aggiorna e Ricalcola'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Pannello import ── */}
          {showImport && (
            <div className="ric-import-panel">
              <div className="ric-import-title">📂 Importa sessioni {mese}</div>
              {righeAnteprima.length === 0 ? (
                <div
                  className={`ric-upload-zone ${dragOver ? 'ric-upload-drag' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFileChange} />
                  <div className="ric-upload-prompt">
                    <span className="ric-upload-icon">📂</span>
                    <div>
                      <div className="ric-upload-title">{hasDati ? `Sostituisci dati ${mese}` : `Carica CSV ${mese}`}</div>
                      <div className="ric-upload-hint">Trascina il file CSV o clicca per selezionare</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ric-import-config">
                  <div className="ric-import-info">
                    📄 File: <strong>{nomeFile}</strong> — <strong>{righeAnteprima.length}</strong> sessioni rilevate.
                    Imposta le tariffe e conferma l'importazione.
                  </div>
                  <div className="ric-config-grid3">
                    <div className="ric-config-section">
                      <div className="ric-config-sub">⚡ Ricariche Interne (JuiceBox)</div>
                      <div className="ric-config-row">
                        <div className="ric-config-field">
                          <label>Importo fattura (€)</label>
                          <input className="ric-input" type="number" step="0.01" placeholder="1250.00"
                            value={fatturaImporto} onChange={(e) => setFatturaImporto(e.target.value)} />
                        </div>
                        <div className="ric-config-field">
                          <label>kWh fatturati</label>
                          <input className="ric-input" type="number" step="0.001" placeholder="2850"
                            value={fatturaKwh} onChange={(e) => setFatturaKwh(e.target.value)} />
                        </div>
                      </div>
                      <div className={`ric-kwh-result ${costoInternoKwh ? 'ric-kwh-ok' : 'ric-kwh-empty'}`}>
                        {costoInternoKwh
                          ? <><span className="ric-kwh-val">{fmtE4(costoInternoKwh)}</span><span className="ric-kwh-unit">€/kWh calcolato</span></>
                          : <span className="ric-kwh-placeholder">→ inserisci fattura e kWh</span>}
                      </div>
                    </div>
                    <div className="ric-config-section">
                      <div className="ric-config-sub">🔌 Ricariche Esterne</div>
                      <div className="ric-config-field">
                        <label>Costo kWh esterno (€)</label>
                        <input className="ric-input" type="number" step="0.001" placeholder="0.840"
                          value={costoEsterno} onChange={(e) => setCostoEsterno(e.target.value)} />
                      </div>
                    </div>
                    <div className="ric-config-section">
                      <div className="ric-config-sub">📊 Maggiorazione e Conferma</div>
                      <div className="ric-config-field">
                        <label>% default (se non impostata sul mezzo)</label>
                        <div className="ric-input-suffix-wrap">
                          <input className="ric-input" type="number" step="1" min="0"
                            value={magDefault} onChange={(e) => setMagDefault(e.target.value)} />
                          <span className="ric-input-suffix">%</span>
                        </div>
                      </div>
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button className="btn-primary" onClick={handleConfermaImport} disabled={saving || !costoInternoKwh}>
                          {saving ? '⏳ Salvataggio...' : '🚀 Conferma Import'}
                        </button>
                        <button className="btn-outline" onClick={annullaImport} disabled={saving}>↩ Cambia file</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Loading / Empty / Error ── */}
          {loading && <div className="ric-loading"><div className="ric-spinner" /><span>Caricamento {mese}…</span></div>}
          {!loading && error && <div className="ric-error">⚠️ {error}</div>}
          {!loading && !hasDati && !error && (
            <div className="ric-empty-state">
              <span className="ric-empty-icon">⚡</span>
              <div className="ric-empty-title">Nessun dato per {mese}</div>
              <div className="ric-empty-hint">Clicca "Importa CSV" per caricare le sessioni</div>
            </div>
          )}

          {/* ── Dati presenti ── */}
          {!loading && hasDati && (
            <>
              {/* ── 6-card KPI row ── */}
              <div className="ric-detail-kpi-row">
                <div className="ric-kpi-card ric-kpi-blue">
                  <span className="ric-kpi-label">Sessioni</span>
                  <span className="ric-kpi-val">{stats.tot}</span>
                  <span className="ric-kpi-sub">{mezziCount} mezzi</span>
                </div>
                <div className="ric-kpi-card ric-kpi-green">
                  <span className="ric-kpi-label">kWh Interne</span>
                  <span className="ric-kpi-val ric-kpi-val-md">{fmtK(stats.kwhInt)}</span>
                  <span className="ric-kpi-sub">JuiceBox</span>
                </div>
                <div className="ric-kpi-card ric-kpi-amber">
                  <span className="ric-kpi-label">kWh Esterne</span>
                  <span className="ric-kpi-val ric-kpi-val-md">{fmtK(stats.kwhExt)}</span>
                  <span className="ric-kpi-sub">rete pubblica</span>
                </div>
                <div className="ric-kpi-card ric-kpi-green">
                  <span className="ric-kpi-label">Costo Interne</span>
                  <span className="ric-kpi-val ric-kpi-val-md">€ {fmtE(stats.costoBaseInt)}</span>
                  <span className="ric-kpi-sub">senza magg.</span>
                </div>
                <div className="ric-kpi-card ric-kpi-amber">
                  <span className="ric-kpi-label">Costo Esterne</span>
                  <span className="ric-kpi-val ric-kpi-val-md">€ {fmtE(stats.costoBaseExt)}</span>
                  <span className="ric-kpi-sub">senza magg.</span>
                </div>
                <div className="ric-kpi-card ric-kpi-purple">
                  <span className="ric-kpi-label">Totale Mese</span>
                  <span className="ric-kpi-val ric-kpi-val-md">€ {fmtE(stats.costoTot)}</span>
                  <span className="ric-kpi-sub">da addebitare</span>
                </div>
                <div className="ric-kpi-card ric-kpi-teal">
                  <span className="ric-kpi-label">Margine</span>
                  <span className="ric-kpi-val ric-kpi-val-md">€ {fmtE(stats.margine)}</span>
                  <span className="ric-kpi-sub">{fmtE(stats.marginePct)}% su addebitato</span>
                </div>
              </div>

              {/* ── Tariffe snapshot ── */}
              {tariffe && (
                <div className="ric-tariffe-bar">
                  {tariffe.costoInternoKwh && (
                    <span className="ric-tariffa-chip ric-tariffa-int">
                      ⚡ Interno: <strong>{fmtE4(tariffe.costoInternoKwh)} €/kWh</strong>
                      {tariffe.fatturaImporto && <em> · fatt. {fmtE(tariffe.fatturaImporto)} € / {fmtK(tariffe.fatturaKwh ?? 0)} kWh</em>}
                    </span>
                  )}
                  {tariffe.costoEsternoKwh && (
                    <span className="ric-tariffa-chip ric-tariffa-ext">🔌 Esterno: <strong>{fmtE4(tariffe.costoEsternoKwh)} €/kWh</strong></span>
                  )}
                </div>
              )}

              {/* ── Tabs ── */}
              <div className="ric-tabs">
                <button className={`ric-tab ${tab === 'riepilogo' ? 'ric-tab-active' : ''}`} onClick={() => setTab('riepilogo')}>
                  🚚 Riepilogo per targa ({riepilogo.length})
                </button>
                <button className={`ric-tab ${tab === 'dettaglio' ? 'ric-tab-active' : ''}`} onClick={() => setTab('dettaglio')}>
                  📋 Dettaglio sessioni ({sessioni.length})
                </button>
              </div>

              {/* ── TAB RIEPILOGO ── */}
              {tab === 'riepilogo' && (
                <>
                  <div className="ric-filters">
                    <div className="ric-search-wrap">
                      <span>🔍</span>
                      <input className="ric-search" placeholder="Cerca targa, padroncino…"
                        value={searchRiep} onChange={(e) => setSearchRiep(e.target.value)} />
                    </div>
                    <div className="ric-tipo-filters">
                      {(['TUTTI', 'DISTRIBUZIONE', 'AUTO_AZIENDALE', 'FLOTTA'] as const).map((c) => (
                        <button key={c}
                          className={`ric-tipo-btn ${filtroCategoriaRiep === c ? 'ric-tipo-active' : ''}`}
                          onClick={() => setFiltroCategoriaRiep(c)}>
                          {c === 'TUTTI' ? 'Tutte' : catLabel(c).label}
                        </button>
                      ))}
                    </div>
                  </div>
                <div className="ric-table-wrap">
                  <table className="ric-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}></th>
                        <th className="ric-th-sort" onClick={() => toggleRiep('targa')}>TARGA<span className="ric-sort-icon">{sortIcon('targa', sortRiep)}</span></th>
                        <th className="ric-th-sort" onClick={() => toggleRiep('categoria')}>CAT.<span className="ric-sort-icon">{sortIcon('categoria', sortRiep)}</span></th>
                        <th className="ric-th-sort" onClick={() => toggleRiep('padroncino')}>PADRONCINO<span className="ric-sort-icon">{sortIcon('padroncino', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-green" style={{ textAlign: 'right' }} onClick={() => toggleRiep('kwhInt')}>kWh Int.<span className="ric-sort-icon">{sortIcon('kwhInt', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-green" style={{ textAlign: 'right' }} onClick={() => toggleRiep('costoBaseInt')}>Costo Int. Orig.<span className="ric-sort-icon">{sortIcon('costoBaseInt', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-green" style={{ textAlign: 'right' }} onClick={() => toggleRiep('costoInt')}>Costo Int.<span className="ric-sort-icon">{sortIcon('costoInt', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-amber" style={{ textAlign: 'right' }} onClick={() => toggleRiep('kwhExt')}>kWh Ext.<span className="ric-sort-icon">{sortIcon('kwhExt', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-amber" style={{ textAlign: 'right' }} onClick={() => toggleRiep('costoBaseExt')}>Costo Ext. Orig.<span className="ric-sort-icon">{sortIcon('costoBaseExt', sortRiep)}</span></th>
                        <th className="ric-th-sort ric-th-amber" style={{ textAlign: 'right' }} onClick={() => toggleRiep('costoExt')}>Costo Ext.<span className="ric-sort-icon">{sortIcon('costoExt', sortRiep)}</span></th>
                        <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleRiep('maggiorazione')}>MAG.%<span className="ric-sort-icon">{sortIcon('maggiorazione', sortRiep)}</span></th>
                        <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleRiep('costoTot')}>TOTALE<span className="ric-sort-icon">{sortIcon('costoTot', sortRiep)}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRiepilogo.map((r) => {
                        const cat = catLabel(r.categoria);
                        const esp = espansoTarga === r.targa;
                        return (
                          <Fragment key={r.targa}>
                            <tr className={`ric-row ric-row-riepilogo ${esp ? 'ric-row-expanded' : ''}`}
                              onClick={() => setEspansoTarga(esp ? null : r.targa)}>
                              <td className="ric-expand-btn">{esp ? '▲' : '▼'}</td>
                              <td><span className="ric-targa">{r.targa}</span></td>
                              <td>{cat.label !== '—' ? <span className={`ric-cat-badge ${cat.cls}`}>{cat.label}</span> : <span className="ric-na">—</span>}</td>
                              <td>{r.padroncino ? <span className="ric-padroncino">{r.padroncino}</span> : <span className="ric-na">—</span>}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-green">{r.kwhInt > 0 ? fmtK(r.kwhInt) : '—'}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-green">{r.costoBaseInt > 0 ? fmtE(r.costoBaseInt) + ' €' : '—'}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-green">{r.costoInt > 0 ? <span className="ric-badge-int-sm">{fmtE(r.costoInt)} €</span> : '—'}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-amber">{r.kwhExt > 0 ? fmtK(r.kwhExt) : '—'}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-amber">{r.costoBaseExt > 0 ? fmtE(r.costoBaseExt) + ' €' : '—'}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num ric-td-amber">{r.costoExt > 0 ? <span className="ric-badge-ext-sm">{fmtE(r.costoExt)} €</span> : '—'}</td>
                              <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                {editMagTarga === r.targa ? (
                                  <input className="ric-mag-input" type="number" step="0.01" autoFocus disabled={savingMag}
                                    value={editMagVal} onChange={(e) => setEditMagVal(e.target.value)}
                                    onBlur={() => {
                                      const v = parseFloat(editMagVal.replace(',', '.'));
                                      if (!isNaN(v) && r.sessioni.length > 0 && v !== r.sessioni[0].maggiorazione) salvaMaggiorazione(r.targa, v);
                                      else setEditMagTarga(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditMagTarga(null); }} />
                                ) : (
                                  <span className="ric-mag-badge ric-mag-editable" title="Clicca per modificare la % maggiorazione"
                                    onClick={() => { const cur = r.sessioni.length > 0 ? r.sessioni[0].maggiorazione : 0; setEditMagVal(String(cur)); setEditMagTarga(r.targa); }}>
                                    {r.sessioni.length > 0 ? `${r.sessioni[0].maggiorazione}%` : '—'}
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(r.costoTot)} €</strong></td>
                            </tr>
                            {esp && (
                              <tr className="ric-detail-row">
                                <td colSpan={12}>
                                  <table className="ric-sub-table">
                                    <thead>
                                      <tr>
                                        <th>TIPO</th><th>STAZIONE</th><th>INIZIO</th><th>DURATA</th>
                                        <th style={{ textAlign: 'right' }}>kWh</th>
                                        <th style={{ textAlign: 'right' }}>€/kWh</th>
                                        <th style={{ textAlign: 'right' }}>COST. BASE</th>
                                        <th style={{ textAlign: 'right' }}>MAG.%</th>
                                        <th style={{ textAlign: 'right' }}>COSTO FINALE</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.sessioni.map((s, idx) => (
                                        <tr key={s.id || idx} className="ric-sub-row">
                                          <td><span className={`ric-tipo-badge ${s.tipoRicarica === 'INTERNA' ? 'ric-badge-int' : 'ric-badge-ext'}`}>{s.tipoRicarica === 'INTERNA' ? '⚡ INT' : '🔌 EXT'}</span></td>
                                          <td className="ric-stazione" title={s.stazione ?? ''}>{s.stazione?.split(' - ').slice(1).join(' - ') || s.stazione}</td>
                                          <td className="ric-data">{s.inizioSessione}</td>
                                          <td className="ric-durata">{s.durata}</td>
                                          <td style={{ textAlign: 'right' }} className="ric-num">{fmtK(s.kwh)}</td>
                                          <td style={{ textAlign: 'right' }} className="ric-num">{s.costoUnitario > 0 ? fmtE4(s.costoUnitario) : '—'}</td>
                                          <td style={{ textAlign: 'right' }} className="ric-num">{s.costoBase > 0 ? fmtE(s.costoBase) : '—'}</td>
                                          <td style={{ textAlign: 'right' }}><span className="ric-mag-badge">{s.maggiorazione}%</span></td>
                                          <td style={{ textAlign: 'right' }}><span className="ric-costo">{fmtE(s.costoFinale)} €</span></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="ric-foot">
                        <td colSpan={4}><strong>TOTALE ({sortedRiepilogo.length} mezzi)</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtK(sortedRiepilogo.reduce((a, r) => a + r.kwhInt, 0))}</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtE(sortedRiepilogo.reduce((a, r) => a + r.costoBaseInt, 0))} €</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtE(sortedRiepilogo.reduce((a, r) => a + r.costoInt, 0))} €</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtK(sortedRiepilogo.reduce((a, r) => a + r.kwhExt, 0))}</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtE(sortedRiepilogo.reduce((a, r) => a + r.costoBaseExt, 0))} €</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtE(sortedRiepilogo.reduce((a, r) => a + r.costoExt, 0))} €</strong></td>
                        <td></td>
                        <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(sortedRiepilogo.reduce((a, r) => a + r.costoTot, 0))} €</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                </>
              )}

              {/* ── TAB DETTAGLIO ── */}
              {tab === 'dettaglio' && (
                <>
                  <div className="ric-filters">
                    <div className="ric-search-wrap">
                      <span>🔍</span>
                      <input className="ric-search" placeholder="Cerca targa, padroncino, stazione…"
                        value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="ric-tipo-filters">
                      {(['TUTTI', 'INTERNA', 'ESTERNA'] as const).map((t) => (
                        <button key={t}
                          className={`ric-tipo-btn ${filtroTipo === t ? 'ric-tipo-active' : ''}`}
                          onClick={() => setFiltroTipo(t)}>
                          {t === 'TUTTI' ? 'Tutti' : t === 'INTERNA' ? '⚡ Interne' : '🔌 Esterne'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ric-table-wrap">
                    <table className="ric-table">
                      <thead>
                        <tr>
                          <th className="ric-th-sort" onClick={() => toggleDett('tipoRicarica')}>TIPO<span className="ric-sort-icon">{sortIcon('tipoRicarica', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('targa')}>TARGA<span className="ric-sort-icon">{sortIcon('targa', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('categoriaMezzo')}>CAT.<span className="ric-sort-icon">{sortIcon('categoriaMezzo', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('padroncino')}>PADRONCINO<span className="ric-sort-icon">{sortIcon('padroncino', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('stazione')}>STAZIONE<span className="ric-sort-icon">{sortIcon('stazione', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('inizioSessione')}>INIZIO<span className="ric-sort-icon">{sortIcon('inizioSessione', sortDett)}</span></th>
                          <th className="ric-th-sort" onClick={() => toggleDett('durata')}>DURATA<span className="ric-sort-icon">{sortIcon('durata', sortDett)}</span></th>
                          <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDett('kwh')}>kWh<span className="ric-sort-icon">{sortIcon('kwh', sortDett)}</span></th>
                          <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDett('costoUnitario')}>€/kWh<span className="ric-sort-icon">{sortIcon('costoUnitario', sortDett)}</span></th>
                          <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDett('costoBase')}>COST. BASE<span className="ric-sort-icon">{sortIcon('costoBase', sortDett)}</span></th>
                          <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDett('maggiorazione')}>MAG.%<span className="ric-sort-icon">{sortIcon('maggiorazione', sortDett)}</span></th>
                          <th className="ric-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDett('costoFinale')}>COSTO FINALE<span className="ric-sort-icon">{sortIcon('costoFinale', sortDett)}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessFiltr.length === 0 && (
                          <tr><td colSpan={12} className="ric-empty">Nessuna sessione trovata</td></tr>
                        )}
                        {sortedSessFiltr.map((s, i) => {
                          const cat = catLabel(s.categoriaMezzo);
                          return (
                            <tr key={s.id ?? i} className={`ric-row ${s.tipoRicarica === 'INTERNA' ? 'ric-row-int' : 'ric-row-ext'}`}>
                              <td><span className={`ric-tipo-badge ${s.tipoRicarica === 'INTERNA' ? 'ric-badge-int' : 'ric-badge-ext'}`}>{s.tipoRicarica === 'INTERNA' ? '⚡ INT' : '🔌 EXT'}</span></td>
                              <td><span className="ric-targa">{s.targa}</span></td>
                              <td>{cat.label !== '—' ? <span className={`ric-cat-badge ${cat.cls}`}>{cat.label}</span> : <span className="ric-na">—</span>}</td>
                              <td>{(() => { const nome = s.padroncino ?? mezziMap.get(s.targa)?.padroncino ?? mezziMap.get(s.targa)?.utilizzatore ?? null; return nome ? <span className="ric-padroncino">{nome}</span> : <span className="ric-na">—</span>; })()}</td>
                              <td className="ric-stazione" title={s.stazione ?? ''}>{s.stazione?.split(' - ').slice(1).join(' - ') || s.stazione}</td>
                              <td className="ric-data">{s.inizioSessione}</td>
                              <td className="ric-durata">{s.durata}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num">{fmtK(s.kwh)}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num">{s.costoUnitario > 0 ? fmtE4(s.costoUnitario) : <span className="ric-na">—</span>}</td>
                              <td style={{ textAlign: 'right' }} className="ric-num">{s.costoBase > 0 ? fmtE(s.costoBase) : <span className="ric-na">—</span>}</td>
                              <td style={{ textAlign: 'right' }}><span className="ric-mag-badge">{s.maggiorazione}%</span></td>
                              <td style={{ textAlign: 'right' }}><span className="ric-costo">{fmtE(s.costoFinale)} €</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {sortedSessFiltr.length > 0 && (
                        <tfoot>
                          <tr className="ric-foot">
                            <td colSpan={7}><strong>TOTALE ({sortedSessFiltr.length} sessioni)</strong></td>
                            <td style={{ textAlign: 'right' }}><strong>{fmtK(sortedSessFiltr.reduce((a, r) => a + r.kwh, 0))}</strong></td>
                            <td colSpan={3}></td>
                            <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(sortedSessFiltr.reduce((a, r) => a + r.costoFinale, 0))} €</strong></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
