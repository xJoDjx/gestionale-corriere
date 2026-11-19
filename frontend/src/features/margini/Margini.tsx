// src/features/margini/Margini.tsx
//
// Pagina "Margini" — split dalla vecchia ContaDoppi.tsx (pageTab 'margini').
// Usa GLI STESSI endpoint già esistenti (/conta-doppi/margini*), quindi non
// serve nessuna modifica al backend. Aggiunge solo una dashboard storica che
// interroga in parallelo gli ultimi mesi con GET /conta-doppi/margini?mese=X
// (l'endpoint già gestisce con grazia un mese senza dati).
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import './Margini.css';
import './Margini2.css';
import { Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SearchBox, Select, Empty, Alert, Icon, Th, C, fmtEur } from '../../components/ds';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const getToken = () => {
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  try { return JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state?.token ?? null; }
  catch { return null; }
};
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

// ── Types (identici alla vecchia ContaDoppi.tsx) ────────────────────────────
interface DettaglioNonConsegnata {
  esito: string; nonConsegnate: number; percNonConsegnate: number;
}
interface RigaMargine {
  codice: string; autista: string; padroncino: string | null;
  fatturato: number | null; competenzeAttive: number | null;
  noli: number | null; costi: number | null;
  extra: number | null; note: string | null;
  differenza: number | null; percentuale: number | null;
  percNonConsegnate: number | null;
  dettaglioNonConsegnate: DettaglioNonConsegnata[] | null;
}
interface MarginiResult {
  mese: string;
  righe: RigaMargine[];
  statisticaImportata: boolean;
  statisticaAggiornataAl: string | null;
  fatturatoImportato: boolean;
  fatturatoAggiornatoAl: string | null;
  statisticaConsegneImportata: boolean;
  statisticaConsegneAggiornataAl: string | null;
  codiciSoloStatistica: string[];
  codiciSoloFatturato: string[];
  totaleFatturato: number;
  totaleCompetenzeAttive: number;
  totaleDifferenza: number;
  totaleFatturatoPda: number;
  esclusi: { codice: string; autista: string }[];
}

const SOGLIA_MARGINE_MIN = 30;
const SOGLIA_NON_CONSEGNATE = 13;
type SortFieldMargini = 'codice' | 'autista' | 'padroncino' | 'fatturato' | 'competenzeAttive' | 'extra' | 'differenza' | 'percentuale' | 'percNonConsegnate';

