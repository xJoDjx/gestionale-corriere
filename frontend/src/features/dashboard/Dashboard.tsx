// src/features/dashboard/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  mezziApi,
  padronciniApi,
  palmariApi,
  conteggiApi,
  auditApi,
  ricaricheApi,
  accontiApi,
  type MezziStats,
  type PadronciniStats,
  type PalmariStats,
  type ConteggiStats,
  type AndamentoMese,
  type TopDaBonificare,
  type AuditLogEntry,
  type Mezzo,
} from '../../lib/api';
import { MEZZO_FIELD_PRIORITY } from '../../lib/auditFormat';
import {
  Page, PageHeader, Card, CardHead, Kpis, Button, SegTabs, Dot, Empty, BarStrip, SegBar,
  Th, useSort, Icon, C, fmtEur, type KpiItem, type Tone, type IconName,
} from '../../components/ds';
import './Dashboard.css';

// ─── Helpers ──────────────────────────────────────────
const eur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const meseCorrente = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const mesePrecedente = (): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatMeseShort = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
};

const giorniDaOra = (iso: string): number => {
  const d = new Date(iso);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const formatRelativeTime = (iso: string): string => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Ieri';
  if (days < 7) return `${days}gg`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
};

const formatMese = (mese: string | undefined): string => {
  if (!mese || typeof mese !== 'string' || !/^\d{4}-\d{2}$/.test(mese)) return '';
  const [y, m] = mese.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
};

