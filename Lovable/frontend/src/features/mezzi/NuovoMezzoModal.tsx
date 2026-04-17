// src/features/mezzi/NuovoMezzoModal.tsx  — VERSIONE AGGIORNATA
import { useState } from 'react';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: NuovoMezzo) => void;
}

export interface NuovoMezzo {
  // Identificativi
  targa: string;
  marca: string;
  modello: string;
  tipo: string;
  alimentazione: string;
  categoria: string;
  annoImmatricolazione: string;
  telaio: string;
  colore: string;
  // KM
  kmAttuali: string;
  kmAttualiAl: string;
  kmLimite: string;
  // Possesso
  tipoPossesso: 'PROPRIETA' | 'NOLEGGIO';
  // Noleggio — dati locatore
  societaNoleggio: string;
  pIvaLocatore: string;
  telefonoLocatore: string;
  emailLocatore: string;
  riferimentoContratto: string;
  // Noleggio — finanziario (DUE RATE DISTINTE)
  rataNoleggio: string;       // rata che noi paghiamo all'azienda locatrice
  canoneNoleggio: string;     // canone che il PDA pagherà a noi
  inizioNoleggio: string;
  fineNoleggio: string;
  // Scadenze
  scadenzaAssicurazione: string;
  scadenzaRevisione: string;
  scadenzaBollo: string;
  // Note
  note: string;
}

