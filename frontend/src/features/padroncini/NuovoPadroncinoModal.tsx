// src/features/padroncini/NuovoPadroncinoModal.tsx
import { useState } from 'react';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: NuovoPadroncino) => void;
}

export interface NuovoPadroncino {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo: string;
  telefono: string;
  email: string;
  pec: string;
  iban: string;
  scadenzaDurc: string;
  scadenzaDvr: string;
  note: string;
}

const EMPTY: NuovoPadroncino = {
  ragioneSociale: '', partitaIva: '', codiceFiscale: '',
  indirizzo: '', telefono: '', email: '', pec: '', iban: '',
  scadenzaDurc: '', scadenzaDvr: '', note: '',
};

export default function NuovoPadroncinoModal({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<NuovoPadroncino>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoPadroncino, string>>>({});

  const set = (k: keyof NuovoPadroncino, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoPadroncino, string>> = {};
    if (!form.ragioneSociale.trim()) e.ragioneSociale = 'Obbligatorio';
    if (!form.partitaIva.trim()) e.partitaIva = 'Obbligatorio';
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
    <Modal open={open} onClose={handleClose} title="Nuovo Padroncino" subtitle="Inserisci i dati anagrafici del nuovo padroncino" width={720}>
      <div className="form-grid">
        <span className="form-section-title">DATI SOCIETARI</span>

        <div className="form-field span-2">
          <label className="form-label">Ragione Sociale <span className="req">*</span></label>
          <input
            className={`form-input ${errors.ragioneSociale ? 'input-error' : ''}`}
            value={form.ragioneSociale}
            onChange={(e) => set('ragioneSociale', e.target.value.toUpperCase())}
            placeholder="ES: MEN LOGISTIC SRLS"
            style={{ fontWeight: 600, fontSize: '14px' }}
          />
          {errors.ragioneSociale && <span className="field-error">{errors.ragioneSociale}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Partita IVA <span className="req">*</span></label>
          <input
            className={`form-input ${errors.partitaIva ? 'input-error' : ''}`}
            value={form.partitaIva}
            onChange={(e) => set('partitaIva', e.target.value)}
            placeholder="01234567890"
            maxLength={11}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          {errors.partitaIva && <span className="field-error">{errors.partitaIva}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Codice Fiscale</label>
          <input
            className="form-input"
            value={form.codiceFiscale}
            onChange={(e) => set('codiceFiscale', e.target.value.toUpperCase())}
            placeholder="RSSMRA80A01F205X"
            maxLength={16}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <span className="form-section-title">CONTATTI</span>

        <div className="form-field span-2">
          <label className="form-label">Indirizzo</label>
          <input className="form-input" value={form.indirizzo} onChange={(e) => set('indirizzo', e.target.value)} placeholder="Via Roma 1, Cosenza (CS)" />
        </div>

        <div className="form-field">
          <label className="form-label">Telefono</label>
          <input className="form-input" type="tel" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="0984 123456" />
        </div>

        <div className="form-field">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="info@esempio.it" />
        </div>

        <div className="form-field">
          <label className="form-label">PEC</label>
          <input className="form-input" type="email" value={form.pec} onChange={(e) => set('pec', e.target.value)} placeholder="pec@pec.it" />
        </div>

        <div className="form-field">
          <label className="form-label">IBAN</label>
          <input
            className="form-input"
            value={form.iban}
            onChange={(e) => set('iban', e.target.value.toUpperCase())}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          />
        </div>

        <span className="form-section-title">SCADENZE DOCUMENTI</span>

        <div className="form-field">
          <label className="form-label">Scadenza DURC</label>
          <input className="form-input" type="date" value={form.scadenzaDurc} onChange={(e) => set('scadenzaDurc', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Scadenza DVR</label>
          <input className="form-input" type="date" value={form.scadenzaDvr} onChange={(e) => set('scadenzaDvr', e.target.value)} />
        </div>

        <span className="form-section-title">NOTE</span>

        <div className="form-field span-2">
          <label className="form-label">Note</label>
          <textarea className="form-textarea" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Annotazioni interne sul padroncino…" rows={3} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Padroncino</button>
      </div>
    </Modal>
  );
}
