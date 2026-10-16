// src/features/mezzi/DettaglioMezzo.tsx — Grafica aggiornata, logica API invariata
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mezziApi, padronciniApi, noteApi, documentiApi } from '../../lib/api';
import type { Mezzo, Padroncino, Nota, Documento } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import ChiudiAssegnazioneModal from '../../components/ui/ChiudiAssegnazioneModal';
import type { ChiudiAssegnazioneTarget } from '../../components/ui/ChiudiAssegnazioneModal';
import LogEntita from '../log/LogEntita';
import TabDocumenti from './TabDocumenti';
import TabManutenzioni from './TabManutenzioni';
import './FlottaMezzi.css';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '';

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
};

const scadenzaInfo = (d: string | null | undefined) => {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0)   return { label: `${Math.abs(diff)}gg fa`, cls: 'dm-scad-expired' };
  if (diff <= 30) return { label: `${diff}gg`,              cls: 'dm-scad-warning' };
  return           { label: `${diff}gg`,                    cls: 'dm-scad-ok'      };
};

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const kmPercent = (km: number | null | undefined, limite: number | null | undefined) =>
  !km || !limite ? 0 : Math.min(100, Math.round((km / limite) * 100));

const kmBarColor = (pct: number) =>
  pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : pct >= 40 ? '#eab308' : '#22c55e';

// ─── MODALE NUOVA ASSEGNAZIONE ────────────────────────────────────────────────

