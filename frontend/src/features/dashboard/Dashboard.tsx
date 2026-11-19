// src/features/dashboard/Dashboard.tsx — Panoramica (layout del mockup approvato)
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api, mezziApi, padronciniApi, palmariApi, codiciAutistaApi, conteggiApi as conteggiStatsApi, carteEniApi, taskApi,
  type MezziStats, type PalmariStats, type CodiciAutistaStats, type AndamentoMese, type Mezzo, type Padroncino, type TaskItem,
} from '../../lib/api';
import { conteggiApi, type ConteggioMensile } from '../../lib/conteggi.api';
import { addebitivSospesoApi, type AddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import { useAuthStore } from '../../stores/auth.store';
import { calcolaRighe } from '../conteggi/ConteggiPage';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import {
  Page, Icon, Spark, BarStrip, Th, useSort, Empty, C, fmtEur, fmtNum, type IconName,
} from '../../components/ds';
import './Dashboard.css';

// ─── Helpers di visualizzazione ───────────────────────
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const meseShift = (m: string, k: number) => { const [y, mo] = m.split('-').map(Number); return ym(new Date(y, mo - 1 + k, 1)); };
const nomeMese = (m: string) => MESI[Number(m.split('-')[1]) - 1];
const nomeMeseCap = (m: string) => nomeMese(m).charAt(0).toUpperCase() + nomeMese(m).slice(1);
const meseLungo = (m: string) => `${nomeMeseCap(m)} ${m.split('-')[0]}`;
const giorniDa = (iso: string | null | undefined) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
const dataIt = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const k = (n: number) => `€ ${fmtNum(Math.round(n))}`;
const iniziali = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const breve = (s: string) => s.replace(/ (S\.?R\.?L\.?S?\.?|SAS|SRL|SRLS)$/i, '');
const AVATAR = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
const pctDelta = (a?: number | null, b?: number | null) => (a != null && b ? ((a - b) / b) * 100 : null);
const fmtPct = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

const TONI = { rosso: ['#B91C1C', '#E5484D'], ambra: ['#C2410C', '#EA6A2A'], grigio: ['#52525B', '#A1A1AA'], blu: ['#1D4ED8', '#3D63F0'], verde: ['#15803D', '#15A06A'] } as const;
type Tono = keyof typeof TONI;

interface DaGestire { k: 'Mezzi' | 'Documenti' | 'Sospesi'; tile: string; icon: IconName; tag: string; tono: Tono; title: string; detail: string; to: string; ordine: number }

// ─── Component ────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const meseCorrente = ym(new Date());
  const [mese, setMese] = useState<string>(meseShift(meseCorrente, -1));
  const [periodo, setPeriodo] = useState<3 | 8 | 12>(8);
  const [filtro, setFiltro] = useState<'Tutto' | 'Mezzi' | 'Documenti' | 'Sospesi'>('Tutto');
  const [cerca, setCerca] = useState('');

  const [andamento, setAndamento] = useState<AndamentoMese[]>([]);
  const [conteggi, setConteggi] = useState<ConteggioMensile[]>([]);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [mezzi, setMezzi] = useState<Mezzo[]>([]);
  const [mezziStats, setMezziStats] = useState<MezziStats | null>(null);
  const [palmariStats, setPalmariStats] = useState<PalmariStats | null>(null);
  const [codiciStats, setCodiciStats] = useState<CodiciAutistaStats | null>(null);
  const [eniMesi, setEniMesi] = useState<{ mese: string; totale: number }[]>([]);
  const [ricariche, setRicariche] = useState<{ mese: string; totale: number }[]>([]);
  const [sospesi, setSospesi] = useState<AddebitoSospeso[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [aggiornato, setAggiornato] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dati che non dipendono dal mese
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [an, pd, mz, ms, ps, cs, eni, sos, tk] = await Promise.all([
          conteggiStatsApi.andamento(12),
          padronciniApi.list({ limit: '200' }),
          mezziApi.list({ limit: '200' }),
          mezziApi.stats(),
          palmariApi.stats(),
          codiciAutistaApi.stats().catch(() => null),
          carteEniApi.listMesi().catch(() => []),
          addebitivSospesoApi.list({ stato: 'PENDENTE' }).catch(() => []),
          taskApi.list('conteggi', 'conteggi').catch(() => []),
        ]);
        setAndamento(an); setPadroncini(pd.data); setMezzi(mz.data); setMezziStats(ms); setPalmariStats(ps); setCodiciStats(cs);
        setEniMesi(eni.map(e => ({ mese: e.mese, totale: Number(e.totale) })));
        setSospesi(sos); setTasks(tk);
        setAggiornato(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore caricamento panoramica');
      } finally { setLoading(false); }
    })();
  }, []);

  // Dati del mese scelto
  useEffect(() => {
    conteggiApi.list(mese).then(setConteggi).catch(() => setConteggi([]));
    const mesi = Array.from({ length: 8 }, (_, i) => meseShift(mese, i - 7));
    // Totale ricariche del mese = somma dei costi finali delle sessioni (come nella pagina Ricariche)
    Promise.all(mesi.map(m => api.get<{ sessioni: { costoFinale: number }[] }>(`/ricariche?mese=${m}`)
      .then(r => ({ mese: m, totale: (r.sessioni ?? []).reduce((s, x) => s + Number(x.costoFinale || 0), 0) }))
      .catch(() => ({ mese: m, totale: 0 }))))
      .then(setRicariche);
  }, [mese]);

  // ─── Indicatori ─────────────────────────────────────
  const nettoMese = conteggi.reduce((s, c) => s + Number(c.netto ?? 0), 0);
  const nettoA = (a: AndamentoMese) => Number(a.bonifici || 0) + Number(a.daBonificare || 0);
  const iA = andamento.findIndex(a => a.mese === mese);
  const curA = iA >= 0 ? andamento[iA] : null;
  const prevA = iA > 0 ? andamento[iA - 1] : null;
  const fino = (n: number) => andamento.slice(0, iA >= 0 ? iA + 1 : undefined).slice(-n);
  const eniFino = eniMesi.filter(e => e.mese <= mese).sort((a, b) => a.mese.localeCompare(b.mese)).slice(-8);
  const eniCur = eniMesi.find(e => e.mese === mese)?.totale ?? 0;
  const eniPrev = eniMesi.find(e => e.mese === meseShift(mese, -1))?.totale ?? null;
  const ricCur = ricariche.find(r => r.mese === mese)?.totale ?? 0;
  const ricPrev = ricariche.find(r => r.mese === meseShift(mese, -1))?.totale ?? null;
  const prevNome = nomeMese(meseShift(mese, -1));

  const kpi: { c: string; icon: IconName; label: string; value: string; delta: number | null; goodUp: boolean; sub: string; spark: number[] }[] = [
    { c: C.blue, icon: 'cont', label: 'Netto conteggi', value: k(nettoMese), delta: curA && prevA ? pctDelta(nettoA(curA), nettoA(prevA)) : null, goodUp: true, sub: `vs ${prevNome}`, spark: fino(8).map(nettoA) },
    { c: C.green, icon: 'euro', label: 'Fatturato imponibile', value: k(Number(curA?.fatturato ?? 0)), delta: curA && prevA ? pctDelta(Number(curA.fatturato), Number(prevA.fatturato)) : null, goodUp: true, sub: `vs ${prevNome} · IVA esclusa`, spark: fino(8).map(a => Number(a.fatturato)) },
    { c: C.orange, icon: 'eni', label: 'Carburante Eni', value: k(eniCur), delta: pctDelta(eniCur, eniPrev), goodUp: false, sub: `vs ${prevNome}`, spark: eniFino.map(e => e.totale) },
    { c: C.teal, icon: 'ric', label: 'Ricariche elettriche', value: k(ricCur), delta: pctDelta(ricCur, ricPrev), goodUp: false, sub: `vs ${prevNome}`, spark: ricariche.filter(r => r.totale > 0).map(r => r.totale) },
  ];

  // ─── Grafico ────────────────────────────────────────
  // Grafico: la finestra resta ancorata all'ultimo mese disponibile, così cliccando un mese
  // precedente le barre successive non spariscono (prima la finestra finiva al mese selezionato).
  const finestra = (n: number) => {
    if (andamento.length === 0) return [];
    // ultimo mese con dati (o quello selezionato, se più avanti)
    let end = andamento.length - 1;
    while (end > 0 && end > iA && !Number(andamento[end].fatturato) && !nettoA(andamento[end])) end--;
    let start = Math.max(0, end - n + 1);
    if (iA >= 0 && iA < start) { start = iA; end = Math.min(andamento.length - 1, iA + n - 1); }
    return andamento.slice(start, end + 1);
  };
  const chartData = finestra(periodo).map(a => ({
    label: MESI[Number(a.mese.split('-')[1]) - 1].slice(0, 3),
    total: Number(a.fatturato || 0),
    part: nettoA(a),
    valueLabel: Number(a.fatturato) ? `${Math.round(Number(a.fatturato) / 1000)}k` : '—',
    tip: `${meseLungo(a.mese)} · imponibile ${fmtEur(a.fatturato)} · netto ${fmtEur(nettoA(a))}`,
    mese: a.mese,
  }));

  // ─── Addebiti del mese per tipo (stessa logica di calcolaRighe) ──
  const addebiti = useMemo(() => {
    const out = { tot: 0, noleggi: 0, ricariche: 0, palmari: 0, vari: 0 };
    for (const c of conteggi) {
      if (!c.righe?.length) continue;
      const sum = (t: string) => c.righe.filter(r => r.tipo === t).reduce((s, r) => s + Number(r.importo), 0);
      const nol = sum('NOLEGGIO'), ric = sum('RICARICA'), pal = sum('PALMARE') * 1.22;
      const tot = calcolaRighe(c.righe).addebiti;
      out.tot += tot; out.noleggi += nol; out.ricariche += ric; out.palmari += pal; out.vari += tot - nol - ric - pal;
    }
    return out;
  }, [conteggi]);
  const breakdown = [
    { l: 'Noleggi mezzi', v: addebiti.noleggi, c: C.teal },
    { l: 'Ricariche', v: addebiti.ricariche, c: C.green },
    { l: 'Palmari', v: addebiti.palmari, c: C.blue },
    { l: 'Addebiti vari e bolli', v: addebiti.vari, c: C.purple },
  ];

  // ─── Da gestire ─────────────────────────────────────
  const daGestire = useMemo<DaGestire[]>(() => {
    const out: DaGestire[] = [];
    const attiviP = padroncini.filter(p => p.attivo !== false);
    for (const [campo, nome] of [['scadenzaDurc', 'DURC'], ['scadenzaDvr', 'DVR']] as const) {
      const valido = (p: Padroncino) => !(campo === 'scadenzaDvr' && p.dvrEsente) && !!p[campo];
      const scaduti = attiviP.filter(p => valido(p) && (giorniDa(p[campo]) ?? 1) < 0)
        .sort((a, b) => String(a[campo]).localeCompare(String(b[campo])));
      if (scaduti.length) out.push({ k: 'Documenti', tile: C.red, icon: 'doc', tag: 'Scaduto', tono: 'rosso', ordine: 0, to: '/padroncini',
        title: `${nome} scaduto · ${scaduti.length} ${scaduti.length === 1 ? 'padroncino attivo' : 'padroncini attivi'}`,
        detail: scaduti.map(p => `${breve(p.ragioneSociale)} dal ${dataIt(p[campo]!)}`).join(' · ') });
      attiviP.filter(valido).forEach(p => {
        const g = giorniDa(p[campo])!;
        if (g >= 0 && g <= 30) out.push({ k: 'Documenti', tile: C.orange, icon: 'doc', tag: `Tra ${g} giorni`, tono: 'ambra', ordine: 1 + g, to: `/padroncini/${p.id}`,
          title: `${nome} in scadenza · ${p.ragioneSociale}`, detail: `Scade il ${dataIt(p[campo]!)}` });
      });
    }
    const inFlotta = mezzi.filter(m => !['DISMESSO', 'VENDUTO'].includes(m.stato.toUpperCase()));
    const gruppo = (campo: 'scadenzaBollo' | 'scadenzaRevisione' | 'fineNoleggio' | 'scadenzaAssicurazione', label: string, entro: number) => {
      const lista = inFlotta.filter(m => m[campo]).map(m => ({ m, g: giorniDa(m[campo])! })).filter(x => x.g <= entro);
      const scad = lista.filter(x => x.g < 0), pross = lista.filter(x => x.g >= 0);
      if (scad.length) {
        const date = Array.from(new Set(scad.map(x => dataIt(x.m[campo]!))));
        const anni = Array.from(new Set(scad.map(x => x.m[campo]!.slice(0, 4)))).sort();
        out.push(campo === 'scadenzaAssicurazione'
          ? { k: 'Mezzi', tile: '#71717A', icon: 'scudo', tag: 'Da aggiornare', tono: 'grigio', ordine: 50, to: '/flotta', title: `${label} con data superata · ${scad.length} mezzi`, detail: anni.length > 1 ? `Date ferme tra il ${anni[0]} e il ${anni[anni.length - 1]}` : `Date ferme al ${anni[0]}` }
          : { k: 'Mezzi', tile: C.red, icon: 'mezzi', tag: 'Scaduto', tono: 'rosso', ordine: 0, to: '/flotta', title: `${label} scaduto · ${scad.length} ${scad.length === 1 ? 'mezzo' : 'mezzi'}`, detail: date.length <= 3 ? `Dal ${date.join(', ')}` : `${scad.map(x => x.m.targa).slice(0, 6).join(', ')}${scad.length > 6 ? ` e altri ${scad.length - 6}` : ''}` });
      }
      const perData = new Map<string, Mezzo[]>();
      pross.forEach(x => { const d = dataIt(x.m[campo]!); perData.set(d, [...(perData.get(d) ?? []), x.m]); });
      perData.forEach((ms, d) => {
        const g = giorniDa(ms[0][campo])!;
        const modelli = Array.from(new Set(ms.map(m => `${m.marca} ${m.modello}`.trim())));
        out.push({ k: 'Mezzi', tile: C.orange, icon: campo === 'scadenzaAssicurazione' ? 'scudo' : 'cal', tag: `Tra ${g} giorni`, tono: 'ambra', ordine: 1 + g,
          to: ms.length === 1 ? `/flotta/${ms[0].id}` : '/flotta',
          title: `${label} · ${ms.map(m => m.targa).join(ms.length === 2 ? ' e ' : ', ')}`,
          detail: `${campo === 'fineNoleggio' ? '' : 'Entro il '}${d} · ${modelli.join(', ')}` });
      });
    };
    gruppo('scadenzaBollo', 'Bollo', 30);
    gruppo('scadenzaRevisione', 'Revisione', 30);
    gruppo('fineNoleggio', 'Fine noleggio', 60);
    gruppo('scadenzaAssicurazione', 'Assicurazione', 30);
    if (sospesi.length) {
      const add = sospesi.filter(s => s.tipo !== 'MEMO');
      const memo = sospesi.length - add.length;
      const tot = add.reduce((s, x) => s + Number(x.importo ?? 0), 0);
      const nomi = Array.from(new Set(sospesi.map(s => s.padroncino ? breve(s.padroncino.ragioneSociale) : '').filter(Boolean)));
      const target = sospesi.map(s => s.meseTarget).sort()[0];
      out.push({ k: 'Sospesi', tile: C.blue, icon: 'euro', tag: target ? nomeMeseCap(target) : 'In attesa', tono: 'blu', ordine: 90, to: '/addebiti-sospesi',
        title: `Sospesi da inserire nei conteggi · ${sospesi.length}`,
        detail: [add.length ? `${add.length} ${add.length === 1 ? 'addebito' : 'addebiti'} per ${k(tot)}` : '', memo ? `${memo} promemoria` : ''].filter(Boolean).join(' e ') + (nomi.length ? ` · ${nomi.join(' e ')}` : '') });
    }
    return out.sort((a, b) => a.ordine - b.ordine);
  }, [padroncini, mezzi, sospesi]);
  const daGestireVisti = daGestire.filter(x => filtro === 'Tutto' || x.k === filtro);

  // ─── Promemoria (attività dei conteggi ancora aperte) ──
  const promemoria = tasks.filter(t => !t.completata).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const handleFatto = async (t: TaskItem) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, completata: true } : x));
    try { await taskApi.toggle(t.id, true); } catch (e: any) { alert('Errore aggiornamento attività: ' + e.message); }
  };
  const handleNuovaAttivita = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      await taskApi.create({ entityType: 'conteggi', entityId: 'conteggi', ...data });
      setTaskOpen(false);
      setTasks(await taskApi.list('conteggi', 'conteggi'));
    } catch (e: any) { alert('Errore salvataggio attività: ' + e.message); }
    finally { setTaskSaving(false); }
  };

  // ─── Padroncini ─────────────────────────────────────
  const nettoPer = useMemo(() => new Map(conteggi.map(c => [c.padroncinoId, Number(c.netto ?? 0)])), [conteggi]);
  const durcInfo = (p: Padroncino): { t: string; tono: Tono; ord: number } => {
    if (!p.scadenzaDurc) return { t: 'Non inserito', tono: 'grigio', ord: -1 };
    const g = giorniDa(p.scadenzaDurc)!;
    if (g < 0) return { t: `Scaduto il ${dataIt(p.scadenzaDurc)}`, tono: 'rosso', ord: 0 };
    if (g <= 30) return { t: `Scade il ${dataIt(p.scadenzaDurc)}`, tono: 'ambra', ord: 1 };
    return { t: dataIt(p.scadenzaDurc), tono: 'verde', ord: 2 };
  };
  const dvrTesto = (p: Padroncino) => (p.dvrEsente ? 'Esente' : p.scadenzaDvr ? dataIt(p.scadenzaDvr) : 'Non inserito');
  const attivi = useMemo(() => padroncini.filter(p => p.attivo !== false && p.ragioneSociale.toLowerCase().includes(cerca.toLowerCase())), [padroncini, cerca]);
  type PK = 'nome' | 'mezzi' | 'palmari' | 'codici' | 'durc' | 'dvr' | 'netto';
  const ps = useSort<Padroncino, PK>(attivi, (p, key) => {
    switch (key) {
      case 'nome': return p.ragioneSociale;
      case 'mezzi': return p.mezziAssegnati?.length ?? 0;
      case 'palmari': return p.palmariAssegnati?.length ?? 0;
      case 'codici': return p.codiciAutista?.length ?? 0;
      case 'durc': { const d = durcInfo(p); return d.ord * 1e9 + (p.scadenzaDurc ? new Date(p.scadenzaDurc).getTime() / 1e5 : 0); }
      case 'dvr': return p.dvrEsente ? 'Esente' : p.scadenzaDvr ?? '';
      case 'netto': return nettoPer.get(p.id) ?? '';
    }
  }, { key: 'netto', dir: 'desc' });
  const totAttivi = padroncini.filter(p => p.attivo !== false);

  // ─── Flotta ─────────────────────────────────────────
  const dismessi = mezzi.filter(m => ['DISMESSO', 'VENDUTO'].includes(m.stato.toUpperCase())).length;
  const assegnati = mezziStats?.assegnati ?? 0, disponibili = mezziStats?.disponibili ?? 0;
  const flottaTot = mezziStats?.totali ?? mezzi.length;

  // ─── Testi in alto ──────────────────────────────────
  const ora = new Date().getHours();
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const chiusi = conteggi.filter(c => c.stato !== 'BOZZA').length;

  if (loading) return <Page><Empty>Caricamento panoramica…</Empty></Page>;

  return (
    <Page>
      <header className="ds-pagehead">
        <div className="ds-pagehead-text">
          <span className="ds-eyebrow">Panoramica operativa</span>
          <h1 className="ds-h1">{saluto}{user?.nome ? `, ${user.nome}` : ''}</h1>
          <p className="ds-sub">{oggi.charAt(0).toUpperCase() + oggi.slice(1)} · ecco come va il deposito.</p>
        </div>
        <div className="ds-actions">
          <label className="ds-btn dash-mese">
            <Icon name="cal" size={14} />
            <span className="sr-only">Mese</span>
            <select value={mese} onChange={e => setMese(e.target.value)}>
              {Array.from({ length: 13 }, (_, i) => meseShift(meseCorrente, -i)).map(m => <option key={m} value={m}>{meseLungo(m)}</option>)}
            </select>
            <Icon name="chevDown" size={12} />
          </label>
          <Link to="/conteggi" className="ds-btn ds-btn-primary" onClick={() => sessionStorage.setItem('conteggi_mese_selezionato', meseCorrente)}>
            <Icon name="cont" size={14} />Conteggi di {nomeMese(meseCorrente)}
          </Link>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert-ko" role="alert">{error}</div>}

      <div className="dash-banner">
        <span aria-hidden="true" className="dash-banner-mark">GC</span>
        <div className="dash-banner-text">
          <span style={{ fontWeight: 600 }}>
            {conteggi.length === 0 ? `Nessun conteggio per ${nomeMese(mese)}` : chiusi === conteggi.length ? `Conteggi di ${nomeMese(mese)} chiusi · ${chiusi} su ${conteggi.length}` : `Conteggi di ${nomeMese(mese)} · ${chiusi} chiusi su ${conteggi.length}`}
          </span>
          <span className="dash-muted12">
            {totAttivi.length} padroncini attivi · {flottaTot} mezzi · {palmariStats?.totali ?? 0} palmari · {codiciStats?.totali ?? 0} codici autista
          </span>
        </div>
        {aggiornato && <span className="ds-dot ds-dot-ok">Dati aggiornati alle {aggiornato.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      <section aria-label={`Indicatori di ${nomeMese(mese)}`} className="ds-g4">
        {kpi.map(x => (
          <div key={x.label} className="ds-kpi">
            <div className="ds-kpi-top">
              <span aria-hidden="true" className="ds-tile" style={{ background: x.c }}><Icon name={x.icon} size={11} stroke={2.6} /></span>
              <span className="ds-kpi-label">{x.label}</span>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="#A1A1AA"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            </div>
            <div className="dash-kpi-row">
              <div className="dash-kpi-col">
                <span className="ds-kpi-value dash-kpi-big">{x.value}</span>
                <span className="ds-kpi-sub">
                  {x.delta !== null && <span style={{ fontWeight: 600, color: (x.delta >= 0) === x.goodUp ? '#15803D' : '#B91C1C' }}>{fmtPct(x.delta)}</span>} {x.sub}
                </span>
              </div>
              {x.spark.length > 0 && <Spark values={x.spark} color={x.c} />}
            </div>
          </div>
        ))}
      </section>

      <div className="ds-g4">
        <section className="ds-card ds-card-pad ds-s3" style={{ gap: 14 }}>
          <div className="ds-cardhead">
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Fatturato e netto</h2>
              <span className="ds-cardsub">{nomeMeseCap(mese)}: imponibile {k(Number(curA?.fatturato ?? 0))} · netto {k(nettoMese)}</span>
            </div>
            <div role="group" aria-label="Periodo" className="dash-periodo">
              {([3, 8, 12] as const).map(p => (
                <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>{p === 12 ? 'Anno' : `${p}M`}</button>
              ))}
            </div>
          </div>
          {chartData.length === 0 ? <Empty>Nessun dato</Empty> : (
            <BarStrip
              data={chartData}
              palette="blue"
              legend={['Fatturato imponibile', 'Netto bonificato']}
              selected={chartData.findIndex(d => d.mese === mese)}
              onSelect={i => setMese(chartData[i].mese)}
              ariaLabel={`Fatturato imponibile e netto per mese, ultimi ${chartData.length} mesi`}
            />
          )}
        </section>

        <section className="ds-card ds-card-pad">
          <div className="ds-cardhead-text">
            <h2 className="ds-h2">Addebiti di {nomeMese(mese)}</h2>
            <span className="ds-cardsub">Cosa addebitiamo ai padroncini</span>
          </div>
          <span className="ds-kpi-value">{fmtEur(addebiti.tot)}</span>
          <div aria-hidden="true" className="dash-seg">
            {breakdown.filter(b => b.v > 0).map(b => <span key={b.l} style={{ width: `${(b.v / (addebiti.tot || 1)) * 100}%`, background: b.c }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {breakdown.map(b => (
              <div key={b.l} className="dash-legrow">
                <i style={{ background: b.c }} />
                <span>{b.l}</span>
                <strong>{fmtEur(b.v)}</strong>
                <small>{addebiti.tot ? Math.round((b.v / addebiti.tot) * 100) : 0}%</small>
              </div>
            ))}
          </div>
          <Link to="/conteggi" className="dash-link" onClick={() => sessionStorage.setItem('conteggi_mese_selezionato', mese)}>Vai ai conteggi ↗</Link>
        </section>
      </div>

      <div className="ds-g4">
        <section className="ds-card ds-s3" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ds-cardhead ds-cardhead-bar" style={{ paddingTop: 16 }}>
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Da gestire</h2>
              <span className="ds-cardsub">{daGestireVisti.length} cose tra scadenze, documenti e sospesi</span>
            </div>
            <div role="group" aria-label="Filtra" className="ds-segtabs">
              {(['Tutto', 'Mezzi', 'Documenti', 'Sospesi'] as const).map(f => (
                <button key={f} type="button" className="ds-segtab" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {f}<small>{f === 'Tutto' ? daGestire.length : daGestire.filter(x => x.k === f).length}</small>
                </button>
              ))}
            </div>
          </div>
          {daGestireVisti.length === 0 && <Empty>Niente da gestire.</Empty>}
          {daGestireVisti.map((t, i) => (
            <Link key={i} to={t.to} className="dash-todo">
              <span aria-hidden="true" className="dash-todo-tile" style={{ background: t.tile }}><Icon name={t.icon} size={13} stroke={2.4} /></span>
              <span className="dash-todo-text">
                <span style={{ fontWeight: 600 }}>{t.title}</span>
                <span className="dash-muted12">{t.detail}</span>
              </span>
              <span className="dash-todo-tag" style={{ color: TONI[t.tono][0] }}><i style={{ background: TONI[t.tono][1] }} />{t.tag}</span>
            </Link>
          ))}
        </section>

        <section className="ds-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ds-cardhead ds-cardhead-bar" style={{ paddingTop: 16 }}>
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Promemoria</h2>
              <span className="ds-cardsub">{promemoria.length} {promemoria.length === 1 ? 'aperto' : 'aperti'}</span>
            </div>
            <button type="button" aria-label="Nuovo promemoria" title="Nuovo promemoria" className="dash-plus" onClick={() => setTaskOpen(true)}><Icon name="plus" size={14} /></button>
          </div>
          {promemoria.length === 0 && <Empty>Nessun promemoria aperto</Empty>}
          <div className="dash-promo-list">
            {promemoria.map(t => (
              <div key={t.id} className="dash-promo">
                <span style={{ fontWeight: 600 }}>{t.testo}</span>
                <div className="dash-promo-foot">
                  <span className="dash-muted12">{t.padroncino ? breve(t.padroncino) : 'Conteggi'} · dal {new Date(t.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span>
                  <button type="button" className="dash-fatto" onClick={() => handleFatto(t)}>Fatto</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="ds-g4">
        <section className="ds-card ds-s3">
          <div className="ds-cardhead" style={{ padding: '16px 18px 6px' }}>
            <div className="ds-cardhead-text">
              <h2 className="ds-h2">Padroncini da bonificare</h2>
              <span className="ds-cardsub">Risorse, documenti e netto di {nomeMese(mese)} · clic sulle intestazioni per ordinare</span>
            </div>
            <label className="ds-search" style={{ minWidth: 200 }}>
              <Icon name="search" size={13} />
              <span className="sr-only">Cerca padroncino</span>
              <input placeholder="Cerca padroncino…" value={cerca} onChange={e => setCerca(e.target.value)} />
            </label>
          </div>
          <div className="ds-tablewrap" style={{ marginTop: 8 }}>
            <table className="ds-table dash-ptable">
              <thead>
                <tr>
                  <Th k="nome" sort={ps.sort} onSort={ps.toggle}>Padroncino</Th>
                  <Th k="mezzi" sort={ps.sort} onSort={ps.toggle} right>Mezzi</Th>
                  <Th k="palmari" sort={ps.sort} onSort={ps.toggle} right>Palmari</Th>
                  <Th k="codici" sort={ps.sort} onSort={ps.toggle} right>Codici</Th>
                  <Th k="durc" sort={ps.sort} onSort={ps.toggle}>DURC</Th>
                  <Th k="dvr" sort={ps.sort} onSort={ps.toggle}>DVR</Th>
                  <Th k="netto" sort={ps.sort} onSort={ps.toggle} right>Netto {nomeMese(mese)}</Th>
                </tr>
              </thead>
              <tbody>
                {ps.sorted.map(p => {
                  const d = durcInfo(p);
                  const n = nettoPer.get(p.id);
                  const idx = padroncini.findIndex(x => x.id === p.id);
                  return (
                    <tr key={p.id} className="is-clickable" onClick={() => navigate(`/padroncini/${p.id}`)}>
                      <td>
                        <span className="dash-pname">
                          <span aria-hidden="true" className="dash-av" style={{ background: AVATAR[idx % AVATAR.length] }}>{iniziali(p.ragioneSociale)}</span>
                          <span className="dash-plink">{p.ragioneSociale}</span>
                        </span>
                      </td>
                      <td className="r">{p.mezziAssegnati?.length ?? 0}</td>
                      <td className="r">{p.palmariAssegnati?.length ?? 0}</td>
                      <td className="r">{p.codiciAutista?.length ?? 0}</td>
                      <td><span className="dash-todo-tag" style={{ color: TONI[d.tono][0] }}><i style={{ background: TONI[d.tono][1] }} />{d.t}</span></td>
                      <td style={{ fontSize: 12, color: '#3F3F46' }}>{dvrTesto(p)}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{n != null ? fmtEur(n) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="dash-pfoot">
            <span>{totAttivi.length} padroncini attivi · totale da bonificare {fmtEur(nettoMese)}</span>
            <Link to="/padroncini" className="dash-link">Apri padroncini ↗</Link>
          </div>
        </section>

        <section className="ds-card ds-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" className="ds-tile" style={{ background: C.teal }}><Icon name="mezzi" size={11} stroke={2.6} /></span>
            <h2 className="ds-h2">Flotta: canoni e rate</h2>
          </div>
          <dl className="dash-dl">
            <div><dt>Canoni noleggio</dt><dd>{fmtEur(mezziStats?.entrateNoleggio ?? 0)}</dd></div>
            <div><dt>Rate PDA</dt><dd>{fmtEur(mezziStats?.sommaRate ?? 0)}</dd></div>
            <div className="dash-dl-sep"><dt>Margine (calcolo attuale)</dt><dd>{fmtEur(mezziStats?.margine ?? 0)}</dd></div>
          </dl>
          <div aria-hidden="true" className="ds-seg">
            <span style={{ width: `${(assegnati / (flottaTot || 1)) * 100}%`, background: C.green }} />
            <span style={{ width: `${(disponibili / (flottaTot || 1)) * 100}%`, background: C.blue }} />
            <span style={{ width: `${(dismessi / (flottaTot || 1)) * 100}%`, background: '#A1A1AA' }} />
          </div>
          <span className="dash-muted12">{flottaTot} mezzi · {assegnati} assegnati · {disponibili} disponibili · {dismessi} dismessi</span>
          <Link to="/flotta" className="dash-link">Apri flotta ↗</Link>
        </section>
      </div>

      <footer className="dash-footer">
        <span>Gestionale Corriere</span>
        <span className="ds-dot ds-dot-ok" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Database collegato</span>
      </footer>

      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} onSubmit={handleNuovaAttivita} saving={taskSaving} />
    </Page>
  );
}
