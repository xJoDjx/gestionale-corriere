// src/features/carte-eni/CarteEni.tsx
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { carteEniApi, padronciniApi } from '../../lib/api';
import type { CartaEni, TransazioneCartaEni, MeseCarteEniEntry, PrezzoGiornoEni, Padroncino, CategoriaProdottoEni, StazioneEni } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import './CarteEni.css';
import '../padroncini/Padroncini2.css';
import '../ricariche/Ricariche2.css';
import './CarteEni2.css';
import { Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SegTabs, SearchBox, Select, Th, Empty, Alert, BarStrip, C, useSort, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';

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

  // ── Solo visualizzazione ─────────────────────────────────────────────────
  type Vista = 'riepilogo' | 'transazioni' | 'carte' | 'stazioni';
  const [vista, setVista] = useState<Vista>('riepilogo');
  const [showListino, setShowListino] = useState(false);
  const [autoMese, setAutoMese] = useState(false);
  useEffect(() => {
    if (autoMese || mesiDesc.length === 0) return;
    setAutoMese(true);
    if (appView === 'dashboard' && !mesiDisp.some((m) => m.mese === mese)) setMese(mesiDesc[0].mese);
    if (appView === 'dashboard') setAppView('detail');
  }, [autoMese, mesiDesc, mesiDisp, mese, appView]);
  const mesiAsc = useMemo(() => [...mesiDisp].sort((a, b) => a.mese.localeCompare(b.mese)), [mesiDisp]);
  const idxM = mesiAsc.findIndex((m) => m.mese === mese);
  const prevS = idxM > 0 ? mesiStats[mesiAsc[idxM - 1].mese] : null;
  const deltaImp = prevS && prevS.importo ? ((stats.importo - prevS.importo) / prevS.importo) * 100 : null;
  const agImporto = transazioni.filter((t) => t.agevolata).reduce((a, t) => a + t.importo, 0);
  const pieImporto = stats.importo - agImporto;
  const agPct = stats.importo ? (agImporto / stats.importo) * 100 : 0;
  const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const trend = mesiAsc.slice(-8).map((m) => {
    const st = mesiStats[m.mese];
    const tot = st?.importo ?? m.totale;
    return { label: MESI3[parseInt(m.mese.slice(5), 10) - 1], mese: m.mese, total: tot, part: st?.agImporto ?? 0,
      valueLabel: `${fmtNum2(tot / 1000, 1)}k`, tip: `${formatMese(m.mese)} · totale ${fmtEur2(tot)}${st && tot ? ` · agevolata ${Math.round((st.agImporto / tot) * 100)}%` : ''}` };
  });
  const mediaTrend = trend.length ? trend.reduce((a, t) => a + t.total, 0) / trend.length : 0;
  const PROD: Record<string, [string, string]> = { DIESEL: ['Diesel', '#52525B'], HVO: ['HVO', C.green], BENZINA: ['Benzina', C.yellow], ALTRO: ['Altro', '#A1A1AA'] };
  const perProdotto = useMemo(() => {
    const m = new Map<string, { imp: number; n: number; l: number }>();
    for (const t of transazioni) {
      const k = normalizzaProdotto(t.prodotto);
      const e = m.get(k) ?? { imp: 0, n: 0, l: 0 };
      e.imp += t.importo; e.n += 1; e.l += t.quantita; m.set(k, e);
    }
    return [...m.entries()].sort((x, y) => y[1].imp - x[1].imp);
  }, [transazioni]);
  const cartaInfo = useMemo(() => new Map(carte.map((c) => [c.numeroCarta, c])), [carte]);
  const q = search.toLowerCase();
  const riepFiltr = riepilogo.filter((r) => !q || r.numeroCarta.toLowerCase().includes(q) || (r.utilizzatore ?? '').toLowerCase().includes(q)
    || (r.padroncino ?? '').toLowerCase().includes(q) || (cartaInfo.get(r.numeroCarta)?.targaAbituale ?? '').toLowerCase().includes(q));
  const txFiltr = transazioni.filter((t) => !q || t.numeroCarta.toLowerCase().includes(q) || (t.utilizzatore ?? '').toLowerCase().includes(q)
    || (t.targa ?? '').toLowerCase().includes(q) || (t.localita ?? '').toLowerCase().includes(q) || (t.prodotto ?? '').toLowerCase().includes(q));
  const stazFiltr = stazioniOrdinate.filter((x) => !q || x.codiceImpianto.toLowerCase().includes(q) || (x.localita ?? '').toLowerCase().includes(q) || (x.note ?? '').toLowerCase().includes(q));
  type RK = 'n' | 'u' | 'tg' | 'p' | 'tx' | 'l' | 'i' | 'ni';
  const riepSort = useSort<typeof riepilogo[number], RK>(riepFiltr, (r, k) => {
    switch (k) {
      case 'n': return r.numeroCarta; case 'u': return r.utilizzatore ?? ''; case 'tg': return cartaInfo.get(r.numeroCarta)?.targaAbituale ?? '';
      case 'p': return r.padroncino ?? ''; case 'tx': return r.count; case 'l': return r.litri; case 'i': case 'ni': return r.importo;
    }
  }, { key: 'i', dir: 'desc' });
  type TK = 'd' | 'n' | 'u' | 'imp' | 'tg' | 'pr' | 'st' | 'l' | 'pz' | 'i' | 'ni';
  const txSort = useSort<TransazioneCartaEni, TK>(txFiltr, (t, k) => {
    switch (k) {
      case 'd': return t.data; case 'n': return t.numeroCarta; case 'u': return t.utilizzatore ?? ''; case 'imp': return t.localita ?? t.codiceImpianto ?? '';
      case 'tg': return t.targa ?? ''; case 'pr': return t.prodotto ?? ''; case 'st': return t.statoAutorizzativo; case 'l': return t.quantita;
      case 'pz': return t.prezzoUnitario ?? null; case 'i': case 'ni': return t.importo;
    }
  }, { key: 'd', dir: 'asc' });
  type CK = 'n' | 'u' | 'p' | 'tg' | 'tx' | 'a';
  const carteSort = useSort<CartaEni, CK>(carteFiltrate, (c, k) => {
    switch (k) {
      case 'n': return c.numeroCarta; case 'u': return c.utilizzatore ?? ''; case 'p': return c.padroncino?.ragioneSociale ?? '';
      case 'tg': return c.targaAbituale ?? ''; case 'tx': return c._count?.transazioni ?? 0; case 'a': return c.attiva ? 0 : 1;
    }
  }, { key: 'n', dir: 'asc' });
  const meseOpts = Array.from(new Set([...mesiDesc.map((m) => m.mese), mese])).sort().reverse();
  const nCarteAttive = carte.filter((c) => c.attiva).length;
  const prezzo = (n: number | null | undefined) => n != null ? `€ ${n.toFixed(4).replace('.', ',')}` : '—';

  return (
    <Page>
      <PageHeader
        eyebrow="Costi"
        title="Carte Eni"
        sub="Rifornimenti del mese per carta, prezzi da listino e ripartizione della tariffa"
        actions={<>
          <Select label="Mese" value={appView === 'dashboard' ? 'STORICO' : mese}
            onChange={(v) => { if (v === 'STORICO') setAppView('dashboard'); else apriMese(v); }}
            options={[...meseOpts.map((m) => ({ value: m, label: formatMese(m) })), { value: 'STORICO', label: 'Tutti i mesi (storico)' }]} />
          {appView !== 'dashboard' && <>
            <Button icon="euro" onClick={() => setShowListino((v) => !v)}>Listino prezzi</Button>
            {hasDati && <Button icon="trash" variant="danger" onClick={eliminaMese}>Elimina mese</Button>}
            <Button icon="upload" variant="primary" onClick={() => setShowImport((v) => !v)}>Importa file mensile</Button>
          </>}
        </>}
      />

      {appView === 'dashboard' ? (<>
        <Kpis items={[
          { label: 'Importo totale', value: dashStats ? fmtEur2(dashStats.totImporto) : '—', sub: `${mesiDisp.length} mesi archiviati · IVA inclusa`, color: C.orange, icon: 'eni' },
          { label: 'Litri', value: fmtNum2(mesiDisp.reduce((a, m) => a + (m.litri ?? 0), 0)), sub: 'Tutti i mesi', color: C.blue, icon: 'goccia' },
          { label: 'Transazioni', value: fmtNum2(mesiDisp.reduce((a, m) => a + (m.count ?? 0), 0)), sub: `${carte.length} carte censite · ${stazioni.length} stazioni`, color: C.purple, icon: 'carta' },
          { label: 'A tariffa agevolata', value: `${splitPct.ag}%`, sub: dashStats ? `${fmtEur2(dashStats.totAg)} su ${fmtEur2(dashStats.totAg + dashStats.totPie)}` : '—', color: C.green, icon: 'ok',
            seg: [{ w: splitPct.ag, color: C.green }, { w: splitPct.pie, color: C.orange }] },
        ]} />
        <Card>
          <CardHead bar title="Mesi archiviati" sub={loadingStats ? 'Calcolo in corso…' : 'Clic su un mese per aprirlo'} />
          {mesiDesc.length === 0 ? <Empty>Nessun mese caricato. Scegli un mese e importa il file Eni.</Empty> : (
            <div className="ds-tablewrap">
              <table className="ds-table">
                <thead><tr><Th>Mese</Th><Th right>Transazioni</Th><Th right>Litri</Th><Th right>Agevolata</Th><Th right>Prezzo pieno</Th><Th right>Totale</Th><Th right>Carte</Th></tr></thead>
                <tbody>
                  {mesiDesc.map((m) => {
                    const st = mesiStats[m.mese];
                    return (
                      <tr key={m.mese} className="is-clickable" onClick={() => apriMese(m.mese)}>
                        <td style={{ fontWeight: 600 }}>{formatMese(m.mese)}</td>
                        <td className="r">{fmtNum2(m.count)}</td>
                        <td className="r">{fmtNum2(m.litri, 1)}</td>
                        <td className="r">{st ? fmtEur2(st.agImporto) : '—'}</td>
                        <td className="r">{st ? fmtEur2(st.pieImporto) : '—'}</td>
                        <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(m.totale)}</td>
                        <td className="r">{st?.carteCount ?? '—'}</td>
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
            { label: 'Importo del mese', value: fmtEur2(stats.importo), color: C.orange, icon: 'eni',
              sub: `${deltaImp != null ? `${deltaImp >= 0 ? '+' : '−'}${fmtNum2(Math.abs(deltaImp), 1)}% vs ${formatMese(mesiAsc[idxM - 1].mese).split(' ')[0].toLowerCase()} · ` : ''}IVA inclusa` },
            { label: 'Litri', value: fmtNum2(stats.litri), sub: stats.litri ? `Prezzo medio € ${fmtNum2(stats.importo / stats.litri, 2)} al litro` : '—', color: C.blue, icon: 'goccia' },
            { label: 'Transazioni', value: transazioni.length, sub: `Su ${stats.carte} carte · ${carte.length} carte censite (${nCarteAttive} attive)`, color: C.purple, icon: 'carta' },
            { label: 'A tariffa agevolata', value: `${fmtNum2(agPct, 0)}%`, sub: `${fmtEur2(agImporto)} su ${fmtEur2(stats.importo)}`, color: C.green, icon: 'ok',
              seg: [{ w: agPct, color: C.green }, { w: 100 - agPct, color: C.orange }] },
          ]} />
        )}

        {hasDati && giorniSenzaListino > 0 && (
          <div className="ce2-alert">
            <span aria-hidden="true" className="ce2-dot" />
            <span style={{ flex: '1 1 360px' }}><span style={{ fontWeight: 600 }}>{giorniSenzaListino} prezzi giorno/prodotto senza listino.</span> <span style={{ color: '#3F3F46' }}>Il prezzo non è definitivo finché non lo importi dal listino o lo imposti a mano.</span></span>
            <Button size="sm" onClick={() => setShowListino(true)}>Imposta prezzi</Button>
          </div>
        )}

        <div className="ds-g4">
          <Card pad className="ds-s2">
            <CardHead title="Andamento" sub={trend.length ? `Importo per mese, ${formatMese(trend[0].mese).split(' ')[0].toLowerCase()}–${formatMese(trend[trend.length - 1].mese).toLowerCase()} · media ${fmtEur2(mediaTrend, 0)}` : 'Nessun mese caricato'} />
            {trend.length > 0 && (
              <BarStrip data={trend} palette="orange" legend={['Totale', 'A tariffa agevolata']}
                selected={Math.max(0, trend.findIndex((t) => t.mese === mese))} onSelect={(i) => apriMese(trend[i].mese)}
                ariaLabel="Carte Eni per mese: importo totale e quota a tariffa agevolata" />
            )}
          </Card>
          <Card pad>
            <CardHead title="Per prodotto" sub={`${meseLabel.split(' ')[0]}, IVA inclusa`} />
            {perProdotto.length === 0 ? <Empty>Nessun rifornimento</Empty> : (
              <div className="ce2-list">
                {perProdotto.map(([k, v]) => (
                  <div key={k} className="ce2-prod">
                    <div className="ce2-prod-top"><span style={{ fontWeight: 500 }}>{PROD[k]?.[0] ?? k}</span><span style={{ fontWeight: 600 }}>{fmtEur2(v.imp)}</span></div>
                    <div aria-hidden="true" className="ce2-bar"><div style={{ width: `${stats.importo ? (v.imp / stats.importo) * 100 : 0}%`, background: PROD[k]?.[1] ?? '#A1A1AA' }} /></div>
                    <span className="ds-cardsub">{v.n} rifornimenti · {fmtNum2(v.l, 1)} l</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card pad>
            <CardHead title="Ripartizione tariffa" sub="Stazioni agevolate e a prezzo pieno" />
            <div className="ce2-list">
              <div className="ce2-prod">
                <div className="ce2-prod-top"><span style={{ fontWeight: 500 }}>Importo agevolato</span><span style={{ fontWeight: 600 }}>{fmtEur2(agImporto)}</span></div>
                <div aria-hidden="true" className="ce2-bar"><div style={{ width: `${agPct}%`, background: C.green }} /></div>
                <span className="ds-cardsub">{transazioni.filter((t) => t.agevolata).length} rifornimenti · {fmtNum2(agPct, 0)}%</span>
              </div>
              <div className="ce2-prod">
                <div className="ce2-prod-top"><span style={{ fontWeight: 500 }}>Importo pieno</span><span style={{ fontWeight: 600 }}>{fmtEur2(pieImporto)}</span></div>
                <div aria-hidden="true" className="ce2-bar"><div style={{ width: `${100 - agPct}%`, background: C.orange }} /></div>
                <span className="ds-cardsub">{transazioni.filter((t) => !t.agevolata).length} rifornimenti · {fmtNum2(100 - agPct, 0)}%</span>
              </div>
              <span className="ds-cardsub">Senza IVA: {fmtEur2(noIva(stats.importo))} in totale</span>
            </div>
          </Card>
        </div>

        {showImport && (
          <Card pad>
            <CardHead title={`Importa transazioni di ${meseLabel.toLowerCase()}`} actions={<IconButton icon="close" label="Chiudi" onClick={() => setShowImport(false)} />} />
            <p className="ce2-hint">
              Carica il file "Ricerca Autorizzazioni" Eni per questo mese. Vengono importate solo le transazioni con rifornimento reale
              (Advice/Sale) e stato Approvata o Approvata con avviso; le preautorizzazioni e le righe negate vengono escluse.
              Le righe con data fuori da {mese} vengono ignorate.
            </p>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={onFileChange} />
            <div><Button variant="primary" icon="upload" disabled={saving} onClick={() => fileRef.current?.click()}>{saving ? 'Importazione…' : 'Scegli file'}</Button></div>
          </Card>
        )}

        {showListino && (
          <Card pad>
            <CardHead title="Listino prezzi" sub="Prezzo unitario per giorno e prodotto · non definitivo finché non modificato"
              actions={<>
                <input ref={filePrezziRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={onFilePrezziChange} />
                <Button size="sm" icon="upload" disabled={saving} onClick={() => filePrezziRef.current?.click()}>{saving ? 'Importazione…' : 'Importa listino'}</Button>
                <IconButton icon="close" label="Chiudi" onClick={() => setShowListino(false)} />
              </>} />
            <p className="ce2-hint">
              Carica un file con giorno e prezzo unitario definitivo (Diesel/HVO/Benzina), oppure un file tipo "Media Carburante" con colonne
              Gasolio no-IVA / Gasolio IVA 22% / HVO no-IVA / HVO IVA 22%: vengono prese automaticamente solo le colonne già IVA inclusa per
              Diesel e HVO (la Benzina non ha agevolazioni e non viene importata). Il prezzo si applica a tutte le transazioni di quel giorno
              e l'importo viene ricalcolato. Puoi anche modificare il prezzo di un singolo giorno qui sotto.
            </p>
            {giorniMese.length === 0 ? <Empty>Nessuna transazione nel mese</Empty> : (
              <div className="ds-tablewrap ce2-listino">
                <table className="ds-table">
                  <thead><tr><Th>Giorno</Th>{prodottiCols.map((p) => <Th key={p.key} right>{p.label} €/l</Th>)}</tr></thead>
                  <tbody>
                    {giorniMese.map((g) => (
                      <tr key={g.giorno}>
                        <td>{formatGiorno(g.giorno)}</td>
                        {prodottiCols.map((p) => {
                          const info = g.prodotti.get(p.key);
                          const key = `${g.giorno}|${p.key}`;
                          if (!info) return <td key={p.key} className="r" style={{ color: '#A1A1AA' }}>—</td>;
                          return (
                            <td key={p.key} className="r">
                              {editKey === key ? (
                                <input className="ds-input ce2-prezzo" autoFocus defaultValue={info.prezzo != null ? String(info.prezzo) : ''}
                                  onChange={(e) => setEditPrezzoVal(e.target.value)}
                                  onBlur={() => salvaPrezzoGiorno(g.giorno, p.key, editPrezzoVal)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                              ) : (
                                <button type="button" className={`ce2-pbtn${info.senzaListino ? ' is-warn' : ''}`}
                                  title={info.senzaListino ? 'Nessun prezzo di listino importato per questo giorno/prodotto' : 'Clic per modificare'}
                                  onClick={() => { setEditKey(key); setEditPrezzoVal(info.prezzo != null ? String(info.prezzo) : ''); }}>
                                  {info.senzaListino && <i />}{info.prezzo != null ? prezzo(info.prezzo) : 'Imposta'}
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
          </Card>
        )}

        {loading ? <Card pad><Empty>Caricamento {meseLabel.toLowerCase()}…</Empty></Card>
          : error ? <Alert tone="ko" title="Errore di caricamento">{error}</Alert> : (
          <Card>
            <div className="pl2-toolbar">
              <SegTabs<Vista> pill value={vista} onChange={setVista} label="Vista"
                items={[
                  { value: 'riepilogo', label: 'Riepilogo per carta', count: riepilogo.length },
                  { value: 'transazioni', label: 'Transazioni', count: transazioni.length },
                  { value: 'carte', label: 'Carte', count: carte.length },
                  { value: 'stazioni', label: 'Stazioni', count: stazioni.length },
                ]} />
              <div className="ds-actions">
                <SearchBox value={search} onChange={setSearch} placeholder={vista === 'stazioni' ? 'Cerca impianto, località…' : 'Cerca carta, utilizzatore, targa…'} width={280} />
                {vista === 'carte' && <Button size="sm" icon="plus" variant="primary" onClick={() => setShowNuovaCarta(true)}>Nuova carta</Button>}
                {vista === 'stazioni' && <Button size="sm" icon="plus" variant="primary" onClick={() => setShowNuovaStazione(true)}>Nuova stazione</Button>}
              </div>
            </div>

            {(vista === 'riepilogo' || vista === 'transazioni') && !hasDati ? (
              <Empty>Nessun dato per {meseLabel.toLowerCase()}. Usa "Importa file mensile" per caricare le transazioni.</Empty>
            ) : vista === 'riepilogo' ? (
              <div className="ds-tablewrap">
                <table className="ds-table ce2-table" style={{ minWidth: 1040 }}>
                  <thead><tr>
                    <Th k="n" sort={riepSort.sort} onSort={riepSort.toggle}>N° carta</Th>
                    <Th k="u" sort={riepSort.sort} onSort={riepSort.toggle}>Utilizzatore</Th>
                    <Th k="tg" sort={riepSort.sort} onSort={riepSort.toggle}>Targa abituale</Th>
                    <Th k="p" sort={riepSort.sort} onSort={riepSort.toggle}>Padroncino</Th>
                    <Th k="tx" sort={riepSort.sort} onSort={riepSort.toggle} right>Transazioni</Th>
                    <Th k="l" sort={riepSort.sort} onSort={riepSort.toggle} right>Litri</Th>
                    <Th k="i" sort={riepSort.sort} onSort={riepSort.toggle} right>Importo</Th>
                    <Th k="ni" sort={riepSort.sort} onSort={riepSort.toggle} right>No IVA</Th>
                  </tr></thead>
                  <tbody>
                    {riepSort.sorted.map((r) => {
                      const esp = espansoCarta === r.numeroCarta;
                      const righe = transazioniPerCarta.get(r.numeroCarta) ?? [];
                      return (
                        <Fragment key={r.numeroCarta}>
                          <tr className={`is-clickable${esp ? ' is-open' : ''}`} onClick={() => setEspansoCarta(esp ? null : r.numeroCarta)} aria-expanded={esp}>
                            <td className="ds-mono" style={{ whiteSpace: 'nowrap' }}><span className="ric2-caret">{esp ? '▾' : '▸'}</span>{r.numeroCarta}</td>
                            <td className="ce2-ell" style={{ color: r.utilizzatore ? undefined : '#71717A' }}>{r.utilizzatore ?? 'Non assegnato'}</td>
                            <td className="ds-mono ce2-ell" style={{ maxWidth: 120 }} title={cartaInfo.get(r.numeroCarta)?.targaAbituale ?? ''}>{cartaInfo.get(r.numeroCarta)?.targaAbituale ?? '—'}</td>
                            <td className="ce2-ell">{r.padroncino ?? '—'}</td>
                            <td className="r">{r.count}</td>
                            <td className="r">{fmtL(r.litri)}</td>
                            <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(r.importo)}</td>
                            <td className="r" style={{ color: '#6B6B73' }}>{fmtEur2(noIva(r.importo))}</td>
                          </tr>
                          {esp && (
                            <tr className="ric2-subrow">
                              <td colSpan={8}>
                                <table className="ric2-sub">
                                  <thead><tr><th>Data</th><th>Impianto</th><th>Targa</th><th>Prodotto</th><th>Tariffa</th><th className="r">Litri</th><th className="r">Prezzo</th><th className="r">Importo</th><th className="r">No IVA</th></tr></thead>
                                  <tbody>
                                    {righe.map((t) => (
                                      <tr key={t.id}>
                                        <td>{formatDataOra(t.data)}</td>
                                        <td className="ce2-ell" title={t.localita ?? ''}>{t.localita ?? t.codiceImpianto ?? '—'}</td>
                                        <td className="ds-mono">{t.targa ?? '—'}</td>
                                        <td><span className="ric2-cat"><i style={{ background: PROD[normalizzaProdotto(t.prodotto)]?.[1] }} />{t.prodotto ?? '—'}</span></td>
                                        <td><span className="ric2-cat" style={{ color: t.agevolata ? '#15803D' : '#C2410C', fontWeight: 500 }}><i style={{ background: t.agevolata ? C.green : C.orange }} />{t.agevolata ? 'Agevolata' : 'Prezzo pieno'}</span></td>
                                        <td className="r">{fmtL(t.quantita)}</td>
                                        <td className="r" style={{ color: '#6B6B73' }}>{prezzo(t.prezzoUnitario)}</td>
                                        <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(t.importo)}</td>
                                        <td className="r" style={{ color: '#6B6B73' }}>{fmtEur2(noIva(t.importo))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div className="ric2-subfoot">
                                  <span>{righe.length} transazion{righe.length === 1 ? 'e' : 'i'} di {meseLabel.toLowerCase()}</span>
                                  <Button size="sm" onClick={() => { setVista('transazioni'); setSearch(r.numeroCarta); }}>Tutte le transazioni della carta</Button>
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
                      <td colSpan={4}>Totale · {riepFiltr.length} carte</td>
                      <td className="r">{riepFiltr.reduce((a, r) => a + r.count, 0)}</td>
                      <td className="r">{fmtL(riepFiltr.reduce((a, r) => a + r.litri, 0))}</td>
                      <td className="r">{fmtEur2(riepFiltr.reduce((a, r) => a + r.importo, 0))}</td>
                      <td className="r">{fmtEur2(noIva(riepFiltr.reduce((a, r) => a + r.importo, 0)))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : vista === 'transazioni' ? (
              <div className="ds-tablewrap">
                <table className="ds-table ce2-table" style={{ minWidth: 1320 }}>
                  <thead><tr>
                    <Th k="d" sort={txSort.sort} onSort={txSort.toggle}>Data</Th>
                    <Th k="n" sort={txSort.sort} onSort={txSort.toggle}>Carta</Th>
                    <Th k="u" sort={txSort.sort} onSort={txSort.toggle}>Utilizzatore</Th>
                    <Th k="imp" sort={txSort.sort} onSort={txSort.toggle}>Impianto</Th>
                    <Th k="tg" sort={txSort.sort} onSort={txSort.toggle}>Targa</Th>
                    <Th k="pr" sort={txSort.sort} onSort={txSort.toggle}>Prodotto</Th>
                    <Th k="st" sort={txSort.sort} onSort={txSort.toggle}>Stato</Th>
                    <Th k="l" sort={txSort.sort} onSort={txSort.toggle} right>Litri</Th>
                    <Th k="pz" sort={txSort.sort} onSort={txSort.toggle} right>Prezzo</Th>
                    <Th k="i" sort={txSort.sort} onSort={txSort.toggle} right>Importo</Th>
                    <Th k="ni" sort={txSort.sort} onSort={txSort.toggle} right>No IVA</Th>
                  </tr></thead>
                  <tbody>
                    {txSort.sorted.map((t) => (
                      <tr key={t.id}>
                        <td style={{ color: '#3F3F46', whiteSpace: 'nowrap' }}>{formatDataOra(t.data)}</td>
                        <td className="ds-mono">{t.numeroCarta}</td>
                        <td className="ce2-ell">{t.utilizzatore ?? '—'}</td>
                        <td className="ce2-ell" title={t.localita ?? ''}><span className="ric2-cat"><i style={{ background: t.agevolata ? C.green : C.orange }} />{t.codiceImpianto ? `${t.codiceImpianto} · ` : ''}{t.localita ?? '—'}</span></td>
                        <td className="ds-mono">{t.targa ?? '—'}</td>
                        <td><span className="ric2-cat"><i style={{ background: PROD[normalizzaProdotto(t.prodotto)]?.[1] }} />{t.prodotto ?? '—'}</span></td>
                        <td style={{ color: t.statoAutorizzativo.includes('Warning') ? '#C2410C' : '#15803D', fontSize: 12 }}>{t.statoAutorizzativo}</td>
                        <td className="r">{fmtL(t.quantita)}</td>
                        <td className="r" style={{ color: '#6B6B73' }}>{prezzo(t.prezzoUnitario)}</td>
                        <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(t.importo)}</td>
                        <td className="r" style={{ color: '#6B6B73' }}>{fmtEur2(noIva(t.importo))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : vista === 'carte' ? (
              <div className="ds-tablewrap">
                <table className="ds-table ce2-table" style={{ minWidth: 980 }}>
                  <thead><tr>
                    <Th k="n" sort={carteSort.sort} onSort={carteSort.toggle}>N° carta</Th>
                    <Th k="u" sort={carteSort.sort} onSort={carteSort.toggle}>Utilizzatore</Th>
                    <Th k="p" sort={carteSort.sort} onSort={carteSort.toggle}>Padroncino (opzionale)</Th>
                    <Th k="tg" sort={carteSort.sort} onSort={carteSort.toggle}>Targa abituale</Th>
                    <Th k="tx" sort={carteSort.sort} onSort={carteSort.toggle} right>Transazioni</Th>
                    <Th k="a" sort={carteSort.sort} onSort={carteSort.toggle}>Stato</Th>
                    <Th />
                  </tr></thead>
                  <tbody>
                    {carteSort.sorted.map((c) => (
                      <tr key={c.id} style={{ opacity: savingCarta === c.id ? 0.6 : 1 }}>
                        <td className="ds-mono">{c.numeroCarta}</td>
                        <td><input className="ds-input ce2-cell" defaultValue={c.utilizzatore ?? ''} placeholder="Nome utilizzatore"
                          onBlur={(e) => { if (e.target.value !== (c.utilizzatore ?? '')) aggiornaCartaField(c.id, 'utilizzatore', e.target.value); }} /></td>
                        <td>
                          <select className="ds-input ce2-cell" value={c.padroncinoId ?? ''} onChange={(e) => aggiornaCartaField(c.id, 'padroncinoId', e.target.value)}>
                            <option value="">Nessun padroncino</option>
                            {padroncini.map((p) => <option key={p.id} value={p.id}>{p.ragioneSociale}</option>)}
                          </select>
                        </td>
                        <td><input className="ds-input ce2-cell ds-mono" style={{ maxWidth: 120 }} defaultValue={c.targaAbituale ?? ''} placeholder="Targa"
                          onBlur={(e) => { if (e.target.value !== (c.targaAbituale ?? '')) aggiornaCartaField(c.id, 'targaAbituale', e.target.value.toUpperCase()); }} /></td>
                        <td className="r">{c._count?.transazioni ?? 0}</td>
                        <td>
                          <button type="button" className={`ce2-toggle${c.attiva ? ' is-on' : ''}`} onClick={() => toggleAttiva(c)} title="Clic per cambiare">
                            <i />{c.attiva ? 'Attiva' : 'Disattivata'}
                          </button>
                        </td>
                        <td className="r"><IconButton icon="trash" label="Elimina carta" danger onClick={() => eliminaCarta(c)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ds-tablewrap">
                <table className="ds-table ce2-table">
                  <thead><tr>
                    <Th k="codiceImpianto" sort={{ key: stazioneSort.col, dir: stazioneSort.dir }} onSort={(k) => toggleStazioneSort(k as StazioneSortCol)}>Codice impianto</Th>
                    <Th k="localita" sort={{ key: stazioneSort.col, dir: stazioneSort.dir }} onSort={(k) => toggleStazioneSort(k as StazioneSortCol)}>Località</Th>
                    <Th k="agevolata" sort={{ key: stazioneSort.col, dir: stazioneSort.dir }} onSort={(k) => toggleStazioneSort(k as StazioneSortCol)}>Tariffa</Th>
                    <Th>Note</Th>
                  </tr></thead>
                  <tbody>
                    {stazFiltr.map((x) => (
                      <tr key={x.id} style={{ opacity: savingStazione === x.id ? 0.6 : 1 }}>
                        <td className="ds-mono">{x.codiceImpianto}</td>
                        <td>{x.localita ?? <span style={{ color: '#A1A1AA' }}>—</span>}</td>
                        <td>
                          <button type="button" className={`ce2-toggle${x.agevolata ? ' is-on' : ' is-off'}`} onClick={() => toggleStazioneAgevolata(x)} title="Clic per cambiare">
                            <i />{x.agevolata ? 'Agevolata' : 'Prezzo pieno'}
                          </button>
                        </td>
                        <td><input className="ds-input ce2-cell" defaultValue={x.note ?? ''} placeholder="Note…" onBlur={(e) => aggiornaStazioneNote(x, e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pl2-foot">
              {vista === 'riepilogo' ? `Mostrate ${riepFiltr.length} di ${riepilogo.length} carte con movimenti in ${meseLabel.toLowerCase()} · clic su una carta per le sue transazioni`
                : vista === 'transazioni' ? `Mostrate ${txFiltr.length} di ${transazioni.length} transazioni · il prezzo viene dal listino del giorno`
                : vista === 'carte' ? `${carteFiltrate.length} di ${carte.length} carte · i campi si salvano quando esci dalla casella`
                : `${stazFiltr.length} di ${stazioni.length} stazioni · la tariffa decide quali rifornimenti sono agevolati`}
            </div>
          </Card>
        )}
      </>)}

      <NuovaCartaModal
        open={showNuovaCarta}
        onClose={() => setShowNuovaCarta(false)}
        padroncini={padroncini}
        onSave={async (data) => { await carteEniApi.createCarta(data); await caricaCarte(); }}
      />
      <NuovaStazioneModal
        open={showNuovaStazione}
        onClose={() => setShowNuovaStazione(false)}
        onSave={async (data) => { await carteEniApi.createStazione(data); await caricaStazioni(); }}
      />
    </Page>
  );
}

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
    <Modal open={open} onClose={onClose} title="Nuova carta Eni" width={480}>
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
    <Modal open={open} onClose={onClose} title="Nuova stazione Eni" width={480}>
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
