// src/features/carte-eni/CarteEni.tsx
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { carteEniApi, padronciniApi } from '../../lib/api';
import type { CartaEni, TransazioneCartaEni, MeseCarteEniEntry, PrezzoGiornoEni, Padroncino, CategoriaProdottoEni, StazioneEni } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import './CarteEni.css';

type AppView = 'dashboard' | 'anagrafica' | 'stazioni' | 'detail';

const fmtE = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtL = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// L'importo importato dal file/calcolato dal listino è già l'importo IVA inclusa.
const IVA = 1.22;
const noIva = (importo: number) => importo / IVA;

function getCurrentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function formatMese(mese: string): string {
  const [year, month] = mese.split('-');
  const nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${nomi[parseInt(month, 10) - 1] ?? month} ${year}`;
}

// Stessa logica di categorizzazione del backend: il prezzo giorno è per prodotto
// (Diesel/HVO/Benzina), perché lo stesso giorno ha prezzi diversi a seconda del carburante.
function normalizzaProdotto(prodottoRaw: string | null | undefined): CategoriaProdottoEni {
  if (!prodottoRaw) return 'ALTRO';
  const s = prodottoRaw.toUpperCase();
  if (s.includes('HVO')) return 'HVO';
  if (s.includes('DIESEL')) return 'DIESEL';
  if (s.includes('BENZ')) return 'BENZINA';
  return 'ALTRO';
}

function formatGiorno(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// L'orario salvato è quello letterale del file Eni (usato anche in fattura): va sempre
// mostrato "as-is", senza conversioni di fuso orario del browser (per questo timeZone: 'UTC').
function formatDataOra(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
}

interface MeseStats {
  importo: number;
  agImporto: number;
  pieImporto: number;
  carteCount: number;
}

export default function CarteEni() {
  const [appView, setAppView] = useState<AppView>('dashboard');
  const [mese, setMese] = useState(getCurrentMonth());

  const [mesiDisp, setMesiDisp] = useState<MeseCarteEniEntry[]>([]);
  const [transazioni, setTransazioni] = useState<TransazioneCartaEni[]>([]);
  const [prezziGiorno, setPrezziGiorno] = useState<PrezzoGiornoEni[]>([]);
  const [carte, setCarte] = useState<CartaEni[]>([]);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [stazioni, setStazioni] = useState<StazioneEni[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [showImportPrezzi, setShowImportPrezzi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const filePrezziRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [showNuovaCarta, setShowNuovaCarta] = useState(false);
  const [showNuovaStazione, setShowNuovaStazione] = useState(false);

  const [tab, setTab] = useState<'riepilogo' | 'dettaglio'>('riepilogo');
  const [espansoCarta, setEspansoCarta] = useState<string | null>(null);
  const [listinoAperto, setListinoAperto] = useState(true);

  // ── dashboard: statistiche aggregate per tutti i mesi ──
  const [mesiStats, setMesiStats] = useState<Record<string, MeseStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  // ── caricamento ──
  const caricaMesi = useCallback(async () => {
    try { setMesiDisp(await carteEniApi.listMesi()); } catch { /* ignora */ }
  }, []);

  const caricaCarte = useCallback(async () => {
    try { setCarte(await carteEniApi.listCarte()); } catch { /* ignora */ }
  }, []);

  const caricaPadroncini = useCallback(async () => {
    try { const r = await padronciniApi.list({ limit: '500' }); setPadroncini(r.data); } catch { /* ignora */ }
  }, []);

  const caricaStazioni = useCallback(async () => {
    try { setStazioni(await carteEniApi.listStazioni()); } catch { /* ignora */ }
  }, []);

  const caricaMese = useCallback(async (m: string) => {
    setLoading(true); setError(null);
    try {
      const [res, prezzi] = await Promise.all([
        carteEniApi.findByMese(m),
        carteEniApi.listPrezziGiorno(m),
      ]);
      setTransazioni(res.transazioni ?? []);
      setPrezziGiorno(prezzi ?? []);
    } catch (e: any) { setError(e.message ?? 'Errore caricamento'); }
    finally { setLoading(false); }
  }, []);

  /** Statistiche aggregate (importo agevolato/pieno, carte coinvolte) per tutti i mesi archiviati */
  const caricaSommari = useCallback(async (mesiList: MeseCarteEniEntry[]) => {
    if (!mesiList.length) return;
    setLoadingStats(true);
    try {
      const results = await Promise.all(
        mesiList.map(m =>
          carteEniApi.findByMese(m.mese)
            .then(res => ({ mese: m.mese, transazioni: res.transazioni ?? [] }))
            .catch(() => ({ mese: m.mese, transazioni: [] as TransazioneCartaEni[] }))
        )
      );
      const statsMap: Record<string, MeseStats> = {};
      for (const r of results) {
        const ag = r.transazioni.filter(t => t.agevolata);
        const pie = r.transazioni.filter(t => !t.agevolata);
        statsMap[r.mese] = {
          importo: r.transazioni.reduce((a, t) => a + t.importo, 0),
          agImporto: ag.reduce((a, t) => a + t.importo, 0),
          pieImporto: pie.reduce((a, t) => a + t.importo, 0),
          carteCount: new Set(r.transazioni.map(t => t.numeroCarta)).size,
        };
      }
      setMesiStats(statsMap);
    } finally { setLoadingStats(false); }
  }, []);

  useEffect(() => { caricaMesi(); caricaCarte(); caricaPadroncini(); caricaStazioni(); }, [caricaMesi, caricaCarte, caricaPadroncini, caricaStazioni]);
  useEffect(() => { caricaMese(mese); }, [mese, caricaMese]);
  useEffect(() => { if (mesiDisp.length > 0) caricaSommari(mesiDisp); }, [mesiDisp, caricaSommari]);

  const apriMese = (m: string) => { setMese(m); setAppView('detail'); };

  // ── import transazioni ──
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    setSaving(true);
    try {
      const res = await carteEniApi.importa(f, mese);
      alert(
        `Import completato:\n` +
        `• ${res.importate} transazioni importate\n` +
        `• ${res.carteNuove} nuove carte censite (da assegnare in Anagrafica)\n` +
        `• ${res.stazioniNuove ?? 0} nuove stazioni censite (da marcare Agevolata/Piena in Stazioni)\n` +
        `• ${res.fuoriMese} righe fuori dal mese ${mese} (ignorate)\n` +
        `• ${res.esclusiStatoOTipo} righe escluse (preautorizzazioni/negate)`
      );
      setShowImport(false);
      await Promise.all([caricaMese(mese), caricaMesi(), caricaCarte(), caricaStazioni()]);
    } catch (e: any) { alert('Errore importazione: ' + e.message); }
    finally { setSaving(false); }
  };

  const onFilePrezziChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    setSaving(true);
    try {
      const res = await carteEniApi.importaPrezzi(f);
      alert(`Listino prezzi importato: ${res.giorniImportati} giorni, ${res.transazioniAggiornate} transazioni ricalcolate.`);
      setShowImportPrezzi(false);
      await caricaMese(mese);
    } catch (e: any) { alert('Errore importazione prezzi: ' + e.message); }
    finally { setSaving(false); }
  };

  const eliminaMese = async () => {
    if (!confirm(`Eliminare tutte le transazioni di ${mese}?`)) return;
    try {
      await carteEniApi.eliminaMese(mese);
      setTransazioni([]);
      await caricaMesi();
      setAppView('dashboard');
    } catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  // ── prezzo giorno+prodotto inline edit ──
  const [editKey, setEditKey] = useState<string | null>(null); // "giorno|prodotto"
  const [editPrezzoVal, setEditPrezzoVal] = useState('');
  const salvaPrezzoGiorno = async (giornoIso: string, prodotto: CategoriaProdottoEni, valore: string) => {
    const n = parseFloat(valore.replace(',', '.'));
    if (isNaN(n) || n <= 0) return;
    try {
      await carteEniApi.aggiornaPrezzoGiorno(giornoIso.slice(0, 10), prodotto, n);
      await caricaMese(mese);
    } catch (e: any) { alert('Errore salvataggio prezzo: ' + e.message); }
    finally { setEditKey(null); }
  };

  // ── giorni presenti nel mese, con un prezzo per ciascun prodotto (Diesel/HVO/Benzina) ──
  const giorniMese = useMemo(() => {
    const map = new Map<string, { giorno: string; prodotti: Map<CategoriaProdottoEni, { prezzo: number | null; senzaListino: boolean }> }>();
    for (const t of transazioni) {
      const giorno = t.data.slice(0, 10);
      const prodotto = normalizzaProdotto(t.prodotto);
      if (!map.has(giorno)) map.set(giorno, { giorno, prodotti: new Map() });
      const g = map.get(giorno)!;
      if (!g.prodotti.has(prodotto)) {
        const pg = prezziGiorno.find(p => p.data.slice(0, 10) === giorno && p.prodotto === prodotto);
        g.prodotti.set(prodotto, { prezzo: pg?.prezzoUnitario ?? t.prezzoUnitario ?? null, senzaListino: false });
      }
      const entry = g.prodotti.get(prodotto)!;
      // Segnala il giorno/prodotto come "senza listino" a prescindere dal fatto che la stazione
      // sia agevolata o piena: qui vogliamo verificare se l'excel del listino aveva un buco per
      // quel giorno, non se il prezzo va effettivamente applicato alla transazione.
      const haListino = prezziGiorno.some(p => p.data.slice(0, 10) === giorno && p.prodotto === prodotto);
      if (!haListino) entry.senzaListino = true;
    }
    return Array.from(map.values()).sort((a, b) => a.giorno.localeCompare(b.giorno));
  }, [transazioni, prezziGiorno]);

  const giorniSenzaListino = useMemo(() => {
    let count = 0;
    for (const g of giorniMese) for (const info of g.prodotti.values()) if (info.senzaListino) count++;
    return count;
  }, [giorniMese]);

  // ── riepilogo per carta ──
  const riepilogo = useMemo(() => {
    const map = new Map<string, { numeroCarta: string; utilizzatore: string | null; padroncino: string | null; litri: number; importo: number; count: number }>();
    for (const t of transazioni) {
      if (!map.has(t.numeroCarta)) {
        map.set(t.numeroCarta, { numeroCarta: t.numeroCarta, utilizzatore: t.utilizzatore, padroncino: t.padroncino, litri: 0, importo: 0, count: 0 });
      }
      const e = map.get(t.numeroCarta)!;
      e.litri += t.quantita; e.importo += t.importo; e.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.importo - a.importo);
  }, [transazioni]);

  const transazioniPerCarta = useMemo(() => {
    const map = new Map<string, TransazioneCartaEni[]>();
    for (const t of transazioni) {
      if (!map.has(t.numeroCarta)) map.set(t.numeroCarta, []);
      map.get(t.numeroCarta)!.push(t);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.data.localeCompare(b.data));
    return map;
  }, [transazioni]);

  const stats = useMemo(() => ({
    litri: transazioni.reduce((s, t) => s + t.quantita, 0),
    importo: transazioni.reduce((s, t) => s + t.importo, 0),
    carte: new Set(transazioni.map(t => t.numeroCarta)).size,
  }), [transazioni]);

  const hasDati = transazioni.length > 0;
  const meseLabel = formatMese(mese);
  const mesiDesc = useMemo(() => [...mesiDisp].sort((a, b) => b.mese.localeCompare(a.mese)), [mesiDisp]);

  const topCarte = useMemo(() => [...riepilogo].sort((a, b) => b.importo - a.importo).slice(0, 5), [riepilogo]);

  const dashStats = useMemo(() => {
    const values = Object.values(mesiStats);
    if (!values.length) return null;
    const totImporto = mesiDisp.reduce((a, m) => a + m.totale, 0);
    const totAg = values.reduce((a, v) => a + v.agImporto, 0);
    const totPie = values.reduce((a, v) => a + v.pieImporto, 0);
    return { totImporto, totAg, totPie };
  }, [mesiStats, mesiDisp]);

  const splitPct = useMemo(() => {
    if (!dashStats) return { ag: 50, pie: 50 };
    const tot = dashStats.totAg + dashStats.totPie;
    const ag = tot > 0 ? Math.round(dashStats.totAg / tot * 100) : 50;
    return { ag, pie: 100 - ag };
  }, [dashStats]);

  // ── anagrafica: edit inline ──
  const [savingCarta, setSavingCarta] = useState<string | null>(null);
  const aggiornaCartaField = async (id: string, field: 'utilizzatore' | 'padroncinoId' | 'targaAbituale' | 'note', value: string) => {
    setSavingCarta(id);
    try {
      const updated = await carteEniApi.updateCarta(id, { [field]: value || undefined });
      setCarte(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch (e: any) { alert('Errore salvataggio: ' + e.message); }
    finally { setSavingCarta(null); }
  };

  const toggleAttiva = async (c: CartaEni) => {
    try {
      const updated = await carteEniApi.updateCarta(c.id, { attiva: !c.attiva });
      setCarte(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
    } catch (e: any) { alert('Errore: ' + e.message); }
  };

  const eliminaCarta = async (c: CartaEni) => {
    if (!confirm(`Eliminare la carta ${c.numeroCarta}?`)) return;
    try { await carteEniApi.deleteCarta(c.id); setCarte(prev => prev.filter(x => x.id !== c.id)); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  const carteFiltrate = useMemo(() => carte.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.numeroCarta.toLowerCase().includes(q) ||
      (c.utilizzatore ?? '').toLowerCase().includes(q) ||
      (c.padroncino?.ragioneSociale ?? '').toLowerCase().includes(q);
  }), [carte, search]);

  // ── anagrafica stazioni: edit inline ──
  const [savingStazione, setSavingStazione] = useState<string | null>(null);
  const toggleStazioneAgevolata = async (s: StazioneEni) => {
    setSavingStazione(s.id);
    try {
      const updated = await carteEniApi.updateStazione(s.id, { agevolata: !s.agevolata });
      setStazioni(prev => prev.map(x => x.id === s.id ? { ...x, ...updated } : x));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSavingStazione(null); }
  };
  const aggiornaStazioneNote = async (s: StazioneEni, note: string) => {
    if (note === (s.note ?? '')) return;
    setSavingStazione(s.id);
    try {
      const updated = await carteEniApi.updateStazione(s.id, { note: note || undefined });
      setStazioni(prev => prev.map(x => x.id === s.id ? { ...x, ...updated } : x));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSavingStazione(null); }
  };

  // ── ordinamento tabella stazioni ──
  type StazioneSortCol = 'codiceImpianto' | 'localita' | 'agevolata';
  const [stazioneSort, setStazioneSort] = useState<{ col: StazioneSortCol; dir: 'asc' | 'desc' }>({ col: 'codiceImpianto', dir: 'asc' });
  const toggleStazioneSort = (col: StazioneSortCol) => {
    setStazioneSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  };
  const stazioniOrdinate = useMemo(() => {
    const { col, dir } = stazioneSort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...stazioni].sort((a, b) => {
      if (col === 'agevolata') return (Number(a.agevolata) - Number(b.agevolata)) * mul;
      const av = (a[col] ?? '').toString().toLowerCase();
      const bv = (b[col] ?? '').toString().toLowerCase();
      return av.localeCompare(bv) * mul;
    });
  }, [stazioni, stazioneSort]);
  const sortArrow = (col: StazioneSortCol) => stazioneSort.col === col ? (stazioneSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const prodottiCols: { key: CategoriaProdottoEni; label: string }[] = [
    { key: 'DIESEL', label: 'Diesel' },
    { key: 'HVO', label: 'HVO' },
    { key: 'BENZINA', label: 'Benzina' },
  ];

  return (
    <div className="ce-page">

      {/* ══════ DASHBOARD ══════ */}
      {appView === 'dashboard' && (
        <>
          <div className="ce-header">
            <div>
              <h1>⛽ Carte Eni</h1>
              <span className="ce-sub">Gestione mensile carburante carte Eni</span>
            </div>
            <div className="ce-header-actions">
              <button className="btn-outline" onClick={() => setAppView('anagrafica')}>🗂️ Anagrafica Carte ({carte.length})</button>
              <button className="btn-outline" onClick={() => setAppView('stazioni')}>⛽ Stazioni ({stazioni.length})</button>
              <button className="btn-primary" onClick={() => { setAppView('detail'); setShowImport(true); }}>📂 Importa file mensile</button>
            </div>
          </div>

          {mesiDisp.length === 0 && (
            <div className="ce-empty-state">
              <span className="ce-empty-icon">⛽</span>
              <div className="ce-empty-title">Nessun dato ancora</div>
              <button className="btn-primary" onClick={() => { setAppView('detail'); setShowImport(true); }}>📂 Importa il primo file</button>
            </div>
          )}

          {mesiDisp.length > 0 && (
            <>
              <div className="ce-dash-kpi-row">
                <div className="ce-kpi-card ce-kpi-blue">
                  <span className="ce-kpi-label">Mesi Archiviati</span>
                  <span className="ce-kpi-val">{mesiDisp.length}</span>
                  <span className="ce-kpi-sub">dati caricati</span>
                </div>
                <div className="ce-kpi-card ce-kpi-teal">
                  <span className="ce-kpi-label">Transazioni Totali</span>
                  <span className="ce-kpi-val">{mesiDisp.reduce((a, m) => a + m.count, 0).toLocaleString('it-IT')}</span>
                  <span className="ce-kpi-sub">tutti i mesi</span>
                </div>
                <div className="ce-kpi-card ce-kpi-green">
                  <span className="ce-kpi-label">Litri Totali</span>
                  <span className="ce-kpi-val">{fmtL(mesiDisp.reduce((a, m) => a + m.litri, 0))}</span>
                  <span className="ce-kpi-sub">carburante</span>
                </div>
                <div className="ce-kpi-card ce-kpi-purple">
                  <span className="ce-kpi-label">Importo Totale</span>
                  <span className="ce-kpi-val">€ {fmtE(mesiDisp.reduce((a, m) => a + m.totale, 0))}</span>
                  <span className="ce-kpi-sub">tutti i mesi</span>
                </div>
                <div className="ce-kpi-card ce-kpi-amber">
                  <span className="ce-kpi-label">Media Mensile</span>
                  <span className="ce-kpi-val">€ {fmtE(mesiDisp.reduce((a, m) => a + m.totale, 0) / mesiDisp.length)}</span>
                  <span className="ce-kpi-sub">per mese</span>
                </div>
              </div>

              <div className="ce-dash-grid">
                <div className="ce-dash-panel">
                  <div className="ce-dash-panel-hd">
                    <span>📅 Storico Mensile</span>
                    <span className="ce-dash-panel-sub">{mesiDisp.length} mesi · clicca per aprire il dettaglio</span>
                  </div>
                  <div className="ce-month-col-hd">
                    <span>MESE</span>
                    <span>RIPARTIZIONE TARIFFA</span>
                    <span style={{ textAlign: 'right' }}>IMPORTO TOTALE</span>
                    <span></span>
                  </div>
                  {mesiDesc.map(m => {
                    const st = mesiStats[m.mese];
                    const agPct = st && st.importo > 0 ? Math.round(st.agImporto / st.importo * 100) : null;
                    const piePct = agPct !== null ? 100 - agPct : null;
                    return (
                      <div key={m.mese} className="ce-month-row" onClick={() => apriMese(m.mese)}>
                        <div>
                          <div className="ce-month-name">{formatMese(m.mese)}</div>
                          <div className="ce-month-sub">{m.count} transazioni{st ? ` · ${st.carteCount} carte` : ''}</div>
                        </div>
                        <div>
                          {agPct !== null ? (
                            <>
                              <div className="ce-tariffa-bar-wrap">
                                <div className="ce-tariffa-bar-ag" style={{ width: `${agPct}%` }}></div>
                                <div className="ce-tariffa-bar-pie" style={{ width: `${piePct}%` }}></div>
                              </div>
                              <div className="ce-tariffa-bar-labels">
                                <span className="ce-tariffa-ag-label">✅ {agPct}%</span>
                                <span className="ce-tariffa-pie-label">⚪ {piePct}%</span>
                                <span className="ce-tariffa-tot-label">{fmtL(m.litri)} L</span>
                              </div>
                            </>
                          ) : (
                            <div className="ce-loading" style={{ padding: '4px 0', justifyContent: 'flex-start' }}>
                              <div className="ce-spinner" style={{ width: 14, height: 14 }} />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="ce-month-importo">€ {fmtE(m.totale)}</span>
                          <span className="ce-month-importo-sub">totale</span>
                        </div>
                        <div style={{ textAlign: 'right' }}><span className="ce-apri-btn">Apri →</span></div>
                      </div>
                    );
                  })}
                </div>

                <div className="ce-dash-sidebar">
                  {topCarte.length > 0 && (
                    <div className="ce-sidebar-panel">
                      <div className="ce-dash-panel-hd">
                        <span>🏆 Top Carte</span>
                        <span className="ce-dash-panel-sub">importo · {meseLabel}</span>
                      </div>
                      {topCarte.map(c => (
                        <div key={c.numeroCarta} className="ce-top-carta">
                          <span className="ce-top-carta-num">…{c.numeroCarta.slice(-6)}</span>
                          <div className="ce-top-carta-info">
                            <span className="ce-top-carta-nome">{c.utilizzatore ?? 'non assegnato'}</span>
                            <span className="ce-top-carta-padroncino">{c.padroncino ?? '—'}</span>
                          </div>
                          <span className="ce-top-carta-importo">€ {fmtE(c.importo)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {dashStats && (
                    <div className="ce-sidebar-panel">
                      <div className="ce-dash-panel-hd">
                        <span>📊 Ripartizione Tariffa</span>
                        <span className="ce-dash-panel-sub">tutti i mesi</span>
                      </div>
                      <div className="ce-split-body">
                        <div className="ce-split-bar-wrap">
                          <div className="ce-split-bar-ag" style={{ flex: splitPct.ag }}></div>
                          <div className="ce-split-bar-pie" style={{ flex: splitPct.pie }}></div>
                        </div>
                        <div className="ce-split-row">
                          <div className="ce-split-legend">
                            <div className="ce-split-dot" style={{ background: '#16a34a' }}></div>
                            <span className="ce-split-legend-label">✅ Agevolata</span>
                          </div>
                          <span className="ce-split-pct-green">{splitPct.ag}%</span>
                        </div>
                        <div className="ce-split-row">
                          <div className="ce-split-legend">
                            <div className="ce-split-dot" style={{ background: '#94a3b8' }}></div>
                            <span className="ce-split-legend-label">⚪ Prezzo pieno</span>
                          </div>
                          <span className="ce-split-pct-grey">{splitPct.pie}%</span>
                        </div>
                        <div className="ce-split-totals">
                          <div className="ce-split-total-row">
                            <span className="ce-split-total-label">Importo agevolato</span>
                            <span className="ce-split-total-val-green">€ {fmtE(dashStats.totAg)}</span>
                          </div>
                          <div className="ce-split-total-row">
                            <span className="ce-split-total-label">Importo pieno</span>
                            <span className="ce-split-total-val-grey">€ {fmtE(dashStats.totPie)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {loadingStats && !dashStats && (
                    <div className="ce-loading"><div className="ce-spinner" /><span>Statistiche…</span></div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══════ ANAGRAFICA ══════ */}
      {appView === 'anagrafica' && (
        <>
          <div className="ce-header">
            <div className="ce-header-left">
              <button className="btn-outline btn-sm" onClick={() => setAppView('dashboard')}>← Storico</button>
              <div>
                <h1>🗂️ Anagrafica Carte Eni</h1>
                <span className="ce-sub">Associa ogni carta a un utilizzatore{padroncini.length ? ' ed eventualmente a un padroncino' : ''}</span>
              </div>
            </div>
            <div className="ce-header-actions">
              <div className="ce-search-wrap">
                <span>🔍</span>
                <input className="ce-search" placeholder="Cerca carta, utilizzatore..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => setShowNuovaCarta(true)}>+ Nuova carta</button>
            </div>
          </div>

          {carteFiltrate.length === 0 ? (
            <div className="ce-empty-state">
              <span className="ce-empty-icon">🗂️</span>
              <div className="ce-empty-title">Nessuna carta censita</div>
              <div className="ce-empty-hint">Le carte vengono censite automaticamente al primo import, oppure aggiungile manualmente.</div>
            </div>
          ) : (
            <div className="ce-table-wrap">
              <table className="ce-table">
                <thead>
                  <tr>
                    <th>N° Carta</th>
                    <th>Utilizzatore</th>
                    <th>Padroncino (opzionale)</th>
                    <th>Targa abituale</th>
                    <th style={{ textAlign: 'center' }}>Transazioni</th>
                    <th style={{ textAlign: 'center' }}>Attiva</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {carteFiltrate.map(c => (
                    <tr key={c.id} className={savingCarta === c.id ? 'ce-row-saving' : ''}>
                      <td className="ce-mono">{c.numeroCarta}</td>
                      <td>
                        <input
                          className="ce-cell-input"
                          defaultValue={c.utilizzatore ?? ''}
                          placeholder="Nome utilizzatore…"
                          onBlur={e => { if (e.target.value !== (c.utilizzatore ?? '')) aggiornaCartaField(c.id, 'utilizzatore', e.target.value); }}
                        />
                      </td>
                      <td>
                        <select
                          className="ce-cell-input"
                          value={c.padroncinoId ?? ''}
                          onChange={e => aggiornaCartaField(c.id, 'padroncinoId', e.target.value)}
                        >
                          <option value="">—</option>
                          {padroncini.map(p => <option key={p.id} value={p.id}>{p.ragioneSociale}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          className="ce-cell-input"
                          defaultValue={c.targaAbituale ?? ''}
                          placeholder="es. GL905JT"
                          onBlur={e => { if (e.target.value !== (c.targaAbituale ?? '')) aggiornaCartaField(c.id, 'targaAbituale', e.target.value.toUpperCase()); }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }} className="ce-num">{c._count?.transazioni ?? 0}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className={`ce-toggle ${c.attiva ? 'ce-toggle-on' : ''}`} onClick={() => toggleAttiva(c)}>
                          {c.attiva ? 'Attiva' : 'Disattiva'}
                        </button>
                      </td>
                      <td><button className="ce-icon-btn" title="Elimina" onClick={() => eliminaCarta(c)}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <NuovaCartaModal
            open={showNuovaCarta}
            onClose={() => setShowNuovaCarta(false)}
            padroncini={padroncini}
            onSave={async (data) => { await carteEniApi.createCarta(data); await caricaCarte(); }}
          />
        </>
      )}

      {/* ══════ STAZIONI ══════ */}
      {appView === 'stazioni' && (
        <>
          <div className="ce-header">
            <div className="ce-header-left">
              <button className="btn-outline btn-sm" onClick={() => setAppView('dashboard')}>← Storico</button>
              <div>
                <h1>⛽ Stazioni Eni</h1>
                <span className="ce-sub">
                  Marca quali impianti hanno la nostra tariffa agevolata (self-service riservato): il prezzo del file
                  Eni non lo distingue, va identificato confrontando i prezzi reali di fattura per stazione.
                </span>
              </div>
            </div>
            <div className="ce-header-actions">
              <button className="btn-primary" onClick={() => setShowNuovaStazione(true)}>+ Nuova stazione</button>
            </div>
          </div>

          {stazioni.length === 0 ? (
            <div className="ce-empty-state">
              <span className="ce-empty-icon">⛽</span>
              <div className="ce-empty-title">Nessuna stazione censita</div>
              <div className="ce-empty-hint">Le stazioni vengono censite automaticamente al primo import di un mese, oppure aggiungile manualmente.</div>
            </div>
          ) : (
            <div className="ce-table-wrap">
              <table className="ce-table">
                <thead>
                  <tr>
                    <th className="ce-th-sort" onClick={() => toggleStazioneSort('codiceImpianto')}>Codice Impianto{sortArrow('codiceImpianto')}</th>
                    <th className="ce-th-sort" onClick={() => toggleStazioneSort('localita')}>Località{sortArrow('localita')}</th>
                    <th className="ce-th-sort" onClick={() => toggleStazioneSort('agevolata')}>Tariffa{sortArrow('agevolata')}</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stazioniOrdinate.map(s => (
                    <tr key={s.id} className={savingStazione === s.id ? 'ce-row-saving' : ''}>
                      <td className="ce-mono">{s.codiceImpianto}</td>
                      <td>{s.localita ?? <span className="ce-muted">—</span>}</td>
                      <td>
                        <button className={`ce-toggle ${s.agevolata ? 'ce-toggle-on' : ''}`} onClick={() => toggleStazioneAgevolata(s)}>
                          {s.agevolata ? '✅ Agevolata' : '⚪ Prezzo pieno'}
                        </button>
                      </td>
                      <td>
                        <input
                          className="ce-cell-input"
                          defaultValue={s.note ?? ''}
                          placeholder="es. deposito riservato..."
                          onBlur={e => aggiornaStazioneNote(s, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <NuovaStazioneModal
            open={showNuovaStazione}
            onClose={() => setShowNuovaStazione(false)}
            onSave={async (data) => { await carteEniApi.createStazione(data); await caricaStazioni(); }}
          />
        </>
      )}

      {/* ══════ DETAIL ══════ */}
      {appView === 'detail' && (
        <>
          <div className="ce-header">
            <div className="ce-header-left">
              <button className="btn-outline btn-sm" onClick={() => setAppView('dashboard')}>← Storico</button>
              <div>
                <h1>⛽ {meseLabel}</h1>
                <span className="ce-sub">{stats.carte} carte coinvolte</span>
              </div>
            </div>
            <div className="ce-header-actions">
              <div className="ce-mese-wrap">
                <label>Mese</label>
                <input type="month" className="ce-mese-input" value={mese} onChange={e => setMese(e.target.value)} />
              </div>
              {hasDati && <button className="btn-outline btn-sm ce-del-mese" onClick={eliminaMese}>🗑 Elimina</button>}
              <button className="btn-outline btn-sm" onClick={() => setShowImportPrezzi(v => !v)}>💶 Listino prezzi</button>
              <button className="btn-primary" onClick={() => setShowImport(v => !v)}>
                {showImport ? '✕ Chiudi' : '📂 Importa file'}
              </button>
            </div>
          </div>

          {showImport && (
            <div className="ce-import-panel">
              <div className="ce-import-title">📂 Importa transazioni {mese}</div>
              <div className="ce-import-hint">
                Carica il file "Ricerca Autorizzazioni" Eni per questo mese. Vengono importate solo le transazioni con
                rifornimento reale (Advice/Sale) e stato Approvata o Approvata con avviso; le preautorizzazioni e le righe negate vengono escluse.
                Le righe con data fuori da {mese} vengono ignorate.
              </div>
              <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={onFileChange} />
              <button className="btn-primary" disabled={saving} onClick={() => fileRef.current?.click()}>
                {saving ? '⏳ Importazione...' : '📂 Scegli file'}
              </button>
            </div>
          )}

          {showImportPrezzi && (
            <div className="ce-import-panel">
              <div className="ce-import-title">💶 Importa listino prezzi (giorno, prezzo)</div>
              <div className="ce-import-hint">
                Carica un file con giorno e prezzo unitario definitivo (Diesel/HVO/Benzina), oppure un file tipo
                "Media Carburante" con colonne Gasolio no-IVA / Gasolio IVA 22% / HVO no-IVA / HVO IVA 22%: in questo
                caso vengono prese automaticamente solo le colonne già IVA inclusa per Diesel e HVO (la Benzina non
                ha agevolazioni e non viene importata). Il prezzo verrà applicato a tutte le transazioni di quel
                giorno (in qualsiasi mese) e l'importo verrà ricalcolato automaticamente. In alternativa puoi
                modificare il prezzo di un singolo giorno direttamente nella tabella sotto.
              </div>
              <input ref={filePrezziRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={onFilePrezziChange} />
              <button className="btn-primary" disabled={saving} onClick={() => filePrezziRef.current?.click()}>
                {saving ? '⏳ Importazione...' : '📂 Scegli file prezzi'}
              </button>
            </div>
          )}

          {loading && <div className="ce-loading"><div className="ce-spinner" /><span>Caricamento {mese}…</span></div>}
          {!loading && error && <div className="ce-error">⚠️ {error}</div>}
          {!loading && !hasDati && !error && (
            <div className="ce-empty-state">
              <span className="ce-empty-icon">⛽</span>
              <div className="ce-empty-title">Nessun dato per {mese}</div>
              <div className="ce-empty-hint">Clicca "Importa file" per caricare le transazioni</div>
            </div>
          )}

          {!loading && hasDati && (
            <>
              <div className="ce-detail-kpi-row">
                <div className="ce-kpi-card ce-kpi-blue">
                  <span className="ce-kpi-label">Transazioni</span>
                  <span className="ce-kpi-val">{transazioni.length}</span>
                  <span className="ce-kpi-sub">rifornimenti</span>
                </div>
                <div className="ce-kpi-card ce-kpi-green">
                  <span className="ce-kpi-label">Litri Totali</span>
                  <span className="ce-kpi-val ce-kpi-val-md">{fmtL(stats.litri)} L</span>
                  <span className="ce-kpi-sub">carburante</span>
                </div>
                <div className="ce-kpi-card ce-kpi-teal">
                  <span className="ce-kpi-label">Carte Coinvolte</span>
                  <span className="ce-kpi-val">{stats.carte}</span>
                  <span className="ce-kpi-sub">questo mese</span>
                </div>
                <div className="ce-kpi-card ce-kpi-purple">
                  <span className="ce-kpi-label">Totale Mese</span>
                  <span className="ce-kpi-val ce-kpi-val-md">€ {fmtE(stats.importo)}</span>
                  <span className="ce-kpi-sub">IVA incl.</span>
                </div>
                <div className={`ce-kpi-card ${giorniSenzaListino > 0 ? 'ce-kpi-warn' : 'ce-kpi-neutral'}`}>
                  <span className="ce-kpi-label">⚠️ Giorni senza listino</span>
                  <span className="ce-kpi-val">{giorniSenzaListino}</span>
                  <span className="ce-kpi-sub">da impostare</span>
                </div>
              </div>

              <div className="ce-section-card">
                <div className="ce-section-hd" onClick={() => setListinoAperto(v => !v)}>
                  <div>
                    <div className="ce-section-title">💶 Prezzo unitario per giorno e prodotto</div>
                    <span className="ce-section-sub">non definitivo finché non modificato</span>
                  </div>
                  <span className="ce-section-toggle">{listinoAperto ? '▲ nascondi' : '▼ mostra'}</span>
                </div>
                {listinoAperto && (
                  <div className="ce-listino-scroll">
                    <table className="ce-listino-table">
                      <thead>
                        <tr>
                          <th>Giorno</th>
                          {prodottiCols.map(p => <th key={p.key} style={{ textAlign: 'right' }}>{p.label} €/L</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {giorniMese.map(g => (
                          <tr key={g.giorno}>
                            <td className="ce-listino-giorno">{formatGiorno(g.giorno)}</td>
                            {prodottiCols.map(p => {
                              const info = g.prodotti.get(p.key);
                              const key = `${g.giorno}|${p.key}`;
                              if (!info) return <td key={p.key} style={{ textAlign: 'right' }}><span className="ce-listino-na">—</span></td>;
                              return (
                                <td key={p.key} style={{ textAlign: 'right' }}>
                                  {editKey === key ? (
                                    <input
                                      className="ce-cell-input ce-listino-input"
                                      autoFocus
                                      defaultValue={info.prezzo != null ? String(info.prezzo) : ''}
                                      onChange={e => setEditPrezzoVal(e.target.value)}
                                      onBlur={() => salvaPrezzoGiorno(g.giorno, p.key, editPrezzoVal)}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  ) : (
                                    <button
                                      className={`ce-listino-prezzo ${info.senzaListino ? 'ce-listino-prezzo-warn' : ''}`}
                                      onClick={() => { setEditKey(key); setEditPrezzoVal(info.prezzo != null ? String(info.prezzo) : ''); }}
                                    >
                                      {info.senzaListino && <span className="ce-dot-warn" title="Nessun prezzo di listino importato per questo giorno/prodotto" />}
                                      {info.prezzo != null ? `€ ${info.prezzo.toFixed(4)}` : '✎ imposta'}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="ce-tabs">
                <button className={`ce-tab ${tab === 'riepilogo' ? 'ce-tab-active' : ''}`} onClick={() => setTab('riepilogo')}>
                  💳 Riepilogo per carta ({riepilogo.length})
                </button>
                <button className={`ce-tab ${tab === 'dettaglio' ? 'ce-tab-active' : ''}`} onClick={() => setTab('dettaglio')}>
                  📋 Dettaglio transazioni ({transazioni.length})
                </button>
              </div>

              {tab === 'riepilogo' && (
                <div className="ce-riep-wrap">
                  <div className="ce-riep-row ce-riep-header">
                    <span></span>
                    <span>N° CARTA</span>
                    <span>UTILIZZATORE</span>
                    <span>PADRONCINO</span>
                    <span style={{ textAlign: 'right' }}>LITRI</span>
                    <span style={{ textAlign: 'right' }}>IMPORTO</span>
                    <span style={{ textAlign: 'right' }}>NO IVA</span>
                    <span style={{ textAlign: 'right' }}>RIF.</span>
                  </div>
                  {riepilogo.map(r => {
                    const esp = espansoCarta === r.numeroCarta;
                    const righeCarta = transazioniPerCarta.get(r.numeroCarta) ?? [];
                    return (
                      <Fragment key={r.numeroCarta}>
                        <div className="ce-riep-row ce-riep-row-clickable" onClick={() => setEspansoCarta(esp ? null : r.numeroCarta)}>
                          <span className="ce-riep-expand">{esp ? '▲' : '▼'}</span>
                          <span className="ce-mono">{r.numeroCarta}</span>
                          <span className="ce-riep-ellipsis">{r.utilizzatore ?? <span className="ce-muted">non assegnato</span>}</span>
                          <span className="ce-riep-ellipsis">{r.padroncino ?? '—'}</span>
                          <span className="ce-num" style={{ textAlign: 'right' }}>{fmtL(r.litri)} L</span>
                          <span style={{ textAlign: 'right', fontWeight: 700 }}>€ {fmtE(r.importo)}</span>
                          <span className="ce-num" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>€ {fmtE(noIva(r.importo))}</span>
                          <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.count}</span>
                        </div>
                        {esp && (
                          <div className="ce-riep-sub">
                            <div className="ce-riep-sub-row ce-riep-sub-header">
                              <span>DATA</span><span>IMPIANTO</span><span>TARGA</span><span>PRODOTTO</span><span>STATO</span>
                              <span style={{ textAlign: 'right' }}>LITRI</span>
                              <span style={{ textAlign: 'right' }}>PREZZO</span>
                              <span style={{ textAlign: 'right' }}>IMPORTO</span>
                              <span style={{ textAlign: 'right' }}>NO IVA</span>
                            </div>
                            {righeCarta.map(t => (
                              <div className="ce-riep-sub-row" key={t.id}>
                                <span className="ce-riep-sub-data">{formatDataOra(t.data)}</span>
                                <span className="ce-riep-ellipsis">{t.localita ?? t.codiceImpianto ?? '—'}</span>
                                <span className="ce-mono ce-riep-sub-targa">{t.targa ?? '—'}</span>
                                <span className="ce-riep-ellipsis">{t.prodotto ?? '—'}</span>
                                <span className={`ce-stato-badge ${t.agevolata ? 'ce-stato-ok' : 'ce-stato-neutral'}`}>
                                  {t.agevolata ? '✅ Agevolata' : '⚪ Piena'}
                                </span>
                                <span className="ce-num" style={{ textAlign: 'right' }}>{fmtL(t.quantita)}</span>
                                <span className="ce-riep-sub-prezzo" style={{ textAlign: 'right' }}>{t.prezzoUnitario != null ? `€ ${t.prezzoUnitario.toFixed(4)}` : '—'}</span>
                                <span style={{ textAlign: 'right', fontWeight: 700 }}>€ {fmtE(t.importo)}</span>
                                <span className="ce-riep-sub-noiva" style={{ textAlign: 'right' }}>€ {fmtE(noIva(t.importo))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                  <div className="ce-riep-row ce-riep-foot">
                    <span style={{ gridColumn: '1 / span 4', fontWeight: 700 }}>TOTALE ({riepilogo.length} carte)</span>
                    <span className="ce-num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtL(stats.litri)} L</span>
                    <span style={{ textAlign: 'right', fontWeight: 700 }}>€ {fmtE(stats.importo)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 700 }}>€ {fmtE(noIva(stats.importo))}</span>
                    <span></span>
                  </div>
                </div>
              )}

              {tab === 'dettaglio' && (
                <div className="ce-table-wrap">
                  <table className="ce-table ce-table-compact">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>N° Carta</th>
                        <th>Utilizzatore</th>
                        <th>Impianto</th>
                        <th>Targa</th>
                        <th>Prodotto</th>
                        <th>Stato</th>
                        <th style={{ textAlign: 'right' }}>Litri</th>
                        <th style={{ textAlign: 'right' }}>Prezzo</th>
                        <th style={{ textAlign: 'right' }}>Importo</th>
                        <th style={{ textAlign: 'right' }}>Importo NO IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transazioni.map(t => (
                        <tr key={t.id}>
                          <td>{formatDataOra(t.data)}</td>
                          <td className="ce-mono">{t.numeroCarta}</td>
                          <td>{t.utilizzatore ?? <span className="ce-muted">—</span>}</td>
                          <td>
                            <span className={`ce-stato-badge ${t.agevolata ? 'ce-stato-ok' : 'ce-stato-warning'}`}>
                              {t.agevolata ? '✅ Agevolata' : '⚪ Piena'}
                            </span>
                            <div className="ce-muted" style={{ fontSize: 11 }}>{t.localita ?? t.codiceImpianto ?? '—'}</div>
                          </td>
                          <td className="ce-mono">{t.targa ?? '—'}</td>
                          <td>{t.prodotto ?? '—'}</td>
                          <td>
                            <span className={`ce-stato-badge ${t.statoAutorizzativo.includes('Warning') ? 'ce-stato-warning' : 'ce-stato-ok'}`}>
                              {t.statoAutorizzativo}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }} className="ce-num">{fmtL(t.quantita)}</td>
                          <td style={{ textAlign: 'right' }} className="ce-num">{t.prezzoUnitario != null ? `€ ${t.prezzoUnitario.toFixed(4)}` : '—'}</td>
                          <td style={{ textAlign: 'right' }}><strong>€ {fmtE(t.importo)}</strong></td>
                          <td style={{ textAlign: 'right' }} className="ce-num">€ {fmtE(noIva(t.importo))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── MODALE NUOVA CARTA ───────────────────────────────────────────────────────
function NuovaCartaModal({
  open, onClose, padroncini, onSave,
}: {
  open: boolean; onClose: () => void; padroncini: Padroncino[];
  onSave: (data: { numeroCarta: string; utilizzatore?: string; padroncinoId?: string; targaAbituale?: string }) => Promise<void>;
}) {
  const [numeroCarta, setNumeroCarta] = useState('');
  const [utilizzatore, setUtilizzatore] = useState('');
  const [padroncinoId, setPadroncinoId] = useState('');
  const [targaAbituale, setTargaAbituale] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!numeroCarta.trim()) return;
    setSaving(true);
    try {
      await onSave({
        numeroCarta: numeroCarta.trim(),
        utilizzatore: utilizzatore || undefined,
        padroncinoId: padroncinoId || undefined,
        targaAbituale: targaAbituale || undefined,
      });
      setNumeroCarta(''); setUtilizzatore(''); setPadroncinoId(''); setTargaAbituale('');
      onClose();
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova Carta Eni" width={480}>
      <div className="ce-modal-body">
        <div className="ce-field">
          <label>N° Carta <span className="ce-req">*</span></label>
          <input className="ce-input ce-mono" value={numeroCarta} onChange={e => setNumeroCarta(e.target.value)} placeholder="710200181702000043" />
        </div>
        <div className="ce-field">
          <label>Utilizzatore</label>
          <input className="ce-input" value={utilizzatore} onChange={e => setUtilizzatore(e.target.value)} placeholder="Nome autista / utilizzatore" />
        </div>
        <div className="ce-field">
          <label>Padroncino (opzionale)</label>
          <select className="ce-input" value={padroncinoId} onChange={e => setPadroncinoId(e.target.value)}>
            <option value="">—</option>
            {padroncini.map(p => <option key={p.id} value={p.id}>{p.ragioneSociale}</option>)}
          </select>
        </div>
        <div className="ce-field">
          <label>Targa abituale</label>
          <input className="ce-input ce-mono" value={targaAbituale} onChange={e => setTargaAbituale(e.target.value.toUpperCase())} placeholder="es. GL905JT" />
        </div>
        <div className="ce-modal-actions">
          <button className="btn-outline" onClick={onClose}>Annulla</button>
          <button className="btn-primary" disabled={!numeroCarta.trim() || saving} onClick={handleSave}>
            {saving ? '⏳ Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODALE NUOVA STAZIONE ─────────────────────────────────────────────────────
function NuovaStazioneModal({
  open, onClose, onSave,
}: {
  open: boolean; onClose: () => void;
  onSave: (data: { codiceImpianto: string; localita?: string; agevolata?: boolean; note?: string }) => Promise<void>;
}) {
  const [codiceImpianto, setCodiceImpianto] = useState('');
  const [localita, setLocalita] = useState('');
  const [agevolata, setAgevolata] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!codiceImpianto.trim()) return;
    setSaving(true);
    try {
      await onSave({
        codiceImpianto: codiceImpianto.trim(),
        localita: localita || undefined,
        agevolata,
        note: note || undefined,
      });
      setCodiceImpianto(''); setLocalita(''); setAgevolata(false); setNote('');
      onClose();
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova Stazione Eni" width={480}>
      <div className="ce-modal-body">
        <div className="ce-field">
          <label>Codice Impianto <span className="ce-req">*</span></label>
          <input className="ce-input ce-mono" value={codiceImpianto} onChange={e => setCodiceImpianto(e.target.value)} placeholder="es. 008685" />
        </div>
        <div className="ce-field">
          <label>Località</label>
          <input className="ce-input" value={localita} onChange={e => setLocalita(e.target.value)} placeholder="es. CASTROVILLARI" />
        </div>
        <div className="ce-field">
          <label>Tariffa</label>
          <button type="button" className={`ce-toggle ${agevolata ? 'ce-toggle-on' : ''}`} onClick={() => setAgevolata(v => !v)}>
            {agevolata ? '✅ Agevolata' : '⚪ Prezzo pieno'}
          </button>
        </div>
        <div className="ce-field">
          <label>Note</label>
          <input className="ce-input" value={note} onChange={e => setNote(e.target.value)} placeholder="es. deposito riservato..." />
        </div>
        <div className="ce-modal-actions">
          <button className="btn-outline" onClick={onClose}>Annulla</button>
          <button className="btn-primary" disabled={!codiceImpianto.trim() || saving} onClick={handleSave}>
            {saving ? '⏳ Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
