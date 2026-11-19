// src/features/log/LogEntita.tsx
// Componente riutilizzabile: mostra il log audit di una singola entità
import { useState, useEffect, useCallback, Fragment } from 'react';
import { api } from '../../lib/api';
import { ENTITY_LABELS, AZIONE_LABELS, prettyField } from '../../lib/auditFormat';
import { SearchBox, Empty, Th, Icon, useSort, C } from '../../components/ds';
import './LogStorico2.css';

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  azione: string;
  createdAt: string;
  dataPrima: Record<string, any> | null;
  dataDopo: Record<string, any> | null;
  user: { nome: string; cognome: string } | null;
}

const SKIP_FIELDS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'id', 'userId']);

const MEZZO_FIELD_LABELS: Record<string, string> = {
  targa: 'Targa', marca: 'Marca', modello: 'Modello', tipo: 'Tipo',
  alimentazione: 'Alimentazione', stato: 'Stato', km: 'KM',
  fineNoleggio: 'Fine noleggio', costoNoleggio: 'Costo noleggio',
  scadenzaBollo: 'Scad. bollo', scadenzaRevisione: 'Scad. revisione',
  scadenzaAssicurazione: 'Scad. assicurazione', scadenzaTachigrafo: 'Scad. tachigrafo',
  note: 'Note',
};