function meseCorrente() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function meseLabelItaliano(mese: string): string {
  const [anno, m] = mese.split('-');
  const nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${nomi[parseInt(m, 10) - 1]} ${anno}`;
}
function ultimiMesi(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const eur = (n: number | null | undefined) => n == null ? '—' : fmtEur(n);
const pctStr = (n: number | null) => n == null ? '—' : `${n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pctStr2 = (n: number | null) => n == null ? '—' : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

async function fetchMargini(mese: string): Promise<MarginiResult | null> {
  try {
    const res = await fetch(`${API_BASE}/conta-doppi/margini?mese=${mese}`, { headers: authHeader() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
export default function Margini() {
  const [mese, setMese] = useState(meseCorrente());
  const [autoMese, setAutoMese] = useState(false);

  // Storico: ultimi 6 mesi interrogati in parallelo (stesso endpoint)
  const [mesiStats, setMesiStats] = useState<Record<string, MarginiResult>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const mesiWindow = ultimiMesi(6); // finestra scorrevole di 6 mesi, più recente per primo

  const caricaSommari = useCallback(async () => {
    setLoadingStats(true);
    const results = await Promise.all(mesiWindow.map(m => fetchMargini(m)));
    const map: Record<string, MarginiResult> = {};
    mesiWindow.forEach((m, i) => { if (results[i]) map[m] = results[i]!; });
    setMesiStats(map);
    setLoadingStats(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { caricaSommari(); }, [caricaSommari]);

  const mesiConDati = mesiWindow.filter(m => {
    const d = mesiStats[m];
    return d && (d.statisticaImportata || d.fatturatoImportato || d.righe.length > 0);
  });

  // All'apertura mostra l'ultimo mese con dati se quello corrente è vuoto
  useEffect(() => {
    if (autoMese || loadingStats) return;
    setAutoMese(true);
    if (!mesiConDati.includes(mese) && mesiConDati.length) setMese(mesiConDati[0]);
  }, [autoMese, loadingStats, mesiConDati, mese]);

  const mesiOpts = [
    { value: STORICO, label: 'Storico 6 mesi' },
    ...Array.from(new Set([...ultimiMesi(12), mese === STORICO ? meseCorrente() : mese])).sort().reverse()
      .map((m) => ({ value: m, label: `${meseLabelItaliano(m)}${mesiConDati.includes(m) ? '' : ' · vuoto'}` })),
  ];
  const selectMese = <Select label="Mese" value={mese} onChange={(m) => { setMese(m); if (m === STORICO) caricaSommari(); }} options={mesiOpts} />;

  if (mese === STORICO) return <MarginiStorico mesiStats={mesiStats} mesiConDati={mesiConDati} loading={loadingStats} selectMese={selectMese} onApri={setMese} />;
  return <MarginiDetail mese={mese} selectMese={selectMese} />;
}

const STORICO = 'STORICO';

function MarginiStorico({ mesiStats, mesiConDati, loading, selectMese, onApri }: {
  mesiStats: Record<string, MarginiResult>; mesiConDati: string[]; loading: boolean; selectMese: ReactNode; onApri: (m: string) => void;
}) {
  // ── Aggregati storico (formule invariate) ──
  const totFatturato = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleFatturato || 0), 0);
  const totCompetenze = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleCompetenzeAttive || 0), 0);
  const totUtile = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleDifferenza || 0), 0);
  const margineMedio = totCompetenze !== 0 ? (totUtile / totCompetenze * 100) : 0;
  const fatPct = totFatturato + totCompetenze !== 0 ? Math.round(totFatturato / (totFatturato + totCompetenze) * 100) : 0;
  const compPct = 100 - fatPct;

  return (
    <Page>
      <PageHeader eyebrow="Analisi" title="Margini e statistiche COD" sub={`Storico degli ultimi 6 mesi · ${mesiConDati.length} mesi con dati`} actions={selectMese} />
      <Kpis items={[
        { label: 'Fatturato (+ extra)', value: eur(totFatturato), color: C.teal, icon: 'trend', sub: 'Tutti i mesi' },
        { label: 'Competenze attive', value: eur(totCompetenze), color: C.blue, icon: 'euro', sub: `Fatturato ${fatPct}% · competenze ${compPct}%` },
        { label: 'Utile totale', value: eur(totUtile), color: C.purple, icon: 'marg', sub: `Margine medio ${pctStr(margineMedio)}`, seg: [{ w: Math.max(0, Math.min(100, margineMedio)), color: C.purple }, { w: 100 - Math.max(0, Math.min(100, margineMedio)), color: '#E4E4E7' }] },
        { label: 'Mesi analizzati', value: String(mesiConDati.length), color: C.gray, icon: 'cal', sub: 'Dati caricati' },
      ]} />
      <Card>
        <div style={{ padding: '14px 18px 10px' }}><CardHead title="Storico mensile" sub="Clic su un mese per aprirlo" /></div>
        {loading ? <Empty>Caricamento storico…</Empty> : mesiConDati.length === 0 ? <Empty>Nessun dato ancora: scegli un mese e importa i file.</Empty> : (
          <div className="ds-tablewrap">
            <table className="ds-table">
              <thead><tr><th>Mese</th><th>Codici</th><th>Fatturato vs competenze</th><th className="r">Fatturato</th><th className="r">Competenze</th><th className="r">Margine</th><th className="r">Utile</th></tr></thead>
              <tbody>
                {mesiConDati.map(m => {
                  const d = mesiStats[m];
                  const marg = d.totaleCompetenzeAttive !== 0 ? (d.totaleDifferenza / d.totaleCompetenzeAttive * 100) : 0;
                  const fp = (d.totaleFatturato + d.totaleCompetenzeAttive) !== 0 ? Math.round(d.totaleFatturato / (d.totaleFatturato + d.totaleCompetenzeAttive) * 100) : 0;
                  const missing = !d.statisticaImportata || !d.fatturatoImportato;
                  return (
                    <tr key={m} className="is-clickable" onClick={() => onApri(m)}>
                      <td style={{ fontWeight: 600 }}>{meseLabelItaliano(m)}</td>
                      <td>{d.righe.length}{missing && <span className="mg2-miss"> · import incompleto</span>}</td>
                      <td><span className="mg2-split"><i style={{ flexGrow: fp || 0.01, background: C.teal }} /><i style={{ flexGrow: (100 - fp) || 0.01, background: C.blue }} /></span></td>
                      <td className="r">{eur(d.totaleFatturato)}</td>
                      <td className="r">{eur(d.totaleCompetenzeAttive)}</td>
                      <td className="r" style={{ fontWeight: 600, color: marg < SOGLIA_MARGINE_MIN ? '#B91C1C' : '#15803D' }}>{pctStr(marg)}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{eur(d.totaleDifferenza)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Vista di dettaglio — logica identica alla vecchia TabMargini, restyled.
function MarginiDetail({ mese, selectMese }: { mese: string; selectMese: ReactNode }) {
  const [dati, setDati] = useState<MarginiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingStat, setImportingStat] = useState(false);
  const [importingFatt, setImportingFatt] = useState(false);
  const [importingConsegne, setImportingConsegne] = useState(false);
  const [azzerando, setAzzerando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [soloProblemi, setSoloProblemi] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [sortField, setSortField] = useState<SortFieldMargini>('percentuale');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAggiungi, setShowAggiungi] = useState(false);
  const inputStatRef = useRef<HTMLInputElement>(null);
  const inputFattRef = useRef<HTMLInputElement>(null);
  const inputConsegneRef = useRef<HTMLInputElement>(null);

  const carica = useCallback(async (m: string) => {
    setLoading(true); setErrore(null);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini?mese=${m}`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore nel caricamento dei margini');
      setDati(data);
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); setDati(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carica(mese); }, [mese, carica]);

  const handleFileStatistica = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    setImportingStat(true); setErrore(null);
    const form = new FormData(); form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini/importa?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'importazione');
      await carica(mese);
      if (data.nonRiconosciuti?.length) {
        setErrore(`Statistica: importate ${data.righeImportate} righe. ${data.nonRiconosciuti.length} autisti senza codice riconoscibile: ${data.nonRiconosciuti.slice(0, 5).join(', ')}${data.nonRiconosciuti.length > 5 ? '…' : ''}`);
      }
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); }
    finally { setImportingStat(false); if (inputStatRef.current) inputStatRef.current.value = ''; }
  }, [mese, carica]);

  const handleFileFattura = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    setImportingFatt(true); setErrore(null);
    const form = new FormData(); form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini/importa-fattura?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'importazione');
      await carica(mese);
      if (data.nonRiconosciuti?.length) {
        setErrore(`Fattura Proforma: importate ${data.righeImportate} righe. ${data.nonRiconosciuti.length} autisti senza codice riconoscibile: ${data.nonRiconosciuti.slice(0, 5).join(', ')}${data.nonRiconosciuti.length > 5 ? '…' : ''}`);
      }
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); }
    finally { setImportingFatt(false); if (inputFattRef.current) inputFattRef.current.value = ''; }
  }, [mese, carica]);

  const handleFileConsegne = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    setImportingConsegne(true); setErrore(null);
    const form = new FormData(); form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini/importa-consegne?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'importazione');
      await carica(mese);
      if (data.nonRiconosciuti?.length) {
        setErrore(`Statistica Consegne: importati ${data.righeImportate} codici. ${data.nonRiconosciuti.length} righe senza codice riconoscibile: ${data.nonRiconosciuti.slice(0, 5).join(', ')}${data.nonRiconosciuti.length > 5 ? '…' : ''}`);
      }
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); }
    finally { setImportingConsegne(false); if (inputConsegneRef.current) inputConsegneRef.current.value = ''; }
  }, [mese, carica]);

  const azzeraMese = useCallback(async () => {
    const label = meseLabelItaliano(mese);
    if (!confirm(
      `Azzerare TUTTE le statistiche COD di ${label}?\n\n` +
      `Verranno eliminati: Statistica Margini Dist., Fattura Proforma, Statistica Consegne e le modifiche manuali ` +
      `(extra, note, codici aggiunti/esclusi) di questo mese.\n` +
      `I conteggi mensili e le trattenute già applicate NON vengono toccati.`
    )) return;
    setAzzerando(true); setErrore(null);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini?mese=${mese}`, { method: 'DELETE', headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'azzeramento');
      await carica(mese);
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); }
    finally { setAzzerando(false); }
  }, [mese, carica]);

  const parseNum = (s: string) => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const salvaManuale = useCallback((codice: string, campi: {
    extraStr: string; noteStr: string; padroncinoStr: string; fatturatoStr: string; competenzeStr: string;
  }) => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const extraVal = parseNum(campi.extraStr);
    const noteVal = campi.noteStr.trim() === '' ? null : campi.noteStr;
    const padroncinoVal = campi.padroncinoStr.trim() === '' ? null : campi.padroncinoStr;
    const fatturatoVal = parseNum(campi.fatturatoStr);
    const competenzeVal = parseNum(campi.competenzeStr);

    setDati((prev) => {
      if (!prev) return prev;
      const righe = prev.righe.map((r) => {
        if (r.codice !== codice) return r;
        let differenza: number | null = null, percentuale: number | null = null;
        if (competenzeVal != null && (fatturatoVal != null || extraVal != null)) {
          const fatturatoConExtra = round2((fatturatoVal ?? 0) + (extraVal ?? 0));
          differenza = round2(competenzeVal - fatturatoConExtra);
          percentuale = competenzeVal !== 0 ? round2((differenza / competenzeVal) * 100) : null;
        }
        return { ...r, extra: extraVal, note: noteVal, padroncino: padroncinoVal, fatturato: fatturatoVal, competenzeAttive: competenzeVal, differenza, percentuale };
      });
      return {
        ...prev, righe,
        totaleFatturato: round2(righe.reduce((s, r) => s + (r.fatturato ?? 0) + (r.extra ?? 0), 0)),
        totaleCompetenzeAttive: round2(righe.reduce((s, r) => s + (r.competenzeAttive ?? 0), 0)),
        totaleDifferenza: round2(righe.reduce((s, r) => s + (r.differenza ?? 0), 0)),
      };
    });

    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        mese, codice, extra: extraVal, note: noteVal,
        padroncino: padroncinoVal, fatturato: fatturatoVal, competenzeAttive: competenzeVal,
      }),
    }).catch(() => {});
  }, [mese]);

  const aggiungiCodice = useCallback(async (nuovo: {
    codice: string; autista: string; padroncino: string; fatturato: string; competenzeAttive: string;
  }) => {
    const codice = nuovo.codice.trim().toUpperCase();
    if (!codice) { setErrore('Il codice è obbligatorio'); return false; }
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini/riga`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          mese, codice,
          autista: nuovo.autista.trim() === '' ? null : nuovo.autista.trim(),
          padroncino: nuovo.padroncino.trim() === '' ? null : nuovo.padroncino.trim(),
          fatturato: parseNum(nuovo.fatturato),
          competenzeAttive: parseNum(nuovo.competenzeAttive),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Errore durante l\'aggiunta del codice'); }
      await carica(mese);
      return true;
    } catch (e: any) { setErrore(e.message || 'Errore sconosciuto'); return false; }
  }, [mese, carica]);

  const esclude = useCallback((codice: string) => {
    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ mese, codice, escluso: true }),
    }).then(() => carica(mese)).catch(() => setErrore('Errore durante l\'esclusione del codice'));
  }, [mese, carica]);

  const ripristina = useCallback((codice: string) => {
    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ mese, codice, escluso: false }),
    }).then(() => carica(mese)).catch(() => setErrore('Errore durante il ripristino del codice'));
  }, [mese, carica]);

  const esporta = () => {
    if (!dati) return;
    const rows = dati.righe.map((r) => ({
      'Codice': r.codice, 'Autista': r.autista, 'Padroncino': r.padroncino ?? '',
      'Fatturato (€)': r.fatturato ?? '', 'Competenze Attive (€)': r.competenzeAttive ?? '',
      'Extra (€)': r.extra ?? '', 'Differenza (€)': r.differenza ?? '', '% Margine': r.percentuale ?? '',
      '% Non Consegnate': r.percNonConsegnate ?? '', 'Note': r.note ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Margini');
    XLSX.writeFile(wb, `margini_${mese}.xlsx`);
  };

  const toggleSort = (field: SortFieldMargini) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const testoRicerca = ricerca.trim().toLowerCase();
  const righeVisibili = (dati?.righe ?? [])
    .filter((r) => {
      if (soloProblemi) {
        const problema = (r.fatturato == null && r.extra == null) || r.competenzeAttive == null ||
          (r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN);
        if (!problema) return false;
      }
      if (testoRicerca) {
        const haystack = `${r.codice} ${r.autista} ${r.padroncino ?? ''}`.toLowerCase();
        if (!haystack.includes(testoRicerca)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortField], vb = b[sortField];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'it', { sensitivity: 'base' }) * dir;
      return ((va as number) - (vb as number)) * dir;
    });

  const hasDati = (dati?.righe.length ?? 0) > 0;
  const mezziCount = dati?.righe.length ?? 0;
  const sottoSoglia = dati?.righe.filter(r => r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN).length ?? 0;

  const dataImp = (d: string | null) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const FILES = [
    { n: 'Statistica Margini Dist.', ok: !!dati?.statisticaImportata, at: dati?.statisticaAggiornataAl ?? null, h: 'Autista, Competenze Attive', busy: importingStat, ref: inputStatRef, on: handleFileStatistica },
    { n: 'Fattura Proforma', ok: !!dati?.fatturatoImportato, at: dati?.fatturatoAggiornatoAl ?? null, h: 'Autista, Importo Totale', busy: importingFatt, ref: inputFattRef, on: handleFileFattura },
    { n: 'Statistica Consegne', ok: !!dati?.statisticaConsegneImportata, at: dati?.statisticaConsegneAggiornataAl ?? null, h: 'A (codice), AC-AE esito', busy: importingConsegne, ref: inputConsegneRef, on: handleFileConsegne },
  ];
  const daControllare = (dati?.righe ?? []).filter(r => r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN)
    .sort((x, y) => (x.percentuale ?? 0) - (y.percentuale ?? 0));
  const incompleti = (dati?.righe ?? []).filter(r => (r.fatturato == null && r.extra == null) || r.competenzeAttive == null);
  const margMedio = dati && dati.totaleCompetenzeAttive !== 0 ? dati.totaleDifferenza / dati.totaleCompetenzeAttive * 100 : null;
  const azzerabile = !!(dati && (dati.statisticaImportata || dati.fatturatoImportato || dati.statisticaConsegneImportata || dati.righe.length > 0));
  const sortState = { key: sortField, dir: sortDir };

  return (
    <Page>
      <PageHeader
        eyebrow="Analisi"
        title="Margini e statistiche COD"
        sub={`${meseLabelItaliano(mese)} · ${mezziCount} codici analizzati, ${dati?.esclusi.length ? `${dati.esclusi.length} esclusi` : 'nessuno escluso'}`}
        actions={<>
          {selectMese}
          <Button icon="plus" onClick={() => setShowAggiungi(true)}>Aggiungi codice</Button>
          <Button icon="download" onClick={esporta} disabled={!hasDati}>Esporta Excel</Button>
          <Button icon="trash" variant="danger" onClick={azzeraMese} disabled={azzerando || loading || !azzerabile}
            title={`Elimina tutte le statistiche COD di ${meseLabelItaliano(mese)}`}>{azzerando ? 'Azzeramento…' : 'Azzera mese'}</Button>
        </>}
      />

      {showAggiungi && (
        <AggiungiCodiceModal
          onClose={() => setShowAggiungi(false)}
          onSave={async (nuovo) => { const ok = await aggiungiCodice(nuovo); if (ok) setShowAggiungi(false); }}
        />
      )}

      <section aria-label="File importati" className="ds-g3">
        {FILES.map((f) => (
          <div key={f.n} className="ds-card mg2-file">
            <input ref={f.ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => f.on(e.target.files?.[0])} />
            <span className={`mg2-fileic${f.ok ? '' : ' is-off'}`}><Icon name={f.ok ? 'doc' : 'upload'} size={15} /></span>
            <div className="mg2-filet">
              <strong>{f.n}</strong>
              <span>{f.busy ? 'Importazione in corso…' : f.ok ? `${f.at ? dataImp(f.at) : 'Importato'} · colonne ${f.h}` : `Non importato · colonne ${f.h}`}</span>
            </div>
            <Button size="sm" icon="upload" onClick={() => f.ref.current?.click()} disabled={f.busy}>{f.ok ? 'Reimporta' : 'Importa'}</Button>
          </div>
        ))}
      </section>

      {errore && <Alert tone="ko" title="Attenzione" actions={<IconButton icon="close" label="Chiudi" onClick={() => setErrore(null)} />}>{errore}</Alert>}
      {loading && <Card pad><Empty>Caricamento margini…</Empty></Card>}

      {!loading && dati && hasDati && (<>
        <Kpis items={[
          { label: 'Fatturato (+ extra)', value: eur(dati.totaleFatturato), color: C.teal, icon: 'trend',
            sub: `Fattura proforma · fatturato PDA da conteggi ${eur(dati.totaleFatturatoPda)}` },
          { label: 'Competenze attive', value: eur(dati.totaleCompetenzeAttive), color: C.blue, icon: 'euro',
            sub: dati.totaleCompetenzeAttive !== 0 ? `Da Statistica Margini Dist. · fatturato ${(dati.totaleFatturato / dati.totaleCompetenzeAttive * 100).toFixed(1)}%` : 'Da Statistica Margini Dist.' },
          { label: 'Utile totale', value: eur(dati.totaleDifferenza), color: C.purple, icon: 'marg',
            sub: margMedio != null ? `Margine medio ${pctStr(margMedio)}` : '—',
            seg: margMedio != null ? [{ w: Math.max(0, Math.min(100, margMedio)), color: C.purple }, { w: 100 - Math.max(0, Math.min(100, margMedio)), color: '#E4E4E7' }] : undefined },
          { label: 'Da controllare', value: String(sottoSoglia), color: C.red, icon: 'warn', subColor: '#B91C1C',
            sub: `Margine sotto il ${SOGLIA_MARGINE_MIN}%${incompleti.length ? ` · ${incompleti.length} con dati mancanti` : ''}` },
        ]} />

        <div className="ds-g4">
          <Card pad className="ds-s3">
            <CardHead title="Da controllare" sub={`Margine sotto il ${SOGLIA_MARGINE_MIN}%, dal più basso`} />
            {daControllare.length === 0 ? <Empty>Nessun codice sotto soglia</Empty> : (
              <div className="ds-g2 mg2-check">
                {daControllare.map((r) => {
                  const p = r.percentuale ?? 0;
                  const col = p < 0 ? '#B91C1C' : p < 15 ? '#C2410C' : '#A16207';
                  return (
                    <div key={r.codice} className="mg2-ck" title={`${r.autista}${r.padroncino ? ` · ${r.padroncino}` : ''}`}>
                      <span className="mg2-code">{r.codice}</span>
                      <span className="mg2-ckn"><span>{r.autista}</span><i style={{ width: `${Math.max(4, Math.min(100, (p / SOGLIA_MARGINE_MIN) * 100))}%`, background: col }} /></span>
                      <span style={{ color: col }}>{pctStr(r.percentuale)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card pad>
            <CardHead title="Dati incompleti" sub="Senza fatturato né competenze attive" />
            {incompleti.length === 0 ? <Empty>Tutti i codici hanno i dati</Empty> : (<>
              <div className="mg2-chips">{incompleti.map((r) => <span key={r.codice} title={r.autista}>{r.codice}</span>)}</div>
              {dati.codiciSoloStatistica.length > 0 && <span className="ds-cardsub">{dati.codiciSoloStatistica.length} senza fatturato/extra · {dati.codiciSoloFatturato.length} senza competenze attive</span>}
              <span className="ds-cardsub">Si completano con Aggiungi codice o si escludono dal mese.</span>
            </>)}
          </Card>
        </div>

        <Card>
          <div className="mg2-head">
            <CardHead title="Margini per codice" sub="Differenza = competenze attive − (fatturato + extra); % sulle competenze" />
            <div className="mg2-tools">
              <SearchBox value={ricerca} onChange={setRicerca} placeholder="Cerca codice, autista, padroncino…" width={260} />
              <button type="button" aria-pressed={soloProblemi} className={`mg2-solo${soloProblemi ? ' is-on' : ''}`} onClick={() => setSoloProblemi(v => !v)}>
                <Icon name="filter" size={13} />Solo sotto il {SOGLIA_MARGINE_MIN}% o incompleti
              </button>
            </div>
          </div>
          {dati.esclusi.length > 0 && (
            <div className="mg2-escl">
              <span>{dati.esclusi.length} esclusi dal calcolo di questo mese:</span>
              {dati.esclusi.map((e) => (
                <button key={e.codice} type="button" title="Ripristina" onClick={() => ripristina(e.codice)}>
                  <b>{e.codice}</b><span>{e.autista}</span><em>↺</em>
                </button>
              ))}
            </div>
          )}
          <div className="ds-tablewrap">
            <table className="ds-table mg2-table">
              <colgroup>
                <col style={{ width: 72 }} /><col style={{ width: 160 }} /><col />
                <col style={{ width: 90 }} /><col style={{ width: 122 }} /><col style={{ width: 72 }} /><col style={{ width: 100 }} />
                <col style={{ width: 92 }} /><col style={{ width: 124 }} /><col style={{ width: 110 }} /><col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr>
                  <Th k="codice" sort={sortState} onSort={toggleSort}>Codice</Th>
                  <Th k="autista" sort={sortState} onSort={toggleSort}>Autista</Th>
                  <Th k="padroncino" sort={sortState} onSort={toggleSort}>Padroncino</Th>
                  <Th k="fatturato" sort={sortState} onSort={toggleSort} right>Fatturato</Th>
                  <Th k="competenzeAttive" sort={sortState} onSort={toggleSort} right>Competenze attive</Th>
                  <Th k="extra" sort={sortState} onSort={toggleSort} right>Extra</Th>
                  <Th k="differenza" sort={sortState} onSort={toggleSort} right>Differenza</Th>
                  <Th k="percentuale" sort={sortState} onSort={toggleSort} right>% margine</Th>
                  <Th k="percNonConsegnate" sort={sortState} onSort={toggleSort} right>% non consegnate</Th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {righeVisibili.map((r, i) => (
                  <RigaMarginiRow key={r.codice} r={r} i={i} onSaveManuale={salvaManuale} onEsclude={esclude} />
                ))}
                {righeVisibili.length === 0 && <tr><td colSpan={11}><Empty>Nessun dato da mostrare</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mg2-foot">Mostrati {righeVisibili.length} di {mezziCount} codici · {dati.esclusi.length ? `${dati.esclusi.length} esclusi questo mese` : 'nessun codice escluso questo mese'} · clic su un codice con statistica consegne per il dettaglio delle non consegnate</div>
        </Card>
      </>)}

      {!loading && !hasDati && !errore && (
        <Card pad><Empty>Nessun dato per {meseLabelItaliano(mese).toLowerCase()}: importa la Statistica Margini Dist. e la Fattura Proforma dalle schede qui sopra.</Empty></Card>
      )}
    </Page>
  );
}

function RigaMarginiRow({ r, i, onSaveManuale, onEsclude }: {
  r: RigaMargine; i: number;
  onSaveManuale: (codice: string, campi: { extraStr: string; noteStr: string; padroncinoStr: string; fatturatoStr: string; competenzeStr: string }) => void;
  onEsclude: (codice: string) => void;
}) {
  const [extraStr, setExtraStr] = useState(r.extra != null ? String(r.extra) : '');
  const [noteStr, setNoteStr] = useState(r.note ?? '');
  const [padroncinoStr, setPadroncinoStr] = useState(r.padroncino ?? '');
  const [fatturatoStr, setFatturatoStr] = useState(r.fatturato != null ? String(r.fatturato) : '');
  const [competenzeStr, setCompetenzeStr] = useState(r.competenzeAttive != null ? String(r.competenzeAttive) : '');
  const [espansa, setEspansa] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const haDettaglio = !!r.dettaglioNonConsegnate?.length;

  useEffect(() => { setExtraStr(r.extra != null ? String(r.extra) : ''); }, [r.extra]);
  useEffect(() => { setNoteStr(r.note ?? ''); }, [r.note]);
  useEffect(() => { setPadroncinoStr(r.padroncino ?? ''); }, [r.padroncino]);
  useEffect(() => { setFatturatoStr(r.fatturato != null ? String(r.fatturato) : ''); }, [r.fatturato]);
  useEffect(() => { setCompetenzeStr(r.competenzeAttive != null ? String(r.competenzeAttive) : ''); }, [r.competenzeAttive]);

  const schedule = (next: Partial<{ extraStr: string; noteStr: string; padroncinoStr: string; fatturatoStr: string; competenzeStr: string }>) => {
    const campi = { extraStr, noteStr, padroncinoStr, fatturatoStr, competenzeStr, ...next };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSaveManuale(r.codice, campi), 600);
  };

  const sottoSoglia = r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN;
  const nonConsegnateAlte = r.percNonConsegnate != null && r.percNonConsegnate >= SOGLIA_NON_CONSEGNATE;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
    <tr
      className={`${haDettaglio ? 'is-clickable' : ''}${espansa ? ' is-open' : ''}`}
      onClick={haDettaglio ? () => setEspansa(v => !v) : undefined}
      title={haDettaglio ? 'Clicca per il dettaglio % Non Consegnate' : undefined}
    >
      <td>
        <span className="mg2-code">
          {haDettaglio && <span className="ric2-caret" aria-hidden="true"><Icon name={espansa ? 'chevDown' : 'chevRight'} size={11} /></span>}
          {r.codice}
        </span>
      </td>
      <td className="mg2-ell" title={r.autista}>{String(r.autista ?? '').replace(new RegExp(`\\s*\\(${r.codice}\\)\\s*$`), '') || r.autista}</td>
      <td onClick={stop}>
        <input type="text" className="mg2-in" value={padroncinoStr} placeholder="—" title={padroncinoStr}
          onChange={(e) => { setPadroncinoStr(e.target.value); schedule({ padroncinoStr: e.target.value }); }} />
      </td>
      <td className="r" onClick={stop}>
        <input type="number" step="0.01" className="mg2-in r" value={fatturatoStr} placeholder="0,00"
          onChange={(e) => { setFatturatoStr(e.target.value); schedule({ fatturatoStr: e.target.value }); }} />
      </td>
      <td className="r" onClick={stop}>
        <input type="number" step="0.01" className="mg2-in r" value={competenzeStr} placeholder="0,00"
          onChange={(e) => { setCompetenzeStr(e.target.value); schedule({ competenzeStr: e.target.value }); }} />
      </td>
      <td className="r" onClick={stop}>
        <input type="number" step="0.01" className="mg2-in r" value={extraStr} placeholder="0,00"
          onChange={(e) => { setExtraStr(e.target.value); schedule({ extraStr: e.target.value }); }} />
      </td>
      <td className="r" style={{ fontWeight: 600, color: r.differenza != null && r.differenza < 0 ? '#B91C1C' : undefined }}>{eur(r.differenza)}</td>
      <td className="r"><span className={`mg2-pct${sottoSoglia ? ' is-ko' : r.percentuale != null ? ' is-ok' : ''}`}>{pctStr(r.percentuale)}</span></td>
      <td className="r">
        {r.percNonConsegnate != null
          ? <span style={{ fontWeight: 600, color: nonConsegnateAlte ? '#B91C1C' : undefined }}>{pctStr2(r.percNonConsegnate)}</span>
          : <span style={{ color: '#A1A1AA' }}>—</span>}
      </td>
      <td onClick={stop}>
        <input type="text" className="mg2-in" value={noteStr} placeholder="Nota…"
          onChange={(e) => { setNoteStr(e.target.value); schedule({ noteStr: e.target.value }); }} />
      </td>
      <td className="r" onClick={stop}>
        <IconButton icon="trash" danger label="Escludi questo codice dal calcolo margini"
          onClick={() => { if (window.confirm(`Escludere il codice ${r.codice} dal calcolo margini di questo mese?`)) onEsclude(r.codice); }} />
      </td>
    </tr>
    {espansa && haDettaglio && (() => {
      const dettaglio = r.dettaglioNonConsegnate!;
      const totNonConsegnate = dettaglio.reduce((s, d) => s + d.nonConsegnate, 0);
      return (
        <tr className="mg-nc-detail-row">
          {/* colonne #, Codice, Autista, Padroncino, Fatturato, Competenze — vuote */}
          <td colSpan={5} className="mg-nc-detail-spacer" />
          {/* colonne Extra, Differenza, % Margine — Esito + Non Consegnate */}
          <td colSpan={3} className="mg-nc-detail-list">
            <div className="mg-nc-line mg-nc-line-hd"><span>Esito</span><span>Non Cons.</span></div>
            {dettaglio.map((d, idx) => (
              <div key={idx} className={`mg-nc-line ${d.percNonConsegnate >= SOGLIA_NON_CONSEGNATE ? 'mg-nc-line-danger' : ''}`}>
                <span className="mg-nc-esito">{d.esito}</span>
                <span className="mg-nc-num">{d.nonConsegnate}</span>
              </div>
            ))}
            <div className="mg-nc-line mg-nc-line-total"><span>Totale</span><span className="mg-nc-num">{totNonConsegnate}</span></div>
          </td>
          {/* colonna % Non Consegnate — allineata con la colonna principale omonima */}
          <td colSpan={1} className="mg-nc-detail-pct">
            <div className="mg-nc-line mg-nc-line-hd"><span>%</span></div>
            {dettaglio.map((d, idx) => (
              <div key={idx} className={`mg-nc-line ${d.percNonConsegnate >= SOGLIA_NON_CONSEGNATE ? 'mg-nc-line-danger' : ''}`}>
                <span className="mg-nc-num">{pctStr2(d.percNonConsegnate)}</span>
              </div>
            ))}
            <div className="mg-nc-line mg-nc-line-total"><span className="mg-nc-num">{pctStr2(r.percNonConsegnate)}</span></div>
          </td>
          {/* colonne Note, azione — vuote */}
          <td colSpan={2} className="mg-nc-detail-spacer" />
        </tr>
      );
    })()}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Modale per aggiungere manualmente un nuovo codice al mese corrente
// (usa lo stesso endpoint PATCH /conta-doppi/margini/riga già esistente).
function AggiungiCodiceModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (nuovo: { codice: string; autista: string; padroncino: string; fatturato: string; competenzeAttive: string }) => Promise<void>;
}) {
  const [codice, setCodice] = useState('');
  const [autista, setAutista] = useState('');
  const [padroncino, setPadroncino] = useState('');
  const [fatturato, setFatturato] = useState('');
  const [competenzeAttive, setCompetenzeAttive] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!codice.trim()) return;
    setSaving(true);
    try { await onSave({ codice, autista, padroncino, fatturato, competenzeAttive }); }
    finally { setSaving(false); }
  };

  return (
    <div className="mg-modal-overlay">
      <div className="mg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mg-modal-hd">
          <span>Aggiungi nuovo codice</span>
          <IconButton icon="close" label="Chiudi" onClick={onClose} />
        </div>
        <div className="mg-modal-body">
          <label className="mg-modal-field">
            <span>Codice *</span>
            <input type="text" value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="Es. AB12" autoFocus />
          </label>
          <label className="mg-modal-field">
            <span>Autista</span>
            <input type="text" value={autista} onChange={(e) => setAutista(e.target.value)} placeholder="Nome Cognome" />
          </label>
          <label className="mg-modal-field">
            <span>Padroncino</span>
            <input type="text" value={padroncino} onChange={(e) => setPadroncino(e.target.value)} placeholder="Ragione sociale" />
          </label>
          <label className="mg-modal-field">
            <span>Fatturato (€)</span>
            <input type="number" step="0.01" value={fatturato} onChange={(e) => setFatturato(e.target.value)} placeholder="0,00" />
          </label>
          <label className="mg-modal-field">
            <span>Competenze Attive (€)</span>
            <input type="number" step="0.01" value={competenzeAttive} onChange={(e) => setCompetenzeAttive(e.target.value)} placeholder="0,00" />
          </label>
        </div>
        <div className="mg-modal-footer">
          <Button onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !codice.trim()}>{saving ? 'Salvataggio…' : 'Aggiungi'}</Button>
        </div>
      </div>
    </div>
  );
}