const eurFmt = (v: number) =>
  v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const auditLabel = (log: AuditLogEntry): { azione: string; dettaglio: string; tipo: string } => {
  const t = log.entityType;
  const a = log.azione;
  const dopo: any = log.dataDopo || {};
  const prima: any = log.dataPrima || {};

  const tipoMap: Record<string, string> = {
    mezzo: 'Mezzo',
    padroncino: 'Padroncino',
    palmare: 'Palmare',
    conteggio_mensile: 'Conteggio',
    conteggio_riga: 'Riga conteggio',
    acconto: 'Acconto',
    ricarica_elettrica: 'Ricarica',
    codice_autista: 'Codice autista',
    assegnazione_mezzo: 'Assegnazione mezzo',
    assegnazione_palmare: 'Assegnazione palmare',
    utente: 'Utente',
    documento: 'Documento',
  };
  const tipoLabel = tipoMap[t] ?? t.replace(/_/g, ' ');

  if (t === 'conteggio_mensile') {
    const meseDopo = formatMese(dopo.mese || dopo.meseDestinazione);
    const padr = dopo.padroncino || prima.padroncino;
    const ctx = [padr, meseDopo].filter(Boolean).join(' · ');

    if (a === 'CREATE') {
      return { tipo: 'Conteggio', azione: 'Creato conteggio', dettaglio: ctx || log.entityId.slice(0, 8) };
    }
    if (a === 'DELETE') {
      return { tipo: 'Conteggio', azione: 'Eliminato conteggio', dettaglio: ctx || log.entityId.slice(0, 8) };
    }
    if (dopo.azione === 'duplica_da_mese') {
      const src = formatMese(dopo.meseSorgente);
      const dst = formatMese(dopo.meseDestinazione);
      return {
        tipo: 'Conteggio',
        azione: 'Duplicato conteggio',
        dettaglio: `${dopo.padroncino ?? ''} · ${src} → ${dst} (${dopo.righeCopiate ?? 0} righe)`.replace(/^ · /, ''),
      };
    }
    if (dopo.azione === 'rigenerazione_righe_automatiche') {
      return { tipo: 'Conteggio', azione: 'Rigenerate righe automatiche', dettaglio: ctx };
    }
    if (dopo.azione === 'cambio_stato' || dopo.stato) {
      const stato = dopo.stato;
      const verbo = stato === 'CONFERMATO' ? 'Confermato' : stato === 'CHIUSO' ? 'Chiuso' : 'Riportato in bozza';
      return { tipo: 'Conteggio', azione: `${verbo} conteggio`, dettaglio: ctx };
    }
    if (dopo.azione === 'salva_netto') {
      const n = Number(dopo.nettoSalvato ?? 0);
      return { tipo: 'Conteggio', azione: 'Salvato netto', dettaglio: `${ctx} · ${eurFmt(n)} €` };
    }
    return { tipo: 'Conteggio', azione: 'Aggiornato conteggio', dettaglio: ctx || log.entityId.slice(0, 8) };
  }

  if (t === 'conteggio_riga') {
    const r = a === 'DELETE' ? prima : dopo;
    const ctx = [r.padroncino, formatMese(r.mese)].filter(Boolean).join(' · ');
    const importo = r.importo != null ? `${eurFmt(Number(r.importo))} €` : '';
    const desc = r.descrizione || r.tipo || '';
    const verbo = a === 'CREATE' ? 'Aggiunta' : a === 'DELETE' ? 'Eliminata' : 'Modificata';
    const det = [ctx, [desc, importo].filter(Boolean).join(' — ')].filter(Boolean).join(' · ');
    return { tipo: 'Riga', azione: `${verbo} riga conteggio`, dettaglio: det };
  }

  if (t === 'mezzo') {
    const targa = dopo.targa || prima.targa;
    const verbo = a === 'CREATE' ? 'Creato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    const targaLabel = targa ? `Targa ${targa}` : log.entityId.slice(0, 8);
    if (a === 'UPDATE') {
      for (const [field, label] of MEZZO_FIELD_PRIORITY) {
        if (prima[field] !== undefined && dopo[field] !== undefined &&
            JSON.stringify(prima[field]) !== JSON.stringify(dopo[field])) {
          const fmtVal = (v: any) => {
            if (field === 'rataNoleggio') return `${eurFmt(Number(v))} €`;
            if (field === 'kmAttuali') return v == null ? '—' : `${Number(v).toLocaleString('it-IT')} km`;
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).toLocaleDateString('it-IT');
            return String(v ?? '—');
          };
          return {
            tipo: 'Mezzo',
            azione: `${label[0].toUpperCase()}${label.slice(1)} aggiornati`,
            dettaglio: `${targaLabel} · da ${fmtVal(prima[field])} a ${fmtVal(dopo[field])}`,
          };
        }
      }
    }
    return { tipo: 'Mezzo', azione: `${verbo} mezzo`, dettaglio: targaLabel };
  }

  if (t === 'assegnazione_mezzo') {
    const targa = dopo.targa || prima.targa;
    const padr = dopo.ragioneSociale || prima.ragioneSociale;
    if (a === 'ASSEGNA') {
      return { tipo: 'Assegnazione', azione: 'Assegnato mezzo', dettaglio: `${targa ?? ''} → ${padr ?? ''}`.trim() };
    }
    if (a === 'CHIUDI' || a === 'CHIUDI_ASSEGNAZIONE' || a === 'DELETE') {
      return { tipo: 'Assegnazione', azione: 'Chiusa assegnazione mezzo', dettaglio: `${targa ?? ''} ${padr ? `→ ${padr}` : ''}`.trim() };
    }
  }

  if (t === 'assegnazione_palmare') {
    const codice = dopo.codice || prima.codice;
    const padr = dopo.ragioneSociale || prima.ragioneSociale;
    if (a === 'ASSEGNA') {
      return { tipo: 'Assegnazione', azione: 'Assegnato palmare', dettaglio: `${codice ?? ''} → ${padr ?? ''}`.trim() };
    }
    return { tipo: 'Assegnazione', azione: 'Aggiornata assegnazione palmare', dettaglio: codice ?? '' };
  }

  if (t === 'padroncino') {
    const rs = dopo.ragioneSociale || prima.ragioneSociale;
    if (a === 'ASSEGNA') {
      const tipo = dopo.tipo;
      const ref = dopo.targa || dopo.codice || '';
      return {
        tipo: 'Padroncino',
        azione: `Assegnato ${tipo ?? ''}`,
        dettaglio: [ref, rs].filter(Boolean).join(' → '),
      };
    }
    const verbo = a === 'CREATE' ? 'Creato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    return { tipo: 'Padroncino', azione: `${verbo} padroncino`, dettaglio: rs ?? log.entityId.slice(0, 8) };
  }

  if (t === 'palmare') {
    const codice = dopo.codice || prima.codice;
    const verbo = a === 'CREATE' ? 'Creato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    return { tipo: 'Palmare', azione: `${verbo} palmare`, dettaglio: codice ?? log.entityId.slice(0, 8) };
  }

  if (t === 'acconto') {
    const r = a === 'DELETE' ? prima : dopo;
    const importo = r.importo != null ? `${eurFmt(Number(r.importo))} €` : '';
    const mese = formatMese(r.mese);
    const cod = r.codiceAutista || r.codice || '';
    const verbo = a === 'CREATE' ? 'Inserito' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    return { tipo: 'Acconto', azione: `${verbo} acconto`, dettaglio: [cod, mese, importo].filter(Boolean).join(' · ') };
  }

  if (t === 'ricarica_elettrica') {
    const r = a === 'DELETE' ? prima : dopo;
    const importo = r.importo != null ? `${eurFmt(Number(r.importo))} €` : '';
    const mese = formatMese(r.mese);
    const verbo = a === 'CREATE' ? 'Inserita' : a === 'DELETE' ? 'Eliminata' : 'Aggiornata';
    return { tipo: 'Ricarica', azione: `${verbo} ricarica`, dettaglio: [mese, importo].filter(Boolean).join(' · ') };
  }

  if (t === 'documento') {
    const r = a === 'DELETE' ? prima : dopo;
    const tipo = (r.tipo || prima.tipo || '').toUpperCase();
    const nome = r.nome || prima.nome || '';
    const rs   = r.ragioneSociale || prima.ragioneSociale || '';
    const verbo = a === 'CREATE' ? 'Caricato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    const label = [tipo, nome].filter(Boolean).join(' — ');
    const dettaglio = [rs, label].filter(Boolean).join(' · ');
    return { tipo: 'Documento', azione: `${verbo} documento`, dettaglio: dettaglio || log.entityId.slice(0, 8) };
  }

  if (t === 'utente') {
    const nome = [dopo.nome, dopo.cognome].filter(Boolean).join(' ') || dopo.email || prima.email || '';
    if (a === 'LOGIN') {
      return { tipo: 'Utente', azione: 'Accesso effettuato', dettaglio: nome ? `${nome} ha effettuato l'accesso` : '' };
    }
    const verbo = a === 'CREATE' ? 'Creato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    return { tipo: 'Utente', azione: `${verbo} utente`, dettaglio: nome || log.entityId.slice(0, 8) };
  }

  if (t === 'codice_autista') {
    const c = dopo.codice || prima.codice;
    const rs = dopo.ragioneSociale || prima.ragioneSociale || '';
    const verbo = a === 'CREATE' ? 'Creato' : a === 'DELETE' ? 'Eliminato' : 'Aggiornato';
    const dettaglio = [rs, c].filter(Boolean).join(' · ');
    return { tipo: 'Codice', azione: `${verbo} codice autista`, dettaglio: dettaglio || log.entityId.slice(0, 8) };
  }

  const verboMap: Record<string, string> = {
    CREATE: 'Creato',
    UPDATE: 'Aggiornato',
    DELETE: 'Eliminato',
    ASSEGNA: 'Assegnato',
    CHIUDI: 'Chiuso',
  };
  return {
    tipo: tipoLabel,
    azione: `${verboMap[a] ?? a} ${tipoLabel.toLowerCase()}`,
    dettaglio:
      dopo.targa || dopo.ragioneSociale || dopo.codice || dopo.descrizione ||
      prima.targa || prima.ragioneSociale || prima.codice ||
      log.entityId.slice(0, 8),
  };
};

