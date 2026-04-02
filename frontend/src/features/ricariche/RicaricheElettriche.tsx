// src/features/ricariche/RicaricheElettriche.tsx
import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react'; 
import { api, mezziApi } from '../../lib/api';
import './RicaricheElettriche.css';

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

interface MezzoInfo {
  id: string;
  targa: string;
  maggiorazioneRicarica: number | null;
  padroncino: string | null;
  categoria: string | null;
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

interface RigaCSV {
  driver: string; targa: string; sessionId: string;
  durata: string; stazione: string; inizioSessione: string; fineSessione: string;
  energiaKwh: number;
}

function parseEnergy(raw: string): number {
  if (!raw || raw.trim() === '0') return 0;
  return parseFloat(raw.replace(',', '.')) || 0;
}
function isInterna(stazione: string): boolean {
  return stazione.toLowerCase().includes('juice');
}
function parseCSV(text: string): RigaCSV[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  lines[0] = lines[0].replace(/^\uFEFF/, '');
  const sep = lines[0].includes(';') ? ';' : ',';
  return lines.slice(1).map((line) => {
    const cols = line.split(sep);
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
const fmtK  = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function catLabel(cat?: string | null): { label: string; cls: string } {
  if (!cat) return { label: '—', cls: '' };
  if (cat.toUpperCase().includes('AUTO')) return { label: '🚗 Az.', cls: 'ric-cat-auto' };
  return { label: '🚛 Dist.', cls: 'ric-cat-dist' };
}
function getCurrentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Componente principale ────────────────────────────────────────────────────
export default function RicaricheElettriche() {
  const [mese, setMese] = useState(getCurrentMonth());
  const [tab, setTab] = useState<'riepilogo' | 'dettaglio'>('riepilogo');

  // tariffe
  const [fatturaImporto, setFatturaImporto] = useState('');
  const [fatturaKwh, setFatturaKwh]         = useState('');
  const [costoEsterno, setCostoEsterno]     = useState('0.870');
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

  // ── carica mezzi ──
  const caricaMezzi = useCallback(async () => {
    try {
      const res = await mezziApi.list({ limit: '500' });
      const map = new Map<string, MezzoInfo>();
      for (const m of res.data) {
        const ass = (m as any).assegnazioni?.find((a: any) => !a.dataFine);
        map.set(m.targa.toUpperCase(), {
          id: m.id, targa: m.targa,
          maggiorazioneRicarica: (m as any).maggiorazioneRicarica ?? null,
          padroncino: ass?.padroncino?.ragioneSociale ?? null,
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
        setCostoEsterno(res.tariffe.costoEsternoKwh ? String(res.tariffe.costoEsternoKwh) : '0.870');
      }
    } catch (e: any) { setError(e.message ?? 'Errore caricamento'); }
    finally { setLoading(false); }
  }, []);

  const caricaMesi = useCallback(async () => {
    try { setMesiDisp(await api.get<MeseEntry[]>('/ricariche/mesi')); } catch { /* ignora */ }
  }, []);

  useEffect(() => { caricaMezzi(); caricaMesi(); }, [caricaMezzi, caricaMesi]);
  useEffect(() => { caricaMese(mese); }, [mese, caricaMese]);

  const costoInternoKwh = useMemo(() => {
    const imp = parseFloat(fatturaImporto.replace(',', '.'));
    const kwh = parseFloat(fatturaKwh.replace(',', '.'));
    if (!imp || !kwh || kwh === 0) return null;
    return imp / kwh;
  }, [fatturaImporto, fatturaKwh]);

  // ── aggiorna tariffe mese esistente ──
  const handleAggiornaTariffe = async () => {
    if (!costoInternoKwh) return alert("Inserisci dati validi per la bolletta (Importo e kWh).");
    setSaving(true);
    try {
      await api.put(`/ricariche/${mese}/tariffe`, {
        fatturaImporto: parseFloat(fatturaImporto.replace(',', '.')),
        fatturaKwh: parseFloat(fatturaKwh.replace(',', '.')),
        costoEsternoKwh: parseFloat(costoEsterno.replace(',', '.')),
      });
      await caricaMese(mese);
      alert("Tariffe aggiornate e sessioni ricalcolate con successo!");
    } catch (e: any) {
      alert("Errore aggiornamento tariffe: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── import CSV: Step 1 Lettura ──
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
  };

  // ── import CSV: Step 2 Conferma ──
  const handleConfermaImport = async () => {
    if (!costoInternoKwh) return alert('Inserisci importo fattura e kWh per calcolare il costo interno prima di importare.');
    setSaving(true);
    try {
      const costoInt = costoInternoKwh;
      const costoExt = parseFloat(costoEsterno.replace(',', '.')) || 0;
      const magDef   = parseFloat(magDefault) || 20;

      const sess = righeAnteprima.map((r) => {
        const tipo: 'INTERNA' | 'ESTERNA' = isInterna(r.stazione) ? 'INTERNA' : 'ESTERNA';
        const mInfo = mezziMap.get(r.targa.toUpperCase());
        const mag   = mInfo?.maggiorazioneRicarica ?? magDef;
        const cu    = tipo === 'INTERNA' ? costoInt : costoExt;
        const base  = r.energiaKwh * cu;
        const tot   = base * (1 + mag / 100);
        return {
          targa: r.targa.toUpperCase(), 
          sessioneId: r.sessionId, // Se back-end lo richiede
          tipoRicarica: tipo, 
          stazione: r.stazione, 
          durata: r.durata,
          inizioSessione: r.inizioSessione, 
          fineSessione: r.fineSessione,
          kwh: r.energiaKwh, 
          costoUnitario: cu, 
          costoBase: base,
          maggiorazione: mag, 
          costoFinale: tot
        };
      });

      await api.post('/ricariche/importa', { 
        mese, 
        sessioni: sess,
        tariffe: {
          fatturaImporto: parseFloat(fatturaImporto.replace(',', '.')),
          fatturaKwh: parseFloat(fatturaKwh.replace(',', '.')),
          costoEsternoKwh: costoExt
        }
      });
      setShowImport(false);
      setRigheAnteprima([]);
      setNomeFile('');
      await Promise.all([caricaMese(mese), caricaMesi()]);
    } catch (e: any) { alert('Errore importazione: ' + e.message); }
    finally { setSaving(false); }
  };

  const annullaImport = () => {
    setRigheAnteprima([]);
    setNomeFile('');
  };

  const eliminaMese = async () => {
    if (!confirm(`Eliminare tutti i dati di ${mese}?`)) return;
    await api.delete(`/ricariche/${mese}`);
    setSessioni([]); setTariffe(null); await caricaMesi();
  };

  // ── filtro dettaglio ──
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

  // ── stats ──
  const stats = useMemo(() => {
    const int = sessioni.filter((s) => s.tipoRicarica === 'INTERNA');
    const ext = sessioni.filter((s) => s.tipoRicarica === 'ESTERNA');
    return {
      tot: sessioni.length,
      kwhTot: sessioni.reduce((a, r) => a + r.kwh, 0),
      costoTot: sessioni.reduce((a, r) => a + r.costoFinale, 0),
      kwhInt: int.reduce((a, r) => a + r.kwh, 0), costoInt: int.reduce((a, r) => a + r.costoFinale, 0),
      kwhExt: ext.reduce((a, r) => a + r.kwh, 0), costoExt: ext.reduce((a, r) => a + r.costoFinale, 0),
    };
  }, [sessioni]);

  // ── riepilogo per targa con fallback su mezziMap ──
  const riepilogo = useMemo(() => {
    const map = new Map<string, { 
      targa: string; 
      padroncino: string | null; 
      categoria: string | null; 
      kwhInt: number; 
      kwhExt: number; 
      costoInt: number; 
      costoExt: number; 
      costoTot: number; 
      sessioni: SessioneDB[] 
    }>();

    for (const s of sessioni) {
      if (!map.has(s.targa)) {
        const infoMezzo = mezziMap.get(s.targa);
        const padroncinoFallback = infoMezzo?.padroncino ?? null;
        const categoriaFallback = infoMezzo?.categoria ?? null;

        map.set(s.targa, {
          targa: s.targa,
          padroncino: s.padroncino ?? padroncinoFallback,
          categoria: s.categoriaMezzo ?? categoriaFallback,
          kwhInt: 0,
          kwhExt: 0,
          costoInt: 0,
          costoExt: 0,
          costoTot: 0,
          sessioni: [],
        });
      }

      const e = map.get(s.targa)!;
      if (s.tipoRicarica === 'INTERNA') {
        e.kwhInt += s.kwh;
        e.costoInt += s.costoFinale;
      } else {
        e.kwhExt += s.kwh;
        e.costoExt += s.costoFinale;
      }
      e.costoTot += s.costoFinale;
      e.sessioni.push(s);
    }
    return Array.from(map.values()).sort((a, b) => b.costoTot - a.costoTot);
  }, [sessioni, mezziMap]); 

  const hasDati = sessioni.length > 0;

  return (
    <div className="ric-page">
      {/* ── HEADER ── */}
      <div className="ric-header">
        <div><h1>⚡ Ricariche Elettriche</h1><span className="ric-sub">Gestione e storico ricariche per mese</span></div>
        <div className="ric-header-actions">
          <div className="ric-mese-wrap">
            <label>Mese</label>
            <input type="month" className="ric-mese-input" value={mese} onChange={(e) => setMese(e.target.value)} />
          </div>
          {hasDati && <button className="btn-outline btn-sm ric-del-mese" onClick={eliminaMese}>🗑 Elimina</button>}
          <button className="btn-primary" onClick={() => setShowImport((v) => !v)}>
            {showImport ? '✕ Chiudi' : '📂 Importa CSV'}
          </button>
        </div>
      </div>

      {/* ── STORICO MESI ── */}
      {mesiDisp.length > 0 && (
        <div className="ric-mesi-strip">
          <span className="ric-mesi-label">Storico:</span>
          {mesiDisp.map((m) => (
            <button key={m.mese} className={`ric-mese-chip ${mese === m.mese ? 'ric-mese-chip-active' : ''}`} onClick={() => setMese(m.mese!)}>
              {m.mese} <span className="ric-mese-cnt">{m.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── PANNELLO MODIFICA TARIFFE MESE (Visibile se ci sono dati e non siamo in import) ── */}
      {hasDati && !showImport && (
        <div className="ric-tariffe-edit-panel">
          <div className="ric-panel-title">📝 Modifica tariffe mese</div>
          <div className="ric-edit-grid">
            <input className="ric-input" type="number" step="0.01" placeholder="Importo fattura €" value={fatturaImporto} onChange={e => setFatturaImporto(e.target.value)} />
            <input className="ric-input" type="number" step="0.001" placeholder="kWh fatturati" value={fatturaKwh} onChange={e => setFatturaKwh(e.target.value)} />
            <input className="ric-input" type="number" step="0.001" placeholder="€/kWh esterno" value={costoEsterno} onChange={e => setCostoEsterno(e.target.value)} />
            <button className="btn-success" onClick={handleAggiornaTariffe} disabled={saving}>
              {saving ? '⏳...' : '🔄 Aggiorna e Ricalcola'}
            </button>
          </div>
        </div>
      )}

      {/* ── PANNELLO IMPORT (Due Step) ── */}
      {showImport && (
        <div className="ric-import-panel">
          <div className="ric-import-title">📂 Importa sessioni {mese}</div>
          
          {righeAnteprima.length === 0 ? (
            // Step 1: Drop/Select CSV
            <div className={`ric-upload-zone ${dragOver ? 'ric-upload-drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} 
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop} 
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFileChange} />
              <div className="ric-upload-prompt">
                <span className="ric-upload-icon">📂</span>
                <div>
                  <div className="ric-upload-title">{hasDati ? `Sostituisci dati ${mese}` : `Carica CSV ${mese}`}</div>
                  <div className="ric-upload-hint">Trascina CSV o clicca per selezionare</div>
                </div>
              </div>
            </div>
          ) : (
            // Step 2: Configura tariffe e conferma
            <div className="ric-import-config">
              <div className="ric-import-info">
                📄 File: <strong>{nomeFile}</strong> ({righeAnteprima.length} sessioni trovate in anteprima)
              </div>
              <div className="ric-config-grid3">
                <div className="ric-config-section">
                  <div className="ric-config-sub">⚡ Ricariche Interne (JuiceBox)</div>
                  <div className="ric-config-row">
                    <div className="ric-config-field"><label>Importo fattura (€)</label>
                      <input className="ric-input" type="number" step="0.01" placeholder="1250.00" value={fatturaImporto} onChange={(e) => setFatturaImporto(e.target.value)} /></div>
                    <div className="ric-config-field"><label>kWh fatturati</label>
                      <input className="ric-input" type="number" step="0.001" placeholder="2850" value={fatturaKwh} onChange={(e) => setFatturaKwh(e.target.value)} /></div>
                  </div>
                  <div className={`ric-kwh-result ${costoInternoKwh ? 'ric-kwh-ok' : 'ric-kwh-empty'}`}>
                    {costoInternoKwh
                      ? <><span className="ric-kwh-val">{fmtE4(costoInternoKwh)}</span><span className="ric-kwh-unit">€/kWh calcolato</span></>
                      : <span className="ric-kwh-placeholder">→ inserisci fattura e kWh</span>}
                  </div>
                </div>
                <div className="ric-config-section">
                  <div className="ric-config-sub">🔌 Ricariche Esterne</div>
                  <div className="ric-config-field"><label>Costo kWh esterno (€)</label>
                    <input className="ric-input" type="number" step="0.001" placeholder="0.870" value={costoEsterno} onChange={(e) => setCostoEsterno(e.target.value)} /></div>
                </div>
                <div className="ric-config-section">
                  <div className="ric-config-sub">📊 Maggiorazione e Conferma</div>
                  <div className="ric-config-field"><label>% se non su mezzo</label>
                    <div className="ric-input-suffix-wrap">
                      <input className="ric-input" type="number" step="1" min="0" value={magDefault} onChange={(e) => setMagDefault(e.target.value)} />
                      <span className="ric-input-suffix">%</span>
                    </div>
                  </div>
                  <div className="ric-import-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary" onClick={handleConfermaImport} disabled={saving || !costoInternoKwh}>
                      {saving ? '⏳ Salvataggio...' : '🚀 Conferma Import'}
                    </button>
                    <button className="btn-outline" onClick={annullaImport} disabled={saving}>Annulla</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LOADING / EMPTY / ERROR ── */}
      {loading && <div className="ric-loading"><div className="ric-spinner" /><span>Caricamento {mese}…</span></div>}
      {!loading && error && <div className="ric-error">⚠️ {error}</div>}
      {!loading && !hasDati && !error && (
        <div className="ric-empty-state">
          <span className="ric-empty-icon">⚡</span>
          <div className="ric-empty-title">Nessun dato per {mese}</div>
          <div className="ric-empty-hint">Clicca "Importa CSV" per caricare le sessioni</div>
        </div>
      )}

      {/* ── DATI PRESENTI ── */}
      {!loading && hasDati && (
        <>
          {/* Tariffe snapshot */}
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

          {/* Stats */}
          <div className="ric-stats-row">
            <div className="ric-stat"><span className="ric-stat-label">SESSIONI</span><span className="ric-stat-val">{stats.tot}</span></div>
            <div className="ric-stat"><span className="ric-stat-label">ENERGIA</span><span className="ric-stat-val">{fmtK(stats.kwhTot)} <small>kWh</small></span></div>
            <div className="ric-stat ric-stat-int">
              <span className="ric-stat-label">⚡ INTERNE</span>
              <span className="ric-stat-val">{fmtK(stats.kwhInt)} kWh</span>
              <span className="ric-stat-sub">{fmtE(stats.costoInt)} €</span>
            </div>
            <div className="ric-stat ric-stat-ext">
              <span className="ric-stat-label">🔌 ESTERNE</span>
              <span className="ric-stat-val">{fmtK(stats.kwhExt)} kWh</span>
              <span className="ric-stat-sub">{fmtE(stats.costoExt)} €</span>
            </div>
            <div className="ric-stat ric-stat-total">
              <span className="ric-stat-label">TOTALE</span>
              <span className="ric-stat-val">{fmtE(stats.costoTot)} €</span>
            </div>
          </div>

          {/* Tabs */}
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
            <div className="ric-table-wrap">
              <table className="ric-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>TARGA</th>
                    <th>CAT.</th>
                    <th>PADRONCINO</th>
                    <th style={{ textAlign: 'right' }}>kWh Int.</th>
                    <th style={{ textAlign: 'right' }}>Costo Int.</th>
                    <th style={{ textAlign: 'right' }}>kWh Ext.</th>
                    <th style={{ textAlign: 'right' }}>Costo Ext.</th>
                    <th style={{ textAlign: 'right' }}>TOTALE</th>
                  </tr>
                </thead>
                <tbody>
                  {riepilogo.map((r) => {
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
                          <td style={{ textAlign: 'right' }} className="ric-num">{r.kwhInt > 0 ? fmtK(r.kwhInt) : '—'}</td>
                          <td style={{ textAlign: 'right' }} className="ric-num">{r.costoInt > 0 ? <span className="ric-badge-int-sm">{fmtE(r.costoInt)} €</span> : '—'}</td>
                          <td style={{ textAlign: 'right' }} className="ric-num">{r.kwhExt > 0 ? fmtK(r.kwhExt) : '—'}</td>
                          <td style={{ textAlign: 'right' }} className="ric-num">{r.costoExt > 0 ? <span className="ric-badge-ext-sm">{fmtE(r.costoExt)} €</span> : '—'}</td>
                          <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(r.costoTot)} €</strong></td>
                        </tr>
                        {esp && (
                          <tr className="ric-detail-row">
                            <td colSpan={9}>
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
                    <td colSpan={4}><strong>TOTALE ({riepilogo.length} mezzi)</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtK(stats.kwhInt)}</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtE(stats.costoInt)} €</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtK(stats.kwhExt)}</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtE(stats.costoExt)} €</strong></td>
                    <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(stats.costoTot)} €</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── TAB DETTAGLIO ── */}
          {tab === 'dettaglio' && (
            <>
              <div className="ric-filters">
                <div className="ric-search-wrap">
                  <span>🔍</span>
                  <input className="ric-search" placeholder="Cerca targa, padroncino, stazione…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="ric-tipo-filters">
                  {(['TUTTI', 'INTERNA', 'ESTERNA'] as const).map((t) => (
                    <button key={t} className={`ric-tipo-btn ${filtroTipo === t ? 'ric-tipo-active' : ''}`} onClick={() => setFiltroTipo(t)}>
                      {t === 'TUTTI' ? 'Tutti' : t === 'INTERNA' ? '⚡ Interne' : '🔌 Esterne'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ric-table-wrap">
                <table className="ric-table">
                  <thead>
                    <tr>
                      <th>TIPO</th><th>TARGA</th><th>CAT.</th><th>PADRONCINO</th>
                      <th>STAZIONE</th><th>INIZIO</th><th>DURATA</th>
                      <th style={{ textAlign: 'right' }}>kWh</th>
                      <th style={{ textAlign: 'right' }}>€/kWh</th>
                      <th style={{ textAlign: 'right' }}>COST. BASE</th>
                      <th style={{ textAlign: 'right' }}>MAG.%</th>
                      <th style={{ textAlign: 'right' }}>COSTO FINALE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessFiltr.length === 0 && <tr><td colSpan={12} className="ric-empty">Nessuna sessione trovata</td></tr>}
                    {sessFiltr.map((s, i) => {
                      const cat = catLabel(s.categoriaMezzo);
                      return (
                        <tr key={s.id ?? i} className={`ric-row ${s.tipoRicarica === 'INTERNA' ? 'ric-row-int' : 'ric-row-ext'}`}>
                          <td><span className={`ric-tipo-badge ${s.tipoRicarica === 'INTERNA' ? 'ric-badge-int' : 'ric-badge-ext'}`}>{s.tipoRicarica === 'INTERNA' ? '⚡ INT' : '🔌 EXT'}</span></td>
                          <td><span className="ric-targa">{s.targa}</span></td>
                          <td>{cat.label !== '—' ? <span className={`ric-cat-badge ${cat.cls}`}>{cat.label}</span> : <span className="ric-na">—</span>}</td>
                          <td>{s.padroncino ? <span className="ric-padroncino">{s.padroncino}</span> : <span className="ric-na">—</span>}</td>
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
                  {sessFiltr.length > 0 && (
                    <tfoot>
                      <tr className="ric-foot">
                        <td colSpan={7}><strong>TOTALE ({sessFiltr.length} sessioni)</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{fmtK(sessFiltr.reduce((a, r) => a + r.kwh, 0))}</strong></td>
                        <td colSpan={3}></td>
                        <td style={{ textAlign: 'right' }}><strong className="ric-costo">{fmtE(sessFiltr.reduce((a, r) => a + r.costoFinale, 0))} €</strong></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}