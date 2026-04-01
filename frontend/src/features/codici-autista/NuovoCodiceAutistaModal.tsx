// src/features/codici-autista/NuovoCodiceAutistaModal.tsx
import { useState } from 'react';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: NuovoCodiceAutista) => void;
}

export interface NuovoCodiceAutista {
  codice: string;
  nome: string;
  cognome: string;
  tariffaFissa: string;
  tariffaRitiro: string;
  target: string;
  note: string;
}

const EMPTY: NuovoCodiceAutista = {
  codice: '', nome: '', cognome: '',
  tariffaFissa: '', tariffaRitiro: '', target: '', note: '',
};

export default function NuovoCodiceAutistaModal({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<NuovoCodiceAutista>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoCodiceAutista, string>>>({});

  const set = (k: keyof NuovoCodiceAutista, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoCodiceAutista, string>> = {};
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

  return (
    <Modal open={open} onClose={() => { setForm(EMPTY); setErrors({}); onClose(); }} title="Nuovo Codice Autista" subtitle="Aggiungi un codice autista" width={500}>
      <div className="form-grid">
        <span className="form-section-title">DATI AUTISTA</span>
        <div className="form-field">
          <label className="form-label">Codice <span className="req">*</span></label>
          <input
            className={`form-input ${errors.codice ? 'input-error' : ''}`}
            placeholder="es. 5001"
            value={form.codice}
            onChange={(e) => set('codice', e.target.value)}
          />
          {errors.codice && <span className="field-error">{errors.codice}</span>}
        </div>

        <div className="form-row-2">
          <div className="form-field">
            <label className="form-label">Nome</label>
            <input className="form-input" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Cognome</label>
            <input className="form-input" value={form.cognome} onChange={(e) => set('cognome', e.target.value)} />
          </div>
        </div>

        <span className="form-section-title">TARIFFE</span>
        <div className="form-row-2">
          <div className="form-field">
            <label className="form-label">Tariffa Fissa (€)</label>
            <input className="form-input" type="number" placeholder="es. 155.00" value={form.tariffaFissa} onChange={(e) => set('tariffaFissa', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Tariffa Ritiro (€)</label>
            <input className="form-input" type="number" placeholder="es. 1.00" value={form.tariffaRitiro} onChange={(e) => set('tariffaRitiro', e.target.value)} />
          </div>
        </div>
        <div className="form-field">
          <label className="form-label">Target</label>
          <input className="form-input" type="number" placeholder="es. 100" value={form.target} onChange={(e) => set('target', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Note</label>
          <textarea className="form-input" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn-outline" onClick={() => { setForm(EMPTY); setErrors({}); onClose(); }}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>Salva</button>
      </div>
    </Modal>
  );
}
