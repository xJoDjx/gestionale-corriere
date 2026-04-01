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
  codiceAutista: '🏷️ Autista',
  acconto: '💰 Acconto',
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

export default function LogStorico() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // filtri
  const [filterType, setFilterType]   = useState('');
  const [filterAzione, setFilterAzione] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filterType)   params.set('entityType', filterType);
      if (filterAzione) params.set('azione', filterAzione);
      const res = await api.get<LogResponse>(`/audit?${params}`);
      setEntries(res.data);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterAzione]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterSearch
    ? entries.filter((e) =>
        e.entityType.includes(filterSearch.toLowerCase()) ||
        e.entityId.toLowerCase().includes(filterSearch.toLowerCase()) ||
        (e.user?.nome + ' ' + e.user?.cognome).toLowerCase().includes(filterSearch.toLowerCase()),
      )
    : entries;

  return (
    <div className="log-page">
      <div className="log-header">
        <h1>Log Storico</h1>
        <span className="log-total">{total} eventi totali</span>
      </div>

      {/* Filtri */}
      <div className="log-toolbar">
        <input
          className="log-search"
          placeholder="🔍 Cerca per entità, ID, utente..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <select
          className="log-select"
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
        >
          <option value="">Tutti i tipi</option>
          <option value="mezzo">Mezzi</option>
          <option value="padroncino">Padroncini</option>
          <option value="palmare">Palmari</option>
          <option value="codiceAutista">Autisti</option>
          <option value="acconto">Acconti</option>
        </select>
        <select
          className="log-select"
          value={filterAzione}
          onChange={(e) => { setFilterAzione(e.target.value); setPage(1); }}
        >
          <option value="">Tutte le azioni</option>
          <option value="CREATE">Creazione</option>
          <option value="UPDATE">Modifica</option>
          <option value="DELETE">Eliminazione</option>
          <option value="ASSEGNA">Assegnazione</option>
          <option value="CHIUDI_ASSEGNAZIONE">Fine assegnazione</option>
        </select>
        <button className="btn-outline btn-sm" onClick={() => { setPage(1); load(); }}>
          🔄 Aggiorna
        </button>
      </div>

      {/* Tabella */}
      <div className="log-table-wrap">
        {loading ? (
          <div className="log-loading"><div className="log-spinner" />Caricamento...</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>DATA / ORA</th>
                <th>UTENTE</th>
                <th>TIPO</th>
                <th>AZIONE</th>
                <th>ENTITÀ ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="log-empty">Nessun evento trovato</td></tr>
              )}
              {filtered.map((e) => (
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
                    <td className="log-entity-id">{e.entityId.slice(-8)}</td>
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
