// src/features/log/LogStorico.tsx
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { api } from '../../lib/api';
import {
  type AuditEntry, ENTITY_LABELS, AZIONE_COLORS, AZIONE_LABELS,
  getHumanReadableDescription, fmtDate,
} from '../../lib/auditFormat';
import './LogStorico.css';

interface LogResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function DiffViewer({ prima, dopo }: { prima: any; dopo: any }) {
  if (!prima && !dopo) return null;

  const skipDiff = new Set([
    'createdAt', 'updatedAt', 'deletedAt',
    'conteggioMensileId', 'padroncinoId', 'mezzoId', 'palmareId',
    'codiceAutistaId', 'userId', 'ordine', 'id',
    // Campi di relazione: compaiono/spariscono solo perché una delle due
    // versioni confrontate include la relazione e l'altra no (rumore, non
    // una modifica reale).
    'assegnazioni', 'acconti', 'kmAttualiAl', 'modificaManuale',
  ]);

  const keys = Array.from(new Set([
    ...Object.keys(prima ?? {}),
    ...Object.keys(dopo ?? {}),
  ])).filter((k) => !skipDiff.has(k));

  const changed = keys.filter((k) => {
    const v1 = JSON.stringify(prima?.[k]);
    const v2 = JSON.stringify(dopo?.[k]);
    return v1 !== v2;
  });

  if (changed.length === 0) return <span className="log-nodiff">Nessuna variazione rilevata</span>;

  const fmtVal = (v: any) => {
    if (v == null) return <em>—</em>;
    const s = String(v);
    // Date ISO
    if (s.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(s).toLocaleDateString('it-IT');
    return s;
  };

  return (
    <table className="log-diff-table">
      <thead>
        <tr><th>Campo</th><th>Prima</th><th>Dopo</th></tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k}>
            <td className="log-diff-key">{k}</td>
            <td className="log-diff-before">{fmtVal(prima?.[k])}</td>
            <td className="log-diff-after">{fmtVal(dopo?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const LIMIT = 50;

interface UtenteOption { id: string; nome: string; cognome: string; }

export default function LogStorico() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterAzione, setFilterAzione] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [utenti, setUtenti] = useState<UtenteOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<UtenteOption[]>('/users')
      .then(setUtenti)
      .catch(() => {});
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 350);
  };

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
      if (filterUserId) params.set('userId', filterUserId);
      if (search) params.set('search', search);

      const res = await api.get<LogResponse>(`/audit?${params}`);
      setEntries(res.data);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento log');
    } finally {
      setLoading(false);
    }
  }, [page, filterEntityType, filterAzione, filterUserId, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterEntityType, filterAzione, filterUserId]);

  return (
    <div className="log-page">
      <div className="log-header">
        <div>
          <h1>📋 Log Storico</h1>
          <span className="log-sub">{total} eventi registrati</span>
        </div>
      </div>

      {/* Toolbar: ricerca + filtri */}
      <div className="log-toolbar">
        <input
          className="log-search"
          type="search"
          placeholder="🔍 Cerca targa, padroncino, importo..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
        />

        <select
          className="log-select"
          value={filterEntityType}
          onChange={(e) => { setFilterEntityType(e.target.value); setPage(1); }}
        >
          <option value="">Tutte le entità</option>
          <option value="mezzo">Mezzi</option>
          <option value="padroncino">Padroncini</option>
          <option value="palmare">Palmari</option>
          <option value="codice_autista">Codici Autista</option>
          <option value="acconto">Acconti</option>
          <option value="documento">Documenti</option>
          <option value="conteggio_mensile">Conteggi Mensili</option>
          <option value="conteggio_riga">Righe Conteggio</option>
          <option value="assegnazione_mezzo">Assegnazioni Mezzo</option>
          <option value="assegnazione_palmare">Assegnazioni Palmare</option>
          <option value="assegnazione_codice_autista">Assegnazioni Autista</option>
          <option value="utente">Utenti (accessi)</option>
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
          <option value="GENERA_CONTRATTO">Contratto mezzo</option>
          <option value="GENERA_CONTRATTO_MEZZI">Contratto mezzi</option>
          <option value="GENERA_CONTRATTO_PALMARE">Contratto palmari</option>
          <option value="GENERA_CONTRATTO_CODICI">Contratto codici</option>
          <option value="LOGIN">Accesso</option>
        </select>

        <select
          className="log-select"
          value={filterUserId}
          onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
        >
          <option value="">Tutti gli utenti</option>
          {utenti.map((u) => (
            <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>
          ))}
        </select>

        {(filterEntityType || filterAzione || filterUserId || search) && (
          <button
            className="btn-outline btn-sm"
            onClick={() => {
              setFilterEntityType('');
              setFilterAzione('');
              setFilterUserId('');
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
          >
            ✕ Reset
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
                <th>DESCRIZIONE</th>
                <th className="log-col-expand"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr
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
                    <td className="log-desc" title={e.entityId}>
                      {getHumanReadableDescription(e)}
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
                </Fragment>
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
