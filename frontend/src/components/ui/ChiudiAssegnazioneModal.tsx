// src/components/ui/ChiudiAssegnazioneModal.tsx
// Finestra per scegliere la data di chiusura di un'assegnazione (passata, odierna o futura).
import { useEffect, useState } from 'react';
import Modal from './Modal';

export interface ChiudiAssegnazioneTarget {
  id: string;
  /** Es. ragione sociale del padroncino */
  nome: string;
  /** Data inizio assegnazione (ISO): la chiusura non può essere precedente */
  dataInizio: string;
}

interface Props {
  target: ChiudiAssegnazioneTarget | null;
  onClose: () => void;
  /** dataFine in formato YYYY-MM-DD. Se lancia un errore viene mostrato nella finestra. */
  onConfirm: (target: ChiudiAssegnazioneTarget, dataFine: string) => Promise<void>;
  /** Cosa si sta chiudendo, es. "mezzo AB123CD" */
  oggetto?: string;
}

const oggi = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const toDay = (iso: string) => iso.slice(0, 10);

export default function ChiudiAssegnazioneModal({ target, onClose, onConfirm, oggetto }: Props) {
  const [dataFine, setDataFine] = useState(oggi());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) { setDataFine(oggi()); setError(null); setSaving(false); }
  }, [target]);

  if (!target) return null;

  const min = toDay(target.dataInizio);
  const invalida = !dataFine || dataFine < min;
  const futura = dataFine > oggi();

  const conferma = async () => {
    if (invalida) return;
    setSaving(true); setError(null);
    try {
      await onConfirm(target, dataFine);
    } catch (e: any) {
      setError(e?.message || 'Errore durante la chiusura');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title="Chiudi assegnazione"
      subtitle={`${oggetto ? oggetto + ' · ' : ''}${target.nome} · dal ${new Date(target.dataInizio).toLocaleDateString('it-IT')}`}
      width={420}
    >
      <div className="form-grid cols-1">
        <div className="form-field">
          <label className="form-label">Data di chiusura <span className="req">*</span></label>
          <input
            className="form-input"
            type="date"
            value={dataFine}
            min={min}
            onChange={(e) => setDataFine(e.target.value)}
            autoFocus
          />
          {dataFine && dataFine < min && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>
              La data non può essere precedente all'inizio dell'assegnazione.
            </span>
          )}
          {futura && !invalida && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Data futura: l'assegnazione risulterà chiusa dal {new Date(dataFine).toLocaleDateString('it-IT')}.
            </span>
          )}
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
      </div>
      <div className="form-actions">
        <button className="btn-outline" onClick={onClose} disabled={saving}>Annulla</button>
        <button className="btn-danger" onClick={conferma} disabled={saving || invalida}>
          {saving ? 'Chiusura...' : '🔓 Chiudi assegnazione'}
        </button>
      </div>
    </Modal>
  );
}