const getEntityUrl = (log: AuditLogEntry): string | null => {
  const t = log.entityType;
  const dopo: any = log.dataDopo || {};
  const prima: any = log.dataPrima || {};

  if (t === 'mezzo') return `/flotta/${log.entityId}`;
  if (t === 'padroncino') {
    const id = dopo.padroncinoId || prima.padroncinoId || log.entityId;
    return `/padroncini/${id}`;
  }
  if (t === 'palmare') return `/palmari/${log.entityId}`;
  if (t === 'codice_autista') return `/codici-autista/${log.entityId}`;
  if (t === 'conteggio_mensile') {
    if (log.azione === 'DELETE') return null;
    return `/conteggi/${log.entityId}`;
  }
  if (t === 'assegnazione_mezzo') {
    const mezzoId = dopo.mezzoId || prima.mezzoId;
    return mezzoId ? `/flotta/${mezzoId}` : null;
  }
  if (t === 'assegnazione_palmare') {
    const palmareId = dopo.palmareId || prima.palmareId;
    return palmareId ? `/palmari/${palmareId}` : null;
  }
  if (t === 'acconto') return '/acconti';
  if (t === 'ricarica_elettrica') return '/ricariche';
  return null;
};

interface ScadenzaRow {
  mezzoId: string;
  targa: string;
  tipo: string;
  data: string;
  giorni: number;
  gravita: 'danger' | 'warning' | 'info';
}

