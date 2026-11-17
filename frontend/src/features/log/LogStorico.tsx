// src/features/log/LogStorico.tsx
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import {
  type AuditEntry, ENTITY_LABELS, AZIONE_LABELS,
  getHumanReadableDescription, fmtDate, prettyField,
} from '../../lib/auditFormat';
import './LogStorico.css';
import './LogStorico2.css';
import { Page, PageHeader, Card, Kpis, Button, SearchBox, Select, Empty, Alert, Icon, Th, useSort, C, fmtNum } from '../../components/ds';

interface LogResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SKIP_DIFF = new Set([
    'createdAt', 'updatedAt', 'deletedAt',
    'conteggioMensileId', 'padroncinoId', 'mezzoId', 'palmareId',
    'codiceAutistaId', 'userId', 'ordine', 'id',
    // Campi di relazione: compaiono/spariscono solo perché una delle due
    // versioni confrontate include la relazione e l'altra no (rumore, non
    // una modifica reale).
    'assegnazioni', 'acconti', 'kmAttualiAl', 'modificaManuale',
  ]);

export function contaModifiche(prima: any, dopo: any): number {
  if (!prima || !dopo) return 0;
  return Array.from(new Set([...Object.keys(prima), ...Object.keys(dopo)])).filter((k) => !SKIP_DIFF.has(k) && JSON.stringify(prima[k]) !== JSON.stringify(dopo[k])).length;
}

