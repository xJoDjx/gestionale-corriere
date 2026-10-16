// TaskModal.tsx — Modal condiviso per creare/modificare una "Cosa da fare"
import { useState, useEffect } from 'react';
import { padronciniApi } from '../../lib/api';
import type { Padroncino, TaskItem } from '../../lib/api';
import './TaskModal.css';

export type TaskRefField = 'targa' | 'codiceAutista' | 'palmare';

export interface TaskModalSubmitData {
  testo: string;
  targa?: string;
  codiceAutista?: string;
  palmare?: string;
  padroncino?: string;
}

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: TaskModalSubmitData) => Promise<void> | void;
  saving?: boolean;
  /** Campo di riferimento specifico della pagina (targa / codiceAutista / palmare).
   *  Omesso se la pagina non ha un riferimento naturale oltre al padroncino
   *  (es. Conteggi) — in quel caso il select dedicato non viene mostrato. */
  fieldKey?: TaskRefField;
  fieldLabel?: string;
  /** Valori disponibili per il menu a tendina del campo di riferimento */
  refOptions?: string[];
  /** Se valorizzato, il modal si apre in modalità modifica precompilata */
  editingTask?: TaskItem | null;
}

export default function TaskModal({ open, onClose, onSubmit, saving, fieldKey, fieldLabel, refOptions, editingTask }: TaskModalProps) {
  const [testo, setTesto] = useState('');
  const [refValue, setRefValue] = useState('');
  const [padroncino, setPadroncino] = useState('');
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);

  useEffect(() => {
    if (!open) return;
    setTesto(editingTask?.testo ?? '');
    setRefValue((fieldKey ? (editingTask?.[fieldKey] as string | null) : null) ?? '');
    setPadroncino(editingTask?.padroncino ?? '');
  }, [open, editingTask, fieldKey]);

  useEffect(() => {
    if (!open) return;
    padronciniApi.list({ limit: '500' })
      .then(r => setPadroncini(r.data.filter(p => p.attivo !== false)))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!testo.trim()) return;
    const data: TaskModalSubmitData = { testo: testo.trim() };
    if (fieldKey) data[fieldKey] = refValue || undefined;
    data.padroncino = padroncino || undefined;
    await onSubmit(data);
  };

  return (
    <div className="taskm-overlay">
      <div className="taskm-modal" onClick={e => e.stopPropagation()}>
        <div className="taskm-header">
          <h3>✅ {editingTask ? 'Modifica attività' : 'Nuova attività'}</h3>
          <button className="taskm-close" onClick={onClose}>✕</button>
        </div>
        <div className="taskm-body">
          <div className="taskm-field">
            <label className="taskm-label">Testo *</label>
            <textarea
              className="taskm-textarea"
              rows={3}
              placeholder="Descrivi l'attività da svolgere..."
              value={testo}
              onChange={e => setTesto(e.target.value)}
              autoFocus
            />
          </div>
          <div className="taskm-row">
            {fieldKey && (
              <div className="taskm-field">
                <label className="taskm-label">{fieldLabel} (opzionale)</label>
                <select className="taskm-input" value={refValue} onChange={e => setRefValue(e.target.value)}>
                  <option value="">— nessuno —</option>
                  {(refOptions ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="taskm-field">
              <label className="taskm-label">Padroncino (opzionale)</label>
              <select className="taskm-input" value={padroncino} onChange={e => setPadroncino(e.target.value)}>
                <option value="">— nessuno —</option>
                {padroncini.map(p => <option key={p.id} value={p.ragioneSociale}>{p.ragioneSociale}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="taskm-footer">
          <button className="btn-outline" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!testo.trim() || saving}>
            {saving ? 'Salvo...' : editingTask ? 'Salva modifiche' : 'Salva attività'}
          </button>
        </div>
      </div>
    </div>
  );
}