const SCAD_TABS = ['Noleggio', 'Revisione', 'Assicurazione'] as const;

const formatMeseLungo = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
};

const STATO_TONE: Record<string, Tone> = { BOZZA: 'na', CONFERMATO: 'ok', CHIUSO: 'info' };
const STATO_LABEL: Record<string, string> = { BOZZA: 'Bozza', CONFERMATO: 'Confermato', CHIUSO: 'Chiuso' };

/** Ultimi 12 mesi fino al mese attuale, per il selettore. */
const ultimiMesi = (n = 12): string[] => {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

// ─── Component ────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [meseKpi, setMeseKpi] = useState<string>(mesePrecedente);
  const [scadTab, setScadTab] = useState<typeof SCAD_TABS[number]>('Noleggio');

  const [mezziStats, setMezziStats] = useState<MezziStats | null>(null);
  const [padronciniStats, setPadronciniStats] = useState<PadronciniStats | null>(null);
  const [palmariStats, setPalmariStats] = useState<PalmariStats | null>(null);
  const [conteggiStats, setConteggiStats] = useState<ConteggiStats | null>(null);
  const [andamento, setAndamento] = useState<AndamentoMese[]>([]);
  const [topBonifici, setTopBonifici] = useState<TopDaBonificare[]>([]);
  const [scadenzeMezzi, setScadenzeMezzi] = useState<Mezzo[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [ricaricheTot, setRicaricheTot] = useState(0);
  const [accontiTot, setAccontiTot] = useState(0);
  const [competenzeAttive, setCompetenzeAttive] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMese, setLoadingMese] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatic = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mz, pd, pl, an, sc, au] = await Promise.all([
        mezziApi.stats(),
        padronciniApi.stats(),
        palmariApi.stats(),
        conteggiApi.andamento(12),
        mezziApi.scadenze(60),
        auditApi.list({ limit: 12 }),
      ]);
      setMezziStats(mz);
      setPadronciniStats(pd);
      setPalmariStats(pl);
      setAndamento(an);
      setScadenzeMezzi(sc);
      setActivity(au.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadMese = async (m: string) => {
    setLoadingMese(true);
    try {
      const [cs, tb, ric, acc, comp] = await Promise.all([
        conteggiApi.stats(m),
        conteggiApi.topDaBonificare(m, 5),
        ricaricheApi.riepilogo(m).catch(() => []),
        accontiApi.list(m).catch(() => []),
        conteggiApi.getCompetenzeAttive(m).catch(() => ({ mese: m, valore: null })),
      ]);
      setConteggiStats(cs);
      setTopBonifici(tb);
      setRicaricheTot(ric.reduce((s, r) => s + Number(r.totale || 0), 0));
      setAccontiTot(acc.reduce((s, a) => s + Number(a.importo || 0), 0));
      setCompetenzeAttive(comp.valore);
    } catch (err) {
      console.error('Errore caricamento dati mese:', err);
    } finally {
      setLoadingMese(false);
    }
  };

  useEffect(() => { loadStatic(); }, []);
  useEffect(() => { loadMese(meseKpi); }, [meseKpi]);

  const scadenzeRows = useMemo<ScadenzaRow[]>(() => {
    const rows: ScadenzaRow[] = [];
    for (const m of scadenzeMezzi) {
      const push = (label: string, iso?: string | null) => {
        if (!iso) return;
        const g = giorniDaOra(iso);
        if (g > 60 || g < -90) return;
        const gravita = g <= 7 ? 'danger' : g <= 30 ? 'warning' : 'info';
        rows.push({
          mezzoId: m.id,
          targa: m.targa,
          tipo: label,
          data: new Date(iso).toLocaleDateString('it-IT'),
          giorni: g,
          gravita,
        });
      };
      push('Noleggio', m.fineNoleggio);
      push('Revisione', m.scadenzaRevisione);
      push('Assicurazione', m.scadenzaAssicurazione);
    }
    return rows.sort((a, b) => a.giorni - b.giorni);
  }, [scadenzeMezzi]);

  const scadenzeFiltrate = useMemo(
    () => scadenzeRows.filter(s => s.tipo === scadTab).slice(0, 10),
    [scadenzeRows, scadTab],
  );

  const alerts = useMemo(() => {
    const out: Array<{ id: string; tone: Tone; color: string; icon: IconName; titolo: string; desc: string; to: string; cta: string }> = [];
    if (padronciniStats?.alertDocumenti) {
      out.push({ id: 'durc', tone: 'ko', color: C.red, icon: 'doc', titolo: `${padronciniStats.alertDocumenti} documenti padroncini in scadenza`, desc: 'DURC o DVR scaduti o in scadenza', to: '/padroncini', cta: 'Padroncini' });
    }
    if (mezziStats?.scadenzeImminenti) {
      out.push({ id: 'mezzi-scad', tone: 'warn', color: C.orange, icon: 'mezzi', titolo: `${mezziStats.scadenzeImminenti} mezzi con scadenze entro 30 giorni`, desc: 'Assicurazione, revisione, bollo o tachigrafo', to: '/flotta', cta: 'Flotta' });
    }
    if (conteggiStats && conteggiStats.bozza > 0) {
      out.push({ id: 'conteggi-bozza', tone: 'info', color: C.blue, icon: 'cont', titolo: `${conteggiStats.bozza} conteggi ancora in bozza`, desc: `${formatMeseLungo(meseKpi)}: non ancora chiusi`, to: '/conteggi', cta: 'Conteggi' });
    }
    if (palmariStats && palmariStats.disponibili > 0) {
      out.push({ id: 'palmari', tone: 'warn', color: C.purple, icon: 'palm', titolo: `${palmariStats.disponibili} palmari senza assegnazione`, desc: 'Disponibili da assegnare', to: '/palmari', cta: 'Palmari' });
    }
    return out;
  }, [padronciniStats, mezziStats, conteggiStats, palmariStats, meseKpi]);

  // Grafico: fatturato imponibile e netto (bonificato + da bonificare) per mese
  const chartData = useMemo(
    () => andamento.map(a => ({
      label: formatMeseShort(a.mese).replace(/ \d{2}$/, ''),
      total: Number(a.fatturato || 0),
      part: Number(a.bonifici || 0) + Number(a.daBonificare || 0),
      valueLabel: Number(a.fatturato) ? `${Math.round(Number(a.fatturato) / 1000)}k` : '—',
      tip: `${formatMeseLungo(a.mese)} · imponibile ${fmtEur(a.fatturato)} · netto ${fmtEur(Number(a.bonifici || 0) + Number(a.daBonificare || 0))}`,
      mese: a.mese,
    })),
    [andamento],
  );
  const selIdx = chartData.findIndex(d => d.mese === meseKpi);
  const prevMese = andamento[andamento.findIndex(a => a.mese === meseKpi) - 1];
  const deltaFatt = prevMese && Number(prevMese.fatturato) && conteggiStats
    ? ((conteggiStats.fatturato - Number(prevMese.fatturato)) / Number(prevMese.fatturato)) * 100
    : null;

  const netto = (conteggiStats?.bonifici ?? 0) + (conteggiStats?.daBonificare ?? 0);
  const kpis: KpiItem[] = [
    { label: 'Fatturato imponibile', value: fmtEur(conteggiStats?.fatturato ?? 0), color: C.green, icon: 'trend',
      delta: deltaFatt === null ? undefined : { text: `${deltaFatt >= 0 ? '+' : ''}${deltaFatt.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`, good: deltaFatt >= 0 },
      sub: 'IVA esclusa · distribuzione PDA' },
    { label: 'Da bonificare', value: fmtEur(conteggiStats?.daBonificare ?? 0), color: C.blue, icon: 'euro',
      sub: `Netto del mese ${fmtEur(netto)} · bonificati ${fmtEur(conteggiStats?.bonifici ?? 0)}` },
    { label: 'Addebiti', value: fmtEur(conteggiStats?.addebiti ?? 0), color: C.orange, icon: 'cont', sub: 'Noleggi, ricariche, palmari' },
    { label: 'Compensazioni', value: fmtEur(conteggiStats?.compensazioni ?? 0), color: C.purple, icon: 'swap', sub: 'Acconti, accrediti, bonus' },
  ];

  const top = useSort(topBonifici, (r, k: 'nome' | 'stato' | 'netto') => (k === 'nome' ? r.ragioneSociale : k === 'stato' ? STATO_LABEL[r.stato] : Number(r.daBonificare)), { key: 'netto', dir: 'desc' });

  if (loading && !mezziStats) {
    return <Page><Empty>Caricamento panoramica…</Empty></Page>;
  }

  const tot = conteggiStats?.totali ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title="Panoramica"
        sub={`Dati del mese di ${formatMeseLungo(meseKpi)}${loadingMese ? ' · aggiornamento…' : ''}`}
        actions={
          <label className="ds-select">
            <span>Mese</span>
            <select value={meseKpi} onChange={e => setMeseKpi(e.target.value)}>
              {ultimiMesi(13).map(m => <option key={m} value={m}>{formatMeseLungo(m)}</option>)}
            </select>
          </label>
        }
      />

      {error && <div className="ds-alert ds-alert-ko" role="alert">{error}</div>}

      <Kpis items={kpis} />

      <div className="ds-g4">
        <Card pad className="ds-s3">
          <CardHead title="Fatturato e netto" sub="Ultimi 12 mesi · clic su un mese per vederne i dati" />
          {chartData.length === 0 ? <Empty>Nessun dato</Empty> : (
            <BarStrip
              data={chartData}
              palette="blue"
              legend={['Fatturato imponibile', 'Netto (bonificato + da bonificare)']}
              selected={selIdx >= 0 ? selIdx : undefined}
              onSelect={i => setMeseKpi(chartData[i].mese)}
              ariaLabel="Fatturato imponibile e netto per mese, ultimi 12 mesi"
            />
          )}
        </Card>
        <Card pad>
          <CardHead title="Altri dati del mese" sub={formatMeseLungo(meseKpi)} />
          <div className="dash-kv">
            <span>Competenze attive</span><strong>{competenzeAttive != null ? fmtEur(competenzeAttive) : '—'}</strong>
            <span>Ricariche PDA</span><strong>{fmtEur(ricaricheTot)}</strong>
            <span>Acconti</span><strong>{fmtEur(accontiTot)}</strong>
          </div>
          <div className="dash-kv-sep" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 500 }}>Stato conteggi</span>
            <span className="ds-cardsub">{(conteggiStats?.confermato ?? 0) + (conteggiStats?.chiuso ?? 0)} di {tot} chiusi o confermati</span>
          </div>
          {tot > 0 ? (
            <>
              <SegBar parts={[
                { value: conteggiStats!.chiuso, color: C.blue },
                { value: conteggiStats!.confermato, color: C.green },
                { value: conteggiStats!.bozza, color: '#D4D4D8' },
              ]} />
              <div className="dash-legend">
                <Dot tone="info">Chiusi {conteggiStats!.chiuso}</Dot>
                <Dot tone="ok">Confermati {conteggiStats!.confermato}</Dot>
                <Dot tone="na">Bozze {conteggiStats!.bozza}</Dot>
              </div>
            </>
          ) : <span className="ds-cardsub">Nessun conteggio per il mese</span>}
        </Card>
      </div>

      <div className="ds-g4">
        <Card className="ds-s2">
          <CardHead bar title="Da gestire" sub={alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'avviso' : 'avvisi'}` : 'Nessun avviso'} />
          <div className="ds-list">
            {alerts.length === 0 && <Empty>Tutto in ordine.</Empty>}
            {alerts.map(a => (
              <div key={a.id} className="ds-listrow">
                <span aria-hidden="true" className="ds-tile ds-tile-md" style={{ background: a.color }}><Icon name={a.icon} size={12} stroke={2.4} /></span>
                <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: 500 }}>{a.titolo}</span>
                  <span className="ds-cardsub" style={{ fontSize: 12 }}>{a.desc}</span>
                </div>
                <Button size="sm" onClick={() => navigate(a.to)}>{a.cta} <Icon name="chevRight" size={12} /></Button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead bar title="Scadenze mezzi" sub="Prossimi 60 giorni" actions={<Link to="/flotta" className="dash-link">Tutte</Link>} />
          <div style={{ padding: '0 18px 8px' }}>
            <SegTabs items={SCAD_TABS.map(t => ({ value: t, label: t, count: scadenzeRows.filter(s => s.tipo === t).length }))} value={scadTab} onChange={setScadTab} />
          </div>
          <div className="ds-list dash-scroll">
            {scadenzeFiltrate.length === 0 && <Empty>Nessuna scadenza di tipo {scadTab.toLowerCase()}</Empty>}
            {scadenzeFiltrate.map((s, i) => (
              <button key={i} type="button" className="ds-listrow dash-rowbtn" onClick={() => navigate(`/flotta/${s.mezzoId}`)}>
                <span className="ds-mono" style={{ fontWeight: 600, fontSize: 12 }}>{s.targa}</span>
                <span className="ds-cardsub" style={{ flex: '1 1 auto', fontSize: 12 }}>{s.data}</span>
                <Dot tone={s.giorni < 0 || s.giorni <= 7 ? 'ko' : s.giorni <= 30 ? 'warn' : 'na'}>
                  {s.giorni < 0 ? `Scaduta da ${-s.giorni} gg` : `Tra ${s.giorni} gg`}
                </Dot>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead bar title="Attività recente" actions={<Link to="/log" className="dash-link">Storico</Link>} />
          <div className="ds-list dash-scroll">
            {activity.length === 0 && <Empty>Nessuna attività</Empty>}
            {activity.map(log => {
              const { azione, dettaglio } = auditLabel(log);
              const utente = log.user ? log.user.nome || log.user.email.split('@')[0] : 'system';
              const url = getEntityUrl(log);
              return (
                <div key={log.id} className={`ds-listrow dash-act${url ? ' is-link' : ''}`} onClick={url ? () => navigate(url) : undefined} title={url ? 'Vai al dettaglio' : undefined}>
                  <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontWeight: 500 }}>{azione}</span>
                    {dettaglio && <span className="dash-act-detail">{dettaglio}</span>}
                  </div>
                  <span className="dash-act-meta">{formatRelativeTime(log.createdAt)}<br />{utente}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="ds-g4">
        <Card className="ds-s3">
          <CardHead bar title="Padroncini da bonificare" sub={`I primi 5 di ${formatMeseLungo(meseKpi)}`} actions={<Link to="/conteggi" className="dash-link">Tutti i conteggi</Link>} />
          {topBonifici.length === 0 ? <Empty>Nessun importo da bonificare</Empty> : (
            <div className="ds-tablewrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <Th k="nome" sort={top.sort} onSort={top.toggle}>Padroncino</Th>
                    <Th k="stato" sort={top.sort} onSort={top.toggle}>Stato</Th>
                    <Th k="netto" sort={top.sort} onSort={top.toggle} right>Da bonificare</Th>
                  </tr>
                </thead>
                <tbody>
                  {top.sorted.map(t => (
                    <tr key={t.conteggioId} className="is-clickable" onClick={() => navigate(`/conteggi/${t.conteggioId}`)}>
                      <td style={{ fontWeight: 500 }}>{t.ragioneSociale}</td>
                      <td><Dot tone={STATO_TONE[t.stato] || 'na'}>{STATO_LABEL[t.stato] || t.stato}</Dot></td>
                      <td className="r" style={{ fontWeight: 600 }}>{fmtEur(t.daBonificare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card pad>
          <CardHead title="Flotta e risorse" />
          <div className="dash-kv">
            <span>Mezzi</span><strong>{mezziStats?.totali ?? 0} · {mezziStats?.assegnati ?? 0} assegnati</strong>
            <span>Entrate noleggio mensili</span><strong>{fmtEur(mezziStats?.entrateNoleggio ?? 0)}</strong>
            <span>Margine noleggio</span><strong style={{ color: (mezziStats?.margine ?? 0) >= 0 ? '#15803D' : '#B91C1C' }}>{fmtEur(mezziStats?.margine ?? 0)}</strong>
          </div>
          <div className="dash-kv-sep" />
          <div className="dash-kv">
            <span>Padroncini attivi</span><strong>{padronciniStats?.attivi ?? 0} di {padronciniStats?.totali ?? 0}</strong>
            <span>Flotta padroncini</span><strong>{padronciniStats?.flottaMezzi ?? 0} mezzi · {padronciniStats?.flottaDisponibili ?? 0} disp.</strong>
            <span>Palmari assegnati</span><strong>{palmariStats?.assegnati ?? 0} di {palmariStats?.totali ?? 0}</strong>
            <span>Palmari attivi (padroncini)</span><strong>{padronciniStats?.palmariAttivi ?? 0} di {padronciniStats?.palmariTotali ?? 0}</strong>
          </div>
        </Card>
      </div>
    </Page>
  );
}
