// BulkAssignModal.tsx — Modal condiviso per assegnazione/rimozione bulk a padroncino
import { useState, useEffect, useCallback } from 'react';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import './BulkAssignModal.css';

export interface BulkAssignModalProps {
  open: boolean;
  onClose: () => void;
  /** Numero di entità selezionate */
  selectedCount: number;
  /** Etichetta entità (es. "mezzi", "palmari", "codici autisti") */
  entityLabel: string;
  /** true se almeno una delle entità selezionate ha un'assegnazione attiva */
  hasActiveAssignments: boolean;
  /** Chiamata per assegnare le entità selezionate a un padroncino */
  onAssegna: (padroncinoId: string, dataInizio: string) => Promise<{ ok: number; errors: string[] }>;
  /** Chiamata per rimuovere le assegnazioni attive delle entità selezionate */
  onRimuovi: () => Promise<{ ok: number; errors: string[] }>;
}

type Tab = 'assegna' | 'rimuovi';
type Phase = 'form' | 'loading' | 'result';

export default function BulkAssignModal({
  open,
  onClose,
  selectedCount,
  entityLabel,
  hasActiveAssignments,
  onAssegna,
  onRimuovi,
}: BulkAssignModalProps) {
  const [tab, setTab] = useState<Tab>('assegna');
  const [phase, setPhase] = useState<Phase>('form');
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);

  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loadingPadroncini, setLoadingPadroncini] = useState(false);
  const [padroncinoId, setPadroncinoId] = useState('');
  const [padroncinoSearch, setPadroncinoSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dataInizio, setDataInizio] = useState(() => new Date().toISOString().slice(0, 10));

  // Carica padroncini al mount
  useEffect(() => {
    if (!open) return;
    setLoadingPadroncini(true);
    padronciniApi.list({ limit: '500' })
      .then((r) => setPadroncini(r.data.filter((p) => p.attivo !== false)))
      .catch(() => {})
      .finally(() => setLoadingPadroncini(false));
  }, [open]);

  // Reset state all'apertura
  useEffect(() => {
    if (open) {
      setPhase('form');
      setResult(null);
      setPadroncinoId('');
      setPadroncinoSearch('');
      setShowDropdown(false);
      setTab(hasActiveAssignments ? 'rimuovi' : 'assegna');
      setDataInizio(new Date().toISOString().slice(0, 10));
    }
  }, [open, hasActiveAssignments]);

  const selectedPadroncino = padroncini.find((p) => p.id === padroncinoId);
  const filteredPadroncini = padroncini.filter((p) =>
    p.ragioneSociale.toLowerCase().includes(padroncinoSearch.toLowerCase())
  );

  const handleSelectPadroncino = (p: Padroncino) => {
    setPadroncinoId(p.id);
    setPadroncinoSearch(p.ragioneSociale);
    setShowDropdown(false);
  };

  const handleAssegna = useCallback(async () => {
    if (!padroncinoId || !dataInizio) return;
    setPhase('loading');
    const res = await onAssegna(padroncinoId, dataInizio);
    setResult(res);
    setPhase('result');
  }, [padroncinoId, dataInizio, onAssegna]);

  const handleRimuovi = useCallback(async () => {
    setPhase('loading');
    const res = await onRimuovi();
    setResult(res);
    setPhase('result');
  }, [onRimuovi]);

  if (!open) return null;

  return (
    <div className="bulk-overlay">
      <div className="bulk-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bulk-header">
          <div className="bulk-title">
            <span className="bulk-title-icon">⚡</span>
            <div>
              <h3>Azione massiva</h3>
              <p className="bulk-subtitle">
                {selectedCount} {entityLabel} selezionat{selectedCount === 1 ? 'o' : 'i'}
              </p>
            </div>
          </div>
          <button className="bulk-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        {phase === 'form' && (
          <div className="bulk-tabs">
            <button
              className={`bulk-tab ${tab === 'assegna' ? 'bulk-tab-active' : ''}`}
              onClick={() => setTab('assegna')}
            >
              🔗 Assegna a padroncino
            </button>
            <button
              className={`bulk-tab ${tab === 'rimuovi' ? 'bulk-tab-active bulk-tab-danger' : ''}`}
              onClick={() => setTab('rimuovi')}
              disabled={!hasActiveAssignments}
              title={!hasActiveAssignments ? 'Nessuna assegnazione attiva tra le entità selezionate' : ''}
            >
              ✂️ Rimuovi assegnazione
            </button>
          </div>
        )}

        {/* Body */}
        <div className="bulk-body">
          {phase === 'form' && tab === 'assegna' && (
            <div className="bulk-form">
              <div className="bulk-field">
                <label className="bulk-label">Padroncino *</label>
                <div className="bulk-autocomplete">
                  <input
                    className="bulk-input"
                    placeholder="Cerca padroncino..."
                    value={padroncinoSearch}
                    onChange={(e) => {
                      setPadroncinoSearch(e.target.value);
                      setPadroncinoId('');
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    disabled={loadingPadroncini}
                  />
                  {showDropdown && filteredPadroncini.length > 0 && (
                    <div className="bulk-dropdown">
                      {filteredPadroncini.slice(0, 30).map((p) => (
                        <div
                          key={p.id}
                          className="bulk-dropdown-item"
                          onMouseDown={() => handleSelectPadroncino(p)}
                        >
                          <span className="bulk-dropdown-rs">{p.ragioneSociale}</span>
                          {p.partitaIva && <span className="bulk-dropdown-piva">{p.partitaIva}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPadroncino && (
                  <div className="bulk-selected-badge">
                    ✅ {selectedPadroncino.ragioneSociale}
                  </div>
                )}
              </div>

              <div className="bulk-field">
                <label className="bulk-label">Data inizio *</label>
                <input
                  className="bulk-input"
                  type="date"
                  value={dataInizio}
                  onChange={(e) => setDataInizio(e.target.value)}
                />
              </div>

              <div className="bulk-info-box">
                ℹ️ L'assegnazione sarà applicata a tutti i {selectedCount} {entityLabel} selezionati.
                Se un'entità ha già un'assegnazione attiva, verrà automaticamente chiusa.
              </div>
            </div>
          )}

          {phase === 'form' && tab === 'rimuovi' && (
            <div className="bulk-form">
              <div className="bulk-warning-box">
                ⚠️ Stai per rimuovere l'assegnazione attiva da {selectedCount} {entityLabel}.
                Le entità senza assegnazione attiva verranno ignorate.
              </div>
              <p className="bulk-rimuovi-note">
                Le assegnazioni verranno chiuse con data odierna ({new Date().toLocaleDateString('it-IT')}).
              </p>
            </div>
          )}

          {phase === 'loading' && (
            <div className="bulk-loading">
              <div className="bulk-spinner" />
              <p>Operazione in corso su {selectedCount} {entityLabel}...</p>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="bulk-result">
              <div className={`bulk-result-icon ${result.errors.length === 0 ? 'bulk-result-ok' : 'bulk-result-partial'}`}>
                {result.errors.length === 0 ? '✅' : '⚠️'}
              </div>
              <p className="bulk-result-title">
                {result.errors.length === 0 ? 'Completato!' : 'Completato con avvisi'}
              </p>
              <div className="bulk-result-stats">
                <div className="bulk-result-stat bulk-result-stat-ok">
                  <span className="bulk-result-val">{result.ok}</span>
                  <span className="bulk-result-lbl">Operazioni riuscite</span>
                </div>
                {result.errors.length > 0 && (
                  <div className="bulk-result-stat bulk-result-stat-err">
                    <span className="bulk-result-val">{result.errors.length}</span>
                    <span className="bulk-result-lbl">Errori</span>
                  </div>
                )}
              </div>
              {result.errors.length > 0 && (
                <details className="bulk-result-errors">
                  <summary>Dettaglio errori ({result.errors.length})</summary>
                  <ul>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bulk-footer">
          {phase === 'form' && tab === 'assegna' && (
            <>
              <button className="btn-outline" onClick={onClose}>Annulla</button>
              <button
                className="btn-primary"
                onClick={handleAssegna}
                disabled={!padroncinoId || !dataInizio}
              >
                🔗 Assegna {selectedCount} {entityLabel}
              </button>
            </>
          )}
          {phase === 'form' && tab === 'rimuovi' && (
            <>
              <button className="btn-outline" onClick={onClose}>Annulla</button>
              <button className="btn-danger" onClick={handleRimuovi}>
                ✂️ Rimuovi assegnazione
              </button>
            </>
          )}
          {phase === 'loading' && (
            <button className="btn-outline" disabled>Attendere...</button>
          )}
          {phase === 'result' && (
            <button className="btn-primary" onClick={onClose}>Chiudi</button>
          )}
        </div>
      </div>
    </div>
  );
}
