// src/features/log/LogEntita.tsx
// Componente riutilizzabile: mostra il log audit di una singola entità
import { useState, useEffect, useCallback, Fragment } from 'react';
import { api } from '../../lib/api';
import './LogStorico.css';

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

const AZIONE_COLORS: Record<string, string> = {
  CREATE:               'log-action-create',
  UPDATE:               'log-action-update',
  DELETE:               'log-action-delete',
  ASSEGNA:              'log-action-assegna',
  CHIUDI_ASSEGNAZIONE:  'log-action-chiudi',
  GENERA_CONTRATTO:     'log-action-contratto',
};

const AZIONE_LABELS: Record<string, string> = {
  CREATE:               '+ Creazione',
  UPDATE:               '✏️ Modifica',
  DELETE:               '🗑 Eliminazione',
  ASSEGNA:              '🔗 Assegnazione',
  CHIUDI_ASSEGNAZIONE:  '🔓 Fine assegnazione',
  GENERA_CONTRATTO:     '📄 Contratto generato',
};

const ENTITY_LABELS: Record<string, string> = {
  mezzo:                       '🚛 Mezzo',
  padroncino:                  '👤 Padroncino',
  palmare:                     '📱 Palmare',
  codice_autista:              '🏷️ Autista',
  acconto:                     '💰 Acconto',
  documento:                   '📄 Documento',
  assegnazione_mezzo:          '🔗 Ass. Mezzo',
  assegnazione_palmare:        '🔗 Ass. Palmare',
  assegnazione_codice_autista: '🔗 Ass. Autista',
};

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

function DiffViewer({ prima, dopo }: { prima: any; dopo: any }) {
  if (!prima && !dopo) return null;
  const keys = Array.from(new Set([
    ...Object.keys(prima ?? {}),
    ...Object.keys(dopo ?? {}),
  ])).filter((k) => !SKIP_FIELDS.has(k));

  const changed = keys.filter((k) => JSON.stringify(prima?.[k]) !== JSON.stringify(dopo?.[k]));

  if (changed.length === 0) return <span className="log-nodiff">Nessuna variazione registrata</span>;

  return (
    <table className="log-diff-table">
      <thead>
        <tr><th>Campo</th><th>Prima</th><th>Dopo</th></tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k}>
            <td className="log-diff-key">{k}</td>
            <td className="log-diff-before">{prima?.[k] != null ? String(prima[k]) : <em>—</em>}</td>
            <td className="log-diff-after">{dopo?.[k] != null ? String(dopo[k]) : <em>—</em>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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

  if (loading) return (
    <div className="log-loading"><div className="log-spinner" />Caricamento log...</div>
  );
  if (error) return <div className="log-empty">⚠️ {error}</div>;
  if (entries.length === 0) return (
    <div className="log-empty">📜 Nessun evento registrato per questa entità</div>
  );

  const colSpan = showTypeCol ? 5 : 4;

  return (
    <div className="log-table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th>DATA / ORA</th>
            <th>UTENTE</th>
            {showTypeCol && <th>TIPO</th>}
            <th>AZIONE</th>
            <th>DETTAGLIO</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const desc = getDescription(e);
            return (
              <Fragment key={e.id}>
                <tr
                  className={`log-row ${expanded === e.id ? 'log-row-expanded' : ''}`}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <td className="log-date">{fmtDate(e.createdAt)}</td>
                  <td className="log-user">
                    {e.user
                      ? `${e.user.nome} ${e.user.cognome}`
                      : <em className="log-system">Sistema</em>}
                  </td>
                  {showTypeCol && (
                    <td>
                      <span className="log-entity-badge">
                        {ENTITY_LABELS[e.entityType] ?? e.entityType}
                      </span>
                    </td>
                  )}
                  <td>
                    <span className={`log-action-badge ${AZIONE_COLORS[e.azione] ?? ''}`}>
                      {AZIONE_LABELS[e.azione] ?? e.azione}
                    </span>
                  </td>
                  <td className="log-entity-desc">
                    {desc || <em style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</em>}
                  </td>
                  <td className="log-expand-btn">{expanded === e.id ? '▲' : '▼'}</td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-d`} className="log-detail-row">
                    <td colSpan={colSpan + 1}>
                      <div className="log-detail-body">
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
  );
}
