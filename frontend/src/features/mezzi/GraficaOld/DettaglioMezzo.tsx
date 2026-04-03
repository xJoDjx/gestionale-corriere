// src/features/mezzi/DettaglioMezzo.tsx — con tab Info / Assegnazioni / Log
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mezziApi, padronciniApi } from '../../lib/api';
import type { Mezzo, Padroncino } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import LogEntita from '../log/LogEntita';
import './FlottaMezzi.css';

// ─── HELPERS ──────────────────────────────────────────
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

// ─── MODALE NUOVA ASSEGNAZIONE ────────────────────────
function NuovaAssegnazioneModal({
  open, onClose, padroncini, onSave,
}: {
  open: boolean;
  onClose: () => void;
  padroncini: Padroncino[];
  onSave: (padroncinoId: string, dataInizio: string) => Promise<void>;
}) {
  const [padroncinoId, setPadroncinoId] = useState('');
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = padroncini.filter((p) =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!padroncinoId || !dataInizio) return;
    setSaving(true);
    try {
      await onSave(padroncinoId, dataInizio);
      setPadroncinoId('');
      setSearch('');
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova Assegnazione Mezzo" width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-field">
          <label className="form-label">Cerca padroncino</label>
          <input
            className="form-input"
            placeholder="Filtra per nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setPadroncinoId(p.id)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: padroncinoId === p.id ? 'rgba(99,102,241,.1)' : 'transparent',
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: padroncinoId === p.id ? 'var(--primary)' : 'var(--text-primary)',
              }}>
                {p.ragioneSociale}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nessun padroncino trovato
            </div>
          )}
        </div>
        <div className="form-field">
          <label className="form-label">Data Inizio <span className="req">*</span></label>
          <input
            className="form-input"
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn-outline" onClick={onClose}>Annulla</button>
          <button
            className="btn-primary"
            disabled={!padroncinoId || !dataInizio || saving}
            onClick={handleSave}
          >
            {saving ? 'Salvataggio...' : '🔗 Assegna'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────
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
  const [activeTab, setActiveTab] = useState<'info' | 'assegnazioni' | 'log'>('info');
  const [showAssegnaModal, setShowAssegnaModal] = useState(false);

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
        annoImmatricolazione: form.annoImmatricolazione ?? undefined,
        telaio: form.telaio ?? undefined,
        colore: form.colore ?? undefined,
        kmAttuali: form.kmAttuali ?? undefined,
        kmLimite: form.kmLimite ?? undefined,
        rataNoleggio: form.rataNoleggio ?? undefined,
        canoneNoleggio: form.canoneNoleggio ?? undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione ?? undefined,
        scadenzaRevisione: form.scadenzaRevisione ?? undefined,
        scadenzaBollo: form.scadenzaBollo ?? undefined,
        scadenzaTachigrafo: form.scadenzaTachigrafo ?? undefined,
        // campi noleggio — usiamo proprietario e nContratto che il backend ora accetta
        proprietario: form.proprietario ?? undefined,
        nContratto: form.nContratto ?? undefined,
        inizioNoleggio: form.inizioNoleggio ?? undefined,
        fineNoleggio: form.fineNoleggio ?? undefined,
        maggiorazioneRicarica: form.maggiorazioneRicarica ?? undefined,
        portata: form.portata ?? undefined,
        volume: form.volume ?? undefined,
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

  const handleNuovaAssegnazione = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await mezziApi.assegna(id, { padroncinoId, dataInizio });
    await load();
  };

  const handleChiudiAssegnazione = async (assegnazioneId: string) => {
    if (!window.confirm('Chiudi questa assegnazione?')) return;
    await mezziApi.chiudiAssegnazione(assegnazioneId);
    await load();
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
  const bolloInfo = scadenzaInfo(mezzo.scadenzaBollo);
  const fineNolDate = form.fineNoleggio
    ? (() => { const d = daysDiff(form.fineNoleggio); return d !== null ? `Scade tra ${d}gg` : ''; })()
    : '';

  const TABS = [
    { key: 'info', label: '📋 Info & Dati' },
    { key: 'assegnazioni', label: `🔗 Assegnazioni (${mezzo.assegnazioni?.length ?? 0})` },
    { key: 'log', label: '📜 Log' },
  ];

  return (
    <div className="fm-page">
      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="btn-ghost-sm" onClick={() => navigate('/flotta')}>← Flotta Mezzi</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, letterSpacing: '.05em' }}>
            {mezzo.targa}
          </h1>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{mezzo.marca} {mezzo.modello}</span>
          <span className={`fm-badge ${mezzo.stato === 'ASSEGNATO' ? 'fm-badge-blue' : mezzo.stato === 'DISPONIBILE' ? 'fm-badge-green' : 'fm-badge-gray'}`}>
            {mezzo.stato}
          </span>
          {assegnazionAttiva && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              → {assegnazionAttiva.padroncino.ragioneSociale}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && (
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
            </button>
          )}
          {!dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>✓ Salvato</span>}
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="dm-tabs-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dm-tab ${activeTab === t.key ? 'dm-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB INFO ── */}
      {activeTab === 'info' && (
        <div className="dm-layout">
          {/* ── COLONNA SX ── */}
          <div className="dm-col-left">
            {/* Identificazione */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>🚚</span> Identificazione</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Targa</label>
                  <input className="dm-input" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                    value={form.targa || ''} onChange={(e) => set('targa', e.target.value.toUpperCase())} />
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
                    <option value="DISTRIBUZIONE">Distribuzione</option>
                    <option value="AUTO_AZIENDALE">Auto Aziendale</option>
                  </select>
                </div>
                <div className="dm-field">
                  <label>Tipo</label>
                  <select className="dm-select" value={form.tipo || ''} onChange={(e) => set('tipo', e.target.value)}>
                    <option value="FURGONE">Furgone</option>
                    <option value="AUTOCARRO">Autocarro</option>
                    <option value="MOTOCICLO">Motociclo</option>
                    <option value="AUTOVETTURA">Autovettura</option>
                    <option value="SEMIRIMORCHIO">Semirimorchio</option>
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
                  <label>Alimentazione</label>
                  <select className="dm-select" value={form.alimentazione || ''} onChange={(e) => set('alimentazione', e.target.value)}>
                    <option value="GASOLIO">Gasolio</option>
                    <option value="BENZINA">Benzina</option>
                    <option value="ELETTRICO">Elettrico</option>
                    <option value="IBRIDO">Ibrido</option>
                    <option value="GPL">GPL</option>
                    <option value="METANO">Metano</option>
                  </select>
                </div>
                <div className="dm-field">
                  <label>Anno Immatricolazione</label>
                  <input className="dm-input" type="number" placeholder="2023"
                    value={form.annoImmatricolazione ?? ''} onChange={(e) => set('annoImmatricolazione', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Telaio</label>
                  <input className="dm-input" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    value={form.telaio || ''} onChange={(e) => set('telaio', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label>Colore</label>
                  <input className="dm-input" value={form.colore || ''} onChange={(e) => set('colore', e.target.value)} />
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Portata (kg)</label>
                  <input className="dm-input" type="number" value={form.portata ?? ''}
                    onChange={(e) => set('portata', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="dm-field">
                  <label>Volume (M³)</label>
                  <input className="dm-input" type="number" value={form.volume ?? ''}
                    onChange={(e) => set('volume', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              </div>
              <div className="dm-field dm-field-full">
                <label>Note</label>
                <textarea className="dm-textarea" rows={2} value={form.note || ''}
                  onChange={(e) => set('note', e.target.value)} />
              </div>
            </div>

            {/* Contratto Noleggio */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>📄</span> Contratto Noleggio</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Proprietario / Società</label>
                  <input className="dm-input" value={form.proprietario || (form as any).societaNoleggio || ''}
                    onChange={(e) => set('proprietario', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label>N° Contratto</label>
                  <input className="dm-input" style={{ fontFamily: 'var(--font-mono)' }}
                    value={form.nContratto || (form as any).riferimentoContratto || ''}
                    onChange={(e) => set('nContratto', e.target.value)} />
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Inizio Noleggio</label>
                  <input className="dm-input" type="date"
                    value={form.inizioNoleggio ? form.inizioNoleggio.split('T')[0] : ''}
                    onChange={(e) => set('inizioNoleggio', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label>Fine Noleggio</label>
                  <input className="dm-input" type="date"
                    value={form.fineNoleggio ? form.fineNoleggio.split('T')[0] : ''}
                    onChange={(e) => set('fineNoleggio', e.target.value)} />
                  {fineNolDate && <span className="dm-hint">{fineNolDate}</span>}
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Canone Nostro (€)</label>
                  <input className="dm-input" type="number" value={form.rataNoleggio ?? ''}
                    onChange={(e) => set('rataNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                  <span className="dm-hint">Quanto paghiamo noi al locatore</span>
                </div>
                <div className="dm-field">
                  <label>Rata Padroncino (€)</label>
                  <input className="dm-input" type="number" value={form.canoneNoleggio ?? ''}
                    onChange={(e) => set('canoneNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                  <span className="dm-hint">Addebitato al padroncino</span>
                </div>
              </div>
              <div className="dm-field" style={{ marginTop: 4 }}>
                <label>⚡ Maggiorazione Ricarica (%)</label>
                <input className="dm-input dm-input-small" type="number" placeholder="es. 20"
                  value={form.maggiorazioneRicarica ?? ''}
                  onChange={(e) => set('maggiorazioneRicarica', e.target.value ? parseFloat(e.target.value) : null)} />
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
              <div className="dm-section-title"><span>📅</span> Scadenze</div>
              <div className="dm-field">
                <label>Assicurazione</label>
                <div className="dm-scad-row">
                  <input className="dm-input" type="date"
                    value={form.scadenzaAssicurazione ? form.scadenzaAssicurazione.split('T')[0] : ''}
                    onChange={(e) => set('scadenzaAssicurazione', e.target.value)} />
                  {assInfo && <span className={`dm-scad-badge ${assInfo.cls}`}>{assInfo.label}</span>}
                </div>
              </div>
              <div className="dm-field">
                <label>Revisione</label>
                <div className="dm-scad-row">
                  <input className="dm-input" type="date"
                    value={form.scadenzaRevisione ? form.scadenzaRevisione.split('T')[0] : ''}
                    onChange={(e) => set('scadenzaRevisione', e.target.value)} />
                  {revInfo && <span className={`dm-scad-badge ${revInfo.cls}`}>{revInfo.label}</span>}
                </div>
              </div>
              <div className="dm-field">
                <label>Bollo</label>
                <div className="dm-scad-row">
                  <input className="dm-input" type="date"
                    value={form.scadenzaBollo ? form.scadenzaBollo.split('T')[0] : ''}
                    onChange={(e) => set('scadenzaBollo', e.target.value)} />
                  {bolloInfo && <span className={`dm-scad-badge ${bolloInfo.cls}`}>{bolloInfo.label}</span>}
                </div>
              </div>
              <div className="dm-field">
                <label>Tachigrafo</label>
                <input className="dm-input" type="date"
                  value={form.scadenzaTachigrafo ? form.scadenzaTachigrafo.split('T')[0] : ''}
                  onChange={(e) => set('scadenzaTachigrafo', e.target.value)} />
              </div>
            </div>

            {/* Chilometraggio */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>🛣️</span> Chilometraggio</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>KM Attuali</label>
                  <input className="dm-input" type="number" value={form.kmAttuali ?? ''}
                    onChange={(e) => set('kmAttuali', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="dm-field">
                  <label>KM Limite</label>
                  <input className="dm-input" type="number" value={form.kmLimite ?? ''}
                    onChange={(e) => set('kmLimite', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
              </div>
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

            {/* Padroncino corrente */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>👤</span> Assegnazione Corrente</div>
              {assegnazionAttiva ? (
                <div className="dm-assegn-row dm-assegn-attiva">
                  <div>
                    <span className="dm-assegn-nome">{assegnazionAttiva.padroncino.ragioneSociale}</span>
                    <span className="dm-badge-attiva" style={{ marginLeft: 8 }}>ATTIVA</span>
                  </div>
                  <div className="dm-assegn-date">
                    dal {fmt(assegnazionAttiva.dataInizio)}
                  </div>
                  <button
                    className="btn-outline btn-sm"
                    style={{ color: '#dc2626', borderColor: '#dc2626', marginTop: 8 }}
                    onClick={() => handleChiudiAssegnazione(assegnazionAttiva.id)}
                  >
                    🔓 Chiudi assegnazione
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nessun padroncino assegnato</span>
                  <button className="btn-primary btn-sm" onClick={() => setShowAssegnaModal(true)}>
                    🔗 Assegna Padroncino
                  </button>
                </div>
              )}
            </div>

            {/* Pulsanti azioni */}
            <div className="dm-actions-card">
              <button className="btn-outline" onClick={() => navigate('/flotta')}>← Annulla</button>
              <button className="btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB ASSEGNAZIONI ── */}
      {activeTab === 'assegnazioni' && (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Storico Assegnazioni
            </h3>
            <button className="btn-primary btn-sm" onClick={() => setShowAssegnaModal(true)}>
              🔗 Nuova Assegnazione
            </button>
          </div>
          {!mezzo.assegnazioni || mezzo.assegnazioni.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              Nessuna assegnazione registrata
            </div>
          ) : (
            <div className="dm-assegnazioni-list">
              {mezzo.assegnazioni.map((a) => (
                <div key={a.id} className={`dm-assegn-row ${!a.dataFine ? 'dm-assegn-attiva' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <div>
                      <span className="dm-assegn-nome">{a.padroncino.ragioneSociale}</span>
                      {!a.dataFine && <span className="dm-badge-attiva" style={{ marginLeft: 8 }}>ATTIVA</span>}
                    </div>
                    {!a.dataFine && (
                      <button
                        className="btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#dc2626' }}
                        onClick={() => handleChiudiAssegnazione(a.id)}
                      >
                        🔓 Chiudi
                      </button>
                    )}
                  </div>
                  <div className="dm-assegn-date">
                    {fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : 'in corso'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB LOG ── */}
      {activeTab === 'log' && id && (
        <div style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Log modifiche mezzo
          </h3>
          <LogEntita entityType="mezzo" entityId={id} />
        </div>
      )}

      {/* ── MODALE ASSEGNAZIONE ── */}
      <NuovaAssegnazioneModal
        open={showAssegnaModal}
        onClose={() => setShowAssegnaModal(false)}
        padroncini={padroncini}
        onSave={handleNuovaAssegnazione}
      />
    </div>
  );
}
