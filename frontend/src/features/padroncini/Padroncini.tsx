import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  padronciniApi, mezziApi, palmariApi, codiciAutistaApi,
  Padroncino, NuovoPadroncino,
} from '../../lib/api';
import LogEntita from '../log/LogEntita';

// ─── HELPERS ──────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

/** Calcola stato DURC dal testo */
function durcStatus(dateStr?: string | null): { label: string; cls: string } {
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const info = scadenzaInfo(dateStr);
  if (!info) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  if (info.days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired' };
  if (info.days <= 10) return { label: 'IN SCADENZA', cls: 'pd-doc-warning' };
  return { label: 'REGOLARE', cls: 'pd-doc-ok' };
}

/** Stato DVR */
function dvrStatus(dateStr?: string | null, esente?: boolean): { label: string; cls: string } {
  if (esente) return { label: 'ESENTE', cls: 'pd-doc-esente' };
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  return { label: 'REGOLARE', cls: 'pd-doc-ok' };
}

// ─── TIPI LOCALI ──────────────────────────────────────
type Filtro = 'TUTTI' | 'ATTIVO' | 'DISMESSO';

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
  onSave: (data: Partial<NuovoPadroncino>) => Promise<void>;
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
    dvrEsente: (p as any).dvrEsente || false,
    note: p.note || '',
    attivo: p.attivo,
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
        dvrEsente: (p as any).dvrEsente || false,
        note: p.note || '',
        attivo: p.attivo,
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
        dvrEsente: form.dvrEsente,
        note: form.note || undefined,
        attivo: form.attivo,
      } as any);
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
    <div className="pd-modal-overlay" onClick={onClose}>
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
  onSave: (data: NuovoPadroncino) => Promise<void>;
}) {
  const empty: NuovoPadroncinoForm = {
    ragioneSociale: '', partitaIva: '', codiceFiscale: '',
    indirizzo: '', telefono: '', email: '', pec: '', iban: '',
    scadenzaDurc: '', dvrEsente: false, note: '',
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
    <div className="pd-modal-overlay" onClick={handleClose}>
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
    <div className="pd-modal-overlay" onClick={onClose}>
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

  const handleRimuovi = async (assId: string) => {
    if (!window.confirm('Rimuovere questo mezzo dal padroncino?')) return;
    await padronciniApi.rimuoviMezzo(p.id, assId);
    await onRefresh();
  };

  const attivi = (p.mezziAssegnati || []).filter((m) => !m.dataFine);
  const storici = (p.mezziAssegnati || []).filter((m) => m.dataFine);

  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm" onClick={() => { loadMezziDisp(); setShowAssegna(true); }}>
          🔗 Assegna Mezzo
        </button>
      </div>

      {attivi.length === 0 ? (
        <EmptyTab icon="🚚" msg="Nessun mezzo assegnato attualmente" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr>
                <th>TARGA</th><th>MARCA / MODELLO</th><th>TIPO</th>
                <th>DATA INIZIO</th><th>TARIFFA</th><th></th>
              </tr>
            </thead>
            <tbody>
              {attivi.map((m) => (
                <tr key={m.id} className="pd-item-row">
                  <td className="pd-item-targa">{m.targa}</td>
                  <td><span className="pd-item-marca">{m.marca}</span> <span className="pd-item-modello">{m.modello}</span></td>
                  <td>{m.alimentazione}</td>
                  <td>{fmtData(m.dataInizio)}</td>
                  <td>{m.tariffa != null ? fmtEur(m.tariffa) : <span className="pd-empty">—</span>}</td>
                  <td>
                    <button className="fm-del-btn" title="Rimuovi assegnazione" onClick={() => handleRimuovi(m.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {storici.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 0' }}>
            Storico assegnazioni ({storici.length})
          </summary>
          <div className="pd-items-table-wrap" style={{ marginTop: 8 }}>
            <table className="pd-items-table">
              <thead>
                <tr><th>TARGA</th><th>INIZIO</th><th>FINE</th></tr>
              </thead>
              <tbody>
                {storici.map((m) => (
                  <tr key={m.id} className="pd-item-row" style={{ opacity: 0.6 }}>
                    <td>{m.targa}</td>
                    <td>{fmtData(m.dataInizio)}</td>
                    <td>{fmtData(m.dataFine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna Mezzo a Padroncino" items={mezziDisp}
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

  const handleRimuovi = async (assId: string) => {
    if (!window.confirm('Rimuovere questo palmare dal padroncino?')) return;
    await padronciniApi.rimuoviPalmare(p.id, assId);
    await onRefresh();
  };

  const attivi = (p.palmariAssegnati || []).filter((pal) => !pal.dataFine);

  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm" onClick={() => { loadPalmariDisp(); setShowAssegna(true); }}>
          🔗 Assegna Palmare
        </button>
      </div>

      {attivi.length === 0 ? (
        <EmptyTab icon="📱" msg="Nessun palmare assegnato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr><th>CODICE</th><th>TARIFFA</th><th>DATA INIZIO</th><th></th></tr>
            </thead>
            <tbody>
              {attivi.map((pal) => (
                <tr key={pal.id} className="pd-item-row">
                  <td className="pd-item-targa">{pal.codice}</td>
                  <td>{pal.tariffa != null ? fmtEur(pal.tariffa) : '—'}</td>
                  <td>{fmtData(pal.dataInizio)}</td>
                  <td>
                    <button className="fm-del-btn" title="Rimuovi" onClick={() => handleRimuovi(pal.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna Palmare a Padroncino" items={palmariDisp}
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
      // Filtra solo quelli non assegnati (attivi senza dataFine)
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

  const attivi = (p.codiciAutista || []).filter((a) => !a.dataFine);

  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm" onClick={() => { loadAutistiDisp(); setShowAssegna(true); }}>
          🔗 Assegna Codice Autista
        </button>
      </div>

      {attivi.length === 0 ? (
        <EmptyTab icon="👤" msg="Nessun codice autista assegnato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr><th>CODICE</th><th>NOME</th><th>DATA INIZIO</th><th></th></tr>
            </thead>
            <tbody>
              {attivi.map((a) => (
                <tr key={a.id} className="pd-item-row">
                  <td className="pd-item-targa">{a.codice}</td>
                  <td>{[a.nome, a.cognome].filter(Boolean).join(' ') || <span className="pd-empty">—</span>}</td>
                  <td>{fmtData(a.dataInizio)}</td>
                  <td>
                    <button className="fm-del-btn" title="Rimuovi" onClick={() => handleRimuovi(a.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssegnaModal
        open={showAssegna} onClose={() => setShowAssegna(false)}
        onSave={handleAssegna} title="Assegna Codice Autista" items={autistiDisp}
      />
    </div>
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

function TabDocumenti({ p }: { p: Padroncino }) {
  const [docs, setDocs] = useState<Documento[]>((p as any).documenti || []);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ nome: '', tipo: 'CONTRATTO', scadenza: '', note: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/padroncini/${p.id}/documenti`);
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

      const res = await fetch(`${API_BASE}/padroncini/${p.id}/documenti`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setShowUpload(false);
      setSelectedFile(null);
      setUploadForm({ nome: '', tipo: 'CONTRATTO', scadenza: '', note: '' });
      await loadDocs();
    } catch (e: any) {
      alert('Errore upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Eliminare questo documento?')) return;
    try {
      await fetch(`${API_BASE}/padroncini/${p.id}/documenti/${docId}`, { method: 'DELETE' });
      await loadDocs();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const fmtSize = (b?: number) => {
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const TIPI_DOC = [
    'CONTRATTO', 'VISURA', 'DURC', 'DVR', 'IDENTITA', 'ALTRO',
  ];

  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm" onClick={() => setShowUpload(!showUpload)}>
          📎 Carica Documento
        </button>
      </div>

      {showUpload && (
        <div className="pd-upload-panel">
          <div className="pd-modal-grid2" style={{ marginBottom: 12 }}>
            <div className="pd-modal-field">
              <label>Tipo Documento *</label>
              <select className="pd-modal-input" value={uploadForm.tipo}
                onChange={(e) => setUploadForm((f) => ({ ...f, tipo: e.target.value }))}>
                {TIPI_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="pd-modal-field">
              <label>Nome (opzionale)</label>
              <input className="pd-modal-input" placeholder="Es. Contratto 2024"
                value={uploadForm.nome}
                onChange={(e) => setUploadForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="pd-modal-field">
              <label>Scadenza (opzionale)</label>
              <input className="pd-modal-input" type="date" value={uploadForm.scadenza}
                onChange={(e) => setUploadForm((f) => ({ ...f, scadenza: e.target.value }))} />
            </div>
            <div className="pd-modal-field">
              <label>Note</label>
              <input className="pd-modal-input" value={uploadForm.note}
                onChange={(e) => setUploadForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>

          <div
            className={`pd-doc-upload-zone ${selectedFile ? 'pd-doc-upload-done' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtSize(selectedFile.size)}</div>
                </div>
                <button className="fm-del-btn" style={{ marginLeft: 'auto' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>✕</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28 }}>📂</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Clicca per selezionare il file</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>PDF, JPG, PNG, DOC, XLS (max 20MB)</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn-outline btn-sm" onClick={() => { setShowUpload(false); setSelectedFile(null); }}>Annulla</button>
            <button className="btn-primary btn-sm" onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? 'Caricamento...' : '⬆️ Carica'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="pd-empty-tab"><div className="pd-spinner" /></div>
      ) : docs.length === 0 ? (
        <EmptyTab icon="📁" msg="Nessun documento caricato" />
      ) : (
        <div className="pd-items-table-wrap">
          <table className="pd-items-table">
            <thead>
              <tr><th>DOCUMENTO</th><th>TIPO</th><th>SCADENZA</th><th>DIM.</th><th>DATA</th><th></th></tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const scad = d.scadenza ? scadenzaInfo(d.scadenza) : null;
                return (
                  <tr key={d.id} className="pd-item-row">
                    <td>
                      <a
                        href={`${API_BASE.replace('/api', '')}/uploads/padroncini/${d.filePath.split('/').pop()}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}
                      >
                        📄 {d.nome}
                      </a>
                    </td>
                    <td>
                      <span className="pd-doc-badge pd-doc-ok">{d.tipo}</span>
                    </td>
                    <td>
                      {d.scadenza ? (
                        <span className={`pd-scad-days ${scad?.cls}`}>
                          {new Date(d.scadenza).toLocaleDateString('it-IT')}
                          {scad && <span style={{ fontSize: 10, marginLeft: 4 }}>({scad.label})</span>}
                        </span>
                      ) : <span className="pd-empty">—</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtSize(d.dimensione)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtData(d.createdAt)}</td>
                    <td>
                      <button className="fm-del-btn" title="Elimina" onClick={() => handleDelete(d.id)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const dvrSt = dvrStatus(p.scadenzaDvr, (p as any).dvrEsente);
  const durcInfo = scadenzaInfo(p.scadenzaDurc);

  return (
    <div className="pd-info-grid">
      <div className="pd-section">
        <h4>Dati Anagrafici</h4>
        <Field label="Ragione Sociale" value={p.ragioneSociale} />
        <Field label="Partita IVA" value={p.partitaIva} mono />
        <Field label="Codice Fiscale" value={p.codiceFiscale} mono />
        <Field label="Indirizzo" value={p.indirizzo} />
      </div>
      <div className="pd-section">
        <h4>Contatti</h4>
        <Field label="Telefono" value={p.telefono} />
        <Field label="Email" value={p.email} />
        <Field label="PEC" value={p.pec} />
        <Field label="IBAN" value={p.iban} mono />
      </div>
      <div className="pd-section pd-section-full">
        <h4>Documenti & Scadenze</h4>
        <div className="pd-scadenze">
          {/* DURC */}
          <div className={`pd-scad-row ${durcInfo?.cls ?? 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DURC</span>
            {p.scadenzaDurc ? (
              <>
                <span className="pd-scad-date">{new Date(p.scadenzaDurc).toLocaleDateString('it-IT')}</span>
                <span className={`pd-doc-badge ${durcSt.cls}`}>{durcSt.label}</span>
                {durcInfo && <span className="pd-scad-days">{durcInfo.label}</span>}
              </>
            ) : (
              <>
                <span className="pd-scad-date pd-empty">Non inserito</span>
                <span className="pd-doc-badge pd-doc-absent">ASSENTE</span>
              </>
            )}
          </div>

          {/* DVR */}
          <div className={`pd-scad-row ${(p as any).dvrEsente ? 'pd-scad-esente' : p.scadenzaDvr ? 'pd-scad-ok' : 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DVR</span>
            {(p as any).dvrEsente ? (
              <>
                <span className="pd-scad-date">Non soggetto a DVR</span>
                <span className="pd-doc-badge pd-doc-esente">ESENTE</span>
              </>
            ) : p.scadenzaDvr ? (
              <>
                <span className="pd-scad-date">{new Date(p.scadenzaDvr).toLocaleDateString('it-IT')}</span>
                <span className="pd-doc-badge pd-doc-ok">REGOLARE</span>
              </>
            ) : (
              <>
                <span className="pd-scad-date pd-empty">Non caricato</span>
                <span className="pd-doc-badge pd-doc-absent">ASSENTE</span>
              </>
            )}
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
  const [showModifica, setShowModifica] = useState(false);

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

  const handleSaveModifica = async (data: Partial<NuovoPadroncino>) => {
    await padronciniApi.update(p.id, data);
    await handleRefresh();
  };

  const durc = scadenzaInfo(p.scadenzaDurc);
  const durcSt = durcStatus(p.scadenzaDurc);
  const dvrSt = dvrStatus(p.scadenzaDvr, (p as any).dvrEsente);

  const TABS = [
    { key: 'info', label: 'Anagrafica' },
    { key: 'mezzi', label: `Mezzi (${p.mezziAssegnati?.filter((m) => !m.dataFine).length ?? 0})` },
    { key: 'palmari', label: `Palmari (${p.palmariAssegnati?.filter((m) => !m.dataFine).length ?? 0})` },
    { key: 'autisti', label: `Autisti (${p.codiciAutista?.filter((a) => !a.dataFine).length ?? 0})` },
    { key: 'documenti', label: 'Documenti' },
    { key: 'log', label: 'Log' },
  ];

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
            <span className={`pd-doc-badge ${durcSt.cls}`}>DURC: {durcSt.label}</span>
            <span className={`pd-doc-badge ${dvrSt.cls}`}>DVR: {dvrSt.label}</span>
            {p.fatturatoMese != null && (
              <span className="pd-detail-fatt">Fatt. {fmtEur(p.fatturatoMese)}</span>
            )}
          </div>
        </div>
        <div className="pd-detail-actions">
          <button className="btn-outline btn-sm" onClick={() => setShowModifica(true)}>✏️ Modifica</button>
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
        {tab === 'documenti' && <TabDocumenti p={p} />}
        {tab === 'log' && <LogEntita entityType="padroncino" entityId={p.id} />}
      </div>

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
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TUTTI');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState('info');
  const [showNuovo, setShowNuovo] = useState(false);
  const [stats, setStats] = useState<any>(null);

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
        (p.partitaIva || '').toLowerCase().includes(s);
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
        dvrEsente: (form as any).dvrEsente,
        note: form.note || undefined,
      } as any);
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
            <span className="pd-page-stat-sub">DURC scaduti o in scadenza</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.flottaMezzi ?? 0}</span>
            <span className="pd-page-stat-label">FLOTTA MEZZI</span>
            <span className="pd-page-stat-sub">{stats?.flottaDisponibili ?? 0} disponibili</span>
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
          <input className="pd-search" placeholder="Cerca per nome o P.IVA..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pd-filters">
          {(['TUTTI', 'ATTIVO', 'DISMESSO'] as const).map((f) => (
            <button key={f} className={`pd-filter-btn ${filtro === f ? 'pd-filter-active' : ''}`}
              onClick={() => setFiltro(f)}>{f}</button>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="pd-empty-row">Nessun padroncino trovato</td></tr>
            )}
            {filtered.map((p) => {
              const durcSt = durcStatus(p.scadenzaDurc);
              const dvrSt = dvrStatus(p.scadenzaDvr, (p as any).dvrEsente);
              return (
                <tr key={p.id} className={`pd-row ${selected === p.id ? 'pd-row-selected' : ''}`}
                  onClick={() => { setSelected(p.id); setTab('info'); }}>
                  <td>
                    <span className="pd-ragsoc">{p.ragioneSociale}</span>
                    {p.partitaIva && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PI: {p.partitaIva}</div>}
                  </td>
                  <td>
                    <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
                      {p.attivo ? 'ATTIVO' : 'DISMESSO'}
                    </span>
                  </td>
                  <td><span className={`pd-doc-badge ${durcSt.cls}`}>{durcSt.label}</span></td>
                  <td><span className={`pd-doc-badge ${dvrSt.cls}`}>{dvrSt.label}</span></td>
                  <td>
                    <span className="pd-count pd-count-blue">
                      {p.palmariAssegnati?.filter((m) => !m.dataFine).length ?? 0}
                    </span>
                  </td>
                  <td>
                    <span className="pd-count pd-count-blue">
                      {p.mezziAssegnati?.filter((m) => !m.dataFine).length ?? 0}
                    </span>
                  </td>
                  <td>
                    <span className="pd-count pd-count-blue">
                      {p.codiciAutista?.filter((a) => !a.dataFine).length ?? 0}
                    </span>
                  </td>
                  <td>
                    <button className="btn-primary btn-sm"
                      onClick={(e) => { e.stopPropagation(); setSelected(p.id); setTab('info'); }}>
                      Dettagli
                    </button>
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
