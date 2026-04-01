// src/features/log/LogStorico.tsx
import { useState, useEffect, useCallback } from 'react';
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
  user: { nome: string; cognome: string; email: string } | null;
}

interface LogResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ENTITY_LABELS: Record<string, string> = {
  mezzo: '🚚 Mezzo',
  padroncino: '👤 Padroncino',
  palmare: '📱 Palmare',
  codice_autista: '🏷️ Autista',
  codiceAutista: '🏷️ Autista',
  acconto: '💰 Acconto',
  assegnazione_mezzo: '🔗 Ass. Mezzo',
  assegnazione_palmare: '🔗 Ass. Palmare',
  assegnazione_codice_autista: '🔗 Ass. Autista',
};

const AZIONE_COLORS: Record<string, string> = {
  CREATE: 'log-action-create',
  UPDATE: 'log-action-update',
  DELETE: 'log-action-delete',
  ASSEGNA: 'log-action-assegna',
  CHIUDI_ASSEGNAZIONE: 'log-action-chiudi',
};

const AZIONE_LABELS: Record<string, string> = {
  CREATE: '+ Creazione',
  UPDATE: '✏️ Modifica',
  DELETE: '🗑 Eliminazione',
  ASSEGNA: '🔗 Assegnazione',
  CHIUDI_ASSEGNAZIONE: '🔓 Fine assegnazione',
};

/**
 * Ricava una descrizione leggibile dall'entità e dai suoi dati,
 * sostituendo il cuid grezzo nella colonna "Entità".
 */
function getEntityDescription(entry: AuditEntry): string {
  const d = entry.dataDopo ?? entry.dataPrima;

  switch (entry.entityType) {
    case 'assegnazione_mezzo':
      if (d?.targa && d?.ragioneSociale) return `${d.targa} → ${d.ragioneSociale}`;
      if (d?.targa) return `Mezzo ${d.targa}`;
      break;

    case 'assegnazione_palmare':
      if (d?.codicePalmare && d?.ragioneSociale) return `${d.codicePalmare} → ${d.ragioneSociale}`;
      if (d?.codicePalmare) return `Palmare ${d.codicePalmare}`;
      break;

    case 'assegnazione_codice_autista':
      if (d?.codiceAutista && d?.ragioneSociale) return `${d.codiceAutista} → ${d.ragioneSociale}`;
      if (d?.codiceAutista) return `Autista ${d.codiceAutista}`;
      break;

    case 'mezzo':
      if (d?.targa) return `Targa ${d.targa}`;
      if (d?.marca && d?.modello) return `${d.marca} ${d.modello}`;
      break;

    case 'padroncino':
      if (d?.ragioneSociale) return d.ragioneSociale;
      break;

    case 'palmare':
      if (d?.codice) return `Palmare ${d.codice}`;
      break;

    case 'codice_autista':
    case 'codiceAutista':
      if (d?.codice) return `Autista ${d.codice}`;
      if (d?.nome || d?.cognome) return [d?.nome, d?.cognome].filter(Boolean).join(' ');
      break;

    case 'acconto':
      if (d?.codiceAutista) return `${d.codiceAutista}${d?.padroncinoCollegato ? ` (${d.padroncinoCollegato})` : ''}`;
      break;
  }

  // Fallback: ultimi 8 chars del cuid
  return `#${entry.entityId.slice(-8)}`;
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
  ])).filter((k) => !['createdAt', 'updatedAt', 'deletedAt'].includes(k));

  const changed = keys.filter((k) => {
    const v1 = JSON.stringify(prima?.[k]);
    const v2 = JSON.stringify(dopo?.[k]);
    return v1 !== v2;
  });

  if (changed.length === 0) return <span className="log-nodiff">Nessuna variazione rilevata</span>;

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

const LIMIT = 50;