function euro(v: any): string {
  const n = Number(v);
  return isNaN(n) ? String(v ?? '—') : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatMese(s?: string): string {
  if (!s) return '';
  const [y, m] = s.split('-');
  const mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  return `${mesi[parseInt(m) - 1] ?? m} ${y}`;
}

function changedFields(prima: any, dopo: any): string[] {
  if (!prima || !dopo) return [];
  return Object.keys({ ...prima, ...dopo }).filter(
    (k) => !SKIP_FIELDS.has(k) && JSON.stringify(prima[k]) !== JSON.stringify(dopo[k]),
  );
}

/**
 * Descrizione leggibile dell'evento, mostrata inline nella riga della tabella.
 * Replica la logica di LogStorico.tsx ma coprendo anche i tipi di assegnazione.
 */
function getDescription(entry: AuditEntry): string {
  const d = entry.dataDopo ?? entry.dataPrima;
  const prima = entry.dataPrima;
  const dopo = entry.dataDopo;
  const a = entry.azione;

  // ─── ASSEGNAZIONE MEZZO ──────────────────────────────
  if (entry.entityType === 'assegnazione_mezzo') {
    const targa = d?.targa ?? '';
    const padr  = d?.ragioneSociale ?? '';
    if (a === 'ASSEGNA') {
      return [targa, padr].filter(Boolean).join(' → ');
    }
    if (a === 'CHIUDI_ASSEGNAZIONE') {
      return `${targa}${padr ? ` (${padr})` : ''}`;
    }
    return [targa, padr].filter(Boolean).join(' · ');
  }

  // ─── ASSEGNAZIONE PALMARE ────────────────────────────
  if (entry.entityType === 'assegnazione_palmare') {
    const codice = d?.codicePalmare ?? d?.codice ?? '';
    const padr   = d?.ragioneSociale ?? '';
    if (a === 'ASSEGNA') return [codice, padr].filter(Boolean).join(' → ');
    return [codice, padr].filter(Boolean).join(' · ');
  }

  // ─── ASSEGNAZIONE CODICE AUTISTA ─────────────────────
  if (entry.entityType === 'assegnazione_codice_autista') {
    const codice = d?.codice ?? '';
    const padr   = d?.ragioneSociale ?? '';
    if (a === 'ASSEGNA') return [codice, padr].filter(Boolean).join(' → ');
    return [codice, padr].filter(Boolean).join(' · ');
  }

  // ─── MEZZO ───────────────────────────────────────────
  if (entry.entityType === 'mezzo') {
    const targa = dopo?.targa ?? prima?.targa ?? '';
    if (a === 'CREATE') {
      const marca = dopo?.marca ?? '';
      const modello = dopo?.modello ?? '';
      return [targa, marca, modello].filter(Boolean).join(' · ');
    }
    if (a === 'DELETE') return targa ? `Mezzo ${targa} eliminato` : '';
    if (a === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      if (changed.length === 0) return targa;
      const parts = changed.slice(0, 3).map((k) => {
        const label = MEZZO_FIELD_LABELS[k] ?? k;
        const vPrima = prima?.[k];
        const vDopo  = dopo?.[k];
        if (vPrima != null && vDopo != null) return `${label}: ${vPrima} → ${vDopo}`;
        if (vDopo != null) return `${label}: ${vDopo}`;
        return label;
      });
      return parts.join(' · ');
    }
    return targa;
  }

  // ─── PALMARE ─────────────────────────────────────────
  if (entry.entityType === 'palmare') {
    const codice = dopo?.codice ?? prima?.codice ?? '';
    if (a === 'CREATE') return `Palmare ${codice} aggiunto`;
    if (a === 'DELETE') return `Palmare ${codice} eliminato`;
    if (a === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      if (changed.length === 0) return codice;
      return changed.slice(0, 3).map((k) => {
        const vP = prima?.[k]; const vD = dopo?.[k];
        if (vP != null && vD != null) return `${k}: ${vP} → ${vD}`;
        return k;
      }).join(' · ');
    }
    return codice;
  }

  // ─── CODICE AUTISTA ──────────────────────────────────
  if (entry.entityType === 'codice_autista') {
    const codice = dopo?.codice ?? prima?.codice ?? '';
    const padr   = dopo?.ragioneSociale ?? prima?.ragioneSociale ?? '';
    if (a === 'CREATE') return [codice, padr].filter(Boolean).join(' · ') + ' — creato';
    if (a === 'DELETE') return [codice, padr].filter(Boolean).join(' · ') + ' — eliminato';
    if (a === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      if (changed.length === 0) return [padr, codice].filter(Boolean).join(' · ');
      return changed.slice(0, 3).map((k) => {
        const vP = prima?.[k]; const vD = dopo?.[k];
        if (vP != null && vD != null) return `${k}: ${vP} → ${vD}`;
        return k;
      }).join(' · ');
    }
    return [padr, codice].filter(Boolean).join(' · ');
  }

  // ─── PADRONCINO ──────────────────────────────────────
  if (entry.entityType === 'padroncino') {
    return dopo?.ragioneSociale ?? prima?.ragioneSociale ?? '';
  }

  // ─── DOCUMENTO ───────────────────────────────────────
  if (entry.entityType === 'documento') {
    const nome = d?.nome ?? '';
    const tipo = d?.tipo ?? '';
    return [tipo, nome].filter(Boolean).join(' — ');
  }

  // ─── ACCONTO ─────────────────────────────────────────
  if (entry.entityType === 'acconto') {
    const r = a === 'DELETE' ? prima : dopo;
    const cod     = r?.codiceAutista ?? r?.codice ?? '';
    const mese    = formatMese(r?.mese);
    const importo = r?.importo != null ? euro(r.importo) : '';
    return [cod, mese, importo].filter(Boolean).join(' · ');
  }

  // ─── CONTEGGIO MENSILE ───────────────────────────────
  if (entry.entityType === 'conteggio_mensile') {
    const r    = a === 'DELETE' ? prima : dopo;
    const padr = r?.padroncino ?? '';
    const mese = formatMese(r?.mese);
    return [padr, mese].filter(Boolean).join(' · ');
  }

  // fallback
  return d?.targa ?? d?.codice ?? d?.ragioneSociale ?? d?.nome ?? '';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtVal(v: any) {
  if (v == null) return <em>—</em>;
  if (typeof v === 'object') return JSON.stringify(v);
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return new Date(str).toLocaleDateString('it-IT');
  return str;
}

function changedKeys(prima: any, dopo: any): string[] {
  const keys = Array.from(new Set([...Object.keys(prima ?? {}), ...Object.keys(dopo ?? {})])).filter((k) => !SKIP_FIELDS.has(k));
  return keys.filter((k) => JSON.stringify(prima?.[k]) !== JSON.stringify(dopo?.[k]));
}

function DiffViewer({ prima, dopo }: { prima: any; dopo: any }) {
  if (!prima && !dopo) return null;
  const changed = changedKeys(prima, dopo);
  if (changed.length === 0) return <span className="ds-cardsub">Nessuna variazione registrata</span>;
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

const pulisci = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
const ENT = (t: string) => pulisci(ENTITY_LABELS[t] ?? t);
const AZ = (a: string) => pulisci(AZIONE_LABELS[a] ?? a.replace(/_/g, ' ').toLowerCase());
const AZ_COLOR: Record<string, string> = {
  UPDATE: C.blue, CREATE: C.green, DELETE: C.red, RESTORE: C.teal, ASSEGNA: C.purple, CHIUDI_ASSEGNAZIONE: C.yellow,
  GENERA_CONTRATTO: C.teal, GENERA_CONTRATTO_PALMARE: C.teal, GENERA_CONTRATTO_CODICI: C.teal, GENERA_CONTRATTO_MEZZI: C.teal, LOGIN: '#A1A1AA',
};

interface Props {
  entityType: string;
  entityId: string;
}

// Usa l'endpoint aggregato per entità che hanno assegnazioni correlate
const FULL_TYPES = new Set(['mezzo', 'palmare', 'codice_autista']);

function buildUrl(entityType: string, entityId: string): string {
  if (entityType === 'padroncino') return `/padroncini/${entityId}/log`;
  if (FULL_TYPES.has(entityType)) return `/audit/entity-full/${entityType}/${entityId}`;
  return `/audit/entity/${entityType}/${entityId}`;
}

// Per le entità che mostrano più tipi, mostra anche la colonna TIPO
const MULTI_TYPES = new Set(['padroncino', 'mezzo', 'palmare', 'codice_autista']);

export default function LogEntita({ entityType, entityId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cerca, setCerca] = useState('');

  const showTypeCol = MULTI_TYPES.has(entityType);

  const load = useCallback(() => {
    if (!entityId) return;
    setLoading(true);
    api.get<AuditEntry[]>(buildUrl(entityType, entityId))
      .then(setEntries)
      .catch(() => setError('Impossibile caricare il log'))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const utente = (e: AuditEntry) => (e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema');
  const q = cerca.trim().toLowerCase();
  const filtrati = q
    ? entries.filter((e) => [fmtDate(e.createdAt), utente(e), ENT(e.entityType), AZ(e.azione), getDescription(e)].join(' ').toLowerCase().includes(q))
    : entries;

  type K = 'd' | 'u' | 't' | 'a' | 'x' | 'n';
  const { sorted, sort, toggle } = useSort<AuditEntry, K>(filtrati, (e, k) => {
    switch (k) {
      case 'd': return e.createdAt;
      case 'u': return utente(e);
      case 't': return ENT(e.entityType);
      case 'a': return AZ(e.azione);
      case 'x': return getDescription(e);
      case 'n': return e.dataPrima && e.dataDopo ? changedKeys(e.dataPrima, e.dataDopo).length : 0;
    }
  }, { key: 'd', dir: 'desc' });

  if (loading) return <Empty>Caricamento modifiche…</Empty>;
  if (error) return <Empty>{error}</Empty>;
  if (entries.length === 0) return <Empty>Nessuna modifica registrata</Empty>;

  const colSpan = showTypeCol ? 7 : 6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SearchBox value={cerca} onChange={setCerca} placeholder="Cerca per data, utente, azione, dettaglio…" width={320} />
        <span className="ds-cardsub">{q ? `${filtrati.length} di ${entries.length}` : `${entries.length} eventi`}</span>
      </div>
      <div className="ds-tablewrap">
        <table className="ds-table lg2-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <Th k="d" sort={sort} onSort={toggle} style={{ width: 150 }}>Data e ora</Th>
              <Th k="u" sort={sort} onSort={toggle} style={{ width: 150 }}>Utente</Th>
              {showTypeCol && <Th k="t" sort={sort} onSort={toggle} style={{ width: 130 }}>Tipo</Th>}
              <Th k="a" sort={sort} onSort={toggle} style={{ width: 170 }}>Azione</Th>
              <Th k="x" sort={sort} onSort={toggle}>Dettaglio</Th>
              <Th k="n" sort={sort} onSort={toggle} style={{ width: 100 }}>Modifiche</Th>
              <Th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={colSpan} className="ds-cardsub" style={{ textAlign: 'center', padding: 18 }}>Nessun evento corrisponde alla ricerca</td></tr>
            )}
            {sorted.map((e) => {
              const desc = getDescription(e);
              const open = expanded === e.id;
              const n = e.dataPrima && e.dataDopo ? changedKeys(e.dataPrima, e.dataDopo).length : 0;
              return (
                <Fragment key={e.id}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setExpanded(open ? null : e.id)}>
                    <td style={{ color: '#3F3F46', whiteSpace: 'nowrap' }}>{fmtDate(e.createdAt)}</td>
                    <td className="lg2-ell" style={{ color: e.user ? undefined : '#6B6B73' }}>{utente(e)}</td>
                    {showTypeCol && <td className="lg2-ell">{ENT(e.entityType)}</td>}
                    <td><span className="lg2-az"><i style={{ background: AZ_COLOR[e.azione] ?? '#A1A1AA' }} />{AZ(e.azione)}</span></td>
                    <td className="lg2-ell" title={desc}>{desc || <span style={{ color: '#A1A1AA' }}>—</span>}</td>
                    <td style={{ color: n ? C.blue : '#A1A1AA' }}>{n ? `${n} ${n === 1 ? 'campo' : 'campi'}` : '—'}</td>
                    <td className="r"><Icon name={open ? 'chevUp' : 'chevDown'} size={14} /></td>
                  </tr>
                  {open && (
                    <tr className="lg2-detail">
                      <td colSpan={colSpan}>
                        <div className="lg2-detbody"><DiffViewer prima={e.dataPrima} dopo={e.dataDopo} /></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
