// src/features/padroncini/AssegnaModal.tsx
// Modal riutilizzabile per assegnare Mezzo, Palmare o Codice Autista a un padroncino

import { useState } from 'react';
import Modal from '../../components/ui/Modal';

// ─── Tipi ──────────────────────────────────
type AssegnaType = 'mezzo' | 'palmare' | 'codice';

interface AssegnaItem {
  id: string;
  label: string;
  sublabel?: string;
  alreadyAssigned?: boolean;
  assignedTo?: string;
}

interface Props {
  open: boolean;
  type: AssegnaType;
  padroncinoNome: string;
  items: AssegnaItem[];
  onClose: () => void;
  onAssegna: (itemId: string, dataInizio: string) => void;
}

const LABELS: Record<AssegnaType, { title: string; icon: string; desc: string }> = {
  mezzo:   { title: 'Assegna Mezzo',         icon: '🚛', desc: 'Seleziona il veicolo da assegnare' },
  palmare: { title: 'Assegna Palmare',        icon: '📱', desc: 'Seleziona il terminale da assegnare' },
  codice:  { title: 'Assegna Codice Autista', icon: '🏷️', desc: 'Seleziona il codice da collegare' },
};

export default function AssegnaModal({ open, type, padroncinoNome, items, onClose, onAssegna }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dataInizio, setDataInizio] = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  const meta = LABELS[type];

  const filtered = items.filter((i) => {
    const s = search.toLowerCase();
    return i.label.toLowerCase().includes(s) || i.sublabel?.toLowerCase().includes(s);
  });

  const handleConfirm = () => {
    if (!selected) return;
    onAssegna(selected, dataInizio);
    setSelected(null);
    setSearch('');
    onClose();
  };

  const handleClose = () => {
    setSelected(null);
    setSearch('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={meta.title}
      subtitle={`${meta.desc} → ${padroncinoNome}`}
      width={560}
    >
      {/* Ricerca */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <input
          className="form-input"
          placeholder="🔍 Cerca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      <div className="assign-list">
        {filtered.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Nessun elemento trovato
          </div>
        )}
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`assign-item ${selected === item.id ? 'selected' : ''}`}
            onClick={() => !item.alreadyAssigned && setSelected(item.id)}
            style={{ opacity: item.alreadyAssigned && selected !== item.id ? 0.5 : 1 }}
          >
            <span className="assign-item-code">{meta.icon}</span>
            <div className="assign-item-info">
              <div className="assign-item-name">{item.label}</div>
              {item.sublabel && <div className="assign-item-sub">{item.sublabel}</div>}
            </div>
            {item.alreadyAssigned && (
              <span className="assign-badge-assigned">
                {item.assignedTo ? `→ ${item.assignedTo}` : 'Assegnato'}
              </span>
            )}
            {selected === item.id && (
              <span style={{ color: 'var(--primary)', fontSize: '16px' }}>✓</span>
            )}
          </div>
        ))}
      </div>

      {/* Data inizio assegnazione */}
      {selected && (
        <div className="assign-date-field">
          <div className="form-field">
            <label className="form-label">Data inizio assegnazione</label>
            <input
              className="form-input"
              type="date"
              value={dataInizio}
              onChange={(e) => setDataInizio(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!selected}
          style={{ opacity: !selected ? 0.5 : 1, cursor: !selected ? 'not-allowed' : 'pointer' }}
        >
          ✅ Conferma Assegnazione
        </button>
      </div>
    </Modal>
  );
}
