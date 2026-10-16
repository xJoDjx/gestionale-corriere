// src/features/margini/Margini.tsx
//
// Pagina "Margini" — split dalla vecchia ContaDoppi.tsx (pageTab 'margini').
// Usa GLI STESSI endpoint già esistenti (/conta-doppi/margini*), quindi non
// serve nessuna modifica al backend. Aggiunge solo una dashboard storica che
// interroga in parallelo gli ultimi mesi con GET /conta-doppi/margini?mese=X
// (l'endpoint già gestisce con grazia un mese senza dati).
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import './Margini.css';

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
const eur = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
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
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [mese, setMese] = useState(meseCorrente());

  // Dashboard state
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

  const apriMese = (m: string) => { setMese(m); setView('detail'); };
  const onNuovaImportazione = () => { setMese(meseCorrente()); setView('detail'); };

  // ── Aggregati dashboard ──
  const totFatturato = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleFatturato || 0), 0);
  const totCompetenze = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleCompetenzeAttive || 0), 0);
  const totUtile = mesiConDati.reduce((a, m) => a + (mesiStats[m].totaleDifferenza || 0), 0);
  const margineMedio = totCompetenze !== 0 ? (totUtile / totCompetenze * 100) : 0;
  const fatPct = totFatturato + totCompetenze !== 0 ? Math.round(totFatturato / (totFatturato + totCompetenze) * 100) : 0;
  const compPct = 100 - fatPct;

  const ultimoMese = mesiConDati[0];
  const codiciDaControllare = ultimoMese
    ? [...mesiStats[ultimoMese].righe]
      .filter(r => r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN)
      .sort((a, b) => (a.percentuale ?? 0) - (b.percentuale ?? 0))
      .slice(0, 6)
    : [];

  return (
    <div className="mg-page">
      {view === 'dashboard' && (
        <>
          <div className="mg-header">
            <div>
              <h1>📊 Statistiche COD</h1>
              <span className="mg-sub">Fatturato vs Competenze Attive e % Non Consegnate — storico mensile</span>
            </div>
            <div className="mg-header-actions">
              <button className="mg-btn-primary" onClick={onNuovaImportazione}>📂 Nuova Importazione</button>
            </div>
          </div>

          <div className="mg-kpi-row">
            <div className="mg-kpi mg-kpi-blue"><span className="mg-kpi-label">Mesi Analizzati</span><span className="mg-kpi-val">{mesiConDati.length}</span><span className="mg-kpi-sub">dati caricati</span></div>
            <div className="mg-kpi mg-kpi-teal"><span className="mg-kpi-label">Tot. Fatturato (+Extra)</span><span className="mg-kpi-val mg-kpi-val-md">{eur(totFatturato)}</span><span className="mg-kpi-sub">tutti i mesi</span></div>
            <div className="mg-kpi mg-kpi-blue"><span className="mg-kpi-label">Tot. Competenze Attive</span><span className="mg-kpi-val mg-kpi-val-md">{eur(totCompetenze)}</span><span className="mg-kpi-sub">tutti i mesi</span></div>
            <div className="mg-kpi mg-kpi-purple"><span className="mg-kpi-label">Tot. Utile</span><span className="mg-kpi-val mg-kpi-val-md">{eur(totUtile)}</span><span className="mg-kpi-sub">competenze − fatturato</span></div>
            <div className="mg-kpi mg-kpi-amber"><span className="mg-kpi-label">Margine Medio</span><span className="mg-kpi-val">{pctStr(margineMedio)}</span><span className="mg-kpi-sub">su tutti i codici</span></div>
          </div>

          {loadingStats && <div className="mg-loading"><div className="mg-spinner" /><span>Caricamento storico…</span></div>}

          {!loadingStats && mesiConDati.length === 0 && (
            <div className="mg-empty-state">
              <span className="mg-empty-icon">💶</span>
              <div className="mg-empty-title">Nessun dato ancora</div>
              <button className="mg-btn-primary" onClick={onNuovaImportazione}>📂 Importa il primo mese</button>
            </div>
          )}

          {!loadingStats && mesiConDati.length > 0 && (
            <div className="mg-dash-grid">
              <div className="mg-panel">
                <div className="mg-panel-hd"><span>📅 Storico Mensile</span><span className="mg-panel-sub">{mesiConDati.length} mesi · clicca per aprire</span></div>
                <div className="mg-month-col-hd">
                  <span>MESE</span><span>FATTURATO vs COMPETENZE</span>
                  <span style={{ textAlign: 'center' }}>MARGINE</span>
                  <span style={{ textAlign: 'right' }}>UTILE</span><span />
                </div>
                {mesiConDati.map(m => {
                  const d = mesiStats[m];
                  const marg = d.totaleCompetenzeAttive !== 0 ? (d.totaleDifferenza / d.totaleCompetenzeAttive * 100) : 0;
                  const fp = (d.totaleFatturato + d.totaleCompetenzeAttive) !== 0 ? Math.round(d.totaleFatturato / (d.totaleFatturato + d.totaleCompetenzeAttive) * 100) : 0;
                  const cp = 100 - fp;
                  const missing = !d.statisticaImportata || !d.fatturatoImportato;
                  return (
                    <div key={m} className="mg-month-row" onClick={() => apriMese(m)}>
                      <div>
                        <div className="mg-month-name">{meseLabelItaliano(m)}</div>
                        <div className="mg-month-sub">{d.righe.length} codici{missing ? ' · import incompleto' : ''}</div>
                      </div>
                      <div>
                        <div className="mg-bar-wrap"><div className="mg-bar-fat" style={{ flex: fp || 0.01 }} /><div className="mg-bar-comp" style={{ flex: cp || 0.01 }} /></div>
                        <div className="mg-bar-labels"><span className="mg-fat-label">Fatt. {eur(d.totaleFatturato)}</span><span className="mg-comp-label">Comp. {eur(d.totaleCompetenzeAttive)}</span></div>
                      </div>
                      <div style={{ textAlign: 'center' }}><span className={`mg-margine-badge ${marg < SOGLIA_MARGINE_MIN ? 'mg-margine-danger' : 'mg-margine-ok'}`}>{pctStr(marg)}</span></div>
                      <div style={{ textAlign: 'right' }}><span className="mg-utile-val">{eur(d.totaleDifferenza)}</span><span className="mg-utile-sub">totale</span></div>
                      <div style={{ textAlign: 'right' }}><span className="mg-apri-btn">Apri →</span></div>
                    </div>
                  );
                })}
              </div>

              <div className="mg-sidebar">
                <div className="mg-panel">
                  <div className="mg-panel-hd"><span>⚠️ Da Controllare</span><span className="mg-panel-sub">{ultimoMese ? meseLabelItaliano(ultimoMese) : ''}</span></div>
                  {codiciDaControllare.map(r => (
                    <div key={r.codice} className="mg-check-row">
                      <code className="mg-check-code">{r.codice}</code>
                      <span className="mg-check-name">{r.autista}</span>
                      <span className="mg-check-pct">{pctStr(r.percentuale)}</span>
                    </div>
                  ))}
                  {codiciDaControllare.length === 0 && <div className="mg-empty-hint">✅ Nessun codice sotto soglia</div>}
                </div>

                <div className="mg-panel">
                  <div className="mg-panel-hd" style={{ display: 'block' }}><span>📊 Fatturato vs Competenze</span><span className="mg-panel-sub" style={{ display: 'block' }}>tutti i mesi</span></div>
                  <div className="mg-split-body">
                    <div className="mg-split-bar-wrap"><div className="mg-split-bar-fat" style={{ flex: fatPct || 0.01 }} /><div className="mg-split-bar-comp" style={{ flex: compPct || 0.01 }} /></div>
                    <div className="mg-split-row"><span className="mg-split-legend"><span className="mg-split-dot" style={{ background: '#0d9488' }} />Fatturato (+Extra)</span><span className="mg-split-pct-fat">{fatPct}%</span></div>
                    <div className="mg-split-row"><span className="mg-split-legend"><span className="mg-split-dot" style={{ background: '#2563eb' }} />Competenze Attive</span><span className="mg-split-pct-comp">{compPct}%</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'detail' && (
        <MarginiDetail mese={mese} onBack={() => { setView('dashboard'); caricaSommari(); }} onMeseChange={setMese} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Vista di dettaglio — logica identica alla vecchia TabMargini, restyled.
function MarginiDetail({ mese, onBack, onMeseChange }: { mese: string; onBack: () => void; onMeseChange: (m: string) => void }) {
  const [dati, setDati] = useState<MarginiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingStat, setImportingStat] = useState(false);
  const [importingFatt, setImportingFatt] = useState(false);
  const [importingConsegne, setImportingConsegne] = useState(false);
  const [azzerando, setAzzerando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [soloProblemi, setSoloProblemi] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [sortField, setSortField] = useState<SortFieldMargini>('codice');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showImport, setShowImport] = useState(false);
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
  const sortIcon = (field: SortFieldMargini) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

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

  return (
    <>
      <div className="mg-header">
        <div className="mg-header-left">
          <button className="mg-btn-outline mg-btn-sm" onClick={onBack}>← Storico</button>
          <div>
            <h1>📊 {meseLabelItaliano(mese)}</h1>
            <span className="mg-sub">{mezziCount} codici analizzati</span>
          </div>
        </div>
        <div className="mg-header-actions">
          <div className="mg-mese-wrap">
            <label>Mese</label>
            <input type="month" className="mg-mese-input" value={mese} onChange={(e) => onMeseChange(e.target.value)} />
          </div>
          <button className="mg-btn-outline mg-btn-sm mg-export-btn" onClick={esporta} disabled={!hasDati}>📥 Esporta Excel</button>
          <button className="mg-btn-outline mg-btn-sm" onClick={() => setShowAggiungi(true)}>➕ Aggiungi codice</button>
          <button className="mg-btn-outline mg-btn-sm mg-btn-danger" onClick={azzeraMese}
            disabled={azzerando || loading || !(dati && (dati.statisticaImportata || dati.fatturatoImportato || dati.statisticaConsegneImportata || dati.righe.length > 0))}
            title={`Elimina tutte le statistiche COD di ${meseLabelItaliano(mese)}`}>
            {azzerando ? 'Azzeramento…' : '🗑️ Azzera mese'}
          </button>
          <button className="mg-btn-primary" onClick={() => setShowImport(v => !v)}>{showImport ? '✕ Chiudi' : '📂 Importa file'}</button>
        </div>
      </div>

      {showAggiungi && (
        <AggiungiCodiceModal
          onClose={() => setShowAggiungi(false)}
          onSave={async (nuovo) => { const ok = await aggiungiCodice(nuovo); if (ok) setShowAggiungi(false); }}
        />
      )}

      {showImport && (
        <div className="mg-import-panel">
          <div className="mg-drop-zone" onClick={() => inputStatRef.current?.click()}>
            <input ref={inputStatRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFileStatistica(e.target.files?.[0])} />
            <div className="mg-drop-icon">📂</div>
            <div className="mg-drop-title">{importingStat ? 'Importazione in corso…' : <>Carica <strong>Statistica Margini Dist.</strong></>}</div>
            <div className="mg-drop-hint">Colonne richieste: <strong>Autista</strong>, <strong>Competenze Attive</strong></div>
            {dati?.statisticaImportata && dati.statisticaAggiornataAl && (
              <div className="mg-drop-info">Importata il {new Date(dati.statisticaAggiornataAl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
          <div className="mg-drop-zone" onClick={() => inputFattRef.current?.click()}>
            <input ref={inputFattRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFileFattura(e.target.files?.[0])} />
            <div className="mg-drop-icon">📂</div>
            <div className="mg-drop-title">{importingFatt ? 'Importazione in corso…' : <>Carica <strong>Fattura Proforma</strong></>}</div>
            <div className="mg-drop-hint">Colonne richieste: <strong>Autista</strong>, <strong>Importo Totale</strong></div>
            {dati?.fatturatoImportato && dati.fatturatoAggiornatoAl && (
              <div className="mg-drop-info">Importata il {new Date(dati.fatturatoAggiornatoAl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
          <div className="mg-drop-zone" onClick={() => inputConsegneRef.current?.click()}>
            <input ref={inputConsegneRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFileConsegne(e.target.files?.[0])} />
            <div className="mg-drop-icon">📦</div>
            <div className="mg-drop-title">{importingConsegne ? 'Importazione in corso…' : <>Carica <strong>Statistica Consegne</strong></>}</div>
            <div className="mg-drop-hint">Colonna A: codice tra le prime parentesi · Colonne AC-AE: Esito / Non Consegnate / %</div>
            {dati?.statisticaConsegneImportata && dati.statisticaConsegneAggiornataAl && (
              <div className="mg-drop-info">Importata il {new Date(dati.statisticaConsegneAggiornataAl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
        </div>
      )}

      {errore && <div className="mg-error">⚠️ {errore}<button className="mg-error-close" onClick={() => setErrore(null)}>✕</button></div>}
      {loading && <div className="mg-loading"><div className="mg-spinner" /><span>Caricamento margini…</span></div>}

      {!loading && dati && (
        <>
          <div className="mg-kpi-row mg-kpi-row-6">
            <div className="mg-kpi mg-kpi-teal"><span className="mg-kpi-label">Fatturato (+Extra)</span><span className="mg-kpi-val mg-kpi-val-md">{eur(dati.totaleFatturato)}</span><span className="mg-kpi-sub">{dati.totaleCompetenzeAttive !== 0 ? `${(dati.totaleFatturato / dati.totaleCompetenzeAttive * 100).toFixed(1)}% delle competenze` : '—'}</span></div>
            <div className="mg-kpi mg-kpi-blue"><span className="mg-kpi-label">Competenze Attive</span><span className="mg-kpi-val mg-kpi-val-md">{eur(dati.totaleCompetenzeAttive)}</span><span className="mg-kpi-sub">da conteggi</span></div>
            <div className="mg-kpi mg-kpi-purple"><span className="mg-kpi-label">Utile Totale</span><span className="mg-kpi-val mg-kpi-val-md">{eur(dati.totaleDifferenza)}</span><span className="mg-kpi-sub">{dati.totaleCompetenzeAttive !== 0 ? `${(dati.totaleDifferenza / dati.totaleCompetenzeAttive * 100).toFixed(1)}% margine medio` : '—'}</span></div>
            <div className="mg-kpi mg-kpi-gray"><span className="mg-kpi-label">Codici Analizzati</span><span className="mg-kpi-val">{mezziCount}</span><span className="mg-kpi-sub">{dati.esclusi.length > 0 ? `${dati.esclusi.length} esclusi` : 'nessuno escluso'}</span></div>
            <div className="mg-kpi mg-kpi-red"><span className="mg-kpi-label">Da Controllare</span><span className="mg-kpi-val">{sottoSoglia}</span><span className="mg-kpi-sub">margine &lt; {SOGLIA_MARGINE_MIN}%</span></div>
          </div>

          {!showImport && (
            <div className="mg-status-chips">
              <span className={`mg-chip ${dati.statisticaImportata ? 'mg-chip-ok' : 'mg-chip-warn'}`}>{dati.statisticaImportata ? '✅ Statistica Margini Dist. importata' : '⚠️ Statistica Margini Dist. non importata'}</span>
              <span className={`mg-chip ${dati.fatturatoImportato ? 'mg-chip-ok' : 'mg-chip-warn'}`}>{dati.fatturatoImportato ? '✅ Fattura Proforma importata' : '⚠️ Fattura Proforma non importata'}</span>
              <span className={`mg-chip ${dati.statisticaConsegneImportata ? 'mg-chip-ok' : 'mg-chip-warn'}`}>{dati.statisticaConsegneImportata ? '✅ Statistica Consegne importata' : '⚠️ Statistica Consegne non importata'}</span>
            </div>
          )}

          {(dati.codiciSoloStatistica.length > 0 || dati.codiciSoloFatturato.length > 0) && (
            <div className="mg-warn-box">
              {dati.codiciSoloStatistica.length > 0 && <div>⚠️ <strong>{dati.codiciSoloStatistica.length} codici</strong> senza Fatturato/Extra — {dati.codiciSoloStatistica.slice(0, 10).join(', ')}{dati.codiciSoloStatistica.length > 10 ? '…' : ''}</div>}
              {dati.codiciSoloFatturato.length > 0 && <div>⚠️ <strong>{dati.codiciSoloFatturato.length} codici</strong> senza Competenze Attive — {dati.codiciSoloFatturato.slice(0, 10).join(', ')}{dati.codiciSoloFatturato.length > 10 ? '…' : ''}</div>}
            </div>
          )}

          <div className="mg-toolbar">
            <div className="mg-search-wrap">
              <span>🔍</span>
              <input className="mg-search" placeholder="Cerca codice, autista, padroncino…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
            </div>
            <label className="mg-check-label">
              <input type="checkbox" checked={soloProblemi} onChange={(e) => setSoloProblemi(e.target.checked)} />
              Solo margini &lt; {SOGLIA_MARGINE_MIN}% o dati mancanti
            </label>
          </div>

          <div className="mg-table-wrap">
            <table className="mg-table mg-table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 170 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="mg-th-num">#</th>
                  <th className="mg-th-sort" onClick={() => toggleSort('codice')}>CODICE{sortIcon('codice')}</th>
                  <th className="mg-th-sort" onClick={() => toggleSort('autista')}>AUTISTA{sortIcon('autista')}</th>
                  <th className="mg-th-sort" onClick={() => toggleSort('padroncino')}>PADRONCINO{sortIcon('padroncino')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('fatturato')}>FATTURATO{sortIcon('fatturato')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('competenzeAttive')}>COMPETENZE ATTIVE{sortIcon('competenzeAttive')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('extra')}>EXTRA{sortIcon('extra')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('differenza')}>DIFFERENZA{sortIcon('differenza')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('percentuale')}>% MARGINE{sortIcon('percentuale')}</th>
                  <th className="mg-th-sort mg-th-num" onClick={() => toggleSort('percNonConsegnate')}>% NON CONSEGNATE{sortIcon('percNonConsegnate')}</th>
                  <th>NOTE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {righeVisibili.map((r, i) => (
                  <RigaMarginiRow key={r.codice} r={r} i={i} onSaveManuale={salvaManuale} onEsclude={esclude} />
                ))}
                {righeVisibili.length === 0 && <tr><td colSpan={12} className="mg-empty">Nessun dato da mostrare</td></tr>}
              </tbody>
            </table>
          </div>

          {dati.esclusi.length > 0 && (
            <div className="mg-warn-box" style={{ marginTop: 12 }}>
              <strong>🗑️ {dati.esclusi.length} codici esclusi dal calcolo di questo mese</strong>
              <div className="mg-esclusi-list">
                {dati.esclusi.map((e) => (
                  <span key={e.codice} className="mg-esclusi-chip">
                    <code>{e.codice}</code> {e.autista}
                    <button title="Ripristina" onClick={() => ripristina(e.codice)}>↺</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !hasDati && !errore && (
        <div className="mg-empty-state">
          <span className="mg-empty-icon">💶</span>
          <div className="mg-empty-title">Nessun dato per {meseLabelItaliano(mese)}</div>
          <div className="mg-empty-hint">Clicca "Importa file" per caricare Statistica e Fattura</div>
        </div>
      )}
    </>
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
      className={`${sottoSoglia ? 'mg-row-danger' : ''} ${haDettaglio ? 'mg-row-clickable' : ''}`}
      onClick={haDettaglio ? () => setEspansa(v => !v) : undefined}
      title={haDettaglio ? 'Clicca per il dettaglio % Non Consegnate' : undefined}
    >
      <td className="mg-td-num">{i + 1}</td>
      <td>
        <code className="mg-codice">
          {haDettaglio && <span className="mg-nc-chevron">{espansa ? '▾' : '▸'}</span>}
          {r.codice}
        </code>
      </td>
      <td className="mg-td-nome">{r.autista}</td>
      <td className="mg-td-nome" onClick={stop}>
        <input type="text" className="mg-inline-input" style={{ width: 150 }} value={padroncinoStr} placeholder="—"
          onChange={(e) => { setPadroncinoStr(e.target.value); schedule({ padroncinoStr: e.target.value }); }} />
      </td>
      <td className="mg-td-num" onClick={stop}>
        <input type="number" step="0.01" className="mg-inline-input" style={{ width: 100 }} value={fatturatoStr} placeholder="0,00"
          onChange={(e) => { setFatturatoStr(e.target.value); schedule({ fatturatoStr: e.target.value }); }} />
      </td>
      <td className="mg-td-num" onClick={stop}>
        <input type="number" step="0.01" className="mg-inline-input" style={{ width: 100 }} value={competenzeStr} placeholder="0,00"
          onChange={(e) => { setCompetenzeStr(e.target.value); schedule({ competenzeStr: e.target.value }); }} />
      </td>
      <td className="mg-td-num" onClick={stop}>
        <input type="number" step="0.01" className="mg-inline-input" style={{ width: 90 }} value={extraStr} placeholder="0,00"
          onChange={(e) => { setExtraStr(e.target.value); schedule({ extraStr: e.target.value }); }} />
      </td>
      <td className="mg-td-num"><span className={`mg-badge ${r.differenza != null && r.differenza < 0 ? 'mg-badge-danger' : 'mg-badge-primary'}`}>{eur(r.differenza)}</span></td>
      <td className="mg-td-num"><span className={`mg-badge ${sottoSoglia ? 'mg-badge-danger' : 'mg-badge-warn'}`}>{pctStr(r.percentuale)}</span></td>
      <td className="mg-td-num">
        {r.percNonConsegnate != null
          ? <span className={`mg-badge ${nonConsegnateAlte ? 'mg-badge-danger' : 'mg-badge-primary'}`}>{pctStr2(r.percNonConsegnate)}</span>
          : <span className="mg-td-empty">—</span>}
      </td>
      <td onClick={stop}>
        <input type="text" className="mg-inline-input" style={{ width: 180 }} value={noteStr} placeholder="Nota…"
          onChange={(e) => { setNoteStr(e.target.value); schedule({ noteStr: e.target.value }); }} />
      </td>
      <td className="mg-td-num" onClick={stop}>
        <button className="mg-icon-btn" title="Escludi questo codice dal calcolo margini"
          onClick={() => { if (window.confirm(`Escludere il codice ${r.codice} dal calcolo margini di questo mese?`)) onEsclude(r.codice); }}>🗑️</button>
      </td>
    </tr>
    {espansa && haDettaglio && (() => {
      const dettaglio = r.dettaglioNonConsegnate!;
      const totNonConsegnate = dettaglio.reduce((s, d) => s + d.nonConsegnate, 0);
      return (
        <tr className="mg-nc-detail-row">
          {/* colonne #, Codice, Autista, Padroncino, Fatturato, Competenze — vuote */}
          <td colSpan={6} className="mg-nc-detail-spacer" />
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
          <span>➕ Aggiungi nuovo codice</span>
          <button className="mg-icon-btn" onClick={onClose}>✕</button>
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
          <button className="mg-btn-outline mg-btn-sm" onClick={onClose} disabled={saving}>Annulla</button>
          <button className="mg-btn-primary" onClick={submit} disabled={saving || !codice.trim()}>{saving ? 'Salvataggio…' : 'Aggiungi'}</button>
        </div>
      </div>
    </div>
  );
}
