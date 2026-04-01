// src/features/log/LogEntita.tsx
// Componente riutilizzabile: mostra il log audit di una singola entità
import { useState, useEffect } from 'react';
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
  ])).filter((k) => !['createdAt', 'updatedAt', 'deletedAt', 'id'].includes(k));

  const changed = keys.filter((k) => JSON.stringify(prima?.[k]) !== JSON.stringify(dopo?.[k]));

  if (changed.length === 0) return <span className="log-nodiff">Snapshot senza variazioni</span>;

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

export default function LogEntita({ entityType, entityId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entityId) return;
    setLoading(true);
    api.get<AuditEntry[]>(`/audit/entity/${entityType}/${entityId}`)
      .then(setEntries)
      .catch(() => setError('Impossibile caricare il log'))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return (
    <div className="log-loading"><div className="log-spinner" />Caricamento log...</div>
  );
  if (error) return <div className="log-empty">⚠️ {error}</div>;
  if (entries.length === 0) return (
    <div className="log-empty">📜 Nessun evento registrato per questa entità</div>
  );

  return (
    <div className="log-table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th>DATA / ORA</th>
            <th>UTENTE</th>
            <th>AZIONE</th>
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
                  {e.user
                    ? `${e.user.nome} ${e.user.cognome}`
                    : <em className="log-system">Sistema</em>}
                </td>
                <td>
                  <span className={`log-action-badge ${AZIONE_COLORS[e.azione] ?? ''}`}>
                    {AZIONE_LABELS[e.azione] ?? e.azione}
                  </span>
                </td>
                <td className="log-expand-btn">{expanded === e.id ? '▲' : '▼'}</td>
              </tr>
              {expanded === e.id && (
                <tr key={`${e.id}-d`} className="log-detail-row">
                  <td colSpan={4}>
                    <div className="log-detail-body">
                      <DiffViewer prima={e.dataPrima} dopo={e.dataDopo} />
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
