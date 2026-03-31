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
  note: string;
}

const EMPTY: NuovoCodiceAutista = { codice: '', nome: '', cognome: '', note: '' };

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
    if (!form.nome.trim()) e.nome = 'Obbligatorio';
    if (!form.cognome.trim()) e.cognome = 'Obbligatorio';
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
    <Modal open={open} onClose={handleClose} title="Nuovo Codice Autista" subtitle="Crea un nuovo codice identificativo autista" width={520}>
      <div className="form-grid">
        <span className="form-section-title">DATI AUTISTA</span>

        <div className="form-field span-2">
          <label className="form-label">Codice autista <span className="req">*</span></label>
          <input
            className={`form-input ${errors.codice ? 'input-error' : ''}`}
            value={form.codice}
            onChange={(e) => set('codice', e.target.value.toUpperCase())}
            placeholder="AUT009"
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px', letterSpacing: '0.05em' }}
          />
          {errors.codice && <span className="field-error">{errors.codice}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Nome <span className="req">*</span></label>
          <input className={`form-input ${errors.nome ? 'input-error' : ''}`} value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Mario" />
          {errors.nome && <span className="field-error">{errors.nome}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Cognome <span className="req">*</span></label>
          <input className={`form-input ${errors.cognome ? 'input-error' : ''}`} value={form.cognome} onChange={(e) => set('cognome', e.target.value)} placeholder="Rossi" />
          {errors.cognome && <span className="field-error">{errors.cognome}</span>}
        </div>

        <div className="form-field span-2">
          <label className="form-label">Note</label>
          <textarea className="form-textarea" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Note sull'autista…" rows={3} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Codice</button>
      </div>
    </Modal>
  );
}
