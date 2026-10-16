// src/features/dashboard/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
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

// ─── Component ────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const meseAttuale = meseCorrente();
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
    const out: Array<{ id: string; tipo: 'danger' | 'warning' | 'info'; icona: string; titolo: string; desc: string; to: string; cta: string }> = [];
    if (padronciniStats?.alertDocumenti) {
      out.push({
        id: 'durc',
        tipo: 'danger',
        icona: '⚠️',
        titolo: `${padronciniStats.alertDocumenti} documenti padroncini in scadenza`,
        desc: 'DURC o DVR scaduti / in scadenza',
        to: '/padroncini',
        cta: 'Vedi padroncini',
      });
    }
    if (mezziStats?.scadenzeImminenti) {
      out.push({
        id: 'mezzi-scad',
        tipo: 'warning',
        icona: '🔧',
        titolo: `${mezziStats.scadenzeImminenti} mezzi con scadenze entro 30gg`,
        desc: 'Assicurazione, revisione, bollo o tachigrafo in scadenza',
        to: '/flotta',
        cta: 'Vedi flotta',
      });
    }
    if (conteggiStats && conteggiStats.bozza > 0) {
      out.push({
        id: 'conteggi-bozza',
        tipo: 'info',
        icona: '📋',
        titolo: `${conteggiStats.bozza} conteggi ancora in bozza`,
        desc: `${formatMeseShort(meseKpi)} — non ancora chiusi`,
        to: '/conteggi',
        cta: 'Vedi conteggi',
      });
    }
    if (palmariStats && palmariStats.disponibili > 0) {
      out.push({
        id: 'palmari',
        tipo: 'warning',
        icona: '📱',
        titolo: `${palmariStats.disponibili} palmari senza assegnazione`,
        desc: 'Disponibili da assegnare',
        to: '/palmari',
        cta: 'Vedi palmari',
      });
    }
    return out;
  }, [padronciniStats, mezziStats, conteggiStats, palmariStats, meseKpi]);

  const chartData = useMemo(
    () =>
      andamento.map((a) => ({
        ...a,
        meseLabel: formatMeseShort(a.mese),
      })),
    [andamento],
  );

  const giorniBadgeClass = (g: number) => (g <= 7 ? 'dash-badge-danger' : g <= 30 ? 'dash-badge-warning' : 'dash-badge-info');
  const statoBonBadgeClass = (stato: string) => `dash-stato-${stato.toLowerCase()}`;

  if (loading && !mezziStats) {
    return (
      <div className="dash-page">
        <div className="dash-loading">Caricamento dashboard…</div>
      </div>
    );
  }

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1>📊 Dashboard</h1>
          <span className="dash-date">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="dash-header-actions">
          <div className="dash-mese-picker">
            <span className="dash-mese-label">📅 Mese KPI</span>
            <input
              type="month"
              className="dash-mese-input"
              value={meseKpi}
              max={meseAttuale}
              onChange={(e) => e.target.value && setMeseKpi(e.target.value)}
            />
            {loadingMese && <span className="dash-mese-loading">↻</span>}
          </div>
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {/* KPI Operativi */}
      <div className="dash-kpi-section">
        <span className="dash-kpi-section-label">Operativo</span>
        <div className="dash-kpi-grid">
          <KpiCard variant="blue" label="Mezzi Totali" value={mezziStats?.totali ?? 0} sub={`${mezziStats?.assegnati ?? 0} assegnati · ${mezziStats?.disponibili ?? 0} disp.`} />
          <KpiCard variant="teal" label="Padroncini Attivi" value={padronciniStats?.attivi ?? 0} sub={`${padronciniStats?.totali ?? 0} totali`} />
          <KpiCard variant="cyan" label="Palmari Assegnati" value={`${palmariStats?.assegnati ?? 0}/${palmariStats?.totali ?? 0}`} sub={`${palmariStats?.disponibili ?? 0} disponibili`} />
          <KpiCard variant="purple" label={`Conteggi ${formatMeseShort(meseKpi)}`} value={`${(conteggiStats?.confermato ?? 0) + (conteggiStats?.chiuso ?? 0)}/${conteggiStats?.totali ?? 0}`} sub="chiusi+conf. / totali" />
          <KpiCard variant="orange" label="Scadenze Imminenti" value={mezziStats?.scadenzeImminenti ?? 0} sub="entro 30 giorni" />
          <KpiCard variant="red" label="Documenti Padroncini" value={padronciniStats?.alertDocumenti ?? 0} sub="DURC/DVR in scadenza" />
        </div>
      </div>

      {/* KPI Finanziari */}
      <div className="dash-kpi-section">
        <span className="dash-kpi-section-label">Finanziario · {formatMeseShort(meseKpi)}</span>
        <div className="dash-kpi-grid dash-kpi-grid-fin">
          <KpiCard variant="green" size="sm" label="Competenze Attive" value={competenzeAttive != null ? `${eur(competenzeAttive)} €` : '—'} sub="inserito in Conteggi" />
          <KpiCard variant="green" size="sm" label="Fatturato Distribuzione PDA" value={`${eur(conteggiStats?.fatturato ?? 0)} €`} sub="imponibile" />
          <KpiCard variant="blue" size="sm" label="Da Bonificare" value={`${eur(conteggiStats?.daBonificare ?? 0)} €`} sub={formatMeseShort(meseKpi)} />
          <KpiCard variant="orange" size="sm" label="Addebiti" value={`${eur(conteggiStats?.addebiti ?? 0)} €`} sub="Noleggi·Ricariche·Palmari" />
          <KpiCard variant="purple" size="sm" label="Compensazioni" value={`${eur(conteggiStats?.compensazioni ?? 0)} €`} sub="Acconti·Accrediti·Bonus" />
          <KpiCard variant="purple" size="sm" label="Ricariche PDA" value={`${eur(ricaricheTot)} €`} sub={formatMeseShort(meseKpi)} />
          <KpiCard variant="purple" size="sm" label="Acconti" value={`${eur(accontiTot)} €`} sub={formatMeseShort(meseKpi)} />
        </div>
      </div>

      {/* Chart andamento */}
      <div className="dash-card dash-chart-card">
        <div className="dash-card-header">
          <h3>📈 Andamento ultimi 12 mesi</h3>
          <div className="dash-chart-legend">
            <span style={{ color: '#16a34a' }}>■ Fatturato</span>
            <span style={{ color: '#ea580c' }}>■ Addebiti</span>
            <span style={{ color: '#7c3aed' }}>● Da bonificare</span>
          </div>
        </div>
        <div className="dash-chart-body">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="meseLabel" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--text-muted)"
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
              />
              <Tooltip
                formatter={(v: number) => `${eur(v)} €`}
                contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fatturato" name="Fatturato" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="addebiti" name="Addebiti" fill="#ea580c" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="daBonificare" name="Da bonificare" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dash-grid">
        {/* ─── Colonna sinistra ─────────────────────── */}
        <div className="dash-col">
          {/* Alert */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>⚠️ Problemi e avvisi</h3>
              <span className="dash-card-count">{alerts.length}</span>
            </div>
            <div className="dash-alerts">
              {alerts.length === 0 && <div className="dash-empty">Nessun avviso 🎉</div>}
              {alerts.map((a) => (
                <div key={a.id} className={`dash-alert dash-alert-${a.tipo}`}>
                  <span className="dash-alert-icon">{a.icona}</span>
                  <div className="dash-alert-body">
                    <span className="dash-alert-title">{a.titolo}</span>
                    <span className="dash-alert-desc">{a.desc}</span>
                  </div>
                  <button className="dash-alert-btn" onClick={() => navigate(a.to)}>{a.cta} →</button>
                </div>
              ))}
            </div>
          </div>

          {/* Scadenze mezzi */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>🔧 Prossime scadenze mezzi</h3>
              <Link to="/flotta" className="dash-card-link">Tutte →</Link>
            </div>
            <div className="dash-tabs-bar">
              {SCAD_TABS.map(tb => (
                <button key={tb} className={`dash-tab ${scadTab === tb ? 'dash-tab-active' : ''}`} onClick={() => setScadTab(tb)}>{tb}</button>
              ))}
            </div>
            {scadenzeFiltrate.length === 0 ? (
              <div className="dash-empty">Nessuna scadenza di tipo {scadTab} nei prossimi 60 giorni</div>
            ) : (
              <>
                <div className="dash-scad-row dash-scad-head">
                  <span>TARGA</span><span>TIPO</span><span>DATA</span><span style={{ textAlign: 'right' }}>GIORNI</span>
                </div>
                {scadenzeFiltrate.map((s, i) => (
                  <div key={i} className="dash-scad-row dash-scad-body" onClick={() => navigate(`/flotta/${s.mezzoId}`)}>
                    <span className="dash-mono">{s.targa}</span>
                    <span>{s.tipo}</span>
                    <span className="dash-muted">{s.data}</span>
                    <span style={{ textAlign: 'right' }}><span className={`dash-badge ${giorniBadgeClass(s.giorni)}`}>{s.giorni}gg</span></span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Top da bonificare */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>🏆 Top padroncini da bonificare</h3>
              <span className="dash-card-sub">{formatMeseShort(meseKpi)}</span>
            </div>
            {topBonifici.length === 0 ? (
              <div className="dash-empty">Nessun importo da bonificare</div>
            ) : (
              topBonifici.map((t) => (
                <div key={t.conteggioId} className="dash-top-row" onClick={() => navigate(`/conteggi/${t.conteggioId}`)}>
                  <span className="dash-top-name">{t.ragioneSociale}</span>
                  <span className={`dash-badge ${statoBonBadgeClass(t.stato)}`}>{t.stato}</span>
                  <span className="dash-top-amount">€ {eur(t.daBonificare)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Colonna destra ───────────────────────── */}
        <div className="dash-col">
          {/* Attività recente */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>🕓 Attività recente</h3>
              <Link to="/log" className="dash-card-link">Tutte →</Link>
            </div>
            <div className="dash-activity">
              {activity.length === 0 && <div className="dash-empty">Nessuna attività</div>}
              {activity.map((log) => {
                const { azione, dettaglio } = auditLabel(log);
                const utente = log.user ? log.user.nome || log.user.email.split('@')[0] : 'system';
                const url = getEntityUrl(log);
                return (
                  <div
                    key={log.id}
                    className={`dash-act-item${url ? ' dash-act-item--link' : ''}`}
                    onClick={url ? () => navigate(url) : undefined}
                    title={url ? 'Vai al dettaglio' : undefined}
                  >
                    <span className="dash-act-time">{formatRelativeTime(log.createdAt)}</span>
                    <span className="dash-act-action">{azione}</span>
                    {dettaglio && <span className="dash-act-detail">· {dettaglio}</span>}
                    <span className="dash-act-user">{utente}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stato conteggi */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>📋 Stato conteggi — {formatMeseShort(meseKpi)}</h3>
              <span className="dash-card-sub">{conteggiStats?.totali ?? 0} totali</span>
            </div>
            {conteggiStats && conteggiStats.totali > 0 ? (
              <div className="dash-conteggi-body">
                <div className="dash-conteggi-bar">
                  {conteggiStats.chiuso > 0 && <div className="dash-cb-segment dash-cb-chiuso" style={{ flex: conteggiStats.chiuso }} title={`Chiusi: ${conteggiStats.chiuso}`} />}
                  {conteggiStats.confermato > 0 && <div className="dash-cb-segment dash-cb-conf" style={{ flex: conteggiStats.confermato }} title={`Confermati: ${conteggiStats.confermato}`} />}
                  {conteggiStats.bozza > 0 && <div className="dash-cb-segment dash-cb-bozza" style={{ flex: conteggiStats.bozza }} title={`Bozze: ${conteggiStats.bozza}`} />}
                </div>
                <div className="dash-cb-legend">
                  <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-chiuso"></span>Chiusi ({conteggiStats.chiuso})</span>
                  <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-conf"></span>Confermati ({conteggiStats.confermato})</span>
                  <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-bozza"></span>Bozze ({conteggiStats.bozza})</span>
                </div>
              </div>
            ) : (
              <div className="dash-empty">Nessun conteggio per il mese</div>
            )}
          </div>

          {/* Riepilogo flotta */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>🚚 Riepilogo finanziario flotta</h3>
            </div>
            <div className="dash-fleet-summary">
              <div className="dash-fs-row">
                <span>Entrate noleggio mensili</span>
                <strong>€ {eur(mezziStats?.entrateNoleggio ?? 0)}</strong>
              </div>
              <div className="dash-fs-row">
                <span>Margine noleggio</span>
                <strong className={(mezziStats?.margine ?? 0) >= 0 ? 'dash-pos' : 'dash-neg'}>€ {eur(mezziStats?.margine ?? 0)}</strong>
              </div>
              <div className="dash-fs-row dash-fs-row-sep">
                <span>Flotta padroncini</span>
                <strong>{padronciniStats?.flottaMezzi ?? 0} mezzi · {padronciniStats?.flottaDisponibili ?? 0} disp.</strong>
              </div>
              <div className="dash-fs-row">
                <span>Palmari attivi</span>
                <strong>{padronciniStats?.palmariAttivi ?? 0} / {padronciniStats?.palmariTotali ?? 0}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, variant, size }: {
  label: string; value: string | number; sub?: string; variant: string; size?: 'sm';
}) {
  return (
    <div className={`dash-kpi dash-kpi-${variant}`}>
      <span className="dash-kpi-label">{label}</span>
      <span className={`dash-kpi-value ${size === 'sm' ? 'dash-kpi-value-sm' : ''}`}>{value}</span>
      {sub && <span className="dash-kpi-sub">{sub}</span>}
    </div>
  );
}