export default function LogStorico() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filtri
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterAzione, setFilterAzione] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (filterEntityType) params.set('entityType', filterEntityType);
      if (filterAzione) params.set('azione', filterAzione);

      const res = await api.get<LogResponse>(`/audit?${params}`);
      setEntries(res.data);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento log');
    } finally {
      setLoading(false);
    }
  }, [page, filterEntityType, filterAzione]);

  useEffect(() => { load(); }, [load]);

  // Reset pagina quando cambiano i filtri
  useEffect(() => { setPage(1); }, [filterEntityType, filterAzione]);

  return (
    <div className="log-page">
      <div className="log-header">
        <div>
          <h1>📋 Log Storico</h1>
          <span className="log-sub">{total} eventi registrati</span>
        </div>
      </div>

      {/* Filtri */}
      <div className="log-filters">
        <select
          className="log-filter-select"
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
        >
          <option value="">Tutte le entità</option>
          <option value="mezzo">Mezzi</option>
          <option value="padroncino">Padroncini</option>
          <option value="palmare">Palmari</option>
          <option value="codice_autista">Codici Autista</option>
          <option value="acconto">Acconti</option>
          <option value="assegnazione_mezzo">Assegnazioni Mezzo</option>
          <option value="assegnazione_palmare">Assegnazioni Palmare</option>
          <option value="assegnazione_codice_autista">Assegnazioni Autista</option>
        </select>

        <select
          className="log-filter-select"
          value={filterAzione}
          onChange={(e) => setFilterAzione(e.target.value)}
        >
          <option value="">Tutte le azioni</option>
          <option value="CREATE">Creazione</option>
          <option value="UPDATE">Modifica</option>
          <option value="DELETE">Eliminazione</option>
          <option value="ASSEGNA">Assegnazione</option>
          <option value="CHIUDI_ASSEGNAZIONE">Fine assegnazione</option>
        </select>

        {(filterEntityType || filterAzione) && (
          <button className="btn-outline btn-sm" onClick={() => { setFilterEntityType(''); setFilterAzione(''); }}>
            ✕ Reset filtri
          </button>
        )}
      </div>

      {/* Tabella */}
      <div className="log-table-wrap">
        {loading ? (
          <div className="log-loading"><div className="log-spinner" />Caricamento...</div>
        ) : error ? (
          <div className="log-empty">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
        ) : entries.length === 0 ? (
          <div className="log-empty">📜 Nessun evento trovato</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>DATA / ORA</th>
                <th>UTENTE</th>
                <th>TIPO</th>
                <th>AZIONE</th>
                <th>DETTAGLIO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <>
                  <tr
                    key={e.id}
                    className={`log-row ${expanded === e.id ? 'log-row-expanded' : ''}`}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <td className="log-date">{fmtDate(e.createdAt)}</td>
                    <td className="log-user">
                      {e.user ? `${e.user.nome} ${e.user.cognome}` : <em className="log-system">Sistema</em>}
                    </td>
                    <td>
                      <span className="log-entity-badge">
                        {ENTITY_LABELS[e.entityType] ?? e.entityType}
                      </span>
                    </td>
                    <td>
                      <span className={`log-action-badge ${AZIONE_COLORS[e.azione] ?? ''}`}>
                        {AZIONE_LABELS[e.azione] ?? e.azione}
                      </span>
                    </td>
                    {/* ← Colonna leggibile al posto dell'entityId grezzo */}
                    <td className="log-entity-desc" title={e.entityId}>
                      {getEntityDescription(e)}
                    </td>
                    <td className="log-expand-btn">{expanded === e.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={`${e.id}-detail`} className="log-detail-row">
                      <td colSpan={6}>
                        <div className="log-detail-body">
                          <div className="log-detail-id">
                            <span className="log-detail-label">ID Entità:</span>
                            <code>{e.entityId}</code>
                          </div>
                          <DiffViewer prima={e.dataPrima} dopo={e.dataDopo} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginazione */}
      <div className="log-pagination">
        <button
          className="btn-outline btn-sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >← Prec</button>
        <span className="log-page-info">Pagina {page} di {Math.ceil(total / LIMIT) || 1}</span>
        <button
          className="btn-outline btn-sm"
          disabled={page >= Math.ceil(total / LIMIT)}
          onClick={() => setPage((p) => p + 1)}
        >Succ →</button>
      </div>
    </div>
  );
}
