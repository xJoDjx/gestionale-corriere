// src/features/padroncini/Padroncini.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  padronciniApi, mezziApi, palmariApi, codiciAutistaApi,
  type Padroncino, type PadronciniStats,
} from '../../lib/api';
import Modal from '../../components/ui/Modal';
import LogEntita from '../log/LogEntita';
import './Padroncini.css';

// ─── HELPERS ──────────────────────────────────────────
const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function scadenzaInfo(date?: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const label = d.toLocaleDateString('it-IT');
  if (diff < 0) return { label, giorni: `${Math.abs(diff)}gg fa`, cls: 'pd-scad-expired' };
  if (diff <= 30) return { label, giorni: `${diff}gg`, cls: 'pd-scad-warning' };
  if (diff <= 90) return { label, giorni: `${diff}gg`, cls: 'pd-scad-near' };
  return { label, giorni: `${diff}gg`, cls: 'pd-scad-ok' };
}

interface NuovoPadroncino {
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

const EMPTY_P: NuovoPadroncino = {
  ragioneSociale: '', partitaIva: '', codiceFiscale: '', indirizzo: '',
  telefono: '', email: '', pec: '', iban: '', scadenzaDurc: '', scadenzaDvr: '', note: '',
};

// ─── MODALE ASSEGNA ───────────────────────────────────
interface AssegnaModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, dataInizio: string) => Promise<void>;
  title: string;
  items: Array<{ id: string; label: string; sub?: string }>;
}

