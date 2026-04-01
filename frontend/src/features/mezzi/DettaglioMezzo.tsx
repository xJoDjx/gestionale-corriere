// src/features/mezzi/DettaglioMezzo.tsx — Pagina dettaglio mezzo da API
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mezziApi, padronciniApi } from '../../lib/api';
import type { Mezzo, Padroncino } from '../../lib/api';
import './FlottaMezzi.css';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '';

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const scadenzaInfo = (d: string | null | undefined) => {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0) return { label: `${Math.abs(diff)}gg fa`, cls: 'scad-badge-expired' };
  if (diff <= 30) return { label: `${diff}gg`, cls: 'scad-badge-warning' };
  return { label: `${diff}gg`, cls: 'scad-badge-ok' };
};

const fmtEur = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const kmPercent = (km: number | null, limite: number | null) =>
  !km || !limite ? 0 : Math.min(100, Math.round((km / limite) * 100));

export default function DettaglioMezzo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [mezzo, setMezzo] = useState<Mezzo | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Mezzo>>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [m, pResp] = await Promise.all([
        mezziApi.detail(id),
        padronciniApi.list({ limit: '200' }),
      ]);
      setMezzo(m);
      setForm(m);
      setPadroncini(pResp.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Mezzo, v: any) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await mezziApi.update(id, {
        targa: form.targa,
        marca: form.marca,
        modello: form.modello,
        tipo: form.tipo,
        alimentazione: form.alimentazione,
        categoria: form.categoria,
        stato: form.stato,
        kmAttuali: form.kmAttuali ?? undefined,
        kmLimite: form.kmLimite ?? undefined,
        rataNoleggio: form.rataNoleggio ?? undefined,
        canoneNoleggio: form.canoneNoleggio ?? undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione ?? undefined,
        scadenzaRevisione: form.scadenzaRevisione ?? undefined,
        scadenzaBollo: form.scadenzaBollo ?? undefined,
        scadenzaTachigrafo: form.scadenzaTachigrafo ?? undefined,
        proprietario: form.proprietario ?? undefined,
        nContratto: form.nContratto ?? undefined,
        inizioNoleggio: form.inizioNoleggio ?? undefined,
        fineNoleggio: form.fineNoleggio ?? undefined,
        maggiorazioneRicarica: form.maggiorazioneRicarica ?? undefined,
        note: form.note ?? undefined,
      });
      setDirty(false);
      await load();
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fm-page">
      <div className="fm-loading"><div className="fm-spinner" /><span>Caricamento mezzo...</span></div>
    </div>
  );
  if (error || !mezzo) return (
    <div className="fm-page">
      <div className="fm-error">
        <span>⚠️ {error || 'Mezzo non trovato'}</span>
        <button className="btn-outline" onClick={() => navigate('/flotta')}>← Torna alla lista</button>
      </div>
    </div>
  );

  const assegnazionAttiva = mezzo.assegnazioni?.find((a) => !a.dataFine);
  const kmPct = kmPercent(mezzo.kmAttuali, mezzo.kmLimite);
  const kmColor = kmPct >= 90 ? '#ef4444' : kmPct >= 70 ? '#f97316' : '#22c55e';

  const revInfo = scadenzaInfo(mezzo.scadenzaRevisione);
  const assInfo = scadenzaInfo(mezzo.scadenzaAssicurazione);

  const fineNolDate = form.fineNoleggio
    ? (() => { const d = daysDiff(form.fineNoleggio); return d !== null ? `Scade tra ${d}gg` : ''; })()
    : '';

  return (
    <div className="fm-page">
      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="btn-ghost-sm" onClick={() => navigate('/flotta')}>← Flotta Mezzi</button>
        <h1>Flotta Mezzi</h1>
      </div>

      <div className="dm-layout">
        {/* ── COLONNA SX ── */}
        <div className="dm-col-left">
          {/* Identificazione */}
          <div className="dm-section-card">
            <div className="dm-section-row">
              <div className="dm-field">
                <label>Targa</label>
                <input
                  className="dm-input"
                  value={form.targa || ''}
                  onChange={(e) => set('targa', e.target.value.toUpperCase())}
                />
              </div>
              <div className="dm-field">
                <label>Stato</label>
                <select className="dm-select" value={form.stato || ''} onChange={(e) => set('stato', e.target.value)}>
                  <option value="ASSEGNATO">ASSEGNATO</option>
                  <option value="DISPONIBILE">DISPONIBILE</option>
                  <option value="IN_REVISIONE">IN REVISIONE</option>
                  <option value="FUORI_SERVIZIO">FUORI SERVIZIO</option>
                  <option value="VENDUTO">VENDUTO</option>
                  <option value="DISMESSO">DISMESSO</option>
                </select>
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field">
                <label>Categoria</label>
                <select className="dm-select" value={form.categoria || ''} onChange={(e) => set('categoria', e.target.value)}>
                  <option value="DISTRIBUZIONE">DISTRIBUZIONE</option>
                  <option value="AUTO_AZIENDALE">AUTO AZIENDALE</option>
                </select>
              </div>
              <div className="dm-field">
                <label>Tipo</label>
                <select className="dm-select" value={form.tipo || ''} onChange={(e) => set('tipo', e.target.value)}>
                  <option value="Furgone">Furgone</option>
                  <option value="Berlina">Berlina</option>
                  <option value="SUV">SUV</option>
                  <option value="Furgonato">Furgonato</option>
                </select>
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field">
                <label>Marca</label>
                <input className="dm-input" value={form.marca || ''} onChange={(e) => set('marca', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>Modello</label>
                <input className="dm-input" value={form.modello || ''} onChange={(e) => set('modello', e.target.value)} />
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field">
                <label>Anno Imm.</label>
                <input className="dm-input" value={form.annoImmatricolazione || ''} onChange={(e) => set('annoImmatricolazione', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>Tipo Cassone</label>
                <select className="dm-select" value={form.tipoCassone || ''} onChange={(e) => set('tipoCassone', e.target.value)}>
                  <option value="">—</option>
                  <option value="CENTINATO">Centinato</option>
                  <option value="FURGONATO">Furgonato</option>
                  <option value="RIBALTABILE">Ribaltabile</option>
                </select>
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field">
                <label>Alimentazione</label>
                <select className="dm-select" value={form.alimentazione || ''} onChange={(e) => set('alimentazione', e.target.value)}>
                  <option value="GASOLIO">Gasolio</option>
                  <option value="ELETTRICO">Elettrico</option>
                  <option value="GASOLIO+MHEV">Gasolio+mhev</option>
                  <option value="BENZINA">Benzina</option>
                  <option value="IBRIDO">Ibrido</option>
                </select>
              </div>
              <div className="dm-field">
                <label>Colore</label>
                <input className="dm-input" value={form.colore || ''} onChange={(e) => set('colore', e.target.value)} />
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field">
                <label>Targa Rimorchio</label>
                <input className="dm-input" value={form.targaRimorchio || ''} onChange={(e) => set('targaRimorchio', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>Portata (KG)</label>
                <input className="dm-input" type="number" value={form.portata ?? ''} onChange={(e) => set('portata', e.target.value ? parseInt(e.target.value) : null)} />
              </div>
            </div>

            <div className="dm-section-row">
              <div className="dm-field dm-field-full">
                <label>Volume (M³)</label>
                <input className="dm-input" type="number" value={form.volume ?? ''} onChange={(e) => set('volume', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            </div>

            <div className="dm-field dm-field-full">
              <label>Note Veicolo</label>
              <textarea className="dm-textarea" rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} />
            </div>
          </div>

          {/* Contratto Noleggio */}
          <div className="dm-section-card">
            <div className="dm-section-title">
              <span>📄</span> Contratto Noleggio
            </div>
            <div className="dm-section-row">
              <div className="dm-field">
                <label>Proprietario / Società</label>
                <input className="dm-input" value={form.proprietario || ''} onChange={(e) => set('proprietario', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>N° Contratto</label>
                <input className="dm-input" value={form.nContratto || ''} onChange={(e) => set('nContratto', e.target.value)} />
              </div>
            </div>
            <div className="dm-section-row">
              <div className="dm-field">
                <label>Inizio</label>
                <input className="dm-input" type="date" value={form.inizioNoleggio ? form.inizioNoleggio.split('T')[0] : ''} onChange={(e) => set('inizioNoleggio', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>Fine</label>
                <input className="dm-input" type="date" value={form.fineNoleggio ? form.fineNoleggio.split('T')[0] : ''} onChange={(e) => set('fineNoleggio', e.target.value)} />
                {fineNolDate && <span className="dm-hint">{fineNolDate}</span>}
              </div>
            </div>
            <div className="dm-section-row">
              <div className="dm-field">
                <label>Canone Nostro (€)</label>
                <input className="dm-input" type="number" value={form.rataNoleggio ?? ''} onChange={(e) => set('rataNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                <span className="dm-hint">Quanto paghiamo noi</span>
              </div>
              <div className="dm-field">
                <label>Rata Padroncino (€)</label>
                <input className="dm-input" type="number" value={form.canoneNoleggio ?? ''} onChange={(e) => set('canoneNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                {assegnazionAttiva && <span className="dm-hint-link">ℹ Addebitato al padroncino</span>}
              </div>
            </div>

            <div className="dm-field" style={{ marginTop: 8 }}>
              <label>⚡ Maggiorazione Ricarica (%)</label>
              <input
                className="dm-input dm-input-small"
                type="number"
                placeholder="es. 20"
                value={form.maggiorazioneRicarica ?? ''}
                onChange={(e) => set('maggiorazioneRicarica', e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>

            {/* Riepilogo economico */}
            <div className="dm-riepilogo">
              <div className="dm-riep-row">
                <span>Canone nostro</span>
                <span className="dm-riep-val">{fmtEur(form.rataNoleggio)}</span>
              </div>
              <div className="dm-riep-row">
                <span>Rata padroncino</span>
                <span className="dm-riep-val dm-riep-green">{fmtEur(form.canoneNoleggio)}</span>
              </div>
              <div className="dm-riep-row">
                <span>Rata + IVA 22%</span>
                <span className="dm-riep-val dm-riep-green">
                  {form.canoneNoleggio ? fmtEur(form.canoneNoleggio * 1.22) : '0,00 €'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── COLONNA DX ── */}
        <div className="dm-col-right">
          {/* Scadenze */}
          <div className="dm-section-card">
            <div className="dm-field">
              <label>Scadenza Assicurazione</label>
              <div className="dm-scad-row">
                <input
                  className="dm-input"
                  type="date"
                  value={form.scadenzaAssicurazione ? form.scadenzaAssicurazione.split('T')[0] : ''}
                  onChange={(e) => set('scadenzaAssicurazione', e.target.value)}
                />
                {assInfo && <span className={`dm-scad-badge ${assInfo.cls}`}>{assInfo.label}</span>}
              </div>
            </div>
            <div className="dm-field">
              <label>Scadenza Revisione</label>
              <div className="dm-scad-row">
                <input
                  className="dm-input"
                  type="date"
                  value={form.scadenzaRevisione ? form.scadenzaRevisione.split('T')[0] : ''}
                  onChange={(e) => set('scadenzaRevisione', e.target.value)}
                />
                {revInfo && <span className={`dm-scad-badge ${revInfo.cls}`}>{revInfo.label}</span>}
              </div>
            </div>
            <div className="dm-field">
              <label>Scadenza Bollo</label>
              <input
                className="dm-input"
                type="date"
                value={form.scadenzaBollo ? form.scadenzaBollo.split('T')[0] : ''}
                onChange={(e) => set('scadenzaBollo', e.target.value)}
              />
            </div>
            <div className="dm-field">
              <label>Scadenza Tachigrafo</label>
              <input
                className="dm-input"
                type="date"
                value={form.scadenzaTachigrafo ? form.scadenzaTachigrafo.split('T')[0] : ''}
                onChange={(e) => set('scadenzaTachigrafo', e.target.value)}
              />
            </div>
          </div>

          {/* Chilometraggio & Assegnazione */}
          <div className="dm-section-card">
            <div className="dm-section-title">
              <span>🚗</span> Chilometraggio &amp; Assegnazione
            </div>
            <div className="dm-field">
              <label>Padroncino Assegnato</label>
              <select
                className="dm-select"
                value={assegnazionAttiva?.padroncino.id || ''}
                onChange={() => {}}
                disabled
              >
                <option value="">— Nessuno —</option>
                {padroncini.map((p) => (
                  <option key={p.id} value={p.id}>{p.ragioneSociale}</option>
                ))}
              </select>
            </div>
            <div className="dm-section-row">
              <div className="dm-field">
                <label>Autista</label>
                <input className="dm-input" value={form.autista || ''} onChange={(e) => set('autista', e.target.value)} />
              </div>
              <div className="dm-field">
                <label>Limite KM</label>
                <input className="dm-input" type="number" value={form.kmLimite ?? ''} onChange={(e) => set('kmLimite', e.target.value ? parseInt(e.target.value) : null)} />
              </div>
            </div>
            <div className="dm-field">
              <label>KM Attuali</label>
              <input className="dm-input" type="number" value={form.kmAttuali ?? ''} onChange={(e) => set('kmAttuali', e.target.value ? parseInt(e.target.value) : null)} />
            </div>

            {/* KM progress bar */}
            {mezzo.kmLimite ? (
              <div className="dm-km-section">
                <div className="dm-km-header">
                  <span>KM: {(mezzo.kmAttuali ?? 0).toLocaleString('it-IT')}</span>
                  <span style={{ color: kmColor, fontWeight: 700 }}>{kmPct}%</span>
                </div>
                <div className="dm-km-bar-bg">
                  <div className="dm-km-bar-fill" style={{ width: `${kmPct}%`, background: kmColor }} />
                </div>
                <div className="dm-km-footer">
                  <span>Limite: {mezzo.kmLimite.toLocaleString('it-IT')}</span>
                  <span>Rimasti: {((mezzo.kmLimite ?? 0) - (mezzo.kmAttuali ?? 0)).toLocaleString('it-IT')}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Storico assegnazioni */}
          {mezzo.assegnazioni && mezzo.assegnazioni.length > 0 && (
            <div className="dm-section-card">
              <div className="dm-section-title">📋 Storico Assegnazioni</div>
              <div className="dm-assegnazioni-list">
                {mezzo.assegnazioni.map((a) => (
                  <div key={a.id} className={`dm-assegn-row ${!a.dataFine ? 'dm-assegn-attiva' : ''}`}>
                    <div>
                      <span className="dm-assegn-nome">{a.padroncino.ragioneSociale}</span>
                      {!a.dataFine && <span className="dm-badge-attiva">ATTIVA</span>}
                    </div>
                    <div className="dm-assegn-date">
                      {fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : 'in corso'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Azioni */}
          <div className="dm-actions-card">
            <button className="btn-outline" onClick={() => navigate('/flotta')}>← Annulla</button>
            <button
              className="btn-primary"
              disabled={!dirty || saving}
              onClick={handleSave}
            >
              {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