const EMPTY: NuovoMezzo = {
  targa: '', marca: '', modello: '', tipo: 'FURGONE', alimentazione: 'GASOLIO',
  categoria: 'DISTRIBUZIONE', annoImmatricolazione: '', telaio: '', colore: '',
  kmAttuali: '', kmAttualiAl: '', kmLimite: '',
  tipoPossesso: 'NOLEGGIO',
  societaNoleggio: '', pIvaLocatore: '', telefonoLocatore: '', emailLocatore: '',
  riferimentoContratto: '',
  rataNoleggio: '', canoneNoleggio: '',
  inizioNoleggio: '', fineNoleggio: '',
  scadenzaAssicurazione: '', scadenzaRevisione: '', scadenzaBollo: '',
  note: '',
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
    if (!form.targa.trim())   e.targa  = 'Obbligatorio';
    if (!form.marca.trim())   e.marca  = 'Obbligatorio';
    if (!form.modello.trim()) e.modello = 'Obbligatorio';
    if (form.tipoPossesso === 'NOLEGGIO' && !form.societaNoleggio.trim())
      e.societaNoleggio = 'Obbligatorio se a noleggio';
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

  const isNoleggio = form.tipoPossesso === 'NOLEGGIO';

  // Differenza rata (margine)
  const rata    = parseFloat(form.rataNoleggio)  || 0;
  const canone  = parseFloat(form.canoneNoleggio) || 0;
  const margine = canone - rata;

  return (
    <Modal open={open} onClose={handleClose} title="Nuovo Mezzo" subtitle="Aggiungi un nuovo veicolo alla flotta" width={820}>
      <div className="form-grid">

        {/* ══ DATI IDENTIFICATIVI ══ */}
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
          <label className="form-label">Categoria</label>
          <select className="form-select" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
            <option value="DISTRIBUZIONE">Distribuzione</option>
            <option value="AUTO_AZIENDALE">Auto Aziendale</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Marca <span className="req">*</span></label>
          <input
            className={`form-input ${errors.marca ? 'input-error' : ''}`}
            value={form.marca}
            onChange={(e) => set('marca', e.target.value)}
            placeholder="Es: Fiat, Iveco, Mercedes…"
          />
          {errors.marca && <span className="field-error">{errors.marca}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Modello <span className="req">*</span></label>
          <input
            className={`form-input ${errors.modello ? 'input-error' : ''}`}
            value={form.modello}
            onChange={(e) => set('modello', e.target.value)}
            placeholder="Es: Ducato, Daily, Sprinter…"
          />
          {errors.modello && <span className="field-error">{errors.modello}</span>}
        </div>

        <div className="form-field">
          <label className="form-label">Tipo Veicolo</label>
          <select className="form-select" value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="FURGONE">Furgone</option>
            <option value="AUTOCARRO">Autocarro</option>
            <option value="AUTO">Auto</option>
            <option value="MOTOCICLO">Motociclo</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Alimentazione</label>
          <select className="form-select" value={form.alimentazione} onChange={(e) => set('alimentazione', e.target.value)}>
            <option value="GASOLIO">Gasolio</option>
            <option value="DIESEL">Diesel</option>
            <option value="GASOLIO_MHEV">Gasolio+MHEV</option>
            <option value="ELETTRICO">Elettrico</option>
            <option value="BENZINA">Benzina</option>
            <option value="IBRIDO">Ibrido</option>
            <option value="METANO">Metano</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Anno Immatricolazione</label>
          <input className="form-input" type="number" min="2000" max="2030" value={form.annoImmatricolazione}
            onChange={(e) => set('annoImmatricolazione', e.target.value)} placeholder="2023" />
        </div>

        <div className="form-field">
          <label className="form-label">Colore</label>
          <input className="form-input" value={form.colore}
            onChange={(e) => set('colore', e.target.value)} placeholder="Bianco" />
        </div>

        <div className="form-field span-2">
          <label className="form-label">Numero Telaio (VIN)</label>
          <input className="form-input" value={form.telaio}
            onChange={(e) => set('telaio', e.target.value.toUpperCase())}
            placeholder="VIN / Numero telaio"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
        </div>

        {/* ══ TIPO POSSESSO ══ */}
        <span className="form-section-title">TIPO DI POSSESSO</span>

        {/* Selettore visuale */}
        <div className="form-field span-2">
          <div className="possesso-selector">
            <div
              className={`possesso-option ${form.tipoPossesso === 'PROPRIETA' ? 'possesso-active' : ''}`}
              onClick={() => set('tipoPossesso', 'PROPRIETA')}
            >
              <span className="possesso-icon">🏠</span>
              <div>
                <span className="possesso-title">Di Proprietà</span>
                <span className="possesso-desc">Il veicolo è di proprietà aziendale</span>
              </div>
              <div className={`possesso-radio ${form.tipoPossesso === 'PROPRIETA' ? 'possesso-radio-active' : ''}`} />
            </div>
            <div
              className={`possesso-option ${form.tipoPossesso === 'NOLEGGIO' ? 'possesso-active' : ''}`}
              onClick={() => set('tipoPossesso', 'NOLEGGIO')}
            >
              <span className="possesso-icon">📄</span>
              <div>
                <span className="possesso-title">Noleggio / Leasing</span>
                <span className="possesso-desc">Il veicolo è noleggiato da una società esterna</span>
              </div>
              <div className={`possesso-radio ${form.tipoPossesso === 'NOLEGGIO' ? 'possesso-radio-active' : ''}`} />
            </div>
          </div>
        </div>

        {/* ══ SEZIONE NOLEGGIO (condizionale) ══ */}
        {isNoleggio && (
          <>
            <span className="form-section-title">DATI AZIENDA LOCATRICE</span>

            <div className="form-field span-2">
              <label className="form-label">Ragione Sociale Locatore <span className="req">*</span></label>
              <input
                className={`form-input ${errors.societaNoleggio ? 'input-error' : ''}`}
                value={form.societaNoleggio}
                onChange={(e) => set('societaNoleggio', e.target.value.toUpperCase())}
                placeholder="Es: ARVAL ITALIA SPA, ALD AUTOMOTIVE SRL…"
                style={{ fontWeight: 600 }}
              />
              {errors.societaNoleggio && <span className="field-error">{errors.societaNoleggio}</span>}
            </div>

            <div className="form-field">
              <label className="form-label">P. IVA Locatore</label>
              <input className="form-input" value={form.pIvaLocatore}
                onChange={(e) => set('pIvaLocatore', e.target.value)}
                placeholder="IT12345678901"
                style={{ fontFamily: 'var(--font-mono)' }} />
            </div>

            <div className="form-field">
              <label className="form-label">Riferimento Contratto / N° Pratica</label>
              <input className="form-input" value={form.riferimentoContratto}
                onChange={(e) => set('riferimentoContratto', e.target.value.toUpperCase())}
                placeholder="Es: CNT-2025-00123"
                style={{ fontFamily: 'var(--font-mono)' }} />
            </div>

            <div className="form-field">
              <label className="form-label">Telefono Locatore</label>
              <input className="form-input" type="tel" value={form.telefonoLocatore}
                onChange={(e) => set('telefonoLocatore', e.target.value)}
                placeholder="02 0000 0000" />
            </div>

            <div className="form-field">
              <label className="form-label">Email Locatore</label>
              <input className="form-input" type="email" value={form.emailLocatore}
                onChange={(e) => set('emailLocatore', e.target.value)}
                placeholder="flotta@locatore.it" />
            </div>

            {/* Date contratto */}
            <div className="form-field">
              <label className="form-label">Inizio Noleggio</label>
              <input className="form-input" type="date" value={form.inizioNoleggio}
                onChange={(e) => set('inizioNoleggio', e.target.value)} />
            </div>

            <div className="form-field">
              <label className="form-label">Fine Noleggio</label>
              <input className="form-input" type="date" value={form.fineNoleggio}
                onChange={(e) => set('fineNoleggio', e.target.value)} />
            </div>

            {/* ── Rate ── */}
            <span className="form-section-title">RATE NOLEGGIO</span>

            {/* Box esplicativo */}
            <div className="form-field span-2">
              <div className="rate-info-box">
                <div className="rate-info-col rate-info-noi">
                  <span className="rate-info-icon">⬇️</span>
                  <span className="rate-info-label">RATA CHE PAGHIAMO NOI</span>
                  <span className="rate-info-desc">Importo che versiamo mensilmente all'azienda locatrice</span>
                </div>
                <div className="rate-info-sep">→</div>
                <div className="rate-info-col rate-info-pda">
                  <span className="rate-info-icon">⬆️</span>
                  <span className="rate-info-label">CANONE CHE PAGA IL PDA</span>
                  <span className="rate-info-desc">Importo che addebitiamo mensilmente al padroncino assegnatario</span>
                </div>
                {(rata > 0 || canone > 0) && (
                  <div className="rate-info-sep">→</div>
                )}
                {(rata > 0 || canone > 0) && (
                  <div className={`rate-info-col rate-info-margine ${margine >= 0 ? 'rate-margine-pos' : 'rate-margine-neg'}`}>
                    <span className="rate-info-icon">{margine >= 0 ? '✅' : '⚠️'}</span>
                    <span className="rate-info-label">MARGINE</span>
                    <span className="rate-info-margine-val">
                      {margine >= 0 ? '+' : ''}{margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €/mese
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">💳 Rata che paghiamo noi (€/mese)</label>
              <input
                className="form-input form-input-rata-noi"
                type="number" step="0.01" value={form.rataNoleggio}
                onChange={(e) => set('rataNoleggio', e.target.value)}
                placeholder="850,00"
              />
              <span className="field-hint">Importo da corrispondere al locatore</span>
            </div>

            <div className="form-field">
              <label className="form-label">💰 Canone addebitato al PDA (€/mese)</label>
              <input
                className="form-input form-input-canone-pda"
                type="number" step="0.01" value={form.canoneNoleggio}
                onChange={(e) => set('canoneNoleggio', e.target.value)}
                placeholder="950,00"
              />
              <span className="field-hint">Importo che il padroncino pagherà mensilmente</span>
            </div>
          </>
        )}

        {/* ══ KM ══ */}
        <span className="form-section-title">CHILOMETRI</span>

        <div className="form-field">
          <label className="form-label">KM Attuali</label>
          <input className="form-input" type="number" value={form.kmAttuali}
            onChange={(e) => set('kmAttuali', e.target.value)} placeholder="0" />
        </div>

        <div className="form-field">
          <label className="form-label">Aggiornato al</label>
          <input className="form-input" type="date" value={form.kmAttualiAl}
            onChange={(e) => set('kmAttualiAl', e.target.value)} />
          <span className="field-hint">Data dell'ultimo aggiornamento km</span>
        </div>

        <div className="form-field">
          <label className="form-label">KM Limite Contratto</label>
          <input className="form-input" type="number" value={form.kmLimite}
            onChange={(e) => set('kmLimite', e.target.value)} placeholder="200000" />
        </div>

        {/* ══ SCADENZE ══ */}
        <span className="form-section-title">SCADENZE</span>

        <div className="form-field">
          <label className="form-label">Scadenza Assicurazione</label>
          <input className="form-input" type="date" value={form.scadenzaAssicurazione}
            onChange={(e) => set('scadenzaAssicurazione', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Scadenza Revisione</label>
          <input className="form-input" type="date" value={form.scadenzaRevisione}
            onChange={(e) => set('scadenzaRevisione', e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Scadenza Bollo</label>
          <input className="form-input" type="date" value={form.scadenzaBollo}
            onChange={(e) => set('scadenzaBollo', e.target.value)} />
        </div>

        {/* ══ NOTE ══ */}
        <span className="form-section-title">NOTE</span>

        <div className="form-field span-2">
          <label className="form-label">Note</label>
          <textarea className="form-textarea" value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Note aggiuntive sul veicolo…" rows={3} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Mezzo</button>
      </div>
    </Modal>
  );
}
