// src/features/mezzi/NuovoMezzoModal.tsx
import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import './NuovoMezzoModal.css';

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
  tipoPossesso: 'PROPRIETA' | 'NOLEGGIO' | 'ESTERNO';
  // Noleggio — locatore
  societaNoleggio: string;
  pIvaLocatore: string;
  telefonoLocatore: string;
  emailLocatore: string;
  riferimentoContratto: string;
  // Noleggio — finanziario
  rataNoleggio: string;
  canoneNoleggio: string;
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

// ── Helper: numero sezione condizionale ──────────────────────
function sectionNum(base: number, isNoleggio: boolean, afterNoleggio: boolean) {
  if (!afterNoleggio) return base;
  return isNoleggio ? base + 1 : base;
}

export default function NuovoMezzoModal({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<NuovoMezzo>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoMezzo, string>>>({});

  const set = (k: keyof NuovoMezzo, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoMezzo, string>> = {};
    if (!form.targa.trim())   e.targa   = 'Obbligatorio';
    if (!form.marca.trim())   e.marca   = 'Obbligatorio';
    if (!form.modello.trim()) e.modello = 'Obbligatorio';
    if (form.tipoPossesso === 'NOLEGGIO' && !form.societaNoleggio.trim())
      e.societaNoleggio = 'Obbligatorio per i veicoli a noleggio';
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
  const isEsterno  = form.tipoPossesso === 'ESTERNO';
  const rata   = parseFloat(form.rataNoleggio)  || 0;
  const canone = parseFloat(form.canoneNoleggio) || 0;
  const margine = canone - rata;
  const hasMargine = rata > 0 || canone > 0;

  const numKm  = sectionNum(3, isNoleggio, true);
  const numNote = isEsterno ? numKm : numKm + 1;

  return (
    <Modal open={open} onClose={handleClose} title="🚛 Nuovo Mezzo" subtitle="Aggiungi un nuovo veicolo alla flotta" width={860}>
      <div className="nm-form">

        {/* ══════════════════════════════════════════
            SEZIONE 1 — DATI VEICOLO
        ══════════════════════════════════════════ */}
        <div className="nm-section nm-section--blue">
          <div className="nm-section-head">
            <span className="nm-section-num">1</span>
            <span className="nm-section-title">Dati Veicolo</span>
            <span className="nm-section-sub">Identificativi e caratteristiche tecniche</span>
          </div>
          <div className="nm-section-body">
            <div className="form-grid">

              {/* Targa — campo prominente */}
              <div className="form-field">
                <label className="form-label">Targa <span className="req">*</span></label>
                <input
                  className={`form-input nm-targa-input ${errors.targa ? 'input-error' : ''}`}
                  value={form.targa}
                  onChange={(e) => set('targa', e.target.value.toUpperCase())}
                  placeholder="ES: GR507EZ"
                />
                {errors.targa && <span className="field-error">{errors.targa}</span>}
              </div>

              <div className="form-field">
                <label className="form-label">Categoria</label>
                <select className="form-select" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                  <option value="DISTRIBUZIONE">🚛 Distribuzione</option>
                  <option value="AUTO_AZIENDALE">🚗 Auto Aziendale</option>
                  <option value="FLOTTA">🚙 Flotta</option>
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
                  <option value="FURGONE">🚐 Furgone</option>
                  <option value="AUTOCARRO">🚚 Autocarro</option>
                  <option value="AUTO">🚗 Auto</option>
                  <option value="MOTOCICLO">🛵 Motociclo</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Alimentazione</label>
                <select className="form-select" value={form.alimentazione} onChange={(e) => set('alimentazione', e.target.value)}>
                  <option value="GASOLIO">⛽ Gasolio</option>
                  <option value="DIESEL">⛽ Diesel</option>
                  <option value="GASOLIO_MHEV">⛽ Gasolio + MHEV</option>
                  <option value="ELETTRICO">⚡ Elettrico</option>
                  <option value="BENZINA">⛽ Benzina</option>
                  <option value="IBRIDO">🔋 Ibrido</option>
                  <option value="METANO">💧 Metano</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Anno Immatricolazione</label>
                <input className="form-input" type="number" min="2000" max="2035"
                  value={form.annoImmatricolazione}
                  onChange={(e) => set('annoImmatricolazione', e.target.value)}
                  placeholder="2023" />
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
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              </div>

            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SEZIONE 2 — TIPO DI POSSESSO
        ══════════════════════════════════════════ */}
        <div className="nm-section nm-section--purple">
          <div className="nm-section-head">
            <span className="nm-section-num">2</span>
            <span className="nm-section-title">Tipo di Possesso</span>
            <span className="nm-section-sub">Seleziona come il veicolo è acquisito</span>
          </div>

          <div className="possesso-selector">
            {/* ── DI PROPRIETÀ ── */}
            <div
              className={`possesso-option possesso-proprieta ${form.tipoPossesso === 'PROPRIETA' ? 'possesso-active' : ''}`}
              onClick={() => set('tipoPossesso', 'PROPRIETA')}
            >
              <div className="possesso-icon-wrap">🏠</div>
              <div className="possesso-text">
                <span className="possesso-title">Di Proprietà</span>
                <span className="possesso-desc">Il veicolo è di proprietà aziendale, acquistato direttamente</span>
              </div>
              <div className={`possesso-radio ${form.tipoPossesso === 'PROPRIETA' ? 'possesso-active possesso-proprieta' : ''}`} />
            </div>

            {/* ── NOLEGGIO / LEASING ── */}
            <div
              className={`possesso-option possesso-noleggio ${form.tipoPossesso === 'NOLEGGIO' ? 'possesso-active' : ''}`}
              onClick={() => set('tipoPossesso', 'NOLEGGIO')}
            >
              <div className="possesso-icon-wrap">📄</div>
              <div className="possesso-text">
                <span className="possesso-title">Noleggio / Leasing</span>
                <span className="possesso-desc">Il veicolo è noleggiato da una società esterna con contratto</span>
              </div>
              <div className={`possesso-radio ${form.tipoPossesso === 'NOLEGGIO' ? 'possesso-active possesso-noleggio' : ''}`} />
            </div>

            {/* ── ESTERNO / DIPENDENTE ── */}
            <div
              className={`possesso-option possesso-esterno ${form.tipoPossesso === 'ESTERNO' ? 'possesso-active' : ''}`}
              onClick={() => set('tipoPossesso', 'ESTERNO')}
            >
              <div className="possesso-icon-wrap">👤</div>
              <div className="possesso-text">
                <span className="possesso-title">Esterno / Dipendente</span>
                <span className="possesso-desc">Mezzo di un dipendente, inserito per tracciare le ricariche elettriche</span>
              </div>
              <div className={`possesso-radio ${form.tipoPossesso === 'ESTERNO' ? 'possesso-active possesso-esterno' : ''}`} />
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SEZIONE 3 — CONTRATTO DI NOLEGGIO
            (solo se tipoPossesso === NOLEGGIO)
        ══════════════════════════════════════════ */}
        {isNoleggio && (
          <div className="nm-section nm-section--orange">
            <div className="nm-section-head">
              <span className="nm-section-num">3</span>
              <span className="nm-section-title">Contratto di Noleggio</span>
              <span className="nm-section-sub">Dati locatore, durata e condizioni economiche</span>
            </div>
            <div className="nm-section-body">

              {/* ── Sub: Azienda Locatrice ── */}
              <div className="nm-subsection">
                <span className="nm-subsection-title">🏢 Azienda Locatrice</span>
                <div className="form-grid">

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
                    <label className="form-label">Rif. Contratto / N° Pratica</label>
                    <input className="form-input" value={form.riferimentoContratto}
                      onChange={(e) => set('riferimentoContratto', e.target.value.toUpperCase())}
                      placeholder="CNT-2025-00123"
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

                </div>
              </div>

              {/* ── Sub: Durata Contratto ── */}
              <div className="nm-subsection">
                <span className="nm-subsection-title">📅 Durata Contratto</span>
                <div className="form-grid">

                  <div className="form-field">
                    <label className="form-label">Data Inizio</label>
                    <input className="form-input" type="date" value={form.inizioNoleggio}
                      onChange={(e) => set('inizioNoleggio', e.target.value)} />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Data Fine / Scadenza</label>
                    <input className="form-input" type="date" value={form.fineNoleggio}
                      onChange={(e) => set('fineNoleggio', e.target.value)} />
                  </div>

                </div>
              </div>

              {/* ── Sub: Rate ── */}
              <div className="nm-subsection">
                <span className="nm-subsection-title">💶 Condizioni Economiche</span>

                {/* Box margine live */}
                {hasMargine ? (
                  <div className="nm-margine-box">
                    <div className="nm-margine-col nm-margine-col--noi">
                      <span className="nm-margine-label">Paghiamo al locatore</span>
                      <span className="nm-margine-val">
                        {rata > 0 ? rata.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €' : '—'}
                      </span>
                      <span className="nm-margine-sub">/ mese</span>
                    </div>
                    <div className="nm-margine-arrow">→</div>
                    <div className="nm-margine-col nm-margine-col--pda">
                      <span className="nm-margine-label">Addebito al padroncino</span>
                      <span className="nm-margine-val">
                        {canone > 0 ? canone.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €' : '—'}
                      </span>
                      <span className="nm-margine-sub">/ mese</span>
                    </div>
                    <div className="nm-margine-arrow">→</div>
                    <div className={`nm-margine-col nm-margine-col--result ${margine >= 0 ? 'nm-margine-pos' : 'nm-margine-neg'}`}>
                      <span className="nm-margine-label">Margine</span>
                      <span className="nm-margine-val">
                        {margine >= 0 ? '+' : ''}{margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €
                      </span>
                      <span className="nm-margine-sub">{margine >= 0 ? '✅ Positivo' : '⚠️ Negativo'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="nm-margine-placeholder">
                    Inserisci le rate qui sotto per visualizzare il margine in tempo reale
                  </div>
                )}

                <div className="form-grid">

                  <div className="form-field">
                    <label className="form-label">💳 Rata che paghiamo noi (€/mese)</label>
                    <input
                      className="form-input form-input-rata-noi"
                      type="number" step="0.01" min="0"
                      value={form.rataNoleggio}
                      onChange={(e) => set('rataNoleggio', e.target.value)}
                      placeholder="Es: 850,00"
                    />
                    <span className="field-hint">Importo mensile da versare al locatore</span>
                  </div>

                  <div className="form-field">
                    <label className="form-label">💰 Canone addebitato al padroncino (€/mese)</label>
                    <input
                      className="form-input form-input-canone-pda"
                      type="number" step="0.01" min="0"
                      value={form.canoneNoleggio}
                      onChange={(e) => set('canoneNoleggio', e.target.value)}
                      placeholder="Es: 950,00"
                    />
                    <span className="field-hint">Importo che il padroncino paga mensilmente</span>
                  </div>

                </div>
              </div>

            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SEZIONE KM + SCADENZE — affiancate
        ══════════════════════════════════════════ */}
        <div className="nm-row-2">

          {/* ── KM ── */}
          <div className="nm-section nm-section--teal">
            <div className="nm-section-head">
              <span className="nm-section-num">{isNoleggio ? 4 : 3}</span>
              <span className="nm-section-title">Chilometri</span>
            </div>
            <div className="nm-section-body">
              <div className="form-grid cols-1">

                <div className="form-field">
                  <label className="form-label">KM Attuali</label>
                  <input className="form-input" type="number" min="0"
                    value={form.kmAttuali}
                    onChange={(e) => set('kmAttuali', e.target.value)}
                    placeholder="0" />
                </div>

                <div className="form-field">
                  <label className="form-label">Rilevati il</label>
                  <input className="form-input" type="date" value={form.kmAttualiAl}
                    onChange={(e) => set('kmAttualiAl', e.target.value)} />
                  <span className="field-hint">Data ultimo aggiornamento km</span>
                </div>

                <div className="form-field">
                  <label className="form-label">KM Limite Contratto</label>
                  <input className="form-input" type="number" min="0"
                    value={form.kmLimite}
                    onChange={(e) => set('kmLimite', e.target.value)}
                    placeholder="200.000" />
                  <span className="field-hint">Limite previsto da contratto di noleggio</span>
                </div>

              </div>
            </div>
          </div>

          {/* ── SCADENZE ── */}
          <div className="nm-section nm-section--red">
            <div className="nm-section-head">
              <span className="nm-section-num">{isNoleggio ? 5 : 4}</span>
              <span className="nm-section-title">Scadenze</span>
            </div>
            <div className="nm-section-body">
              <div className="form-grid cols-1">

                <div className="form-field">
                  <label className="form-label">🛡️ Scadenza Assicurazione</label>
                  <input className="form-input" type="date"
                    value={form.scadenzaAssicurazione}
                    onChange={(e) => set('scadenzaAssicurazione', e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label">🔧 Scadenza Revisione</label>
                  <input className="form-input" type="date"
                    value={form.scadenzaRevisione}
                    onChange={(e) => set('scadenzaRevisione', e.target.value)} />
                </div>

                <div className="form-field">
                  <label className="form-label">📋 Scadenza Bollo</label>
                  <input className="form-input" type="date"
                    value={form.scadenzaBollo}
                    onChange={(e) => set('scadenzaBollo', e.target.value)} />
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* ══════════════════════════════════════════
            SEZIONE NOTE
        ══════════════════════════════════════════ */}
        <div className="nm-section nm-section--gray">
          <div className="nm-section-head">
            <span className="nm-section-num">{isNoleggio ? 6 : 5}</span>
            <span className="nm-section-title">Note</span>
            <span className="nm-section-sub">Informazioni aggiuntive (opzionale)</span>
          </div>
          <div className="nm-section-body">
            <textarea className="form-textarea" rows={3} value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Note aggiuntive sul veicolo, sul contratto, particolarità tecniche…"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

      </div>{/* /nm-form */}

      {/* ── Footer ── */}
      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva Mezzo</button>
      </div>
    </Modal>
  );
}