function NuovaAssegnazioneModal({
  open, onClose, padroncini, onSave,
}: {
  open: boolean; onClose: () => void;
  padroncini: Padroncino[];
  onSave: (padroncinoId: string, dataInizio: string) => Promise<void>;
}) {
  const [padroncinoId, setPadroncinoId] = useState('');
  const [dataInizio,   setDataInizio]   = useState(new Date().toISOString().split('T')[0]);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');

  const filtered = padroncini.filter(p =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!padroncinoId || !dataInizio) return;
    setSaving(true);
    try { await onSave(padroncinoId, dataInizio); setPadroncinoId(''); setSearch(''); onClose(); }
    catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova Assegnazione Mezzo" width={500}>
      <div className="ncam-body">
        <div className="ncam-field">
          <label className="ncam-label">Cerca padroncino</label>
          <input className="ncam-input" placeholder="Filtra per nome..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dm-pad-list">
          {filtered.map(p => (
            <div key={p.id} className={`dm-pad-item ${padroncinoId === p.id ? 'dm-pad-selected' : ''}`} onClick={() => setPadroncinoId(p.id)}>
              <span className="dm-pad-name">{p.ragioneSociale}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="dm-pad-empty">Nessun padroncino trovato</div>}
        </div>
        <div className="ncam-field">
          <label className="ncam-label">Data Inizio <span className="ncam-req">*</span></label>
          <input className="ncam-input" type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)} />
        </div>
        <div className="ncam-actions">
          <button className="ncam-btn-cancel" onClick={onClose}>Annulla</button>
          <button className="ncam-btn-save" disabled={!padroncinoId || !dataInizio || saving} onClick={handleSave}>
            {saving ? '⏳ Salvataggio...' : '🔗 Assegna'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODALE CONTRATTO PDA ─────────────────────────────────────────────────────

function ContrattoModal({
  open, onClose, mezzoId, targa, rataDefault, isElettrico,
  padronciniList, defaultPadroncinoId, defaultDataFirma,
}: {
  open: boolean; onClose: () => void; mezzoId: string; targa: string;
  rataDefault?: number | null; isElettrico: boolean; padronciniList: Padroncino[];
  defaultPadroncinoId?: string; defaultDataFirma?: string;
}) {
  const [padroncinoId,  setPadroncinoId]  = useState('');
  const [search,        setSearch]        = useState('');
  const [nomeRapp,      setNomeRapp]      = useState('');
  const [cognomeRapp,   setCognomeRapp]   = useState('');
  const [cfRapp,        setCfRapp]        = useState('');
  const [qualificaRapp, setQualificaRapp] = useState('Amministratore Unico');
  const [dataFirma,     setDataFirma]     = useState(defaultDataFirma ?? new Date().toISOString().split('T')[0]);
  const [rataNoleggio,  setRataNoleggio]  = useState<string>(rataDefault != null ? String(rataDefault) : '');
  const [kmInclusi,     setKmInclusi]     = useState<string>('4000');
  const [eccedenzaKm,   setEccedenzaKm]  = useState<string>('0.10');
  const [generating,    setGenerating]    = useState(false);
  const [errMsg,        setErrMsg]        = useState('');

  const padroncinoSel = padronciniList.find(p => p.id === padroncinoId) ?? null;

  useEffect(() => {
    if (open) {
      if (defaultPadroncinoId) setPadroncinoId(defaultPadroncinoId);
      if (defaultDataFirma)    setDataFirma(defaultDataFirma);
    }
  }, [open]);

  useEffect(() => {
    if (!padroncinoSel) return;
    if (padroncinoSel.rappresentanteNome)      setNomeRapp(padroncinoSel.rappresentanteNome);
    if (padroncinoSel.rappresentanteCognome)   setCognomeRapp(padroncinoSel.rappresentanteCognome);
    if (padroncinoSel.cfRappresentante)        setCfRapp(padroncinoSel.cfRappresentante);
    if (padroncinoSel.qualificaRappresentante) setQualificaRapp(padroncinoSel.qualificaRappresentante);
  }, [padroncinoId]);

  const filtered = padronciniList.filter(p =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()) ||
    p.partitaIva.includes(search),
  );

  const handleGenera = async () => {
    if (!padroncinoId) { setErrMsg('Seleziona un padroncino'); return; }
    setErrMsg(''); setGenerating(true);
    try {
      await mezziApi.generaContrattoPda(mezzoId, {
        padroncinoId, nomeRapp: nomeRapp || undefined, cognomeRapp: cognomeRapp || undefined,
        cfRapp: cfRapp || undefined, qualificaRapp: qualificaRapp || undefined, dataFirma,
        rataNoleggio: rataNoleggio ? parseFloat(rataNoleggio) : undefined,
        kmInclusi: kmInclusi ? parseInt(kmInclusi) : undefined,
        eccedenzaKm: eccedenzaKm ? parseFloat(eccedenzaKm) : undefined,
        _targa: targa, _ragioneSociale: padroncinoSel?.ragioneSociale,
      });
      onClose();
    } catch (e: any) { setErrMsg(e.message || 'Errore generazione contratto'); }
    finally { setGenerating(false); }
  };

  const handleClose = () => {
    setPadroncinoId(''); setSearch(''); setNomeRapp(''); setCognomeRapp('');
    setCfRapp(''); setQualificaRapp('Amministratore Unico');
    setDataFirma(new Date().toISOString().split('T')[0]);
    setRataNoleggio(rataDefault != null ? String(rataDefault) : '');
    setKmInclusi('4000'); setEccedenzaKm('0.10'); setErrMsg(''); onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={isElettrico ? '⚡ Crea Contratto Noleggio Elettrico' : '📄 Crea Contratto Noleggio'} width={620}>
      <div className="ncam-body">

        {/* Mezzo info */}
        <div className="dm-mezzo-info-banner">
          🚚 Mezzo: <strong style={{ fontFamily: 'monospace' }}>{targa}</strong>
          {isElettrico && <span className="dm-elettrico-tag">⚡ Elettrico</span>}
        </div>

        {/* Selezione Padroncino */}
        <div className="ncam-section-label">Padroncino (Noleggiante)</div>
        <div className="ncam-field">
          <input className="ncam-input" placeholder="Filtra per ragione sociale o P.IVA..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dm-pad-list">
          {filtered.map(p => (
            <div key={p.id} className={`dm-pad-item ${padroncinoId === p.id ? 'dm-pad-selected' : ''}`} onClick={() => setPadroncinoId(p.id)}>
              <span className="dm-pad-name">{p.ragioneSociale}</span>
              <span className="dm-pad-piva">P.IVA {p.partitaIva}{p.indirizzo ? ` · ${p.indirizzo}` : ''}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="dm-pad-empty">Nessun padroncino trovato</div>}
        </div>
        {padroncinoSel && (
          <div className="dm-pad-selected-banner">
            ✅ Noleggiante: <strong>{padroncinoSel.ragioneSociale}</strong>
            {padroncinoSel.indirizzo && <span> · {padroncinoSel.indirizzo}</span>}
          </div>
        )}

        {/* Rappresentante Legale */}
        <div className="ncam-section-label">Rappresentante Legale Noleggiante</div>
        <div className="ncam-grid-2">
          <div className="ncam-field"><label className="ncam-label">Nome</label><input className="ncam-input" value={nomeRapp} onChange={e => setNomeRapp(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Cognome</label><input className="ncam-input" value={cognomeRapp} onChange={e => setCognomeRapp(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Codice Fiscale</label><input className="ncam-input ncam-mono" value={cfRapp} onChange={e => setCfRapp(e.target.value.toUpperCase())} /></div>
          <div className="ncam-field">
            <label className="ncam-label">Qualifica</label>
            <select className="ncam-input" value={qualificaRapp} onChange={e => setQualificaRapp(e.target.value)}>
              <option>Amministratore Unico</option>
              <option>Legale Rappresentante</option>
              <option>Socio</option>
              <option>Titolare</option>
              <option>Procuratore</option>
            </select>
          </div>
        </div>

        {/* Dettagli Contratto */}
        <div className="ncam-section-label">Dettagli Contratto</div>
        <div className="ncam-grid-2">
          <div className="ncam-field"><label className="ncam-label">Data Firma</label><input className="ncam-input" type="date" value={dataFirma} onChange={e => setDataFirma(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Rata Mensile (€ + IVA)</label><input className="ncam-input" type="number" step="0.01" placeholder="200.00" value={rataNoleggio} onChange={e => setRataNoleggio(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">KM inclusi/mese</label><input className="ncam-input" type="number" placeholder="4000" value={kmInclusi} onChange={e => setKmInclusi(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Eccedenza (€/km)</label><input className="ncam-input" type="number" step="0.01" placeholder="0.10" value={eccedenzaKm} onChange={e => setEccedenzaKm(e.target.value)} /></div>
        </div>

        {errMsg && <div className="dm-err-msg">⚠️ {errMsg}</div>}

        <div className="ncam-actions">
          <button className="ncam-btn-cancel" onClick={handleClose}>Annulla</button>
          <button className="ncam-btn-save" disabled={!padroncinoId || generating} onClick={handleGenera}>
            {generating ? '⏳ Generazione...' : '📥 Genera e Scarica Contratto'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────

export default function DettaglioMezzo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [mezzo,    setMezzo]    = useState<Mezzo | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [form,     setForm]     = useState<Partial<Mezzo>>({});
  const [dirty,    setDirty]    = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'assegnazioni' | 'documenti' | 'manutenzioni' | 'note' | 'log'>('info');
  const [showAssegnaModal,  setShowAssegnaModal]  = useState(false);
  const [chiudiTarget, setChiudiTarget] = useState<ChiudiAssegnazioneTarget | null>(null);
  const [showContrattoModal,setShowContrattoModal]= useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [noteList,    setNoteList]    = useState<Nota[]>([]);
  const [notaTesto,   setNotaTesto]   = useState('');
  const [notaSaving,  setNotaSaving]  = useState(false);
  const [docs,        setDocs]        = useState<Documento[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [m, pResp, noteResp, docResp] = await Promise.all([
        mezziApi.detail(id),
        padronciniApi.list({ limit: '200' }),
        noteApi.list('mezzo', id, 100),
        documentiApi.list('mezzo', id),
      ]);
      setMezzo(m); setForm(m); setPadroncini(pResp.data); setNoteList(noteResp);
      setDocs(docResp);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  const docCount = docs.length;
  const haContrattoNoleggio = useMemo(() => docs.some(d => d.tipo === 'CONTRATTO'), [docs]);

  const handleAddNota = async () => {
    if (!id || !notaTesto.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'mezzo', entityId: id, contenuto: notaTesto.trim() });
      setNotaTesto('');
      setNoteList(await noteApi.list('mezzo', id, 100));
    } catch (e: any) { alert('Errore salvataggio nota: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const handleDeleteNota = async (notaId: string) => {
    if (!confirm('Eliminare questa nota?')) return;
    try {
      await noteApi.remove(notaId);
      setNoteList(prev => prev.filter(n => n.id !== notaId));
    } catch (e: any) { alert('Errore eliminazione nota: ' + e.message); }
  };

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Mezzo, v: any) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await mezziApi.update(id, {
        targa: form.targa, marca: form.marca, modello: form.modello, tipo: form.tipo,
        alimentazione: form.alimentazione, categoria: form.categoria,
        tipoPossesso: (form as any).tipoPossesso ?? undefined, stato: form.stato,
        annoImmatricolazione: form.annoImmatricolazione ?? undefined,
        telaio: form.telaio ?? undefined, colore: form.colore ?? undefined,
        kmAttuali: form.kmAttuali ?? undefined,
        kmAttualiAl: form.kmAttualiAl ? form.kmAttualiAl.split('T')[0] : null,
        kmLimite: form.kmLimite ?? undefined,
        rataNoleggio: form.rataNoleggio ?? undefined, canoneNoleggio: form.canoneNoleggio ?? undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione || null,
        costoAssicurazione: form.costoAssicurazione ?? null,
        scadenzaRevisione: form.scadenzaRevisione || null, scadenzaBollo: form.scadenzaBollo || null,
        costoRevisione: form.costoRevisione ?? null, costoBollo: form.costoBollo ?? null,
        scadenzaTachigrafo: form.scadenzaTachigrafo || null,
        proprietario: form.proprietario ?? undefined, nContratto: form.nContratto ?? undefined,
        inizioNoleggio: form.inizioNoleggio || null, fineNoleggio: form.fineNoleggio || null,
        maggiorazioneRicarica: form.maggiorazioneRicarica ?? undefined,
        portata: form.portata ?? undefined, volume: form.volume ?? undefined,
        utilizzatore: form.utilizzatore ?? undefined, note: form.note ?? undefined,
      });
      setDirty(false); await load();
    } catch (e: any) { alert('Errore salvataggio: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleNuovaAssegnazione = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await mezziApi.assegna(id, { padroncinoId, dataInizio });
    await load();
  };

  const handleChiudiAssegnazione = (assegnazioneId: string, nome: string, dataInizio: string) => {
    setChiudiTarget({ id: assegnazioneId, nome, dataInizio });
  };

  const confermaChiusura = async (t: ChiudiAssegnazioneTarget, dataFine: string) => {
    await mezziApi.chiudiAssegnazione(t.id, dataFine);
    setChiudiTarget(null);
    await load();
  };

  const handleEliminaAssegnazione = async (assegnazioneId: string, ragioneSociale: string) => {
    if (!window.confirm(`Eliminare definitivamente l'assegnazione a "${ragioneSociale}"?`)) return;
    try { await mezziApi.deleteAssegnazione(assegnazioneId); await load(); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  const handleDuplica = async () => {
    if (!id || !mezzo) return;
    if (!window.confirm(`Duplicare il mezzo "${mezzo.targa}"? Verrà creata una copia con nuova targa (assegnazioni, note, log e documenti non vengono copiati).`)) return;
    setDuplicating(true);
    try {
      const nuovo = await mezziApi.duplica(id);
      navigate(`/flotta/${nuovo.id}`);
    } catch (e: any) { alert('Errore duplicazione: ' + e.message); }
    finally { setDuplicating(false); }
  };

  const handleDelete = async () => {
    if (!id || !mezzo) return;
    if (!window.confirm(`Eliminare il mezzo "${mezzo.targa}"? L'operazione è irreversibile.`)) return;
    try { await mezziApi.delete(id); navigate('/flotta'); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  if (loading) return <div className="fm-page"><div className="fm-loading"><div className="fm-spinner" /><span>Caricamento mezzo...</span></div></div>;
  if (error || !mezzo) return (
    <div className="fm-page"><div className="fm-error">
      <span>⚠️ {error || 'Mezzo non trovato'}</span>
      <button className="fm-btn-outline" onClick={() => navigate(-1)}>← Torna alla lista</button>
    </div></div>
  );

  const assegnazionAttiva = mezzo.assegnazioni?.find(a => !a.dataFine);
  const kmPct   = kmPercent(mezzo.kmAttuali, mezzo.kmLimite);
  const kmColor = kmBarColor(kmPct);
  const revInfo  = scadenzaInfo(mezzo.scadenzaRevisione);
  const assInfo  = scadenzaInfo(mezzo.scadenzaAssicurazione);
  const bolloInfo= scadenzaInfo(mezzo.scadenzaBollo);
  const fineNolDiff = form.fineNoleggio ? daysDiff(form.fineNoleggio) : null;

  const STATO_BADGE_CLS: Record<string, string> = {
    ASSEGNATO: 'fm-badge-assigned', DISPONIBILE: 'fm-badge-available',
    IN_REVISIONE: 'fm-badge-revision', FUORI_SERVIZIO: 'fm-badge-fuori',
    VENDUTO: 'fm-badge-gray', DISMESSO: 'fm-badge-gray',
  };

  const documentoContrattoMancante = !!assegnazionAttiva && !haContrattoNoleggio;

  const TABS = [
    { key: 'info',         label: '📋 Info mezzo'  },
    { key: 'assegnazioni', label: `🔗 Assegnazioni (${mezzo.assegnazioni?.length ?? 0})` },
    {
      key: 'documenti',
      label: `📎 Documenti${docCount > 0 ? ` (${docCount})` : ''}`,
      warn: documentoContrattoMancante,
      warnTitle: 'Mezzo assegnato ma manca il documento del contratto di noleggio',
    },
    { key: 'manutenzioni', label: '🔧 Manutenzioni' },
    { key: 'note',         label: `📝 Note (${noteList.length})` },
    { key: 'log',          label: '📜 Log'          },
  ];

  return (
    <div className="fm-page">
      <ChiudiAssegnazioneModal
        target={chiudiTarget}
        oggetto={`Mezzo ${mezzo.targa}`}
        onClose={() => setChiudiTarget(null)}
        onConfirm={confermaChiusura}
      />

      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="dm-back-btn" onClick={() => navigate(-1)}>← Flotta Mezzi</button>
        <div className="dm-topbar-center">
          <span className="dm-topbar-targa">{mezzo.targa}</span>
          <span className="dm-topbar-sub">{mezzo.marca} {mezzo.modello}</span>
          <span className={`fm-badge ${STATO_BADGE_CLS[mezzo.stato?.toUpperCase()] ?? 'fm-badge-gray'}`}>{mezzo.stato}</span>
          {assegnazionAttiva && (
            <span className="dm-topbar-pad">→ {assegnazionAttiva.padroncino.ragioneSociale}</span>
          )}
        </div>
        <div className="dm-topbar-actions">
          {dirty
            ? <button className="fm-btn-primary" disabled={saving} onClick={handleSave}>{saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}</button>
            : <span className="dm-saved-label">✓ Salvato</span>}
          <button className="fm-btn-outline" disabled={duplicating} onClick={handleDuplica} title="Duplica mezzo">
            {duplicating ? '⏳ Duplicazione...' : '📋 Duplica'}
          </button>
          <button className="dm-delete-btn" onClick={handleDelete} title="Elimina mezzo">🗑 Elimina</button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="dm-tabs-bar">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`dm-tab ${activeTab === t.key ? 'dm-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key as any)}
            title={'warnTitle' in t && t.warn ? t.warnTitle : undefined}
          >
            {t.label}
            {'warn' in t && t.warn && <span className="dm-tab-dot" />}
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
              <div className="dm-section-title">🚚 Identificazione</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Targa</label>
                  <input className="dm-input dm-mono" value={form.targa || ''} onChange={e => set('targa', e.target.value.toUpperCase())} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Stato</label>
                  <select className="dm-select" value={form.stato || ''} onChange={e => set('stato', e.target.value)}>
                    <option value="ASSEGNATO">Assegnato</option>
                    <option value="DISPONIBILE">Disponibile</option>
                    <option value="IN_REVISIONE">In Revisione</option>
                    <option value="FUORI_SERVIZIO">Fuori Servizio</option>
                    <option value="VENDUTO">Venduto</option>
                    <option value="DISMESSO">Dismesso</option>
                  </select>
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Categoria</label>
                  <select className="dm-select" value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}>
                    <option value="DISTRIBUZIONE">🚚 Distribuzione</option>
                    <option value="AUTO_AZIENDALE">🚗 Auto Privata</option>
                    <option value="FLOTTA">🏢 Flotta Aziendale</option>
                  </select>
                </div>
                <div className="dm-field">
                  <label className="dm-label">Tipo Possesso</label>
                  <select className="dm-select" value={(form as any).tipoPossesso || 'NOLEGGIO'} onChange={e => set('tipoPossesso' as any, e.target.value)}>
                    <option value="NOLEGGIO">📄 Noleggio / Leasing</option>
                    <option value="PROPRIETA">🏠 Proprietà</option>
                    <option value="ESTERNO">👤 Esterno / Dipendente</option>
                  </select>
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Tipo</label>
                  <select className="dm-select" value={form.tipo || ''} onChange={e => set('tipo', e.target.value)}>
                    <option value="FURGONE">Furgone</option>
                    <option value="AUTOCARRO">Autocarro</option>
                    <option value="MOTOCICLO">Motociclo</option>
                    <option value="AUTOVETTURA">Autovettura</option>
                    <option value="SEMIRIMORCHIO">Semirimorchio</option>
                  </select>
                </div>
                <div className="dm-field">
                  <label className="dm-label">Alimentazione</label>
                  <select className="dm-select" value={form.alimentazione || ''} onChange={e => set('alimentazione', e.target.value)}>
                    <option value="GASOLIO">Gasolio</option>
                    <option value="BENZINA">Benzina</option>
                    <option value="ELETTRICO">Elettrico</option>
                    <option value="IBRIDO">Ibrido</option>
                    <option value="GPL">GPL</option>
                    <option value="METANO">Metano</option>
                  </select>
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Marca</label>
                  <input className="dm-input" value={form.marca || ''} onChange={e => set('marca', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Modello</label>
                  <input className="dm-input" value={form.modello || ''} onChange={e => set('modello', e.target.value)} />
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Anno Immatricolazione</label>
                  <input className="dm-input" type="number" placeholder="2023"
                    value={form.annoImmatricolazione ?? ''}
                    onChange={e => set('annoImmatricolazione', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Colore</label>
                  <input className="dm-input" value={form.colore || ''} onChange={e => set('colore', e.target.value)} />
                </div>
              </div>
              <div className="dm-field dm-field-full">
                <label className="dm-label">Telaio</label>
                <input className="dm-input dm-mono" value={form.telaio || ''} onChange={e => set('telaio', e.target.value)} />
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Portata (kg)</label>
                  <input className="dm-input" type="number" value={form.portata ?? ''}
                    onChange={e => set('portata', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Volume (M³)</label>
                  <input className="dm-input" type="number" value={form.volume ?? ''}
                    onChange={e => set('volume', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              </div>

            </div>

            {/* Contratto Noleggio */}
            <div className="dm-section-card">
              <div className="dm-section-title-row">
                <span className="dm-section-title">📄 Contratto Noleggio</span>
                <button className="fm-btn-primary fm-btn-sm" onClick={() => setShowContrattoModal(true)}>
                  {mezzo.alimentazione === 'ELETTRICO' ? '⚡' : '📄'} Crea Contratto PDA
                </button>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Proprietario / Società</label>
                  <input className="dm-input" value={form.proprietario || (form as any).societaNoleggio || ''}
                    onChange={e => set('proprietario', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">N° Contratto</label>
                  <input className="dm-input dm-mono" value={form.nContratto || (form as any).riferimentoContratto || ''}
                    onChange={e => set('nContratto', e.target.value)} />
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Inizio Noleggio</label>
                  <input className="dm-input" type="date"
                    value={form.inizioNoleggio ? form.inizioNoleggio.split('T')[0] : ''}
                    onChange={e => set('inizioNoleggio', e.target.value)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Fine Noleggio</label>
                  <input className="dm-input" type="date"
                    value={form.fineNoleggio ? form.fineNoleggio.split('T')[0] : ''}
                    onChange={e => set('fineNoleggio', e.target.value)} />
                  {fineNolDiff !== null && (
                    <span className={`dm-hint ${fineNolDiff < 0 ? 'dm-hint-red' : fineNolDiff <= 30 ? 'dm-hint-amber' : 'dm-hint-green'}`}>
                      {fineNolDiff < 0 ? `Scaduto ${Math.abs(fineNolDiff)}gg fa` : `Scade tra ${fineNolDiff}gg`}
                    </span>
                  )}
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">Canone Nostro (€)</label>
                  <input className="dm-input" type="number" value={form.canoneNoleggio ?? ''}
                    onChange={e => set('canoneNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                  <span className="dm-hint">Quanto paghiamo noi al locatore</span>
                </div>
                <div className="dm-field">
                  <label className="dm-label">Rata Padroncino (€)</label>
                  <input className="dm-input" type="number" value={form.rataNoleggio ?? ''}
                    onChange={e => set('rataNoleggio', e.target.value ? parseFloat(e.target.value) : null)} />
                  <span className="dm-hint">Addebitato al padroncino</span>
                </div>
              </div>
              <div className="dm-field">
                <label className="dm-label">⚡ Maggiorazione Ricarica (%)</label>
                <input className="dm-input" style={{ maxWidth: 140 }} type="number" placeholder="es. 20"
                  value={form.maggiorazioneRicarica ?? ''}
                  onChange={e => set('maggiorazioneRicarica', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="dm-riepilogo">
                <div className="dm-riep-row"><span>Canone nostro</span><span className="dm-riep-val">{fmtEur(form.canoneNoleggio)}</span></div>
                <div className="dm-riep-row"><span>Rata padroncino</span><span className="dm-riep-val dm-riep-green">{fmtEur(form.rataNoleggio)}</span></div>
                <div className="dm-riep-row">
                  <span>Rata + IVA 22%</span>
                  <span className="dm-riep-val dm-riep-green">{form.rataNoleggio ? fmtEur(form.rataNoleggio * 1.22) : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── COLONNA DX ── */}
          <div className="dm-col-right">

            {/* Scadenze */}
            <div className="dm-section-card">
              <div className="dm-section-title">📅 Scadenze</div>
              {[
                { label: 'Assicurazione', field: 'scadenzaAssicurazione', costField: 'costoAssicurazione', info: assInfo },
                { label: 'Revisione',     field: 'scadenzaRevisione',     costField: 'costoRevisione',     info: revInfo  },
                { label: 'Bollo',         field: 'scadenzaBollo',         costField: 'costoBollo',         info: bolloInfo },
                { label: 'Tachigrafo',    field: 'scadenzaTachigrafo',    costField: null,                 info: null },
              ].map(({ label, field, costField, info }) => (
                <div key={field} className="dm-field">
                  <label className="dm-label">{label}</label>
                  <div className="dm-scad-row">
                    <input className="dm-input dm-scad-date" type="date"
                      value={(form as any)[field] ? (form as any)[field].split('T')[0] : ''}
                      onChange={e => set(field as keyof Mezzo, e.target.value || null)} />
                    {costField && (
                      <div className="dm-scad-cost-col">
                        <label className="dm-label dm-label-sub">Costo {label}</label>
                        <input className="dm-input dm-scad-cost" type="number" step="0.01" placeholder="€"
                          value={(form as any)[costField] ?? ''}
                          onChange={e => set(costField as keyof Mezzo, e.target.value ? parseFloat(e.target.value) : null)} />
                      </div>
                    )}
                    {info && <span className={`dm-scad-badge ${info.cls}`}>{info.label}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Chilometraggio */}
            <div className="dm-section-card">
              <div className="dm-section-title">🛣️ Chilometraggio</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label className="dm-label">KM Attuali</label>
                  <input className="dm-input" type="number" value={form.kmAttuali ?? ''}
                    onChange={e => set('kmAttuali', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">Aggiornati al</label>
                  <input className="dm-input" type="date"
                    value={form.kmAttualiAl ? form.kmAttualiAl.split('T')[0] : ''}
                    onChange={e => set('kmAttualiAl', e.target.value || null)} />
                </div>
                <div className="dm-field">
                  <label className="dm-label">KM Limite</label>
                  <input className="dm-input" type="number" value={form.kmLimite ?? ''}
                    onChange={e => set('kmLimite', e.target.value ? parseInt(e.target.value) : null)} />
                </div>
              </div>
              {mezzo.kmLimite ? (
                <div className="dm-km-box">
                  <div className="dm-km-header">
                    <span className="dm-km-label">{(mezzo.kmAttuali ?? 0).toLocaleString('it-IT')} km</span>
                    <span className="dm-km-pct" style={{ color: kmColor }}>{kmPct}%</span>
                  </div>
                  <div className="dm-km-bar-bg">
                    <div className="dm-km-bar-fill" style={{ width: `${kmPct}%`, background: kmColor }} />
                  </div>
                  <div className="dm-km-footer">
                    <span>Limite: {mezzo.kmLimite.toLocaleString('it-IT')} km</span>
                    <span>Rimasti: {((mezzo.kmLimite ?? 0) - (mezzo.kmAttuali ?? 0)).toLocaleString('it-IT')} km</span>
                  </div>
                  {mezzo.kmAttualiAl && (
                    <span className="dm-hint" style={{ marginTop: 4 }}>Aggiornati al {new Date(mezzo.kmAttualiAl).toLocaleDateString('it-IT')}</span>
                  )}
                </div>
              ) : null}
            </div>

            {/* Assegnazione corrente */}
            <div className="dm-section-card">
              <div className="dm-section-title">👤 Assegnazione Corrente</div>
              {assegnazionAttiva ? (
                <div className="dm-assegn-card dm-assegn-attiva">
                  <div className="dm-assegn-top">
                    <span className="dm-assegn-nome">{assegnazionAttiva.padroncino.ragioneSociale}</span>
                    <span className="dm-attiva-badge">ATTIVA</span>
                  </div>
                  <span className="dm-assegn-date">dal {fmt(assegnazionAttiva.dataInizio)}</span>
                  <button className="dm-chiudi-btn" onClick={() => handleChiudiAssegnazione(assegnazionAttiva.id, assegnazionAttiva.padroncino.ragioneSociale, assegnazionAttiva.dataInizio)}>
                    🔓 Chiudi assegnazione
                  </button>
                </div>
              ) : form.utilizzatore ? (
                <div className="dm-assegn-card dm-assegn-attiva">
                  <div className="dm-assegn-top">
                    <span className="dm-assegn-nome">{form.utilizzatore}</span>
                    <span className="dm-attiva-badge">DIPENDENTE</span>
                  </div>
                  <span className="dm-assegn-date">Auto aziendale in uso al dipendente</span>
                </div>
              ) : (
                <div className="dm-no-assegn">
                  <span>Nessun padroncino assegnato</span>
                  <button className="fm-btn-primary fm-btn-sm" onClick={() => setShowAssegnaModal(true)}>🔗 Assegna Padroncino</button>
                </div>
              )}
              <div className="dm-field" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e5e7eb' }}>
                <label className="dm-label">Utilizzatore dipendente (auto aziendale)</label>
                <input className="dm-input" placeholder="Nome e cognome del dipendente…"
                  value={form.utilizzatore || ''}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => {
                      const next = { ...f, utilizzatore: v };
                      if (!assegnazionAttiva) next.stato = v.trim() ? 'ASSEGNATO' : 'DISPONIBILE';
                      return next;
                    });
                    setDirty(true);
                  }}
                  disabled={!!assegnazionAttiva}
                  title={assegnazionAttiva ? 'Chiudi prima l\'assegnazione al padroncino' : ''} />
                <span className="dm-hint">Compilando questo campo il mezzo risulta ASSEGNATO al dipendente.</span>
              </div>
            </div>

            {/* Pulsanti azioni */}
            <div className="dm-actions-row">
              <button className="fm-btn-outline" onClick={() => navigate(-1)}>← Annulla</button>
              <button className="fm-btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB ASSEGNAZIONI ── */}
      {activeTab === 'assegnazioni' && (
        <div className="dm-tab-body">
          <div className="dm-tab-header">
            <h3 className="dm-tab-title">Storico Assegnazioni</h3>
            <button className="fm-btn-primary fm-btn-sm" onClick={() => setShowAssegnaModal(true)}>🔗 Nuova Assegnazione</button>
          </div>
          {!mezzo.assegnazioni || mezzo.assegnazioni.length === 0 ? (
            <div className="dm-empty-state">Nessuna assegnazione registrata</div>
          ) : (
            <div className="dm-assegnazioni-list">
              {mezzo.assegnazioni.map(a => (
                <div key={a.id} className={`dm-assegn-card ${!a.dataFine ? 'dm-assegn-attiva' : ''}`}>
                  <div className="dm-assegn-top">
                    <span className="dm-assegn-nome">{a.padroncino.ragioneSociale}</span>
                    {!a.dataFine && <span className="dm-attiva-badge">ATTIVA</span>}
                    <div className="dm-assegn-btns">
                      {!a.dataFine && (
                        <button className="dm-chiudi-btn" onClick={() => handleChiudiAssegnazione(a.id, a.padroncino.ragioneSociale, a.dataInizio)}>🔓 Chiudi</button>
                      )}
                      <button className="dm-del-assegn-btn" title="Elimina dall'archivio" onClick={() => handleEliminaAssegnazione(a.id, a.padroncino.ragioneSociale)}>🗑️</button>
                    </div>
                  </div>
                  <span className="dm-assegn-date">{fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : 'in corso'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB DOCUMENTI ── */}
      {activeTab === 'documenti' && id && <TabDocumenti mezzoId={id} onDocsChange={setDocs} />}

      {/* ── TAB MANUTENZIONI ── */}
      {activeTab === 'manutenzioni' && id && <TabManutenzioni mezzoId={id} />}

      {/* ── TAB NOTE ── */}
      {activeTab === 'note' && (
        <div className="dm-tab-body">
          <div className="dm-note-add-form">
            <textarea
              className="dm-note-textarea"
              rows={3}
              placeholder="Scrivi una nota su questo mezzo…"
              value={notaTesto}
              onChange={e => setNotaTesto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNota(); }}
            />
            <div className="dm-note-form-footer">
              <span className="dm-note-hint">Ctrl+Invio per salvare</span>
              <button className="dm-note-submit" onClick={handleAddNota} disabled={notaSaving || !notaTesto.trim()}>
                {notaSaving ? 'Salvo…' : '+ Aggiungi nota'}
              </button>
            </div>
          </div>
          {noteList.length === 0
            ? <div className="dm-note-empty">Nessuna nota registrata.</div>
            : noteList.map(n => (
              <div key={n.id} className={`dm-note-card${n.contenuto.startsWith('[Nota originale]') ? ' dm-note-card-legacy' : ''}`}>
                <div className="dm-note-card-header">
                  <span className="dm-note-avatar">{n.user ? (n.user.nome?.[0] ?? '') + (n.user.cognome?.[0] ?? '') : '?'}</span>
                  <div className="dm-note-card-meta">
                    <span className="dm-note-author">{n.user ? `${n.user.nome} ${n.user.cognome}` : 'Sistema'}</span>
                    <span className="dm-note-ts">{new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <button className="dm-note-del" onClick={() => handleDeleteNota(n.id)} title="Elimina nota">✕</button>
                </div>
                <p className="dm-note-body">{n.contenuto}</p>
              </div>
            ))
          }
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

      {/* ── MODALI ── */}
      <NuovaAssegnazioneModal
        open={showAssegnaModal}
        onClose={() => setShowAssegnaModal(false)}
        padroncini={padroncini}
        onSave={handleNuovaAssegnazione}
      />
      {id && mezzo && (
        <ContrattoModal
          open={showContrattoModal}
          onClose={() => setShowContrattoModal(false)}
          mezzoId={id}
          targa={mezzo.targa}
          rataDefault={mezzo.rataNoleggio}
          isElettrico={mezzo.alimentazione === 'ELETTRICO'}
          padronciniList={padroncini}
          defaultPadroncinoId={mezzo.assegnazioni?.find(a => !a.dataFine)?.padroncino.id}
        />
      )}
    </div>
  );
}