function AssegnaModal({ open, onClose, onSave, title, items }: AssegnaModalProps) {
  const [selectedId, setSelectedId] = useState('');
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = items.filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase()) ||
    (i.sub ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!selectedId || !dataInizio) return;
    setSaving(true);
    try {
      await onSave(selectedId, dataInizio);
      setSelectedId('');
      setSearch('');
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-field">
          <label className="form-label">Cerca</label>
          <input
            className="form-input"
            placeholder="Filtra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nessun elemento disponibile
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selectedId === item.id ? 'rgba(99,102,241,.1)' : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: selectedId === item.id ? 'var(--primary)' : 'var(--text-primary)' }}>
                  {item.label}
                </span>
                {item.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.sub}</span>}
              </div>
            ))
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
            onClick={handleSave}
            disabled={!selectedId || !dataInizio || saving}
          >
            {saving ? 'Salvataggio...' : '🔗 Assegna'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODALE NUOVO PADRONCINO ──────────────────────────
function NuovoPadroncinoModal({
  open, onClose, onSave,
}: {
  open: boolean; onClose: () => void; onSave: (d: NuovoPadroncino) => void;
}) {
  const [form, setForm] = useState<NuovoPadroncino>(EMPTY_P);
  const set = (k: keyof NuovoPadroncino, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const handleClose = () => { setForm(EMPTY_P); onClose(); };
  const handleSave = () => { if (!form.ragioneSociale.trim()) return; onSave(form); setForm(EMPTY_P); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Nuovo Padroncino" width={640}>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="form-field span-2">
          <label className="form-label">Ragione Sociale <span className="req">*</span></label>
          <input className="form-input" value={form.ragioneSociale} onChange={(e) => set('ragioneSociale', e.target.value)} placeholder="Es: Mario Rossi Trasporti SRL" />
        </div>
        <div className="form-field"><label className="form-label">Partita IVA</label><input className="form-input" value={form.partitaIva} onChange={(e) => set('partitaIva', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">Cod. Fiscale</label><input className="form-input" value={form.codiceFiscale} onChange={(e) => set('codiceFiscale', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">Telefono</label><input className="form-input" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">PEC</label><input className="form-input" value={form.pec} onChange={(e) => set('pec', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">IBAN</label><input className="form-input" value={form.iban} onChange={(e) => set('iban', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">Scad. DURC</label><input className="form-input" type="date" value={form.scadenzaDurc} onChange={(e) => set('scadenzaDurc', e.target.value)} /></div>
        <div className="form-field"><label className="form-label">Scad. DVR</label><input className="form-input" type="date" value={form.scadenzaDvr} onChange={(e) => set('scadenzaDvr', e.target.value)} /></div>
        <div className="form-field span-2"><label className="form-label">Indirizzo</label><input className="form-input" value={form.indirizzo} onChange={(e) => set('indirizzo', e.target.value)} /></div>
        <div className="form-field span-2"><label className="form-label">Note</label><textarea className="form-textarea" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} /></div>
      </div>
      <div className="form-actions">
        <button className="btn-outline" onClick={handleClose}>Annulla</button>
        <button className="btn-primary" onClick={handleSave}>💾 Salva</button>
      </div>
    </Modal>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────
export default function PadronciniPage() {
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [stats, setStats] = useState<PadronciniStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('info');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'TUTTI' | 'ATTIVO' | 'DISMESSO'>('TUTTI');
  const [showNuovo, setShowNuovo] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, statsRes] = await Promise.all([
        padronciniApi.list({ limit: '200' }),
        padronciniApi.stats(),
      ]);
      setPadroncini(listRes.data);
      setStats(statsRes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return padroncini.filter((p) => {
      const matchSearch = !s ||
        p.ragioneSociale.toLowerCase().includes(s) ||
        (p.codice ?? '').toLowerCase().includes(s);
      const matchFiltro =
        filtro === 'TUTTI' ||
        (filtro === 'ATTIVO' && p.attivo) ||
        (filtro === 'DISMESSO' && !p.attivo);
      return matchSearch && matchFiltro;
    });
  }, [padroncini, search, filtro]);

  const selectedP = padroncini.find((p) => p.id === selected) ?? null;

  const handleCreate = async (form: NuovoPadroncino) => {
    try {
      const nuovo = await padronciniApi.create({
        ragioneSociale: form.ragioneSociale,
        partitaIva: form.partitaIva,
        codiceFiscale: form.codiceFiscale || undefined,
        indirizzo: form.indirizzo || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        pec: form.pec || undefined,
        iban: form.iban || undefined,
        scadenzaDurc: form.scadenzaDurc || undefined,
        scadenzaDvr: form.scadenzaDvr || undefined,
        note: form.note || undefined,
      });
      await load();
      setSelected(nuovo.id);
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div className="pd-page">
      <div className="pd-loading"><div className="pd-spinner" /><span>Caricamento padroncini...</span></div>
    </div>
  );
  if (error) return (
    <div className="pd-page">
      <div className="pd-error">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="pd-page">
      <div className="pd-page-header">
        <h1>Padroncini</h1>
        <div className="pd-page-stats">
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.attivi ?? padroncini.filter(p => p.attivo).length}</span>
            <span className="pd-page-stat-label">PADRONCINI ATTIVI</span>
            <span className="pd-page-stat-sub">{stats?.dismissi ?? 0} dismessi · {stats?.totali ?? padroncini.length} totali</span>
          </div>
          <div className="pd-page-stat pd-page-stat-alert">
            <span className="pd-page-stat-val pd-page-stat-val-red">{stats?.alertDocumenti ?? 0}</span>
            <span className="pd-page-stat-label">ALERT DOCUMENTI</span>
            <span className="pd-page-stat-sub">DURC · DVR</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.flottaMezzi ?? 0}</span>
            <span className="pd-page-stat-label">FLOTTA MEZZI</span>
            <span className="pd-page-stat-sub">{stats?.flottaMezzi ?? 0} totali · {stats?.flottaDisponibili ?? 0} disponibili</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.palmariAttivi ?? 0}</span>
            <span className="pd-page-stat-label">PALMARI ATTIVI</span>
            <span className="pd-page-stat-sub">su {stats?.palmariTotali ?? 0} totali</span>
          </div>
        </div>
      </div>

      <div className="pd-toolbar">
        <div className="pd-search-wrap">
          <span>🔍</span>
          <input className="pd-search" placeholder="Cerca padroncino per nome o codice..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pd-filters">
          {(['TUTTI', 'ATTIVO', 'DISMESSO'] as const).map((f) => (
            <button key={f} className={`pd-filter-btn ${filtro === f ? 'pd-filter-active' : ''}`} onClick={() => setFiltro(f)}>{f}</button>
          ))}
        </div>
        <button className="btn-primary pd-nuovo-btn" onClick={() => setShowNuovo(true)}>+ Nuovo</button>
      </div>

      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              <th>PADRONCINO</th>
              <th>STATO</th>
              <th>DURC</th>
              <th>DVR</th>
              <th>PALMARI</th>
              <th>MEZZI</th>
              <th>AUTISTI</th>
              <th>FATTURATO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="pd-empty-row">Nessun padroncino trovato</td></tr>
            )}
            {filtered.map((p) => {
              const durc = scadenzaInfo(p.scadenzaDurc);
              const dvr  = scadenzaInfo(p.scadenzaDvr);
              const durcLabel = !p.scadenzaDurc ? 'ASSENTE' :
                durc?.cls === 'pd-scad-expired' ? 'SCADUTO' :
                durc?.cls === 'pd-scad-warning' ? 'IN SCADENZA' : 'REGOLARE';
              const dvrLabel = !p.scadenzaDvr ? 'ASSENTE' :
                dvr?.cls === 'pd-scad-expired' ? 'ASSENTE' : 'PRESENTE';
              const durcCls = durcLabel === 'SCADUTO' ? 'pd-doc-expired' :
                durcLabel === 'IN SCADENZA' ? 'pd-doc-warning' :
                durcLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';
              const dvrCls = dvrLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';
              return (
                <tr key={p.id} className={`pd-row ${selected === p.id ? 'pd-row-selected' : ''}`} onClick={() => { setSelected(p.id); setTab('info'); }}>
                  <td>
                    <div className="pd-name">{p.ragioneSociale}</div>
                    {p.codice && <div className="pd-codice">#{p.codice}</div>}
                  </td>
                  <td>
                    <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
                      {p.attivo ? 'ATTIVO' : 'DISMESSO'}
                    </span>
                  </td>
                  <td><span className={`pd-doc-badge ${durcCls}`}>{durcLabel}</span></td>
                  <td><span className={`pd-doc-badge ${dvrCls}`}>{dvrLabel}</span></td>
                  <td><span className="pd-count pd-count-blue">{p.palmariAssegnati?.length ?? 0}</span></td>
                  <td><span className="pd-count pd-count-blue">{p.mezziAssegnati?.length ?? 0}</span></td>
                  <td><span className="pd-count pd-count-blue">{p.codiciAutista?.length ?? 0}</span></td>
                  <td><span className="pd-fatturato">{fmtEur(p.fatturatoMese ?? 0)}</span></td>
                  <td>
                    <button className="btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setSelected(p.id); setTab('info'); }}>Dettagli</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pd-table-footer">{filtered.length} di {padroncini.length} padroncini</div>
      </div>

      {selectedP && (
        <PadroncinoDetail p={selectedP} tab={tab} setTab={setTab} onRefresh={load} />
      )}

      <NuovoPadroncinoModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleCreate} />
    </div>
  );
}

// ─── DETTAGLIO PADRONCINO ─────────────────────────────
function PadroncinoDetail({
  p: initialP,
  tab,
  setTab,
  onRefresh,
}: {
  p: Padroncino;
  tab: string;
  setTab: (t: any) => void;
  onRefresh: () => void;
}) {
  const [p, setP] = useState(initialP);

  // Scarica tutti i dettagli strutturati (mezziAssegnati, palmariAssegnati, codiciAutista mappati)
  const fetchDetail = useCallback(async () => {
    try {
      const updated = await padronciniApi.detail(initialP.id);
      setP(updated);
    } catch (error) {
      console.error("Errore durante il caricamento del dettaglio:", error);
    }
  }, [initialP.id]);

  // Sincronizza lo stato locale e carica i dettagli approfonditi all'apertura
  useEffect(() => {
    setP(initialP);
    fetchDetail();
  }, [initialP.id, fetchDetail]);

  const handleRefresh = useCallback(async () => {
    await fetchDetail(); // Aggiorna pannello dettaglio
    onRefresh();         // Aggiorna lista in background
  }, [fetchDetail, onRefresh]);

  const durc = scadenzaInfo(p.scadenzaDurc);
  const dvr = scadenzaInfo(p.scadenzaDvr);

  const TABS = [
    { key: 'info', label: 'Anagrafica' },
    { key: 'mezzi', label: `Mezzi (${p.mezziAssegnati?.length ?? 0})` },
    { key: 'palmari', label: `Palmari (${p.palmariAssegnati?.length ?? 0})` },
    { key: 'autisti', label: `Autisti (${p.codiciAutista?.length ?? 0})` },
    { key: 'storico', label: 'Storico' },
    { key: 'log', label: 'Log' },
  ];

  const durcLabel = !p.scadenzaDurc ? 'ASSENTE' :
    durc?.cls === 'pd-scad-expired' ? 'SCADUTO' :
    durc?.cls === 'pd-scad-warning' ? 'IN SCADENZA' : 'REGOLARE';

  const durcCls = durcLabel === 'SCADUTO' ? 'pd-doc-expired' :
    durcLabel === 'IN SCADENZA' ? 'pd-doc-warning' :
    durcLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';

  return (
    <div className="pd-detail-panel">
      <div className="pd-detail-header">
        <div className="pd-detail-title-row">
          <div>
            <h2 className="pd-detail-title">{p.ragioneSociale}</h2>
            {p.codice && <span className="pd-detail-codice">Cod. {p.codice}</span>}
          </div>
          <div className="pd-detail-badges">
            <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
              {p.attivo ? 'ATTIVO' : 'DISMESSO'}
            </span>
            <span className={`pd-doc-badge ${durcCls}`}>DURC: {durcLabel}</span>
            <span className={`pd-doc-badge ${p.scadenzaDvr ? 'pd-doc-ok' : 'pd-doc-absent'}`}>
              DVR: {p.scadenzaDvr ? 'PRESENTE' : 'ASSENTE'}
            </span>
            {p.fatturatoMese != null && (
              <span className="pd-detail-fatt">Fatt. {fmtEur(p.fatturatoMese)}</span>
            )}
          </div>
        </div>
        <div className="pd-detail-actions">
          <button className="btn-outline btn-sm">✏️ Modifica</button>
          <button className="btn-outline btn-sm">📊 Conteggio</button>
        </div>
      </div>

      <div className="pd-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pd-tab ${tab === t.key ? 'pd-tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pd-tab-body">
        {tab === 'info' && <TabInfo p={p} />}
        {tab === 'mezzi' && <TabMezzi p={p} onRefresh={handleRefresh} />}
        {tab === 'palmari' && <TabPalmari p={p} onRefresh={handleRefresh} />}
        {tab === 'autisti' && <TabAutisti p={p} onRefresh={handleRefresh} />}
        {tab === 'storico' && <div className="pd-empty-tab">Sezione storico conteggi in sviluppo</div>}
        {tab === 'log' && <LogEntita entityType="padroncino" entityId={p.id} />}
      </div>
    </div>
  );
}

// ─── FIELD ────────────────────────────────────────────
function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="pd-field">
      <span className="pd-field-label">{label}</span>
      <span className={`pd-field-val ${mono ? 'pd-mono' : ''} ${!value ? 'pd-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── TAB INFO ─────────────────────────────────────────
function TabInfo({ p }: { p: Padroncino }) {
  const durc = scadenzaInfo(p.scadenzaDurc);
  const dvr  = scadenzaInfo(p.scadenzaDvr);
  return (
    <div className="pd-info-grid">
      <div className="pd-section">
        <h4>Dati Aziendali</h4>
        <Field label="Ragione Sociale" value={p.ragioneSociale} />
        <Field label="Partita IVA" value={p.partitaIva} mono />
        <Field label="Codice Fiscale" value={p.codiceFiscale} mono />
      </div>
      <div className="pd-section">
        <h4>Contatti</h4>
        <Field label="Indirizzo" value={p.indirizzo} />
        <Field label="Telefono" value={p.telefono} />
        <Field label="Email" value={p.email} />
        <Field label="PEC" value={p.pec} />
      </div>
      <div className="pd-section">
        <h4>Dati Bancari</h4>
        <Field label="IBAN" value={p.iban} mono />
      </div>
      <div className="pd-section">
        <h4>Scadenze Documenti</h4>
        <div className="pd-scadenze">
          <div className={`pd-scad-row ${durc?.cls || 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DURC</span>
            <span className="pd-scad-date">{durc?.label || '—'}</span>
            {durc && <span className="pd-scad-days">{durc.giorni}</span>}
          </div>
          <div className={`pd-scad-row ${dvr?.cls || 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DVR</span>
            <span className="pd-scad-date">{dvr?.label || '—'}</span>
            {dvr && <span className="pd-scad-days">{dvr.giorni}</span>}
          </div>
        </div>
      </div>
      {p.note && (
        <div className="pd-section pd-section-full">
          <h4>Note</h4>
          <p className="pd-note-text">{p.note}</p>
        </div>
      )}
    </div>
  );
}

// ─── TAB MEZZI ────────────────────────────────────────
function TabMezzi({ p, onRefresh }: { p: Padroncino; onRefresh: () => void }) {
  const [showAssegna, setShowAssegna] = useState(false);
  const [mezziDisp, setMezziDisp] = useState<Array<{ id: string; label: string; sub?: string }>>([]);

  const loadMezziDisp = async () => {
    try {
      const res = await mezziApi.list({ stato: 'DISPONIBILE', limit: '200' });
      setMezziDisp(res.data.map((m: any) => ({
        id: m.id,
        label: `${m.targa} — ${m.marca} ${m.modello}`,
        sub: m.alimentazione,
      })));
    } catch { /* ignora */ }
  };

  const handleAssegna = async (mezzoId: string, dataInizio: string) => {
    await padronciniApi.assegnaMezzo(p.id, { mezzoId, dataInizio });
    await onRefresh();
  };

  return (
    <div>
      <div className="pd-tab-actions">
        <button
          className="btn-primary btn-sm"
          onClick={() => { loadMezziDisp(); setShowAssegna(true); }}
        >
          🔗 Assegna Mezzo
        </button>
      </div>

      {(!p.mezziAssegnati || p.mezziAssegnati.length === 0) ? (
        <EmptyTab icon="🚚" msg="Nessun mezzo assegnato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr>
                <th>TARGA</th>
                <th>MARCA / MODELLO</th>
                <th>TIPO</th>
                <th>DATA INIZIO</th>
                <th>TARIFFA (IMP.)</th>
                <th>TARIFFA (IVATA)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {p.mezziAssegnati.map((m) => (
                <tr key={m.id} className="pd-item-row">
                  <td className="pd-item-targa">{m.targa}</td>
                  <td>
                    <span className="pd-item-marca">{m.marca}</span>{' '}
                    <span className="pd-item-modello">{m.modello}</span>
                  </td>
                  <td>{m.alimentazione}</td>
                  <td>{m.dataInizio ? new Date(m.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
                  <td>{m.tariffa != null ? fmtEur(m.tariffa) : <span className="pd-empty">—</span>}</td>
                  <td>{m.tariffaIvata != null ? fmtEur(m.tariffaIvata) : <span className="pd-empty">—</span>}</td>
                  <td><button className="btn-primary btn-sm">Dettaglio</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssegnaModal
        open={showAssegna}
        onClose={() => setShowAssegna(false)}
        onSave={handleAssegna}
        title="Assegna Mezzo a Padroncino"
        items={mezziDisp}
      />
    </div>
  );
}

// ─── TAB PALMARI ──────────────────────────────────────
function TabPalmari({ p, onRefresh }: { p: Padroncino; onRefresh: () => void }) {
  const [showAssegna, setShowAssegna] = useState(false);
  const [palmariDisp, setPalmariDisp] = useState<Array<{ id: string; label: string; sub?: string }>>([]);

  const loadPalmariDisp = async () => {
    try {
      const res = await palmariApi.list({ stato: 'DISPONIBILE', limit: '200' });
      setPalmariDisp(res.data.map((pal: any) => ({
        id: pal.id,
        label: pal.codice,
        sub: [pal.marca, pal.modello].filter(Boolean).join(' ') || undefined,
      })));
    } catch { /* ignora */ }
  };

  const handleAssegna = async (palmareId: string, dataInizio: string) => {
    await padronciniApi.assegnaPalmare(p.id, { palmareId, dataInizio });
    await onRefresh();
  };

  return (
    <div>
      <div className="pd-tab-actions">
        <button
          className="btn-primary btn-sm"
          onClick={() => { loadPalmariDisp(); setShowAssegna(true); }}
        >
          🔗 Assegna Palmare
        </button>
      </div>

      {(!p.palmariAssegnati || p.palmariAssegnati.length === 0) ? (
        <EmptyTab icon="📱" msg="Nessun palmare assegnato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr>
                <th>CODICE</th>
                <th>TARIFFA</th>
                <th>DATA INIZIO</th>
                <th>FINE</th>
              </tr>
            </thead>
            <tbody>
              {p.palmariAssegnati.map((pal) => (
                <tr key={pal.id} className="pd-item-row">
                  <td className="pd-item-targa">{pal.codice}</td>
                  <td>{pal.tariffa != null ? fmtEur(pal.tariffa) : '—'}</td>
                  <td>{pal.dataInizio ? new Date(pal.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
                  <td>{pal.dataFine ? new Date(pal.dataFine).toLocaleDateString('it-IT') : <span className="pd-empty">Attivo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssegnaModal
        open={showAssegna}
        onClose={() => setShowAssegna(false)}
        onSave={handleAssegna}
        title="Assegna Palmare a Padroncino"
        items={palmariDisp}
      />
    </div>
  );
}

// ─── TAB AUTISTI ──────────────────────────────────────
function TabAutisti({ p, onRefresh }: { p: Padroncino; onRefresh: () => void }) {
  const [showAssegna, setShowAssegna] = useState(false);
  const [autistiDisp, setAutistiDisp] = useState<Array<{ id: string; label: string; sub?: string }>>([]);

  const loadAutistiDisp = async () => {
    try {
      const res = await codiciAutistaApi.list({ limit: '200' });
      const liberi = res.data.filter((a: any) =>
        !a.assegnazioni?.some((x: any) => !x.dataFine),
      );
      setAutistiDisp(liberi.map((a: any) => ({
        id: a.id,
        label: a.codice,
        sub: [a.nome, a.cognome].filter(Boolean).join(' ') || undefined,
      })));
    } catch { /* ignora */ }
  };

  const handleAssegna = async (codiceAutistaId: string, dataInizio: string) => {
    await padronciniApi.assegnaCodice(p.id, { codiceAutistaId, dataInizio });
    await onRefresh();
  };

  return (
    <div>
      <div className="pd-tab-actions">
        <button
          className="btn-primary btn-sm"
          onClick={() => { loadAutistiDisp(); setShowAssegna(true); }}
        >
          🔗 Assegna Autista
        </button>
      </div>

      {(!p.codiciAutista || p.codiciAutista.length === 0) ? (
        <EmptyTab icon="👤" msg="Nessun autista assegnato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr>
                <th>CODICE</th>
                <th>NOME</th>
                <th>COGNOME</th>
                <th>DATA INIZIO</th>
                <th>FINE</th>
              </tr>
            </thead>
            <tbody>
              {p.codiciAutista.map((a) => (
                <tr key={a.id} className="pd-item-row">
                  <td className="pd-item-targa">{a.codice}</td>
                  <td>{a.nome || '—'}</td>
                  <td>{a.cognome || '—'}</td>
                  <td>{a.dataInizio ? new Date(a.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
                  <td>{a.dataFine ? new Date(a.dataFine).toLocaleDateString('it-IT') : <span className="pd-empty">Attivo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssegnaModal
        open={showAssegna}
        onClose={() => setShowAssegna(false)}
        onSave={handleAssegna}
        title="Assegna Autista a Padroncino"
        items={autistiDisp}
      />
    </div>
  );
}

function EmptyTab({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="pd-empty-tab">
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}