function DiffViewer({ prima, dopo }: { prima: any; dopo: any }) {
  if (!prima && !dopo) return null;

  const skipDiff = SKIP_DIFF;


  const keys = Array.from(new Set([
    ...Object.keys(prima ?? {}),
    ...Object.keys(dopo ?? {}),
  ])).filter((k) => !skipDiff.has(k));

  const changed = keys.filter((k) => {
    const v1 = JSON.stringify(prima?.[k]);
    const v2 = JSON.stringify(dopo?.[k]);
    return v1 !== v2;
  });

  if (changed.length === 0) return <span className="ds-cardsub">Nessuna variazione rilevata</span>;

  const fmtVal = (v: any) => {
    if (v == null) return <em>—</em>;
    const s = String(v);
    // Date ISO
    if (s.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(s).toLocaleDateString('it-IT');
    return s;
  };

  return (
    <div className="lg2-diff">
      {changed.map((k) => (
        <div key={k} className="lg2-diffrow">
          <span className="lg2-dk" title={k}>{prettyField(k)}</span>
          <span className="lg2-db">{fmtVal(prima?.[k])}</span>
          <Icon name="chevRight" size={12} />
          <span className="lg2-da">{fmtVal(dopo?.[k])}</span>
        </div>
      ))}
    </div>
  );
}

const LIMIT = 20;

interface UtenteOption { id: string; nome: string; cognome: string; }
interface AuditStats {
  totale: number; meseCorrente: number; mesePrecedente: number; ultimi30Giorni: number; primoEvento: string | null;
  perTipo: Record<string, number>; perAzione: Record<string, number>;
  perUtente: { userId: string | null; nome: string; count: number }[];
}

const pulisci = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
const ENT = (t: string) => pulisci(ENTITY_LABELS[t] ?? t);
const AZ_LABEL = (a: string) => pulisci(AZIONE_LABELS[a] ?? a);
const AZ_COLOR: Record<string, string> = {
  UPDATE: C.blue, CREATE: C.green, DELETE: C.red, RESTORE: C.teal, ASSEGNA: C.purple, CHIUDI_ASSEGNAZIONE: C.yellow,
  GENERA_CONTRATTO: C.teal, GENERA_CONTRATTO_PALMARE: C.teal, GENERA_CONTRATTO_CODICI: C.teal, GENERA_CONTRATTO_MEZZI: C.teal, LOGIN: '#A1A1AA',
};
const TIPI = ['conteggio_riga', 'conteggio_mensile', 'mezzo', 'acconto', 'codice_autista', 'utente', 'padroncino', 'assegnazione_mezzo', 'assegnazione_palmare', 'assegnazione_codice_autista', 'documento', 'palmare', 'statistica_cod', 'competenze_attive_mese'];
const AZIONI = ['UPDATE', 'CREATE', 'DELETE', 'ASSEGNA', 'CHIUDI_ASSEGNAZIONE', 'GENERA_CONTRATTO', 'GENERA_CONTRATTO_MEZZI', 'GENERA_CONTRATTO_PALMARE', 'GENERA_CONTRATTO_CODICI', 'LOGIN', 'RESTORE'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function periodoRange(p: string): { dal?: string; al?: string } {
  const now = new Date();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (p === 'oggi') return { dal: day(now).toISOString() };
  if (p === '7g') return { dal: new Date(day(now).getTime() - 6 * 86400000).toISOString() };
  if (p === '30g') return { dal: new Date(now.getTime() - 30 * 86400000).toISOString() };
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (m) { const y = +m[1], mo = +m[2] - 1; return { dal: new Date(y, mo, 1).toISOString(), al: new Date(y, mo + 1, 1).toISOString() }; }
  return {};
}

export default function LogStorico() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [exporting, setExporting] = useState(false);

  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterAzione, setFilterAzione] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [utenti, setUtenti] = useState<UtenteOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<UtenteOption[]>('/users').then(setUtenti).catch(() => {});
    api.get<AuditStats>('/audit/stats').then(setStats).catch(() => {});
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(value); setPage(1); }, 350);
  };

  const buildParams = useCallback((pg: number, lim: number) => {
    const params = new URLSearchParams({ page: String(pg), limit: String(lim) });
    if (filterEntityType) params.set('entityType', filterEntityType);
    if (filterAzione) params.set('azione', filterAzione);
    if (filterUserId) params.set('userId', filterUserId);
    if (search) params.set('search', search);
    const r = periodoRange(periodo);
    if (r.dal) params.set('dal', r.dal);
    if (r.al) params.set('al', r.al);
    return params;
  }, [filterEntityType, filterAzione, filterUserId, search, periodo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<LogResponse>(`/audit?${buildParams(page, LIMIT)}`);
      setEntries(res.data);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento log');
    } finally {
      setLoading(false);
    }
  }, [page, buildParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterEntityType, filterAzione, filterUserId, periodo]);

  const esporta = async () => {
    setExporting(true);
    try {
      const res = await api.get<LogResponse>(`/audit?${buildParams(1, 10000)}`);
      const rows = res.data.map((e) => ({
        'Data e ora': fmtDate(e.createdAt),
        'Utente': e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema',
        'Azione': AZ_LABEL(e.azione), 'Tipo': ENT(e.entityType),
        'Descrizione': getHumanReadableDescription(e), 'ID entità': e.entityId,
        'Campi modificati': contaModifiche(e.dataPrima, e.dataDopo),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Storico');
      XLSX.writeFile(wb, `storico_modifiche_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) { setError(e.message ?? 'Errore esportazione'); }
    finally { setExporting(false); }
  };

  type K = 'd' | 'u' | 'a' | 't' | 'x' | 'n';
  const { sorted, sort, toggle } = useSort<AuditEntry, K>(entries, (e, k) => {
    if (k === 'd') return e.createdAt;
    if (k === 'u') return e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema';
    if (k === 'a') return AZ_LABEL(e.azione);
    if (k === 't') return ENT(e.entityType);
    if (k === 'x') return getHumanReadableDescription(e);
    return contaModifiche(e.dataPrima, e.dataDopo);
  }, { key: 'd', dir: 'desc' });

  const totPages = Math.ceil(total / LIMIT) || 1;
  const pagine = (() => {
    const set = new Set([1, totPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totPages));
    if (page <= 3) [2, 3].forEach((p) => p <= totPages && set.add(p));
    return [...set].sort((a, b) => a - b);
  })();

  // KPI dal riepilogo
  const pa = stats?.perAzione ?? {};
  const contratti = Object.entries(pa).filter(([k]) => k.startsWith('GENERA_CONTRATTO')).reduce((s, [, v]) => s + v, 0);
  const now = new Date();
  const meseNome = MESI[now.getMonth()];
  const mesePrecNome = MESI[(now.getMonth() + 11) % 12];
  const top = stats?.perUtente[0];
  const topPct = stats && top && stats.totale ? Math.round(top.count / stats.totale * 100) : 0;
  const PAL = [C.orange, '#A1A1AA', C.blue, C.purple, C.teal];
  const filtriAttivi = !!(filterEntityType || filterAzione || filterUserId || search || periodo);

  const mesiPeriodo = [0, 1, 2].map((i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MESI[d.getMonth()][0].toUpperCase()}${MESI[d.getMonth()].slice(1)} ${d.getFullYear()}` }; });

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Storico modifiche"
        sub="Ogni creazione, modifica ed eliminazione con il valore prima e dopo"
        actions={<Button icon="download" onClick={esporta} disabled={exporting || total === 0}>{exporting ? 'Esportazione…' : 'Esporta'}</Button>}
      />

      {stats && (
        <Kpis items={[
          { label: `Eventi a ${meseNome}`, value: fmtNum(stats.meseCorrente, 0), color: C.blue, icon: 'clock',
            sub: `${fmtNum(stats.mesePrecedente, 0)} a ${mesePrecNome} · ${fmtNum(stats.totale, 0)}${stats.primoEvento ? ` dal ${new Date(stats.primoEvento).toLocaleDateString('it-IT')}` : ''}` },
          { label: 'Modifiche', value: fmtNum(pa.UPDATE ?? 0, 0), color: C.purple, icon: 'edit',
            sub: `${fmtNum(pa.CREATE ?? 0, 0)} creazioni · ${fmtNum(pa.DELETE ?? 0, 0)} eliminazioni · ${fmtNum(pa.RESTORE ?? 0, 0)} ripristin${(pa.RESTORE ?? 0) === 1 ? 'o' : 'i'}` },
          { label: 'Assegnazioni', value: fmtNum((pa.ASSEGNA ?? 0) + (pa.CHIUDI_ASSEGNAZIONE ?? 0), 0), color: C.teal, icon: 'swap',
            sub: `${fmtNum(pa.ASSEGNA ?? 0, 0)} nuove · ${fmtNum(pa.CHIUDI_ASSEGNAZIONE ?? 0, 0)} chiuse${contratti ? ` · ${contratti} contratti` : ''}` },
          { label: `Attribuiti a ${top?.nome ?? '—'}`, value: `${topPct}%`, color: C.orange, icon: 'user', subColor: topPct > 60 ? '#C2410C' : undefined,
            sub: `${fmtNum(top?.count ?? 0, 0)} eventi${topPct > 60 ? ': account condiviso, chi ha fatto cosa non si distingue' : ''}`,
            seg: stats.perUtente.slice(0, 5).map((u, i) => ({ w: stats.totale ? u.count / stats.totale * 100 : 0, color: PAL[i] })) },
        ]} />
      )}

      <Card>
        <div className="lg2-tools">
          <SearchBox value={searchInput} onChange={handleSearchChange} placeholder="Cerca targa, codice, padroncino, valore…" width={300} />
          <Select size="sm" label="Tipo" value={filterEntityType} onChange={setFilterEntityType}
            options={[{ value: '', label: `Tutti${stats ? ` (${fmtNum(stats.totale, 0)})` : ''}` },
              ...TIPI.filter((t) => !stats || stats.perTipo[t]).sort((a, b) => (stats?.perTipo[b] ?? 0) - (stats?.perTipo[a] ?? 0))
                .map((t) => ({ value: t, label: `${ENT(t)}${stats?.perTipo[t] ? ` (${fmtNum(stats.perTipo[t], 0)})` : ''}` }))]} />
          <Select size="sm" label="Azione" value={filterAzione} onChange={setFilterAzione}
            options={[{ value: '', label: 'Tutte' }, ...AZIONI.map((a) => ({ value: a, label: AZ_LABEL(a) }))]} />
          <Select size="sm" label="Utente" value={filterUserId} onChange={setFilterUserId}
            options={[{ value: '', label: 'Tutti' }, ...utenti.map((u) => ({ value: u.id, label: `${u.nome} ${u.cognome}` }))]} />
          <Select size="sm" label="Periodo" value={periodo} onChange={setPeriodo}
            options={[{ value: '', label: 'Tutto' }, { value: '30g', label: 'Ultimi 30 giorni' }, { value: 'oggi', label: 'Oggi' }, { value: '7g', label: 'Ultimi 7 giorni' }, ...mesiPeriodo]} />
          {filtriAttivi && (
            <Button size="sm" icon="close" onClick={() => { setFilterEntityType(''); setFilterAzione(''); setFilterUserId(''); setPeriodo(''); setSearchInput(''); setSearch(''); setPage(1); }}>Azzera filtri</Button>
          )}
        </div>

        {error && <div style={{ padding: '0 18px 12px' }}><Alert tone="ko" title="Errore" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></div>}

        {loading ? <Empty>Caricamento…</Empty> : entries.length === 0 ? <Empty>Nessun evento trovato</Empty> : (
          <div className="ds-tablewrap">
            <table className="ds-table lg2-table">
              <colgroup><col style={{ width: 150 }} /><col style={{ width: '17%' }} /><col style={{ width: 160 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 44 }} /></colgroup>
              <thead>
                <tr>
                  <Th k="d" sort={sort} onSort={toggle}>Data e ora</Th>
                  <Th k="u" sort={sort} onSort={toggle}>Utente</Th>
                  <Th k="a" sort={sort} onSort={toggle}>Azione</Th>
                  <Th k="t" sort={sort} onSort={toggle}>Tipo</Th>
                  <Th k="x" sort={sort} onSort={toggle}>Elemento</Th>
                  <Th k="n" sort={sort} onSort={toggle}>Modifiche</Th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const n = contaModifiche(e.dataPrima, e.dataDopo);
                  const open = expanded === e.id;
                  const utente = e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema';
                  return (
                    <Fragment key={e.id}>
                      <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setExpanded(open ? null : e.id)}>
                        <td style={{ color: '#3F3F46', whiteSpace: 'nowrap' }}>{fmtDate(e.createdAt)}</td>
                        <td className="lg2-ell" style={{ color: utente === top?.nome ? '#6B6B73' : undefined }}>{utente}</td>
                        <td><span className="lg2-az"><i style={{ background: AZ_COLOR[e.azione] ?? "#A1A1AA" }} />{AZ_LABEL(e.azione)}</span></td>
                        <td className="lg2-ell">{ENT(e.entityType)}</td>
                        <td className="lg2-ell" title={`${getHumanReadableDescription(e)} · ID ${e.entityId}`}>{getHumanReadableDescription(e)}</td>
                        <td style={{ color: n ? C.blue : '#A1A1AA' }}>{n ? `${n} ${n === 1 ? 'campo' : 'campi'}` : '—'}</td>
                        <td className="r"><Icon name={open ? 'chevUp' : 'chevDown'} size={14} /></td>
                      </tr>
                      {open && (
                        <tr className="lg2-detail">
                          <td colSpan={7}>
                            <div className="lg2-detbody">
                              <span className="ds-cardsub">ID entità <code>{e.entityId}</code></span>
                              <DiffViewer prima={e.dataPrima} dopo={e.dataDopo} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="lg2-foot">
          <span>Eventi {total ? `${fmtNum((page - 1) * LIMIT + 1, 0)}–${fmtNum(Math.min(page * LIMIT, total), 0)}` : '0'} di {fmtNum(total, 0)}{stats ? ` · ultimi 30 giorni: ${fmtNum(stats.ultimi30Giorni, 0)}` : ''}</span>
          <nav aria-label="Pagine" className="lg2-pag">
            <button type="button" aria-label="Pagina precedente" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            {pagine.map((p, i) => (
              <Fragment key={p}>
                {i > 0 && p - pagine[i - 1] > 1 && <span>…</span>}
                <button type="button" aria-current={p === page ? 'page' : undefined} className={p === page ? 'is-on' : ''} onClick={() => setPage(p)}>{fmtNum(p, 0)}</button>
              </Fragment>
            ))}
            <button type="button" aria-label="Pagina successiva" disabled={page >= totPages} onClick={() => setPage((p) => p + 1)}>›</button>
          </nav>
        </div>
      </Card>
    </Page>
  );
}
