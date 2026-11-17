import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  padronciniApi, mezziApi, palmariApi, codiciAutistaApi,
  Padroncino, CreatePadroncinoPayload,
} from '../../lib/api';
import type { PadroncinoMezzo, PadroncinoPalmare, PadroncinoCodiceAutista } from '../../lib/api';
import LogEntita from '../log/LogEntita';
import { Page, PageHeader, Card, Kpis, Button, SegTabs, Tabs, SearchBox, Select, Th, Dot, Empty, Alert, Tile, Icon, C, useSort, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';
import type { Tone, IconName } from '../../components/ds';
import './Padroncini2.css';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';


// ─── HELPERS ──────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function fmtEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtData(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT');
}

/** Ritorna info scadenza: giorni mancanti, classe CSS, testo */
function scadenzaInfo(dateStr?: string | null): { days: number; cls: string; label: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  const cls = days < 0 ? 'pd-scad-expired' : days <= 10 ? 'pd-scad-warning' : 'pd-scad-ok';
  const label = days < 0 ? `Scaduto da ${Math.abs(days)}gg` : days === 0 ? 'Scade oggi' : `Tra ${days}gg`;
  return { days, cls, label };
}

/** Calcola stato DURC */
function durcStatus(dateStr?: string | null): { label: string; cls: string; days?: number } {
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const info = scadenzaInfo(dateStr);
  if (!info) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  if (info.days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired', days: info.days };
  if (info.days <= 30) return { label: 'IN SCADENZA', cls: 'pd-doc-warning', days: info.days };
  return { label: 'VALIDO', cls: 'pd-doc-ok', days: info.days };
}

/** Stato DVR */
function dvrStatus(dateStr?: string | null, esente?: boolean): { label: string; cls: string } {
  if (esente) return { label: 'ESENTE', cls: 'pd-doc-esente' };
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const info = scadenzaInfo(dateStr);
  if (!info) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  if (info.days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired' };
  return { label: 'VALIDO', cls: 'pd-doc-ok' };
}

// ─── TIPI LOCALI ──────────────────────────────────────
type Filtro = 'TUTTI' | 'ATTIVO' | 'DISMESSO' | 'ALERT';
type SortK = 'nome' | 'stato' | 'durc' | 'dvr' | 'palmari' | 'mezzi' | 'autisti' | 'fatturato';
interface DocInfo { t: string; tone: Tone; k: number }

interface NuovoPadroncinoForm {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo: string;
  telefono: string;
  email: string;
  pec: string;
  iban: string;
  scadenzaDurc: string;
  dvrEsente: boolean;
  note: string;
  rappresentanteNome: string;
  rappresentanteCognome: string;
  cfRappresentante: string;
  qualificaRappresentante: string;
}

// ─── MODAL MODIFICA PADRONCINO ────────────────────────
function ModificaPadroncinoModal({
  open,
  p,
  onClose,
  onSave,
}: {
  open: boolean;
  p: Padroncino;
  onClose: () => void;
  onSave: (data: Partial<CreatePadroncinoPayload>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    ragioneSociale: p.ragioneSociale || '',
    partitaIva: p.partitaIva || '',
    codiceFiscale: p.codiceFiscale || '',
    indirizzo: p.indirizzo || '',
    telefono: p.telefono || '',
    email: p.email || '',
    pec: p.pec || '',
    iban: p.iban || '',
    scadenzaDurc: p.scadenzaDurc ? p.scadenzaDurc.substring(0, 10) : '',
    dvrEsente: p.dvrEsente || false,
    note: p.note || '',
    attivo: p.attivo,
    rappresentanteNome: p.rappresentanteNome || '',
    rappresentanteCognome: p.rappresentanteCognome || '',
    cfRappresentante: p.cfRappresentante || '',
    qualificaRappresentante: p.qualificaRappresentante || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ragioneSociale: p.ragioneSociale || '',
        partitaIva: p.partitaIva || '',
        codiceFiscale: p.codiceFiscale || '',
        indirizzo: p.indirizzo || '',
        telefono: p.telefono || '',
        email: p.email || '',
        pec: p.pec || '',
        iban: p.iban || '',
        scadenzaDurc: p.scadenzaDurc ? p.scadenzaDurc.substring(0, 10) : '',
        dvrEsente: p.dvrEsente || false,
        note: p.note || '',
        attivo: p.attivo,
        rappresentanteNome: p.rappresentanteNome || '',
        rappresentanteCognome: p.rappresentanteCognome || '',
        cfRappresentante: p.cfRappresentante || '',
        qualificaRappresentante: p.qualificaRappresentante || '',
      });
    }
  }, [open, p]);

  const setF = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.ragioneSociale.trim()) return alert('Ragione sociale obbligatoria');
    setSaving(true);
    try {
      await onSave({
        ragioneSociale: form.ragioneSociale,
        partitaIva: form.partitaIva,
        codiceFiscale: form.codiceFiscale || undefined,
        indirizzo: form.indirizzo || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        pec: form.pec || undefined,
        iban: form.iban || undefined,
        scadenzaDurc: form.scadenzaDurc || undefined,
        note: form.note || undefined,
        attivo: form.attivo,
        dvrEsente: form.dvrEsente,
        rappresentanteNome: form.rappresentanteNome || undefined,
        rappresentanteCognome: form.rappresentanteCognome || undefined,
        cfRappresentante: form.cfRappresentante || undefined,
        qualificaRappresentante: form.qualificaRappresentante || undefined,
      });
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Calcola stato DURC live
  const durcSt = durcStatus(form.scadenzaDurc || null);

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="pd-modal-header">
          <h3>✏️ Modifica Padroncino</h3>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-grid2">
            <div className="pd-modal-field pd-modal-full">
              <label>Ragione Sociale *</label>
              <input className="pd-modal-input" value={form.ragioneSociale}
                onChange={(e) => setF('ragioneSociale', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Partita IVA</label>
              <input className="pd-modal-input" value={form.partitaIva}
                onChange={(e) => setF('partitaIva', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Codice Fiscale</label>
              <input className="pd-modal-input" value={form.codiceFiscale}
                onChange={(e) => setF('codiceFiscale', e.target.value)} />
            </div>
            <div className="pd-modal-field pd-modal-full">
              <label>Indirizzo</label>
              <input className="pd-modal-input" value={form.indirizzo}
                onChange={(e) => setF('indirizzo', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Telefono</label>
              <input className="pd-modal-input" value={form.telefono}
                onChange={(e) => setF('telefono', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Email</label>
              <input className="pd-modal-input" type="email" value={form.email}
                onChange={(e) => setF('email', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>PEC</label>
              <input className="pd-modal-input" value={form.pec}
                onChange={(e) => setF('pec', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>IBAN</label>
              <input className="pd-modal-input" value={form.iban}
                onChange={(e) => setF('iban', e.target.value)} />
            </div>

            {/* ── Rappresentante legale ── */}
            <div className="pd-modal-field pd-modal-full" style={{ borderTop: '1px dashed var(--border)', paddingTop: 12, marginTop: 4 }}>
              <label style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                👤 Rappresentante Legale (per contratti)
              </label>
            </div>
            <div className="pd-modal-field">
              <label>Nome Rappresentante</label>
              <input className="pd-modal-input" value={form.rappresentanteNome}
                onChange={(e) => setF('rappresentanteNome', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Cognome Rappresentante</label>
              <input className="pd-modal-input" value={form.rappresentanteCognome}
                onChange={(e) => setF('rappresentanteCognome', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>C.F. Rappresentante</label>
              <input className="pd-modal-input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                value={form.cfRappresentante}
                onChange={(e) => setF('cfRappresentante', e.target.value.toUpperCase())} />
            </div>
            <div className="pd-modal-field">
              <label>Qualifica</label>
              <select className="pd-modal-input" value={form.qualificaRappresentante}
                onChange={(e) => setF('qualificaRappresentante', e.target.value)}>
                <option value="">-- seleziona --</option>
                <option>Amministratore Unico</option>
                <option>Legale Rappresentante</option>
                <option>Socio</option>
                <option>Titolare</option>
                <option>Procuratore</option>
              </select>
            </div>

            {/* DURC con logica automatica */}
            <div className="pd-modal-field">
              <label>Scadenza DURC</label>
              <input className="pd-modal-input" type="date" value={form.scadenzaDurc}
                onChange={(e) => setF('scadenzaDurc', e.target.value)} />
              {form.scadenzaDurc && (
                <span className={`pd-doc-badge ${durcSt.cls}`} style={{ marginTop: 4, display: 'inline-block' }}>
                  {durcSt.label}
                </span>
              )}
            </div>

            {/* DVR con opzione esente */}
            <div className="pd-modal-field">
              <label>DVR</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.dvrEsente}
                    onChange={(e) => setF('dvrEsente', e.target.checked)} />
                  Esente
                </label>
              </div>
              {form.dvrEsente && (
                <span className="pd-doc-badge pd-doc-esente" style={{ marginTop: 4, display: 'inline-block' }}>ESENTE</span>
              )}
            </div>

            {/* Stato attivo */}
            <div className="pd-modal-field">
              <label>Stato</label>
              <select className="pd-modal-input" value={form.attivo ? 'true' : 'false'}
                onChange={(e) => setF('attivo', e.target.value === 'true')}>
                <option value="true">Attivo</option>
                <option value="false">Dismesso</option>
              </select>
            </div>

            <div className="pd-modal-field pd-modal-full">
              <label>Note</label>
              <textarea className="pd-modal-input" rows={3} value={form.note}
                onChange={(e) => setF('note', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={onClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvataggio...' : '💾 Salva Modifiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL NUOVO PADRONCINO ────────────────────────────
function NuovoPadroncinoModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreatePadroncinoPayload) => Promise<void>;
}) {
  const empty: NuovoPadroncinoForm = {
    ragioneSociale: '', partitaIva: '', codiceFiscale: '',
    indirizzo: '', telefono: '', email: '', pec: '', iban: '',
    scadenzaDurc: '', dvrEsente: false, note: '',
    rappresentanteNome: '', rappresentanteCognome: '', cfRappresentante: '', qualificaRappresentante: '',
  };
  const [form, setForm] = useState<NuovoPadroncinoForm>(empty);
  const [saving, setSaving] = useState(false);

  const setF = (k: keyof NuovoPadroncinoForm, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => { setForm(empty); };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!form.ragioneSociale.trim()) return alert('Ragione sociale obbligatoria');
    setSaving(true);
    try {
      await onSave({ ...form });
      reset();
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const durcSt = durcStatus(form.scadenzaDurc || null);

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="pd-modal-header">
          <h3>➕ Nuovo Padroncino</h3>
          <button className="pd-modal-close" onClick={handleClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-grid2">
            <div className="pd-modal-field pd-modal-full">
              <label>Ragione Sociale *</label>
              <input className="pd-modal-input" value={form.ragioneSociale}
                onChange={(e) => setF('ragioneSociale', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Partita IVA</label>
              <input className="pd-modal-input" value={form.partitaIva}
                onChange={(e) => setF('partitaIva', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Codice Fiscale</label>
              <input className="pd-modal-input" value={form.codiceFiscale}
                onChange={(e) => setF('codiceFiscale', e.target.value)} />
            </div>
            <div className="pd-modal-field pd-modal-full">
              <label>Indirizzo</label>
              <input className="pd-modal-input" value={form.indirizzo}
                onChange={(e) => setF('indirizzo', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Telefono</label>
              <input className="pd-modal-input" value={form.telefono}
                onChange={(e) => setF('telefono', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Email</label>
              <input className="pd-modal-input" type="email" value={form.email}
                onChange={(e) => setF('email', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>PEC</label>
              <input className="pd-modal-input" value={form.pec}
                onChange={(e) => setF('pec', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>IBAN</label>
              <input className="pd-modal-input" value={form.iban}
                onChange={(e) => setF('iban', e.target.value)} />
            </div>
            <div className="pd-modal-field">
              <label>Scadenza DURC</label>
              <input className="pd-modal-input" type="date" value={form.scadenzaDurc}
                onChange={(e) => setF('scadenzaDurc', e.target.value)} />
              {form.scadenzaDurc && (
                <span className={`pd-doc-badge ${durcSt.cls}`} style={{ marginTop: 4, display: 'inline-block' }}>
                  {durcSt.label}
                </span>
              )}
            </div>
            <div className="pd-modal-field">
              <label>DVR</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={form.dvrEsente}
                  onChange={(e) => setF('dvrEsente', e.target.checked)} />
                Esente (non soggetto a DVR)
              </label>
            </div>
            <div className="pd-modal-field pd-modal-full">
              <label>Note</label>
              <textarea className="pd-modal-input" rows={2} value={form.note}
                onChange={(e) => setF('note', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={handleClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : '✅ Crea Padroncino'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ASSEGNA ────────────────────────────────────
function AssegnaModal({
  open, onClose, onSave, title, items,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (itemId: string, dataInizio: string) => Promise<void>;
  title: string;
  items: Array<{ id: string; label: string; sub?: string }>;
}) {
  const [itemId, setItemId] = useState('');
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().substring(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setItemId(''); setDataInizio(new Date().toISOString().substring(0, 10)); } }, [open]);

  const handleSave = async () => {
    if (!itemId || !dataInizio) return alert('Seleziona un elemento e una data di inizio');
    setSaving(true);
    try {
      await onSave(itemId, dataInizio);
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h3>{title}</h3>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-field">
            <label>Seleziona</label>
            <select className="pd-modal-input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">— Seleziona —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}{it.sub ? ` — ${it.sub}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="pd-modal-field">
            <label>Data Inizio</label>
            <input className="pd-modal-input" type="date" value={dataInizio}
              onChange={(e) => setDataInizio(e.target.value)} />
          </div>
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={onClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving || !itemId}>
            {saving ? '...' : '🔗 Assegna'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EMPTY TAB ────────────────────────────────────────
function EmptyTab({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="pd-empty-tab">
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

// ─── GRAFICA CONDIVISA DELLE SCHEDE (restyling) ───────
function TabCard({ title, sub, actions, children, foot }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <Card>
      <div className="pdx-head">
        <div className="pdx-head-t">
          <h2 className="ds-h2">{title}</h2>
          {sub && <span className="ds-cardsub">{sub}</span>}
        </div>
        {actions && <div className="ds-actions">{actions}</div>}
      </div>
      {children}
      {foot && <div className="pl2-foot">{foot}</div>}
    </Card>
  );
}
function RowAct({ icon, label, onClick, danger, href }: { icon: IconName; label: string; onClick?: () => void; danger?: boolean; href?: string }) {
  if (href) return <a className={`pdx-act${danger ? ' is-danger' : ''}`} href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} onClick={(e) => e.stopPropagation()}><Icon name={icon} size={13} /></a>;
  return <button type="button" className={`pdx-act${danger ? ' is-danger' : ''}`} title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick?.(); }}><Icon name={icon} size={13} /></button>;
}
function VuotoTab({ msg, cta }: { msg: string; cta?: React.ReactNode }) {
  return <div className="pdx-empty"><span>{msg}</span>{cta}</div>;
}

// ─── TAB MEZZI ────────────────────────────────────────
function TabMezzi({ p, onRefresh, contrSignal }: { p: Padroncino; onRefresh: () => void; contrSignal?: number }) {
  const navigate = useNavigate();
  const [showAssegna, setShowAssegna] = useState(false);
  const [showContratto, setShowContratto] = useState(false);
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

  const handleRimuovi = async (assId: string) => {
    if (!window.confirm('Rimuovere questo mezzo dal padroncino?')) return;
    await padronciniApi.rimuoviMezzo(p.id, assId);
    await onRefresh();
  };

  const attivi = (p.mezziAssegnati || []).filter((m) => !m.dataFine);
  const storici = (p.mezziAssegnati || []).filter((m) => m.dataFine);

  useEffect(() => { if (contrSignal) setShowContratto(true); }, [contrSignal]);
  const { sorted, sort, toggle } = useSort<PadroncinoMezzo, 'targa' | 'marca' | 'alim' | 'rata' | 'dal'>(attivi, (m, k) =>
    k === 'targa' ? m.targa : k === 'marca' ? `${m.marca} ${m.modello}` : k === 'alim' ? m.alimentazione : k === 'rata' ? (m.tariffa ?? null) : m.dataInizio,
    { key: 'targa', dir: 'asc' });
  const rataTot = attivi.reduce((s, m) => s + (Number(m.tariffa) || 0), 0);

  return (
    <>
      <TabCard
        title="Mezzi assegnati"
        sub={`${attivi.length} in corso${rataTot ? ` · rata totale ${fmtEur2(rataTot)} al mese` : ''}`}
        actions={<>
          <Button size="sm" icon="doc" disabled={attivi.length === 0} onClick={() => setShowContratto(true)}>Contratto mezzi</Button>
          <Button size="sm" icon="plus" variant="primary" onClick={() => { loadMezziDisp(); setShowAssegna(true); }}>Assegna mezzo</Button>
        </>}
        foot={<>
          {attivi.length} mezz{attivi.length === 1 ? 'o' : 'i'}{storici.length ? ` · ${storici.length} assegnazion${storici.length === 1 ? 'e chiusa' : 'i chiuse'} nello storico` : ''}
        </>}
      >
        {attivi.length === 0 ? <VuotoTab msg="Nessun mezzo assegnato attualmente" /> : (
          <div className="ds-tablewrap">
            <table className="ds-table pdx-table">
              <thead><tr>
                <Th k="targa" sort={sort} onSort={toggle}>Targa</Th>
                <Th k="marca" sort={sort} onSort={toggle}>Marca / modello</Th>
                <Th k="alim" sort={sort} onSort={toggle}>Alimentazione</Th>
                <Th k="rata" sort={sort} onSort={toggle} right>Rata €/mese</Th>
                <Th k="dal" sort={sort} onSort={toggle}>Assegnato dal</Th>
                <Th />
              </tr></thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className="is-clickable" onClick={() => navigate(`/flotta/${m.mezzoId}`)}>
                    <td className="ds-mono" style={{ fontWeight: 600 }}>{m.targa}</td>
                    <td>{[m.marca, m.modello].filter(Boolean).join(' ')}</td>
                    <td style={{ color: m.alimentazione === 'ELETTRICO' ? '#0B7A7A' : undefined }}>{m.alimentazione ? m.alimentazione.charAt(0) + m.alimentazione.slice(1).toLowerCase() : '—'}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{m.tariffa != null ? fmtEur2(m.tariffa) : '—'}</td>
                    <td>{fmtData(m.dataInizio)}</td>
                    <td className="r pdx-acts">
                      <RowAct icon="link" label="Vai ai dettagli del mezzo" onClick={() => navigate(`/flotta/${m.mezzoId}`)} />
                      <RowAct icon="close" label="Chiudi assegnazione" danger onClick={() => handleRimuovi(m.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {storici.length > 0 && (
          <details className="pdx-details">
            <summary>Storico assegnazioni ({storici.length})</summary>
            <div className="ds-tablewrap">
              <table className="ds-table pdx-table">
                <thead><tr><Th>Targa</Th><Th>Inizio</Th><Th>Fine</Th></tr></thead>
                <tbody>
                  {storici.map((m) => (
                    <tr key={m.id} style={{ color: '#6B6B73' }}>
                      <td className="ds-mono">{m.targa}</td>
                      <td>{fmtData(m.dataInizio)}</td>
                      <td>{fmtData(m.dataFine)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </TabCard>

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna mezzo a padroncino" items={mezziDisp}
      />

      <ContrattoMezziModal
        open={showContratto} onClose={() => setShowContratto(false)}
        p={p} attivi={attivi}
      />
    </>
  );
}

// ─── MODALE CONTRATTO MEZZI ────────────────────────────
function ContrattoMezziModal({
  open, onClose, p, attivi,
}: {
  open: boolean; onClose: () => void; p: Padroncino;
  attivi: Array<{ id: string; mezzoId: string; targa: string; dataInizio: string }>;
}) {
  const [nomeRapp,      setNomeRapp]      = useState('');
  const [cognomeRapp,   setCognomeRapp]   = useState('');
  const [cfRapp,        setCfRapp]        = useState('');
  const [qualificaRapp, setQualificaRapp] = useState('Amministratore Unico');
  const [dataFirma,     setDataFirma]     = useState(new Date().toISOString().split('T')[0]);
  const [eccedenzaKm,   setEccedenzaKm]   = useState('0.10');
  const [selezionati,   setSelezionati]   = useState<string[]>([]);
  const [generating,    setGenerating]    = useState(false);
  const [errMsg,        setErrMsg]        = useState('');

  useEffect(() => {
    if (!open) return;
    setNomeRapp(p.rappresentanteNome ?? '');
    setCognomeRapp(p.rappresentanteCognome ?? '');
    setCfRapp(p.cfRappresentante ?? '');
    setQualificaRapp(p.qualificaRappresentante ?? 'Amministratore Unico');
    setDataFirma(new Date().toISOString().split('T')[0]);
    setEccedenzaKm('0.10');
    setSelezionati(attivi.map((a) => a.mezzoId));
    setErrMsg('');
  }, [open]);

  const toggleMezzo = (mezzoId: string) => {
    setSelezionati((cur) => cur.includes(mezzoId) ? cur.filter((id) => id !== mezzoId) : [...cur, mezzoId]);
  };

  const handleGenera = async () => {
    if (selezionati.length === 0) { setErrMsg('Seleziona almeno un mezzo'); return; }
    setErrMsg(''); setGenerating(true);
    try {
      await padronciniApi.generaContrattoMezzi(p.id, {
        nomeRapp: nomeRapp || undefined, cognomeRapp: cognomeRapp || undefined,
        cfRapp: cfRapp || undefined, qualificaRapp: qualificaRapp || undefined,
        dataFirma, mezzoIds: selezionati,
        eccedenzaKm: eccedenzaKm !== '' ? parseFloat(eccedenzaKm) : undefined,
        _ragioneSociale: p.ragioneSociale,
      });
      onClose();
    } catch (e: any) { setErrMsg(e.message || 'Errore generazione contratto'); }
    finally { setGenerating(false); }
  };

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h3>📄 Crea Contratto Noleggio Mezzi</h3>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-field">
            <label>Mezzi da includere</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
              {attivi.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={selezionati.includes(a.mezzoId)} onChange={() => toggleMezzo(a.mezzoId)} />
                  {a.targa}
                </label>
              ))}
            </div>
          </div>
          <div className="pd-modal-field">
            <label>Nome Rappresentante</label>
            <input className="pd-modal-input" value={nomeRapp} onChange={(e) => setNomeRapp(e.target.value)} />
          </div>
          <div className="pd-modal-field">
            <label>Cognome Rappresentante</label>
            <input className="pd-modal-input" value={cognomeRapp} onChange={(e) => setCognomeRapp(e.target.value)} />
          </div>
          <div className="pd-modal-field">
            <label>Codice Fiscale Rappresentante</label>
            <input className="pd-modal-input" value={cfRapp} onChange={(e) => setCfRapp(e.target.value.toUpperCase())} />
          </div>
          <div className="pd-modal-field">
            <label>Qualifica</label>
            <select className="pd-modal-input" value={qualificaRapp} onChange={(e) => setQualificaRapp(e.target.value)}>
              <option>Amministratore Unico</option>
              <option>Legale Rappresentante</option>
              <option>Socio</option>
              <option>Titolare</option>
              <option>Procuratore</option>
            </select>
          </div>
          <div className="pd-modal-field">
            <label>Data Firma</label>
            <input className="pd-modal-input" type="date" value={dataFirma} onChange={(e) => setDataFirma(e.target.value)} />
          </div>
          <div className="pd-modal-field">
            <label>Eccedenza km (€/km)</label>
            <input className="pd-modal-input" type="number" step="0.01" value={eccedenzaKm} onChange={(e) => setEccedenzaKm(e.target.value)} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 2px' }}>
            ℹ️ La rata noleggio e i km mensili inclusi vengono presi da ciascun mezzo (rata noleggio / km limite).
          </div>
          {errMsg && <div className="dm-err-msg">⚠️ {errMsg}</div>}
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={onClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleGenera} disabled={generating || selezionati.length === 0}>
            {generating ? '⏳ Generazione...' : '📥 Genera e Scarica Contratto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODALE CONTRATTO PALMARI ──────────────────────────
function ContrattoPalmareModal({
  open, onClose, p, attivi,
}: {
  open: boolean; onClose: () => void; p: Padroncino;
  attivi: Array<{ id: string; palmareId: string; codice: string; dataInizio: string }>;
}) {
  const [nomeRapp,      setNomeRapp]      = useState('');
  const [cognomeRapp,   setCognomeRapp]   = useState('');
  const [cfRapp,        setCfRapp]        = useState('');
  const [qualificaRapp, setQualificaRapp] = useState('Amministratore Unico');
  const [dataFirma,     setDataFirma]     = useState(new Date().toISOString().split('T')[0]);
  const [selezionati,   setSelezionati]   = useState<string[]>([]);
  const [generating,    setGenerating]    = useState(false);
  const [errMsg,        setErrMsg]        = useState('');

  useEffect(() => {
    if (!open) return;
    setNomeRapp(p.rappresentanteNome ?? '');
    setCognomeRapp(p.rappresentanteCognome ?? '');
    setCfRapp(p.cfRappresentante ?? '');
    setQualificaRapp(p.qualificaRappresentante ?? 'Amministratore Unico');
    setDataFirma(new Date().toISOString().split('T')[0]);
    setSelezionati(attivi.map((a) => a.palmareId));
    setErrMsg('');
  }, [open]);

  const togglePalmare = (palmareId: string) => {
    setSelezionati((cur) => cur.includes(palmareId) ? cur.filter((id) => id !== palmareId) : [...cur, palmareId]);
  };

  const handleGenera = async () => {
    if (selezionati.length === 0) { setErrMsg('Seleziona almeno un palmare'); return; }
    setErrMsg(''); setGenerating(true);
    try {
      await padronciniApi.generaContrattoPalmari(p.id, {
        nomeRapp: nomeRapp || undefined, cognomeRapp: cognomeRapp || undefined,
        cfRapp: cfRapp || undefined, qualificaRapp: qualificaRapp || undefined,
        dataFirma, palmareIds: selezionati, _ragioneSociale: p.ragioneSociale,
      });
      onClose();
    } catch (e: any) { setErrMsg(e.message || 'Errore generazione contratto'); }
    finally { setGenerating(false); }
  };

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h3>📄 Crea Contratto Noleggio Palmare</h3>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-field">
            <label>Palmari da includere</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
              {attivi.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={selezionati.includes(a.palmareId)} onChange={() => togglePalmare(a.palmareId)} />
                  {a.codice}
                </label>
              ))}
            </div>
          </div>
          <div className="pd-modal-field">
            <label>Nome Rappresentante</label>
            <input className="pd-modal-input" value={nomeRapp} onChange={(e) => setNomeRapp(e.target.value)} />
          </div>
          <div className="pd-modal-field">
            <label>Cognome Rappresentante</label>
            <input className="pd-modal-input" value={cognomeRapp} onChange={(e) => setCognomeRapp(e.target.value)} />
          </div>
          <div className="pd-modal-field">
            <label>Codice Fiscale Rappresentante</label>
            <input className="pd-modal-input" value={cfRapp} onChange={(e) => setCfRapp(e.target.value.toUpperCase())} />
          </div>
          <div className="pd-modal-field">
            <label>Qualifica</label>
            <select className="pd-modal-input" value={qualificaRapp} onChange={(e) => setQualificaRapp(e.target.value)}>
              <option>Amministratore Unico</option>
              <option>Legale Rappresentante</option>
              <option>Socio</option>
              <option>Titolare</option>
              <option>Procuratore</option>
            </select>
          </div>
          <div className="pd-modal-field">
            <label>Data Firma</label>
            <input className="pd-modal-input" type="date" value={dataFirma} onChange={(e) => setDataFirma(e.target.value)} />
          </div>
          {errMsg && <div className="dm-err-msg">⚠️ {errMsg}</div>}
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={onClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleGenera} disabled={generating || selezionati.length === 0}>
            {generating ? '⏳ Generazione...' : '📥 Genera e Scarica Contratto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB PALMARI ──────────────────────────────────────
function TabPalmari({ p, onRefresh, contrSignal }: { p: Padroncino; onRefresh: () => void; contrSignal?: number }) {
  const navigate = useNavigate();
  const [showAssegna, setShowAssegna] = useState(false);
  const [showContratto, setShowContratto] = useState(false);
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

  const handleRimuovi = async (assId: string) => {
    if (!window.confirm('Rimuovere questo palmare dal padroncino?')) return;
    await padronciniApi.rimuoviPalmare(p.id, assId);
    await onRefresh();
  };

  const attivi = (p.palmariAssegnati || []).filter((pal) => !pal.dataFine);

  useEffect(() => { if (contrSignal) setShowContratto(true); }, [contrSignal]);
  const { sorted, sort, toggle } = useSort<PadroncinoPalmare, 'cod' | 'tar' | 'dal'>(attivi, (x, k) =>
    k === 'cod' ? x.codice : k === 'tar' ? (x.tariffa ?? null) : x.dataInizio, { key: 'cod', dir: 'asc' });
  const tariffe = Array.from(new Set(attivi.map((x) => x.tariffa).filter((t) => t != null)));

  return (
    <>
      <TabCard
        title="Palmari assegnati"
        sub={`${attivi.length} in corso${tariffe.length === 1 ? ` · ${fmtEur2(Number(tariffe[0]))} al giorno ciascuno` : ''}`}
        actions={<>
          <Button size="sm" icon="doc" disabled={attivi.length === 0} onClick={() => setShowContratto(true)}>Contratto palmari</Button>
          <Button size="sm" icon="plus" variant="primary" onClick={() => { loadPalmariDisp(); setShowAssegna(true); }}>Assegna palmare</Button>
        </>}
        foot={`${attivi.length} palmar${attivi.length === 1 ? 'e' : 'i'}`}
      >
        {attivi.length === 0 ? <VuotoTab msg="Nessun palmare assegnato" /> : (
          <div className="ds-tablewrap">
            <table className="ds-table pdx-table">
              <thead><tr>
                <Th k="cod" sort={sort} onSort={toggle}>Palmare</Th>
                <Th k="tar" sort={sort} onSort={toggle} right>Tariffa €/giorno</Th>
                <Th k="dal" sort={sort} onSort={toggle}>Assegnato dal</Th>
                <Th />
              </tr></thead>
              <tbody>
                {sorted.map((pal) => (
                  <tr key={pal.id} className="is-clickable" onClick={() => navigate(`/palmari/${pal.palmareId}`)}>
                    <td className="ds-mono" style={{ fontWeight: 600 }}>{pal.codice}</td>
                    <td className="r">{pal.tariffa != null ? fmtEur2(pal.tariffa) : '—'}</td>
                    <td>{fmtData(pal.dataInizio)}</td>
                    <td className="r pdx-acts">
                      <RowAct icon="link" label="Vai ai dettagli del palmare" onClick={() => navigate(`/palmari/${pal.palmareId}`)} />
                      <RowAct icon="close" label="Chiudi assegnazione" danger onClick={() => handleRimuovi(pal.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabCard>

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna palmare a padroncino" items={palmariDisp}
      />

      <ContrattoPalmareModal
        open={showContratto} onClose={() => setShowContratto(false)}
        p={p} attivi={attivi}
      />
    </>
  );
}

// ─── INLINE EDIT CELL ─────────────────────────────────
function InlineEditCell({
  value,
  tipo,
  onSave,
  placeholder,
  valueClassName,
}: {
  value: string | number | null | undefined;
  tipo: 'text' | 'number' | 'euro';
  onSave: (val: string) => Promise<void>;
  placeholder?: string;
  valueClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    const raw = value != null ? String(value) : '';
    setDraft(raw);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch { /* ignora */ }
    finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => setEditing(false);

  const displayVal = () => {
    if (value == null || value === '') return <span className="pdx-muted">—</span>;
    if (tipo === 'euro') return <span className={valueClassName}>{fmtEur2(Number(value))}</span>;
    return <span className={valueClassName}>{String(value)}</span>;
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 80 }}>
        <input
          ref={inputRef}
          type={tipo === 'text' ? 'text' : 'number'}
          step={tipo === 'euro' ? '0.01' : tipo === 'number' ? '1' : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={commit}
          disabled={saving}
          style={{
            width: tipo === 'text' ? 110 : 72,
            fontSize: 12,
            padding: '2px 6px',
            border: '1.5px solid var(--primary)',
            borderRadius: 5,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <span
      title="Clicca per modificare"
      onClick={startEdit}
      className="pdx-inline"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') startEdit(); }}
    >
      {displayVal()}
    </span>
  );
}

// ─── MODALE CONTRATTO CODICI AUTISTA ───────────────────
function ContrattoCodiciModal({
  open, onClose, p, attivi,
}: {
  open: boolean; onClose: () => void; p: Padroncino;
  attivi: Array<{ id: string; codiceId: string; codice: string }>;
}) {
  const [dataContratto, setDataContratto] = useState(new Date().toISOString().split('T')[0]);
  const [selezionati,   setSelezionati]   = useState<string[]>([]);
  const [generating,    setGenerating]    = useState(false);
  const [errMsg,        setErrMsg]        = useState('');

  useEffect(() => {
    if (!open) return;
    setDataContratto(new Date().toISOString().split('T')[0]);
    setSelezionati(attivi.map((a) => a.codiceId));
    setErrMsg('');
  }, [open]);

  const toggleCodice = (codiceId: string) => {
    setSelezionati((cur) => cur.includes(codiceId) ? cur.filter((id) => id !== codiceId) : [...cur, codiceId]);
  };

  const handleGenera = async () => {
    if (selezionati.length === 0) { setErrMsg('Seleziona almeno un codice autista'); return; }
    setErrMsg(''); setGenerating(true);
    try {
      await padronciniApi.generaContrattoCodici(p.id, {
        dataContratto, codiceAutistaIds: selezionati, _ragioneSociale: p.ragioneSociale,
      });
      onClose();
    } catch (e: any) { setErrMsg(e.message || 'Errore generazione contratto'); }
    finally { setGenerating(false); }
  };

  if (!open) return null;
  return (
    <div className="pd-modal-overlay">
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h3>📄 Crea Contratto Codici Autista</h3>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-body">
          <div className="pd-modal-field">
            <label>Codici da includere</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
              {attivi.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={selezionati.includes(a.codiceId)} onChange={() => toggleCodice(a.codiceId)} />
                  {a.codice}
                </label>
              ))}
            </div>
          </div>
          <div className="pd-modal-field">
            <label>Data Contratto</label>
            <input className="pd-modal-input" type="date" value={dataContratto} onChange={(e) => setDataContratto(e.target.value)} />
          </div>
          {errMsg && <div className="dm-err-msg">⚠️ {errMsg}</div>}
        </div>
        <div className="pd-modal-footer">
          <button className="btn-outline btn-sm" onClick={onClose}>Annulla</button>
          <button className="btn-primary btn-sm" onClick={handleGenera} disabled={generating || selezionati.length === 0}>
            {generating ? '⏳ Generazione...' : '📥 Genera e Scarica Contratto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB AUTISTI ──────────────────────────────────────
function TabAutisti({ p, onRefresh, contrSignal }: { p: Padroncino; onRefresh: () => void; contrSignal?: number }) {
  const navigate = useNavigate();
  const [showAssegna, setShowAssegna] = useState(false);
  const [showContratto, setShowContratto] = useState(false);
  const [autistiDisp, setAutistiDisp] = useState<Array<{ id: string; label: string; sub?: string }>>([]);

  const loadAutistiDisp = async () => {
    try {
      const res = await codiciAutistaApi.list({ limit: '200' });
      const disponibili = res.data.filter((c: any) => {
        const assAttiva = c.assegnazioni?.find((a: any) => !a.dataFine);
        return !assAttiva;
      });
      setAutistiDisp(disponibili.map((c: any) => ({
        id: c.id,
        label: c.codice,
        sub: [c.nome, c.cognome].filter(Boolean).join(' ') || undefined,
      })));
    } catch { /* ignora */ }
  };

  const handleAssegna = async (codiceAutistaId: string, dataInizio: string) => {
    await padronciniApi.assegnaCodice(p.id, { codiceAutistaId, dataInizio });
    await onRefresh();
  };

  const handleRimuovi = async (assId: string) => {
    if (!window.confirm('Rimuovere questo codice autista dal padroncino?')) return;
    await padronciniApi.rimuoviCodice(p.id, assId);
    await onRefresh();
  };

  /** Salva un campo del CodiceAutista e fa refresh */
  const handleSaveField = async (codiceId: string, field: string, rawVal: string) => {
    let parsed: any = rawVal === '' ? null : rawVal;
    if (field === 'tariffaFissa' || field === 'tariffaRitiro' || field === 'bonus' || field === 'malus') {
      parsed = rawVal === '' ? null : parseFloat(rawVal);
    } else if (field === 'target') {
      parsed = rawVal === '' ? null : parseInt(rawVal, 10);
    }
    await codiciAutistaApi.update(codiceId, { [field]: parsed });
    await onRefresh();
  };

  const attivi = (p.codiciAutista || []).filter((a) => !a.dataFine);

  useEffect(() => { if (contrSignal) setShowContratto(true); }, [contrSignal]);
  type K = 'cod' | 'zone' | 'tf' | 'tr' | 'tg' | 'bo' | 'ma' | 'note' | 'dal';
  const { sorted, sort, toggle } = useSort<PadroncinoCodiceAutista, K>(attivi, (a, k) => {
    switch (k) {
      case 'cod': return a.codice;
      case 'zone': return a.zone ?? '';
      case 'tf': return a.tariffaFissa ?? null;
      case 'tr': return a.tariffaRitiro ?? null;
      case 'tg': return a.target ?? null;
      case 'bo': return a.bonus ?? null;
      case 'ma': return a.malus ?? null;
      case 'note': return a.note ?? '';
      case 'dal': return a.dataInizio;
    }
  }, { key: 'cod', dir: 'asc' });

  return (
    <>
      <TabCard
        title="Codici autista assegnati"
        sub={`${attivi.length} in corso · tariffe, target e bonus/malus: clic su un valore per modificarlo`}
        actions={<>
          <Button size="sm" icon="doc" disabled={attivi.length === 0} onClick={() => setShowContratto(true)}>Contratto codici</Button>
          <Button size="sm" icon="plus" variant="primary" onClick={() => { loadAutistiDisp(); setShowAssegna(true); }}>Assegna codice</Button>
        </>}
        foot={`${attivi.length} codic${attivi.length === 1 ? 'e' : 'i'} autista`}
      >
        {attivi.length === 0 ? <VuotoTab msg="Nessun codice autista assegnato" /> : (
          <div className="ds-tablewrap">
            <table className="ds-table pdx-table" style={{ minWidth: 980 }}>
              <thead><tr>
                <Th k="cod" sort={sort} onSort={toggle}>Codice</Th>
                <Th k="zone" sort={sort} onSort={toggle}>Zone</Th>
                <Th k="tf" sort={sort} onSort={toggle} right>Tariffa fissa</Th>
                <Th k="tr" sort={sort} onSort={toggle} right>Ritiro</Th>
                <Th k="tg" sort={sort} onSort={toggle} right>Target</Th>
                <Th k="bo" sort={sort} onSort={toggle} right>Bonus</Th>
                <Th k="ma" sort={sort} onSort={toggle} right>Malus</Th>
                <Th k="note" sort={sort} onSort={toggle}>Note</Th>
                <Th k="dal" sort={sort} onSort={toggle}>Dal</Th>
                <Th />
              </tr></thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id}>
                    <td className="ds-mono" style={{ fontWeight: 600 }}>{a.codice}</td>
                    <td style={{ maxWidth: 260 }}>
                      <InlineEditCell value={a.zone} tipo="text" placeholder="Zone..." onSave={(v) => handleSaveField(a.codiceId, 'zone', v)} />
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>
                      <InlineEditCell value={a.tariffaFissa} tipo="euro" placeholder="0.00" onSave={(v) => handleSaveField(a.codiceId, 'tariffaFissa', v)} />
                    </td>
                    <td className="r">
                      <InlineEditCell value={a.tariffaRitiro} tipo="euro" placeholder="0.00" onSave={(v) => handleSaveField(a.codiceId, 'tariffaRitiro', v)} />
                    </td>
                    <td className="r">
                      <InlineEditCell value={a.target} tipo="number" placeholder="0" onSave={(v) => handleSaveField(a.codiceId, 'target', v)} />
                    </td>
                    <td className="r">
                      <InlineEditCell value={a.bonus} tipo="euro" placeholder="0.00" valueClassName="pdx-pos" onSave={(v) => handleSaveField(a.codiceId, 'bonus', v)} />
                    </td>
                    <td className="r">
                      <InlineEditCell value={a.malus} tipo="euro" placeholder="0.00" valueClassName="pdx-neg" onSave={(v) => handleSaveField(a.codiceId, 'malus', v)} />
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <InlineEditCell value={a.note} tipo="text" placeholder="Note..." onSave={(v) => handleSaveField(a.codiceId, 'note', v)} />
                    </td>
                    <td>{fmtData(a.dataInizio)}</td>
                    <td className="r pdx-acts">
                      <RowAct icon="link" label="Vai ai dettagli del codice autista" onClick={() => navigate(`/codici-autista/${a.codiceId}`)} />
                      <RowAct icon="close" label="Chiudi assegnazione" danger onClick={() => handleRimuovi(a.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabCard>

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna codice autista" items={autistiDisp}
      />

      <ContrattoCodiciModal
        open={showContratto} onClose={() => setShowContratto(false)}
        p={p} attivi={attivi}
      />
    </>
  );
}

// ─── TAB DOCUMENTI ────────────────────────────────────
interface Documento {
  id: string;
  nome: string;
  tipo: string;
  filePath: string;
  mimeType?: string;
  dimensione?: number;
  scadenza?: string;
  note?: string;
  createdAt: string;
}

function normalizeDocPath(filePath: string) {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.?\/*/, '')
    .replace(/^uploads\/padroncini\//, '');
}

// ─── TAB STORICO CONTEGGI ─────────────────────────────
interface StoricoMese {
  id: string;
  mese: string;
  stato: 'BOZZA' | 'CHIUSO' | 'CONFERMATO';
  /** Fatturato con IVA inclusi acconti (netto da acconti) — per il dettaglio fattura */
  fatturato: number;
  /** Fatturato lordo con IVA, senza detrarre acconti — per statistiche e grafici */
  fatturatoLordo: number;
  addebiti: number;
  compensazioni: number;
  netto: number;
  nSpedizioni: number | null;
}

function fmtMese(mese: string) {
  const [y, m] = mese.split('-');
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function StatoConteggioBadge({ stato }: { stato: string }) {
  const map: Record<string, string> = { BOZZA: 'pd-doc-absent', CHIUSO: 'pd-doc-warning', CONFERMATO: 'pd-doc-ok' };
  return <span className={`pd-doc-badge ${map[stato] ?? 'pd-doc-absent'}`}>{stato}</span>;
}

const CHART_COLORS = {
  fatturato: '#6366f1',
  addebiti:  '#f97316',
  netto:     '#22c55e',
};

function pctDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#16a34a' : 'var(--danger)', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ fontSize: 12, margin: '2px 0', color: entry.color }}>
          <span style={{ fontWeight: 600 }}>{entry.name}:</span>{' '}
          {fmtEur(entry.value)}
        </p>
      ))}
    </div>
  );
}

function TabStoricoConteggi({ p }: { p: Padroncino }) {
  const [storico, setStorico] = useState<StoricoMese[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const prevMeseRef = useRef(new Map<string, StoricoMese>());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    padronciniApi.storicoConteggi(p.id)
      .then((data) => { if (!cancelled) setStorico(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setStorico([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [p.id]);

  type SK = 'mese' | 'stato' | 'fat' | 'add' | 'comp' | 'net' | 'sped' | 'df' | 'dsp';
  const sortHook = useSort<StoricoMese, SK>(storico, (r, k) => {
    const prev = prevMeseRef.current.get(r.mese);
    switch (k) {
      case 'mese': return r.mese;
      case 'stato': return r.stato;
      case 'fat': return r.fatturatoLordo ?? r.fatturato;
      case 'add': return r.addebiti;
      case 'comp': return r.compensazioni;
      case 'net': return r.netto;
      case 'sped': return r.nSpedizioni;
      case 'df': return pctDelta(r.fatturatoLordo ?? r.fatturato, prev ? (prev.fatturatoLordo ?? prev.fatturato) : null);
      case 'dsp': return pctDelta(r.nSpedizioni, prev?.nSpedizioni ?? null);
    }
  }, { key: 'mese', dir: 'asc' });

  if (loading) return <TabCard title="Storico conteggi"><VuotoTab msg="Caricamento…" /></TabCard>;
  if (storico.length === 0) return <TabCard title="Storico conteggi"><VuotoTab msg="Nessun conteggio trovato per questo padroncino" /></TabCard>;

  // Mappa mese → riga precedente (ordine cronologico) per calcolo delta %
  const sorted = [...storico].sort((a, b) => a.mese.localeCompare(b.mese));
  const prevMese = new Map<string, StoricoMese>();
  sorted.forEach((r, i) => { if (i > 0) prevMese.set(r.mese, sorted[i - 1]); });

  // fatturatoLordo = fatturato con IVA escludendo acconti (per statistiche/grafici)
  const totFatt  = storico.reduce((s, r) => s + (r.fatturatoLordo ?? r.fatturato), 0);
  const totAdd   = storico.reduce((s, r) => s + r.addebiti + r.compensazioni, 0);
  const totNetto = storico.reduce((s, r) => s + r.netto, 0);

  // Dati per il grafico (ordine cronologico)
  const chartData = [...storico]
    .sort((a, b) => a.mese.localeCompare(b.mese))
    .map((r) => ({
      mese:      fmtMese(r.mese),
      fatturato: r.fatturatoLordo ?? r.fatturato,                     // lordo senza acconti
      addebiti:  Math.round((r.addebiti + r.compensazioni) * 100) / 100,
      netto:     r.netto,
    }));

  prevMeseRef.current = prevMese;
  const maxV = Math.max(1, ...chartData.map((d) => Math.max(d.fatturato, d.netto)));
  const STATO_TONE: Record<string, Tone> = { BOZZA: 'warn', CHIUSO: 'na', CONFERMATO: 'ok' };
  const deltaTxt = (pct: number | null) => pct == null ? <span className="pdx-muted">—</span>
    : <span style={{ color: pct >= 0 ? '#15803D' : '#B91C1C', fontWeight: 600 }}>{pct >= 0 ? '+' : '−'}{fmtNum2(Math.abs(pct), 1)}%</span>;

  return (
    <TabCard
      title="Storico conteggi"
      sub={`${storico.length} mes${storico.length === 1 ? 'e' : 'i'} · fatturato ${fmtEur2(totFatt)} · addebiti e compensazioni ${fmtEur2(totAdd)} · netto ${fmtEur2(totNetto)}`}
      foot="Fatturato con IVA (blu) e netto bonificato (verde) per mese · clic su una riga per aprire il conteggio"
    >
      <div role="img" aria-label="Fatturato con IVA e netto bonificato per mese" className="pdx-chart">
        {chartData.map((m) => (
          <div key={m.mese} className="pdx-chart-col" title={`${m.mese} · fatturato ${fmtEur2(m.fatturato)} · addebiti ${fmtEur2(m.addebiti)} · netto ${fmtEur2(m.netto)}`}>
            <div className="pdx-chart-bars">
              <span style={{ height: `${Math.max(0, (m.fatturato / maxV) * 100)}%`, background: C.blue }} />
              <span style={{ height: `${Math.max(0, (m.netto / maxV) * 100)}%`, background: C.green }} />
            </div>
            <span className="pdx-chart-l">{m.mese.split(' ')[0].toLowerCase()}</span>
          </div>
        ))}
      </div>
      <div className="ds-tablewrap">
        <table className="ds-table pdx-table" style={{ minWidth: 980 }}>
          <thead><tr>
            <Th k="mese" sort={sortHook.sort} onSort={sortHook.toggle}>Mese</Th>
            <Th k="stato" sort={sortHook.sort} onSort={sortHook.toggle}>Stato</Th>
            <Th k="fat" sort={sortHook.sort} onSort={sortHook.toggle} right>Fatturato c/IVA</Th>
            <Th k="add" sort={sortHook.sort} onSort={sortHook.toggle} right>Addebiti</Th>
            <Th k="comp" sort={sortHook.sort} onSort={sortHook.toggle} right>Compensazioni</Th>
            <Th k="net" sort={sortHook.sort} onSort={sortHook.toggle} right>Bonificato</Th>
            <Th k="sped" sort={sortHook.sort} onSort={sortHook.toggle} right>Spedizioni</Th>
            <Th k="df" sort={sortHook.sort} onSort={sortHook.toggle} right>Δ fatturato</Th>
            <Th k="dsp" sort={sortHook.sort} onSort={sortHook.toggle} right>Δ spedizioni</Th>
            <Th />
          </tr></thead>
          <tbody>
            {sortHook.sorted.map((r) => {
              const prev = prevMese.get(r.mese);
              return (
                <tr key={r.id} className="is-clickable" onClick={() => navigate(`/conteggi/${p.id}?mese=${r.mese}`)}>
                  <td style={{ fontWeight: 600 }}>{fmtMese(r.mese)}</td>
                  <td><Dot tone={STATO_TONE[r.stato] ?? 'na'}>{r.stato.charAt(0) + r.stato.slice(1).toLowerCase()}</Dot></td>
                  <td className="r">{fmtEur2(r.fatturatoLordo ?? r.fatturato)}</td>
                  <td className="r" style={{ color: '#B91C1C' }}>{fmtEur2(r.addebiti)}</td>
                  <td className="r" style={{ color: '#1D4ED8' }}>{fmtEur2(r.compensazioni)}</td>
                  <td className="r" style={{ fontWeight: 600, color: r.netto < 0 ? '#B91C1C' : undefined }}>{fmtEur2(r.netto)}</td>
                  <td className="r">{r.nSpedizioni !== null ? fmtNum2(r.nSpedizioni) : <span className="pdx-muted">—</span>}</td>
                  <td className="r">{deltaTxt(pctDelta(r.fatturatoLordo ?? r.fatturato, prev ? (prev.fatturatoLordo ?? prev.fatturato) : null))}</td>
                  <td className="r">{deltaTxt(pctDelta(r.nSpedizioni, prev?.nSpedizioni ?? null))}</td>
                  <td className="r pdx-acts"><RowAct icon="link" label="Apri conteggio" onClick={() => navigate(`/conteggi/${p.id}?mese=${r.mese}`)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TabCard>
  );
}

function TabDocumenti({ p, onRefresh }: { p: Padroncino; onRefresh: () => Promise<void> }) {
  const [docs, setDocs] = useState<Documento[]>((p as any).documenti || []);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ nome: '', tipo: 'CONTRATTO', scadenza: '', note: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', tipo: 'CONTRATTO', scadenza: '', note: '' });
  const [saving, setSaving] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/padroncini/${p.id}/documenti`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setDocs(await res.json());
    } catch { /* ignora */ }
    finally { setLoading(false); }
  }, [p.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async () => {
    if (!selectedFile) return alert('Seleziona un file');
    if (!uploadForm.tipo) return alert('Seleziona il tipo documento');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('tipo', uploadForm.tipo);
      fd.append('nome', uploadForm.nome || selectedFile.name);
      if (uploadForm.scadenza) fd.append('scadenza', uploadForm.scadenza);
      if (uploadForm.note) fd.append('note', uploadForm.note);

      const token = getToken();
      const res = await fetch(`${API_BASE}/padroncini/${p.id}/documenti`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setShowUpload(false);
      setSelectedFile(null);
      setUploadForm({ nome: '', tipo: 'CONTRATTO', scadenza: '', note: '' });
      await loadDocs();
      await onRefresh();
    } catch (e: any) {
      alert('Errore upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Eliminare questo documento?')) return;
    try {
      const token = getToken();
      await fetch(`${API_BASE}/padroncini/${p.id}/documenti/${docId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await loadDocs();
      await onRefresh();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const openEdit = (doc: Documento) => {
    setShowUpload(false);
    setEditingDocId(doc.id);
    setEditForm({
      nome: doc.nome || '',
      tipo: doc.tipo || 'CONTRATTO',
      scadenza: doc.scadenza ? doc.scadenza.substring(0, 10) : '',
      note: doc.note || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDocId) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editForm.nome)     body.nome     = editForm.nome;
      if (editForm.tipo)     body.tipo     = editForm.tipo;
      body.scadenza = editForm.scadenza || '';
      body.note     = editForm.note;
      const token = getToken();
      const res = await fetch(`${API_BASE}/padroncini/${p.id}/documenti/${editingDocId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingDocId(null);
      await loadDocs();
      await onRefresh();
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const fmtSize = (b?: number) => {
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const TIPI_DOC = [
    'CONTRATTO', 'VISURA', 'DURC', 'DVR', 'LICENZA', 'IDENTITA', 'ALTRO',
  ];

  const TIPO_COL: Record<string, string> = { DURC: C.red, DVR: C.green, CONTRATTO: C.blue, VISURA: C.purple, LICENZA: C.orange, IDENTITA: C.teal, ALTRO: '#71717A' };
  const cap = (t: string) => !t ? '' : ['DURC', 'DVR'].includes(t) ? t : t === 'IDENTITA' ? 'Identità' : t.charAt(0) + t.slice(1).toLowerCase();
  const { sorted, sort, toggle } = useSort<Documento, 'tipo' | 'nome' | 'sca' | 'car' | 'dim'>(docs, (d, k) =>
    k === 'tipo' ? d.tipo : k === 'nome' ? d.nome : k === 'sca' ? (d.scadenza ?? null) : k === 'car' ? d.createdAt : (d.dimensione ?? null),
    { key: 'tipo', dir: 'asc' });
  const docUrl = (d: Documento) => `${API_BASE.replace('/api', '')}/uploads/padroncini/${normalizeDocPath(d.filePath)}`;

  const formFields = (f: { nome: string; tipo: string; scadenza: string; note: string }, setF: (fn: (x: typeof f) => typeof f) => void, upload: boolean) => (
    <div className="pdx-form">
      <label className="ds-field"><span>Tipo documento{upload ? ' *' : ''}</span>
        <select className="ds-input" value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
          {TIPI_DOC.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
        </select>
      </label>
      <label className="ds-field"><span>Nome{upload ? ' (opzionale)' : ''}</span>
        <input className="ds-input" placeholder={upload ? 'Es. Contratto 2024' : ''} value={f.nome} onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
      </label>
      <label className="ds-field"><span>Scadenza{upload ? ' (opzionale)' : ''}</span>
        <input className="ds-input" type="date" value={f.scadenza} onChange={(e) => setF((x) => ({ ...x, scadenza: e.target.value }))} />
      </label>
      <label className="ds-field"><span>Note</span>
        <input className="ds-input" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
      </label>
    </div>
  );

  return (
    <TabCard
      title="Documenti"
      sub="Con scadenza dove serve: alimentano gli avvisi"
      actions={<Button size="sm" icon="upload" variant="primary" onClick={() => { setShowUpload(!showUpload); setEditingDocId(null); }}>Carica documento</Button>}
      foot={`${docs.length} document${docs.length === 1 ? 'o' : 'i'}`}
    >
      {editingDocId && (
        <div className="pdx-panel">
          <span className="ds-h2">Modifica documento</span>
          {formFields(editForm, setEditForm as any, false)}
          <div className="pdx-panel-actions">
            <Button size="sm" onClick={() => setEditingDocId(null)}>Annulla</Button>
            <Button size="sm" variant="primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</Button>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="pdx-panel">
          <span className="ds-h2">Nuovo documento</span>
          {formFields(uploadForm, setUploadForm as any, true)}
          <div className={`pdx-drop${selectedFile ? ' is-done' : ''}`} onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}>
            <input ref={fileRef} type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <Icon name="doc" size={18} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
                  <span className="pdx-muted" style={{ fontSize: 12 }}>{fmtSize(selectedFile.size)}</span>
                </div>
                <span style={{ marginLeft: 'auto' }}><RowAct icon="close" label="Rimuovi file" danger onClick={() => setSelectedFile(null)} /></span>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 500 }}>Clicca per selezionare il file</div>
                <div className="pdx-muted" style={{ fontSize: 12, marginTop: 2 }}>PDF, JPG, PNG, DOC, XLS (max 20MB)</div>
              </div>
            )}
          </div>
          <div className="pdx-panel-actions">
            <Button size="sm" onClick={() => { setShowUpload(false); setSelectedFile(null); }}>Annulla</Button>
            <Button size="sm" variant="primary" icon="upload" onClick={handleUpload} disabled={uploading || !selectedFile}>{uploading ? 'Caricamento…' : 'Carica'}</Button>
          </div>
        </div>
      )}

      {loading ? <VuotoTab msg="Caricamento…" /> : docs.length === 0 ? <VuotoTab msg="Nessun documento caricato" /> : (
        <div className="ds-tablewrap">
          <table className="ds-table pdx-table" style={{ minWidth: 860 }}>
            <thead><tr>
              <Th k="tipo" sort={sort} onSort={toggle}>Tipo</Th>
              <Th k="nome" sort={sort} onSort={toggle}>Nome</Th>
              <Th k="sca" sort={sort} onSort={toggle}>Scadenza</Th>
              <Th>Note</Th>
              <Th k="car" sort={sort} onSort={toggle}>Caricato il</Th>
              <Th k="dim" sort={sort} onSort={toggle} right>Dimensione</Th>
              <Th />
            </tr></thead>
            <tbody>
              {sorted.map((d) => {
                const scad = d.scadenza ? scadenzaInfo(d.scadenza) : null;
                const tone: Tone = !scad ? 'na' : scad.cls === 'pd-scad-expired' ? 'ko' : scad.cls === 'pd-scad-warning' ? 'warn' : 'ok';
                return (
                  <tr key={d.id}>
                    <td><span className="pdx-tipo"><span aria-hidden="true" style={{ background: TIPO_COL[d.tipo] ?? '#71717A' }} />{cap(d.tipo)}</span></td>
                    <td style={{ maxWidth: 340 }}>
                      <a className="pdx-doclink" href={docUrl(d)} target="_blank" rel="noreferrer" title={d.nome}>{d.nome}</a>
                    </td>
                    <td>
                      {d.scadenza
                        ? <Dot tone={tone} title={scad?.label}>{new Date(d.scadenza).toLocaleDateString('it-IT')}{tone === 'ko' ? ' · Scaduto' : tone === 'warn' ? ` · ${scad?.label}` : ''}</Dot>
                        : <span className="pdx-muted">—</span>}
                    </td>
                    <td className="pdx-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.note || ''}>{d.note || '—'}</td>
                    <td>{fmtData(d.createdAt)}</td>
                    <td className="r pdx-muted">{fmtSize(d.dimensione)}</td>
                    <td className="r pdx-acts">
                      <RowAct icon="download" label="Scarica" href={docUrl(d)} />
                      <RowAct icon="edit" label="Modifica" onClick={() => openEdit(d)} />
                      <RowAct icon="trash" label="Elimina" danger onClick={() => handleDelete(d.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TabCard>
  );
}

// ─── TAB INFO ─────────────────────────────────────────
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

function TabInfo({ p }: { p: Padroncino }) {
  const durcSt = durcStatus(p.scadenzaDurc);
  const dvrSt = dvrStatus(p.scadenzaDvr, p.dvrEsente);
  const durcInfo = scadenzaInfo(p.scadenzaDurc);
  const dvrInfo = scadenzaInfo(p.scadenzaDvr);
  const toneOf = (cls: string): Tone => cls === 'pd-doc-ok' ? 'ok' : cls === 'pd-doc-warning' ? 'warn' : cls === 'pd-doc-expired' ? 'ko' : cls === 'pd-doc-esente' ? 'info' : 'na';
  const docs: Documento[] = ((p as any).documenti || []);
  const ultimo = (tipo: string) => docs.filter((d) => d.tipo === tipo).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  const contratto = ultimo('CONTRATTO');
  const visura = ultimo('VISURA');

  type Campo = { l: string; v?: React.ReactNode; mono?: boolean; tone?: Tone };
  const sezioni: { t: string; c: string; icon: IconName; campi: Campo[] }[] = [
    { t: 'Dati anagrafici', c: C.blue, icon: 'info', campi: [
      { l: 'Ragione sociale', v: p.ragioneSociale }, { l: 'Partita IVA', v: p.partitaIva, mono: true },
      { l: 'Codice fiscale', v: p.codiceFiscale, mono: true }, { l: 'Indirizzo', v: p.indirizzo },
      { l: 'Telefono', v: p.telefono }, { l: 'Email', v: p.email },
      { l: 'PEC', v: p.pec }, { l: 'IBAN', v: p.iban, mono: true },
    ] },
    { t: 'Rappresentante legale', c: C.purple, icon: 'user', campi: [
      { l: 'Nome', v: p.rappresentanteNome }, { l: 'Cognome', v: p.rappresentanteCognome },
      { l: 'Qualifica', v: p.qualificaRappresentante }, { l: 'Codice fiscale', v: p.cfRappresentante, mono: true },
    ] },
    { t: 'Documenti e scadenze', c: C.red, icon: 'doc', campi: [
      { l: 'DURC', tone: toneOf(durcSt.cls), v: p.scadenzaDurc
        ? `${durcSt.cls === 'pd-doc-expired' ? 'Scaduto il' : durcSt.cls === 'pd-doc-warning' ? 'In scadenza il' : 'Valido fino al'} ${fmtData(p.scadenzaDurc)}` : '' },
      { l: 'DVR', tone: toneOf(dvrSt.cls), v: p.dvrEsente ? 'Esente: non soggetto a DVR' : p.scadenzaDvr
        ? `${dvrSt.cls === 'pd-doc-expired' ? 'Scaduto il' : 'Valido fino al'} ${fmtData(p.scadenzaDvr)}` : '' },
      { l: 'Contratto', tone: contratto ? 'ok' : 'na', v: contratto ? `Caricato il ${fmtData(contratto.createdAt)}` : '' },
      { l: 'Visura', tone: visura ? 'ok' : 'na', v: visura ? `Caricata il ${fmtData(visura.createdAt)}` : '' },
    ] },
    { t: 'Note', c: C.yellow, icon: 'note', campi: [
      { l: 'Nota', v: p.note }, { l: 'Stato', tone: p.attivo ? 'ok' : 'na', v: p.attivo ? 'Attivo' : 'Dismesso' },
      ...(p.codice ? [{ l: 'Codice', v: p.codice, mono: true }] : []),
    ] },
  ];

  return (
    <div className="pdx-stack">
      <div className="ds-g2">
        {sezioni.map((s) => (
          <Card key={s.t} pad className="pdx-info">
            <div className="pdx-info-h"><Tile color={s.c} icon={s.icon} size="md" /><h2 className="ds-h2">{s.t}</h2></div>
            <dl className="pdx-dl">
              {s.campi.map((f) => {
                const vuoto = f.v === null || f.v === undefined || f.v === '';
                return (
                  <div key={f.l} style={f.l === 'Nota' ? { gridColumn: '1 / -1' } : undefined}>
                    <dt>{f.l}</dt>
                    <dd className={`${vuoto ? 'pdx-muted' : ''}${f.mono && !vuoto ? ' ds-mono' : ''}`}>
                      {f.tone && !vuoto && <span aria-hidden="true" className="pdx-dot" style={{ background: { ok: '#15A06A', ko: '#E5484D', warn: '#EA6A2A', na: '#A1A1AA', info: '#3D63F0' }[f.tone] }} />}
                      <span style={f.tone && !vuoto ? { color: { ok: '#15803D', ko: '#B91C1C', warn: '#C2410C', na: '#52525B', info: '#1D4ED8' }[f.tone] } : undefined}>{vuoto ? 'Non inserito' : f.v}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        ))}
      </div>

      {/* ── Andamento fatturato ── */}
      <AndamentoChart padroncinoId={p.id} />
    </div>
  );
}

// ─── GRAFICO ANDAMENTO FATTURATO ──────────────────────
function AndamentoChart({ padroncinoId }: { padroncinoId: string }) {
  const currentYear = new Date().getFullYear();
  const [yearFrom, setYearFrom] = useState<number>(currentYear);
  const [yearTo, setYearTo] = useState<number>(currentYear);
  const [data, setData] = useState<Array<{ mese: string; fatturato: number; addebiti: number; daBonificare: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dal = `${yearFrom}-01`;
        const al = `${yearTo}-12`;
        const res = await padronciniApi.andamento(padroncinoId, dal, al);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [padroncinoId, yearFrom, yearTo]);

  // Espandi su tutti i mesi del range (anche 0)
  const chartData = useMemo(() => {
    const byMese = new Map(data.map((d) => [d.mese, d]));
    const out: Array<{ label: string; mese: string; fatturato: number; addebiti: number; daBonificare: number }> = [];
    const MESI_LBL = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
    for (let y = yearFrom; y <= yearTo; y++) {
      for (let m = 1; m <= 12; m++) {
        const k = `${y}-${String(m).padStart(2, '0')}`;
        const row = byMese.get(k);
        const label = yearFrom === yearTo ? MESI_LBL[m - 1] : `${MESI_LBL[m - 1]} ${String(y).slice(2)}`;
        out.push({
          label,
          mese: k,
          fatturato: row?.fatturato ?? 0,
          addebiti: row?.addebiti ?? 0,
          daBonificare: row?.daBonificare ?? 0,
        });
      }
    }
    return out;
  }, [data, yearFrom, yearTo]);

  const years = [];
  for (let y = currentYear - 5; y <= currentYear + 1; y++) years.push(y);

  return (
    <Card>
      <div className="pdx-head">
        <div className="pdx-head-t">
          <h2 className="ds-h2">Andamento fatturato</h2>
          <span className="ds-cardsub">Fatturato, addebiti e da bonificare per mese</span>
        </div>
        <div className="ds-actions">
          <Select size="sm" label="Dal" value={String(yearFrom)} options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => { const n = parseInt(v); setYearFrom(n); if (n > yearTo) setYearTo(n); }} />
          <Select size="sm" label="Al" value={String(yearTo)} options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => { const n = parseInt(v); setYearTo(n); if (n < yearFrom) setYearFrom(n); }} />
        </div>
      </div>
      <div style={{ padding: '4px 12px 14px' }}>
        {loading ? (
          <VuotoTab msg="Caricamento…" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEEEF0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B6B73' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B6B73' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
              <Tooltip
                formatter={(v: any) => fmtEur2(Number(v))}
                cursor={{ fill: '#F6F6F7' }}
                contentStyle={{ background: '#FFFFFF', border: '1px solid #EAEAEC', borderRadius: 8, fontSize: 12 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fatturato"    name="Fatturato"     fill={C.blue}   radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="addebiti"     name="Addebiti"      fill={C.red}    radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="daBonificare" name="Da bonificare" fill={C.green}  radius={[3, 3, 0, 0]} maxBarSize={22} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// ─── DETTAGLIO PADRONCINO ─────────────────────────────
export function PadroncinoDetail({
  p: initialP,
  tab: tabProp,
  setTab: setTabProp,
  onRefresh,
  onBack,
}: {
  p: Padroncino;
  tab?: string;
  setTab?: (t: any) => void;
  onRefresh: () => void;
  onBack?: () => void;
}) {
  const [p, setP] = useState(initialP);
  const [showModifica, setShowModifica] = useState(false);
  const [tabInternal, setTabInternal] = useState('info');
  const tab = tabProp ?? tabInternal;
  const setTab = setTabProp ?? setTabInternal;

  const fetchDetail = useCallback(async () => {
    try {
      const updated = await padronciniApi.detail(initialP.id);
      setP(updated);
    } catch (error) {
      console.error('Errore caricamento dettaglio:', error);
    }
  }, [initialP.id]);

  useEffect(() => {
    setP(initialP);
    fetchDetail();
  }, [initialP.id, fetchDetail]);

  const handleRefresh = useCallback(async () => {
    await fetchDetail();
    onRefresh();
  }, [fetchDetail, onRefresh]);

  const handleSaveModifica = async (data: Partial<CreatePadroncinoPayload>) => {
    await padronciniApi.update(p.id, data);
    await handleRefresh();
  };

  const handleElimina = async () => {
    if (!window.confirm(`Eliminare definitivamente "${p.ragioneSociale}"?\nQuesta operazione non può essere annullata.`)) return;
    try {
      await padronciniApi.delete(p.id);
      onRefresh();
    } catch (e: any) {
      alert('Errore eliminazione: ' + e.message);
    }
  };

  const durcSt = durcStatus(p.scadenzaDurc);
  const dvrSt = dvrStatus(p.scadenzaDvr, p.dvrEsente);

  const nMezzi = p.mezziAssegnati?.filter((m) => !m.dataFine).length ?? 0;
  const nPalmari = p.palmariAssegnati?.filter((m) => !m.dataFine).length ?? 0;
  const nAutisti = p.codiciAutista?.filter((a) => !a.dataFine).length ?? 0;
  const nDocs = ((p as any).documenti || []).length;

  // Menu "Genera contratto": apre la scheda giusta e il suo modale
  const [contrOpen, setContrOpen] = useState(false);
  const [contrSig, setContrSig] = useState<{ tab: string; n: number }>({ tab: '', n: 0 });
  const apriContratto = (t: string) => { setContrOpen(false); setTab(t); setContrSig((s) => ({ tab: t, n: s.n + 1 })); };
  const sig = (t: string) => (contrSig.tab === t ? contrSig.n : 0);

  const TABS: { value: string; label: string; count?: number; color: string; icon: IconName }[] = [
    { value: 'info',      label: 'Anagrafica', color: '#0B0B0C', icon: 'info' },
    { value: 'mezzi',     label: 'Mezzi', count: nMezzi, color: C.teal, icon: 'mezzi' },
    { value: 'palmari',   label: 'Palmari', count: nPalmari, color: C.blue, icon: 'palm' },
    { value: 'autisti',   label: 'Autisti', count: nAutisti, color: C.purple, icon: 'cod' },
    { value: 'storico',   label: 'Storico conteggi', color: C.green, icon: 'trend' },
    { value: 'documenti', label: 'Documenti', count: nDocs, color: C.orange, icon: 'doc' },
    { value: 'log',       label: 'Storico modifiche', color: '#71717A', icon: 'stor' },
  ];

  const toneOf = (cls: string): Tone => cls === 'pd-doc-ok' ? 'ok' : cls === 'pd-doc-warning' ? 'warn' : cls === 'pd-doc-expired' ? 'ko' : cls === 'pd-doc-esente' ? 'info' : 'na';
  const durcTxt = !p.scadenzaDurc ? 'DURC non inserito'
    : durcSt.cls === 'pd-doc-expired' ? `DURC scaduto il ${fmtData(p.scadenzaDurc)}`
    : durcSt.cls === 'pd-doc-warning' ? `DURC in scadenza il ${fmtData(p.scadenzaDurc)}`
    : `DURC fino al ${fmtData(p.scadenzaDurc)}`;
  const dvrTxt = p.dvrEsente ? 'DVR esente' : !p.scadenzaDvr ? 'DVR non inserito'
    : dvrSt.cls === 'pd-doc-expired' ? `DVR scaduto il ${fmtData(p.scadenzaDvr)}` : `DVR fino al ${fmtData(p.scadenzaDvr)}`;
  const iniziali = p.ragioneSociale.replace(/[^A-Za-zÀ-ú0-9& ]/g, ' ').split(/\s+/).filter((w) => w && w !== '&').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal][p.ragioneSociale.length % 7];

  return (
    <div className="ds-page pdx-page">
      <header className="pdx-top">
        <div className="pdx-top-l">
          <span aria-hidden="true" className="pdx-avatar" style={{ background: p.attivo ? hue : '#A1A1AA' }}>{iniziali}</span>
          <div className="pdx-top-t">
            <span className="ds-eyebrow">
              {onBack ? <button type="button" className="pdx-link" onClick={onBack}>Padroncini</button> : 'Padroncino'}
              {p.partitaIva ? ` · P. IVA ${p.partitaIva}` : ''}{p.codice ? ` · Cod. ${p.codice}` : ''}
            </span>
            <div className="pdx-top-row">
              <h1 className="ds-h1" style={{ margin: 0 }}>{p.ragioneSociale}</h1>
              <Dot tone={p.attivo ? 'ok' : 'na'}>{p.attivo ? 'Attivo' : 'Dismesso'}</Dot>
              <Dot tone={toneOf(durcSt.cls)}>{durcTxt}</Dot>
              <Dot tone={toneOf(dvrSt.cls)}>{dvrTxt}</Dot>
            </div>
            <span className="ds-sub" style={{ margin: 0 }}>
              {[p.indirizzo, `${nMezzi} mezz${nMezzi === 1 ? 'o' : 'i'}`, `${nPalmari} palmar${nPalmari === 1 ? 'e' : 'i'}`, `${nAutisti} autist${nAutisti === 1 ? 'a' : 'i'}`].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <div className="ds-actions" style={{ alignItems: 'flex-start' }}>
          <div className="pdx-menuwrap">
            <Button icon="doc" aria-expanded={contrOpen} onClick={() => setContrOpen((v) => !v)}>
              Genera contratto <Icon name="chevDown" size={12} />
            </Button>
            {contrOpen && (
              <>
                <div className="pdx-menu-bg" onClick={() => setContrOpen(false)} />
                <div className="pdx-menu" role="menu">
                  {[
                    { t: 'Noleggio mezzi', s: 'Scegli i mezzi da includere', tab: 'mezzi', n: nMezzi },
                    { t: 'Noleggio palmari', s: 'Scegli i palmari da includere', tab: 'palmari', n: nPalmari },
                    { t: 'Codici autista', s: 'Scegli i codici da includere', tab: 'autisti', n: nAutisti },
                  ].map((o) => (
                    <button key={o.tab} type="button" role="menuitem" disabled={o.n === 0} onClick={() => apriContratto(o.tab)}>
                      <span style={{ fontWeight: 600 }}>{o.t}</span>
                      <span className="pdx-muted" style={{ fontSize: 12 }}>{o.n === 0 ? 'Niente assegnato' : o.s}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button icon="edit" onClick={() => setShowModifica(true)}>Modifica</Button>
          <Button icon="trash" variant="danger" onClick={handleElimina}>Elimina</Button>
        </div>
      </header>

      <Kpis items={[
        { label: 'Fatturato totale', value: p.fatturatoTotale != null ? fmtEur2(p.fatturatoTotale) : '—', sub: 'Con IVA · tutti i conteggi', color: C.blue, icon: 'euro' },
        { label: 'Addebiti totali', value: p.addebitiTotali != null ? fmtEur2(p.addebitiTotali) : '—', sub: 'Noleggi, palmari, ricariche, vari', color: C.red, icon: 'cont' },
        { label: 'Da bonificare', value: p.daBonificare != null ? fmtEur2(p.daBonificare) : '—', sub: 'Fatturato meno addebiti', color: C.green, icon: 'scudo' },
        { label: 'Media mensile', value: p.mediaMensile != null ? fmtEur2(p.mediaMensile) : '—', sub: 'Fattura al mese', color: C.purple, icon: 'trend' },
      ]} />

      <Tabs<string> items={TABS} value={tab} onChange={setTab} label="Sezioni del padroncino" />

      {tab === 'info' && <TabInfo p={p} />}
      {tab === 'mezzi' && <TabMezzi p={p} onRefresh={handleRefresh} contrSignal={sig('mezzi')} />}
      {tab === 'palmari' && <TabPalmari p={p} onRefresh={handleRefresh} contrSignal={sig('palmari')} />}
      {tab === 'autisti' && <TabAutisti p={p} onRefresh={handleRefresh} contrSignal={sig('autisti')} />}
      {tab === 'storico' && <TabStoricoConteggi p={p} />}
      {tab === 'documenti' && <TabDocumenti p={p} onRefresh={handleRefresh} />}
      {tab === 'log' && (
        <TabCard title="Storico modifiche" sub="Ogni modifica con valore precedente e autore">
          <div style={{ padding: '0 18px 16px' }}><LogEntita entityType="padroncino" entityId={p.id} /></div>
        </TabCard>
      )}

      {showModifica && (
        <ModificaPadroncinoModal
          open={showModifica}
          p={p}
          onClose={() => setShowModifica(false)}
          onSave={handleSaveModifica}
        />
      )}
    </div>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────
export default function PadronciniPage() {
  const navigate = useNavigate();
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ATTIVO');
  const [showNuovo, setShowNuovo] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ creati: number; saltati: number; errori: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportaExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await padronciniApi.importaExcel(file);
      setImportResult(result);
      await load();
    } catch (err: any) {
      alert('Errore importazione: ' + (err?.message ?? 'Errore sconosciuto'));
    } finally {
      setImportando(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [res, st] = await Promise.all([
        padronciniApi.list(),
        padronciniApi.stats(),
      ]);
      setPadroncini(res.data);
      setStats(st);
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
      const matchSearch = !s || p.ragioneSociale.toLowerCase().includes(s) ||
        (p.partitaIva || '').toLowerCase().includes(s) || (p.codice || '').toLowerCase().includes(s);
      const matchFiltro =
        filtro === 'TUTTI' || filtro === 'ALERT' ||
        (filtro === 'ATTIVO' && p.attivo) ||
        (filtro === 'DISMESSO' && !p.attivo);
      return matchSearch && matchFiltro;
    });
  }, [padroncini, search, filtro]);

  const handleCreate = async (form: CreatePadroncinoPayload) => {
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
        note: form.note || undefined,
      });
      await load();
      navigate(`/padroncini/${nuovo.id}`);
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  // ── Solo visualizzazione: stato documenti come nel mockup ──
  const docDurc = (p: Padroncino): DocInfo => {
    const st = durcStatus(p.scadenzaDurc);
    const data = fmtData(p.scadenzaDurc);
    if (st.cls === 'pd-doc-absent') return { t: 'Non inserito', tone: 'na', k: 0 };
    if (st.cls === 'pd-doc-expired') return { t: `Scaduto ${data}`, tone: 'ko', k: new Date(p.scadenzaDurc!).getTime() };
    if (st.cls === 'pd-doc-warning') return { t: `In scadenza ${data}`, tone: 'warn', k: new Date(p.scadenzaDurc!).getTime() };
    return { t: data, tone: 'ok', k: new Date(p.scadenzaDurc!).getTime() };
  };
  const docDvr = (p: Padroncino): DocInfo => {
    const st = dvrStatus(p.scadenzaDvr, p.dvrEsente);
    const data = fmtData(p.scadenzaDvr);
    if (st.cls === 'pd-doc-esente') return { t: 'Esente', tone: 'info', k: 9e15 };
    if (st.cls === 'pd-doc-absent') return { t: 'Non inserito', tone: 'na', k: 0 };
    if (st.cls === 'pd-doc-expired') return { t: `Scaduto ${data}`, tone: 'ko', k: new Date(p.scadenzaDvr!).getTime() };
    return { t: data, tone: 'ok', k: new Date(p.scadenzaDvr!).getTime() };
  };
  const conAlert = (p: Padroncino) => p.attivo && (docDurc(p).tone !== 'ok' || !['ok', 'info'].includes(docDvr(p).tone));
  const nAttivi = padroncini.filter((p) => p.attivo).length;
  const nAlert = padroncini.filter(conAlert).length;

  const righe = filtro === 'ALERT' ? filtered.filter(conAlert) : filtered;
  const { sorted, sort, toggle } = useSort<Padroncino, SortK>(righe, (p, k) => {
    switch (k) {
      case 'nome': return p.ragioneSociale.toLowerCase();
      case 'stato': return p.attivo ? 0 : 1;
      case 'durc': return docDurc(p).k;
      case 'dvr': return docDvr(p).k;
      case 'palmari': return p.palmariAssegnati?.filter((m) => !m.dataFine).length ?? 0;
      case 'mezzi': return p.mezziAssegnati?.filter((m) => !m.dataFine).length ?? 0;
      case 'autisti': return p.codiciAutista?.filter((a) => !a.dataFine).length ?? 0;
      case 'fatturato': return p.fatturatoTotale ?? null;
    }
  }, { key: 'nome', dir: 'asc' });

  // Testo dell'avviso documenti, costruito dai dati
  const attiviP = padroncini.filter((p) => p.attivo);
  const nomeBreve = (n: string) => n.replace(/\s+(S\.?R\.?L\.?S?\.?|SRLS|SRL|SAS|SNC|S\.?A\.?S\.?)$/i, '').trim();
  const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
  const scaduti = attiviP.filter((p) => docDurc(p).tone === 'ko').map((p) => nomeBreve(p.ragioneSociale));
  const inScad = attiviP.filter((p) => docDurc(p).tone === 'warn');
  const senzaDoc = attiviP.filter((p) => docDurc(p).tone === 'na' && docDvr(p).tone === 'na').map((p) => nomeBreve(p.ragioneSociale));
  const frasi = [
    scaduti.length ? `DURC scaduto per ${lista(scaduti)}` : '',
    inScad.length ? `in scadenza per ${lista(inScad.map((p) => `${nomeBreve(p.ragioneSociale)} il ${fmtData(p.scadenzaDurc).slice(0, 5)}`))}` : '',
  ].filter(Boolean).join('; ');
  const avviso = [frasi ? frasi.charAt(0).toUpperCase() + frasi.slice(1) + '.' : '', senzaDoc.length ? `${lista(senzaDoc)} ${senzaDoc.length === 1 ? 'non ha' : 'non hanno'} DURC né DVR a sistema.` : ''].filter(Boolean).join(' ');
  // Stesso criterio della tabella: padroncini attivi con DURC scaduto o in scadenza
  const nAlertDoc = scaduti.length + inScad.length;

  if (loading) return <Page><Card pad><Empty>Caricamento padroncini…</Empty></Card></Page>;
  if (error) return (
    <Page><Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></Page>
  );

  const AV = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
  const iniz = (n: string) => n.replace(/[^A-Za-zÀ-ú0-9& ]/g, ' ').split(/\s+/).filter((w) => w && w !== '&').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <Page>
      <PageHeader
        eyebrow="Operativo"
        title="Padroncini"
        sub="Anagrafiche, documenti, risorse assegnate e fatturato"
        actions={<>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportaExcel} />
          <Button icon="upload" onClick={() => importInputRef.current?.click()} disabled={importando} title="Importa padroncini da file Excel">
            {importando ? 'Importazione…' : 'Importa Excel'}
          </Button>
          <Button icon="plus" variant="primary" onClick={() => setShowNuovo(true)}>Nuovo padroncino</Button>
        </>}
      />

      <Kpis items={[
        { label: 'Padroncini attivi', value: stats?.attivi ?? nAttivi, sub: `${stats?.dismissi ?? padroncini.length - nAttivi} dismessi · ${stats?.totali ?? padroncini.length} totali`, color: C.blue, icon: 'pad' },
        { label: 'Alert documenti', value: nAlertDoc, sub: 'DURC scaduti o in scadenza', color: C.red, icon: 'alert', subColor: nAlertDoc ? '#B91C1C' : undefined },
        { label: 'Flotta mezzi', value: stats?.flottaMezzi ?? 0, sub: `${stats?.flottaDisponibili ?? 0} disponibili`, color: C.teal, icon: 'mezzi' },
        { label: 'Palmari attivi', value: stats?.palmariAttivi ?? 0, sub: `su ${stats?.palmariTotali ?? 0} totali`, color: C.purple, icon: 'palm' },
      ]} />

      {avviso && (
        <div className="pl2-alert">
          <span aria-hidden="true" className="pl2-dot" />
          <span style={{ flex: '1 1 360px' }}>
            <span style={{ fontWeight: 600 }}>{nAlertDoc} alert document{nAlertDoc === 1 ? 'o' : 'i'}.</span>{' '}
            <span style={{ color: '#3F3F46' }}>{avviso}</span>
          </span>
          <Button size="sm" onClick={() => setFiltro('ALERT')}>Mostra solo questi</Button>
        </div>
      )}

      <Card>
        <div className="pl2-toolbar">
          <SegTabs<Filtro>
            value={filtro}
            onChange={setFiltro}
            label="Vista"
            items={[
              { value: 'ATTIVO', label: 'Attivi', count: nAttivi },
              { value: 'DISMESSO', label: 'Dismessi', count: padroncini.length - nAttivi },
              { value: 'TUTTI', label: 'Tutti', count: padroncini.length },
              { value: 'ALERT', label: 'Con alert', count: nAlert },
            ]}
          />
          <SearchBox value={search} onChange={setSearch} placeholder="Cerca per nome, codice o P. IVA…" width={300} />
        </div>
        <div className="ds-tablewrap">
          <table className="ds-table pl2-table">
            <thead>
              <tr>
                <Th k="nome" sort={sort} onSort={toggle}>Padroncino</Th>
                <Th k="stato" sort={sort} onSort={toggle}>Stato</Th>
                <Th k="durc" sort={sort} onSort={toggle}>DURC</Th>
                <Th k="dvr" sort={sort} onSort={toggle}>DVR</Th>
                <Th k="palmari" sort={sort} onSort={toggle} right>Palmari</Th>
                <Th k="mezzi" sort={sort} onSort={toggle} right>Mezzi</Th>
                <Th k="autisti" sort={sort} onSort={toggle} right>Autisti</Th>
                <Th k="fatturato" sort={sort} onSort={toggle} right>Fatturato totale</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8}><Empty>Nessun padroncino trovato</Empty></td></tr>
              )}
              {sorted.map((p, i) => {
                const durc = docDurc(p);
                const dvr = docDvr(p);
                const durcInfo = scadenzaInfo(p.scadenzaDurc);
                const sub = [p.codice ? `Cod. ${p.codice}` : '', p.indirizzo || 'Sede non inserita', p.partitaIva ? `P. IVA ${p.partitaIva}` : ''].filter(Boolean).join(' · ');
                return (
                  <tr key={p.id} className="is-clickable" onClick={() => navigate(`/padroncini/${p.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/padroncini/${p.id}`); }} tabIndex={0}>
                    <td>
                      <div className="pl2-who">
                        <span aria-hidden="true" className="pl2-av" style={{ background: p.attivo ? AV[i % 7] : '#A1A1AA' }}>{iniz(p.ragioneSociale)}</span>
                        <span className="pl2-who-t">
                          <span className="pl2-name">{p.ragioneSociale}</span>
                          <span className="pl2-sub" title={sub}>{sub}</span>
                        </span>
                      </div>
                    </td>
                    <td><Dot tone={p.attivo ? 'ok' : 'na'}>{p.attivo ? 'Attivo' : 'Dismesso'}</Dot></td>
                    <td><Dot tone={durc.tone} title={durcInfo?.label}>{durc.t}</Dot></td>
                    <td><Dot tone={dvr.tone}>{dvr.t}</Dot></td>
                    <td className="r">{p.palmariAssegnati?.filter((m) => !m.dataFine).length ?? 0}</td>
                    <td className="r">{p.mezziAssegnati?.filter((m) => !m.dataFine).length ?? 0}</td>
                    <td className="r">{p.codiciAutista?.filter((a) => !a.dataFine).length ?? 0}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{p.fatturatoTotale != null ? fmtEur2(p.fatturatoTotale) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pl2-foot">{sorted.length} di {padroncini.length} padroncini · fatturato con IVA di tutti i conteggi</div>
      </Card>

      {importResult && (
        <div className="modal-overlay" onClick={() => setImportResult(null)}>
          <div className="modal-panel pl2-import" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Risultati importazione Excel</h3>
            <div className="pl2-import-stats">
              <div><strong>{importResult.creati}</strong> creati</div>
              <div><strong>{importResult.saltati}</strong> saltati (duplicati)</div>
              <div><strong>{importResult.errori.length}</strong> errori</div>
            </div>
            {importResult.errori.length > 0 && (
              <div className="pl2-import-err">
                <h4>Errori</h4>
                <ul>
                  {importResult.errori.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  {importResult.errori.length > 20 && <li>… e altri {importResult.errori.length - 20}</li>}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={() => setImportResult(null)}>Chiudi</Button></div>
          </div>
        </div>
      )}

      <NuovoPadroncinoModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleCreate} />
    </Page>
  );
}
