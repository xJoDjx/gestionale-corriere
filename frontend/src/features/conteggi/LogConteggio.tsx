// src/features/conteggi/LogConteggio.tsx
// Blocco "Log Conteggio": mostra in ordine cronologico le operazioni fatte
// su questo conteggio mensile (creazione, cambio stato, righe aggiunte/
// modificate/eliminate — es. addebito fattura inserito, importo noleggio
// modificato, ecc). Riusa l'endpoint aggregato /audit/entity-full già usato
// per mezzi/palmari/codici autista, esteso in audit.service.ts a coprire
// anche conteggio_riga.
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { type AuditEntry, getHumanReadableDescription, fmtDate } from '../../lib/auditFormat';

interface Props {
  conteggioId: string | null;
}

// Stile per tipo di azione: icona + classe colore del bordo/sfondo
const AZIONE_META: Record<string, { icon: string; cls: string }> = {
  CREATE:  { icon: '➕', cls: 'dc-log-azione-create' },
  UPDATE:  { icon: '✏️', cls: 'dc-log-azione-update' },
  DELETE:  { icon: '🗑️', cls: 'dc-log-azione-delete' },
  RESTORE: { icon: '♻️', cls: 'dc-log-azione-restore' },
};
const AZIONE_DEFAULT = { icon: '•', cls: 'dc-log-azione-altro' };

// Tempo relativo compatto (2m, 3h, Ieri, 5gg, 12/08) — coerente con il
// widget "Attività recente" della Dashboard.
function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Ieri';
  if (days < 7) return `${days}gg fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

export default function LogConteggio({ conteggioId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!conteggioId) { setEntries([]); return; }
    setLoading(true);
    setError('');
    api.get<AuditEntry[]>(`/audit/entity-full/conteggio_mensile/${conteggioId}`)
      .then(setEntries)
      .catch(() => setError('Impossibile caricare il log'))
      .finally(() => setLoading(false));
  }, [conteggioId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="dc-log-conteggio">
      <div className="dc-log-conteggio-head">
        <span>📜 Log Conteggio</span>
        {conteggioId && entries.length > 0 && (
          <span className="dc-log-conteggio-count">{entries.length}</span>
        )}
      </div>
      <div className="dc-log-conteggio-body">
        {!conteggioId && (
          <div className="dc-log-conteggio-empty">Salva il conteggio per iniziare a registrare il log</div>
        )}
        {conteggioId && loading && (
          <div className="dc-log-conteggio-empty">Caricamento…</div>
        )}
        {conteggioId && !loading && error && (
          <div className="dc-log-conteggio-empty">⚠️ {error}</div>
        )}
        {conteggioId && !loading && !error && entries.length === 0 && (
          <div className="dc-log-conteggio-empty">Nessun evento registrato per questo conteggio</div>
        )}
        {conteggioId && !loading && !error && entries.map((e) => {
          const meta = AZIONE_META[e.azione] ?? AZIONE_DEFAULT;
          const desc = getHumanReadableDescription(e, { hideIdentifier: true, hideContext: true });
          return (
            <div key={e.id} className={`dc-log-conteggio-item ${meta.cls}`}>
              <span className="dc-log-conteggio-icon">{meta.icon}</span>
              <div className="dc-log-conteggio-main">
                <span className="dc-log-conteggio-desc">{desc}</span>
                <span className="dc-log-conteggio-meta">
                  <span>{e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema'}</span>
                  <span className="dc-log-conteggio-dot">·</span>
                  <span title={fmtDate(e.createdAt)}>{relativeTime(e.createdAt)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
