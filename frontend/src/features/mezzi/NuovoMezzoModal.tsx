// src/features/mezzi/NuovoMezzoModal.tsx
import { useState } from 'react';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: NuovoMezzo) => void;
}

export interface NuovoMezzo {
  targa: string;
  marca: string;
  modello: string;
  tipo: string;
  alimentazione: string;
  categoria: string;
  annoImmatricolazione: string;
  telaio: string;
  colore: string;
  kmAttuali: string;
  kmLimite: string;
  rataNoleggio: string;
  canoneNoleggio: string;
  scadenzaAssicurazione: string;
  scadenzaRevisione: string;
  scadenzaBollo: string;
  note: string;
}

const EMPTY: NuovoMezzo = {
  targa: '', marca: '', modello: '', tipo: 'FURGONE', alimentazione: 'GASOLIO',
  categoria: 'DISTRIBUZIONE', annoImmatricolazione: '', telaio: '', colore: '',
  kmAttuali: '', kmLimite: '', rataNoleggio: '', canoneNoleggio: '',
  scadenzaAssicurazione: '', scadenzaRevisione: '', scadenzaBollo: '', note: '',
};

export default function NuovoMezzoModal({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<NuovoMezzo>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoMezzo, string>>>({});

  const set = (k: keyof NuovoMezzo, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoMezzo, string>> = {};
    if (!form.targa.trim()) e.targa = 'Obbligatorio';
    if (!form.marca.trim()) e.marca = 'Obbligatorio';
    if (!form.modello.trim()) e.modello = 'Obbligatorio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
    setForm(EMPTY);
    onClose();
  };

  const handleClose = () => {
    setForm(EMPTY);
    setErrors({});
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Nuovo Mezzo" subtitle="Aggiungi un nuovo veicolo alla flotta" width={760}>
      <div className="form-grid">
        <span className="form-section-title">DATI IDENTIFICATIVI</span>

        <div className="form-field">
          <label className="form-label">Targa <span className="req">*</span></label>
          <input
            className={`form-input ${errors.targa ? 'input-error' : ''}`}
            value={form.targa}
            onChange={(e) => set('targa', e.target.value.toUpperCase())}
            placeholder="ES: GR507EZ"
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}
          />
          {errors.targa && <span className="field-error">{errors.targa}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Marca <span className="req">*</span></label>
          <input className={`form-input ${errors.marca ? 'input-error' : ''}`} value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Ford, Man, Cupra…" />
          {errors.marca && <span className="field-error">{errors.marca}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Modello <span className="req">*</span></label>
          <input className={`form-input ${errors.modello ? 'input-error' : ''}`} value={form.modello} onChange={(e) => set('modello', e.target.value)} placeholder="TRANSIT, E-TRANSIT…" />
          {errors.modello && <span className="field-error">{errors.modello}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Colore</label>
          <input className="form-input" value={form.colore} onChange={(e) => set('colore', e.target.value)} placeholder="Bianco, Grigio…" />
        </div>

        <div className="form-field">
          <label className="form-label">Tipo</label>
          <select className="form-select" value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="FURGONE">Furgone</option>
            <option value="AUTO">Auto</option>
            <option value="CAMION">Camion</option>
            <option value="MOTO">Moto</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Categoria</label>
          <select className="form-select" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
            <option value="DISTRIBUZIONE">Distribuzione</option>
            <option value="AUTO_AZIENDALE">Auto aziendale</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Alimentazione</label>
          <select className="form-select" value={form.alimentazione} onChange={(e) => set('alimentazione', e.target.value)}>
            <option value="GASOLIO">Gasolio</option>
            <option value="GASOLIO_MHEV">Gasolio MHEV</option>
            <option value="ELETTRICO">Elettrico</option>
            <option value="BENZINA">Benzina</option>
            <option value="IBRIDO">Ibrido</option>
            <option value="GPL">GPL</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Anno Immatricolazione</label>
          <input className="form-input" type="number" min="2000" max="2030" value={form.annoImmatricolazione} onChange={(e) => set('annoImmatricolazione', e.target.value)} placeholder="2023" />
        </div>

        <div className="form-field span-2">
          <label className="form-label">Numero Telaio</label>
          <input className="form-input" value={form.telaio} onChange={(e) => set('telaio', e.target.value.toUpperCase())} placeholder="VIN / Numero telaio" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
        </div>

        <span className="form-section-title">CHILOMETRI</span>

        <div className="form-field">
          <label className="form-label">KM Attuali</label>
          <input className="form-input" type="number" value={form.kmAttuali} onChange={(e) => set('kmAttuali', e.target.value)} placeholder="0" />
        </div>

        <div className="form-field">
          <label className="form-label">KM Limite contratto</label>
          <input className="form-input" type="number" value={form.kmLimite} onChange={(e) => set('kmLimite', e.target.value)} placeholder="200000" />
        </div>

        <span className="form-section-title">CONTRATTO NOLEGGIO</span>

        <div className="form-field">
          <label className="form-label">Rata Noleggio (€/mese)</label>
          <input className="form-input" type="number" step="0.01" value={form.rataNoleggio} onChange={(e) => set('rataNoleggio', e.target.value)} placeholder="850,00" />
        </div>

        <div className="form-field">
          <label className="form-label">Canone (€/mese)</label>
          <input className="form-input" type="number" step="0.01" value={form.canoneNoleggio} onChange={(e) => set('canoneNoleggio', e.target.value)} placeholder="720,00" />
        </div>

        <span className="form-section-title">SCADENZE</span>

        <div className="form-field">
          <label className="form-label">Scadenza Assicurazione</label>
          <input className="form-input" type="date" value={form.scadenzaAssicurazione} onChange={(e) => set('scadenzaAssicurazione', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Scadenza Revisione</label>
          <input className="form-input" type="date" value={form.scadenzaRevisione} onChange={(e) => set('scadenzaRevisione', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Scadenza Bollo</label>
          <input className="form-input" type="date" value={form.scadenzaBollo} onChange={(e) => set('scadenzaBollo', e.target.value)} />
        </div>

        <span className="form-section-title">NOTE</span>

        <div className="form-field span-2">
          <label className="form-label">Note</label>
          <textarea className="form-textarea" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Note aggiuntive sul veicolo…" rows={3} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Mezzo</button>
      </div>
    </Modal>
  );
}
