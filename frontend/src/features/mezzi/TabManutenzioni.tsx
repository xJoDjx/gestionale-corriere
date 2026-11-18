// TabManutenzioni.tsx
import { useState, useEffect, useRef } from 'react';
import { manutenzioniApi } from '../../lib/api';
import type { Manutenzione } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import DocumentPreview from '../../components/ui/DocumentPreview';
import type { PreviewTarget } from '../../components/ui/DocumentPreview';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n?: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

interface FormState {
  dataInizio: string;
  dataFine: string;
  descrizione: string;
  costo: string;
  fornitore: string;
  note: string;
}

const emptyForm = (): FormState => ({
  dataInizio: new Date().toISOString().split('T')[0],
  dataFine: '',
  descrizione: '',
  costo: '',
  fornitore: '',
  note: '',
});

interface Props { mezzoId: string }

export default function TabManutenzioni({ mezzoId }: Props) {
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [items, setItems] = useState<Manutenzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalCosto = items.reduce((s, m) => s + Number(m.costo ?? 0), 0);

  const load = async () => {
    setLoading(true);
    try { setItems(await manutenzioniApi.list(mezzoId)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [mezzoId]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setFile(null);
    setShowModal(true);
  };

  const openEdit = (m: Manutenzione) => {
    setEditId(m.id);
    setForm({
      dataInizio: m.dataInizio.split('T')[0],
      dataFine: m.dataFine ? m.dataFine.split('T')[0] : '',
      descrizione: m.descrizione,
      costo: m.costo != null ? String(m.costo) : '',
      fornitore: m.fornitore ?? '',
      note: m.note ?? '',
    });
    setFile(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFile(null);
  };

  const handleSave = async () => {
    if (!form.descrizione.trim() || !form.dataInizio) return;
    setSaving(true);
    try {
      const data = {
        mezzoId,
        dataInizio: form.dataInizio,
        dataFine: form.dataFine || undefined,
        descrizione: form.descrizione.trim(),
        costo: form.costo ? parseFloat(form.costo) : undefined,
        fornitore: form.fornitore || undefined,
        note: form.note || undefined,
      };
      if (editId) {
        await manutenzioniApi.update(editId, data, file ?? undefined);
      } else {
        await manutenzioniApi.create(data, file ?? undefined);
      }
      closeModal();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, desc: string) => {
    if (!confirm(`Eliminare l'intervento "${desc}"?`)) return;
    try {
      await manutenzioniApi.remove(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) { alert(e.message); }
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const D_MAN = 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z';
  const ico = (d: string, size = 12, sw = 2) => (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );

  return (
    <>
      <DocumentPreview target={preview} onClose={() => setPreview(null)} />
      {loading ? (
        <section className="dm2-card dm2-empty"><span className="dm2-muted">Caricamento manutenzioni…</span></section>
      ) : items.length === 0 ? (
        <section className="dm2-card dm2-empty">
          <span aria-hidden="true" className="dm2-tile" style={{ width: 40, height: 40, borderRadius: 10, background: '#0E9494' }}>{ico(D_MAN, 18, 2.2)}</span>
          <span className="dm2-empty-t">Nessuna manutenzione registrata</span>
          <span className="dm2-muted" style={{ maxWidth: 440 }}>Interventi, fornitore, costo e fattura restano nello storico del mezzo.</span>
          <button type="button" className="dm2-btn dm2-btn-primary" onClick={openNew}>Aggiungi manutenzione</button>
        </section>
      ) : (
        <section className="dm2-card dm2-list">
          <div className="dm2-lhead">
            <div className="dm2-col" style={{ gap: 2 }}>
              <h2 className="dm2-h2">Manutenzioni</h2>
              <span className="dm2-muted">{items.length} intervent{items.length === 1 ? 'o' : 'i'} · costo totale {fmtEur(totalCosto)}</span>
            </div>
            <button type="button" className="dm2-btn dm2-btn-sm" onClick={openNew}>{ico('M12 5v14M5 12h14')}Nuovo intervento</button>
          </div>
          {items.map((m) => {
            const inCorso = !m.dataFine;
            return (
              <div key={m.id} className="dm2-ev dm2-ev-doc">
                <span aria-hidden="true" className="dm2-tile" style={{ width: 26, height: 26, borderRadius: 7, background: inCorso ? '#EA6A2A' : '#0E9494' }}>{ico(D_MAN, 12, 2.4)}</span>
                <span className="dm2-ev-data">{fmtDate(m.dataInizio)}</span>
                <span className="dm2-tag" style={{ color: inCorso ? '#C2410C' : '#15803D' }}><span aria-hidden="true" className="dm2-dot" style={{ background: inCorso ? '#EA6A2A' : '#15A06A' }} />{inCorso ? 'In corso' : `Chiusa ${fmtDate(m.dataFine)}`}</span>
                <span className="dm2-col" style={{ minWidth: 0 }}>
                  <span className="dm2-ev-tit" title={m.descrizione}>{m.descrizione}</span>
                  {(m.fornitore || m.note) && <span className="dm2-small dm2-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[m.fornitore, m.note].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="dm2-ev-dopo" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.costo != null ? fmtEur(m.costo) : <span className="dm2-muted">Costo non inserito</span>}</span>
                <span className="dm2-row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                  {m.fatturaPath && (
                    <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" title="Anteprima fattura" aria-label="Anteprima fattura" onClick={() => setPreview({
                      title: m.fatturaNome ?? 'Fattura',
                      path: `/manutenzioni/${m.id}/fattura`,
                      fileHint: m.fatturaNome ?? m.fatturaPath,
                      onDownload: () => manutenzioniApi.downloadFattura(m.id, m.fatturaNome ?? 'fattura'),
                    })}>{ico('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}</button>
                  )}
                  {m.fatturaPath && (
                    <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" onClick={() => manutenzioniApi.downloadFattura(m.id, m.fatturaNome ?? 'fattura')} title="Scarica fattura" aria-label="Scarica fattura">{ico('M12 4v12M6 10l6 6 6-6M4 20h16')}</button>
                  )}
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" onClick={() => openEdit(m)} title="Modifica" aria-label={`Modifica ${m.descrizione}`}>{ico('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')}</button>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon dm2-btn-danger" onClick={() => handleDelete(m.id, m.descrizione)} title="Elimina" aria-label={`Elimina ${m.descrizione}`}>{ico('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13')}</button>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Modal form */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editId ? 'Modifica intervento' : 'Nuovo intervento'}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Descrizione - campo principale */}
          <div>
            <label className="form-label">Descrizione *</label>
            <input
              className="form-input"
              placeholder="es. Sostituzione filtri + olio motore"
              value={form.descrizione}
              onChange={set('descrizione')}
              autoFocus
            />
          </div>

          {/* Date su una riga */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Data inizio *</label>
              <input className="form-input" type="date" value={form.dataInizio} onChange={set('dataInizio')} />
            </div>
            <div>
              <label className="form-label">Data fine <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(se completato)</span></label>
              <input className="form-input" type="date" value={form.dataFine} onChange={set('dataFine')} />
            </div>
          </div>

          {/* Costo + Fornitore */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Costo (€)</label>
              <input
                className="form-input" type="number" step="0.01" min="0"
                placeholder="0,00"
                value={form.costo}
                onChange={set('costo')}
              />
            </div>
            <div>
              <label className="form-label">Fornitore / Officina</label>
              <input className="form-input" placeholder="es. Officina Rossi" value={form.fornitore} onChange={set('fornitore')} />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="form-label">Note</label>
            <input className="form-input" placeholder="Note aggiuntive..." value={form.note} onChange={set('note')} />
          </div>

          {/* Upload fattura */}
          <div>
            <label className="form-label">Fattura / allegato <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opzionale)</span></label>
            <div
              style={{
                border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8, padding: '14px 16px', cursor: 'pointer',
                background: file ? 'rgba(99,102,241,.06)' : 'var(--bg-tertiary)',
                fontSize: 13, color: file ? 'var(--primary)' : 'var(--text-secondary)',
                textAlign: 'center', transition: 'all .15s',
              }}
              onClick={() => fileRef.current?.click()}
            >
              {file ? file.name : editId ? 'Clicca per sostituire la fattura' : 'Clicca per allegare un file'}
            </div>
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Azioni */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className="btn-outline btn-sm" onClick={closeModal}>Annulla</button>
            <button
              className="btn-primary btn-sm"
              disabled={!form.descrizione.trim() || !form.dataInizio || saving}
              onClick={handleSave}
            >
              {saving ? 'Salvataggio…' : editId ? 'Salva modifiche' : 'Aggiungi'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
