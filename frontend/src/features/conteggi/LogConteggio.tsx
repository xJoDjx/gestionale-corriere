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

// Stile per tipo di azione (grafica del mockup: tile colorata + etichetta col pallino)
const AZIONE_META: Record<string, { tipo: string; tile: string; sc: string; sd: string; d: string }> = {
  CREATE:  { tipo: 'Aggiunta',     tile: '#15A06A', sc: '#15803D', sd: '#15A06A', d: 'M12 5v14M5 12h14' },
  UPDATE:  { tipo: 'Modifica',     tile: '#3D63F0', sc: '#1D4ED8', sd: '#3D63F0', d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' },
  DELETE:  { tipo: 'Eliminazione', tile: '#DC4446', sc: '#B91C1C', sd: '#E5484D', d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' },
  RESTORE: { tipo: 'Ripristino',   tile: '#0E9494', sc: '#0F766E', sd: '#0E9494', d: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' },
};
const AZIONE_DEFAULT = { tipo: 'Evento', tile: '#71717A', sc: '#52525B', sd: '#A1A1AA', d: 'M12 8v4l3 2' };

const dataBreve = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Righe del log del conteggio (creazione, cambio stato, righe aggiunte/modificate/eliminate).
 *  Rende solo le righe: il contenitore è la card "Note, attività e modifiche". */
export default function LogConteggio({ conteggioId, limit }: Props & { limit?: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tutti, setTutti] = useState(false);

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

  const msg = !conteggioId ? 'Salva il conteggio per iniziare a registrare le modifiche'
    : loading ? 'Caricamento…'
    : error ? error
    : entries.length === 0 ? 'Nessuna modifica registrata per questo conteggio' : '';
  if (msg) return <div className="dc2-ev-empty dc2-muted">{msg}</div>;

  const visibili = limit && !tutti ? entries.slice(0, limit) : entries;
  return (
    <>
      {visibili.map((e) => {
        const meta = AZIONE_META[e.azione] ?? AZIONE_DEFAULT;
        const desc = getHumanReadableDescription(e, { hideIdentifier: true, hideContext: true });
        return (
          <div key={e.id} className="dc2-ev">
            <span aria-hidden="true" className="dc2-tile" style={{ width: 26, height: 26, borderRadius: 7, background: meta.tile }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={meta.d} /></svg>
            </span>
            <span className="dc2-ev-data" title={fmtDate(e.createdAt)}>{dataBreve(e.createdAt)}</span>
            <span className="dc2-tag" style={{ color: meta.sc }}><span aria-hidden="true" className="dc2-dot" style={{ background: meta.sd }} />{meta.tipo}</span>
            <span className="dc2-ev-tit" title={desc}>{desc}</span>
            <span className="dc2-ev-txt">{e.user ? `${e.user.nome} ${e.user.cognome}` : 'Sistema'}</span>
          </div>
        );
      })}
      {limit && entries.length > limit && (
        <button type="button" className="dc2-more" onClick={() => setTutti(v => !v)}>
          {tutti ? 'Mostra meno' : `Mostra tutte le ${entries.length} modifiche`}
        </button>
      )}
    </>
  );
}
