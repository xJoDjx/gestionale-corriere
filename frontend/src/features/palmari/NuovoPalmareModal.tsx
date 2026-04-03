// src/features/palmari/NuovoPalmareModal.tsx
import { useState } from 'react';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: NuovoPalmare) => void;
}

export interface NuovoPalmare {
  codice: string;
  seriale: string;
  modello: string;
  tariffa: string;
  sim: string;
  note: string;
}

const EMPTY: NuovoPalmare = {
  codice: '', seriale: '', modello: '', tariffa: '35', sim: '', note: '',
};

export default function NuovoPalmareModal({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<NuovoPalmare>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoPalmare, string>>>({});

  const set = (k: keyof NuovoPalmare, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoPalmare, string>> = {};
    if (!form.codice.trim()) e.codice = 'Obbligatorio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
    setForm(EMPTY);
    onClose();
  };

  const handleClose = () => { setForm(EMPTY); setErrors({}); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Nuovo Palmare" subtitle="Aggiungi un terminale alla flotta" width={580}>
      <div className="form-grid">
        <span className="form-section-title">DATI PALMARE</span>

        <div className="form-field">
          <label className="form-label">Codice <span className="req">*</span></label>
          <input
            className={`form-input ${errors.codice ? 'input-error' : ''}`}
            value={form.codice}
            onChange={(e) => set('codice', e.target.value.toUpperCase())}
            placeholder="PAL-009"
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
          />
          {errors.codice && <span className="field-error">{errors.codice}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Modello dispositivo</label>
          <input className="form-input" value={form.modello} onChange={(e) => set('modello', e.target.value)} placeholder="Zebra TC52, Honeywell CT40…" />
        </div>

        <div className="form-field span-2">
          <label className="form-label">Numero Seriale / IMEI</label>
          <input
            className="form-input"
            value={form.seriale}
            onChange={(e) => set('seriale', e.target.value)}
            placeholder="Numero seriale o IMEI"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
        </div>

        <div className="form-field">
          <label className="form-label">Tariffa giornaliera (€)</label>
          <input className="form-input" type="number" step="0.01" value={form.tariffa} onChange={(e) => set('tariffa', e.target.value)} placeholder="35,00" />
        </div>

        <div className="form-field">
          <label className="form-label">SIM / Numero</label>
          <input className="form-input" value={form.sim} onChange={(e) => set('sim', e.target.value)} placeholder="3XX XXXXXXX" />
        </div>

        <span className="form-section-title">NOTE</span>

        <div className="form-field span-2">
          <label className="form-label">Note</label>
          <textarea className="form-textarea" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Note aggiuntive…" rows={3} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Palmare</button>
      </div>
    </Modal>
  );
}
