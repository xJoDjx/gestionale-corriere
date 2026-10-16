// TabManutenzioni.tsx
import { useState, useEffect, useRef } from 'react';
import { manutenzioniApi } from '../../lib/api';
import type { Manutenzione } from '../../lib/api';
import Modal from '../../components/ui/Modal';

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

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            🔧 Manutenzioni ({items.length})
          </h3>
          {items.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Costo totale: <strong style={{ color: 'var(--text-primary)' }}>{fmtEur(totalCosto)}</strong>
            </div>
          )}
        </div>
        <button className="btn-primary btn-sm" onClick={openNew}>+ Nuovo intervento</button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Caricamento...</div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', color: 'var(--text-muted)', padding: 48,
          border: '1px dashed var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
          <p style={{ margin: 0 }}>Nessun intervento registrato</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((m) => {
            const inCorso = !m.dataFine;
            return (
              <div key={m.id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '12px 16px',
                borderLeft: `3px solid ${inCorso ? 'var(--warning)' : 'var(--success)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        {m.descrizione}
                      </span>
                      {inCorso && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px',
                          borderRadius: 3, background: 'var(--warning-bg)', color: 'var(--warning)',
                        }}>IN CORSO</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>📅 {fmtDate(m.dataInizio)}{m.dataFine ? ` → ${fmtDate(m.dataFine)}` : ''}</span>
                      {m.costo != null && <span>💶 {fmtEur(m.costo)}</span>}
                      {m.fornitore && <span>🏢 {m.fornitore}</span>}
                      {m.note && <span>📝 {m.note}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {m.fatturaPath && (
                      <button
                        className="btn-outline btn-sm"
                        onClick={() => manutenzioniApi.downloadFattura(m.id, m.fatturaNome ?? 'fattura')}
                        title="Scarica fattura"
                      >📄</button>
                    )}
                    <button className="btn-outline btn-sm" onClick={() => openEdit(m)} title="Modifica">✏️</button>
                    <button
                      className="btn-sm"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 8px' }}
                      onClick={() => handleDelete(m.id, m.descrizione)}
                      title="Elimina"
                    >🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal form */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editId ? '✏️ Modifica intervento' : '🔧 Nuovo intervento'}
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
              {file ? `📄 ${file.name}` : editId ? '📂 Clicca per sostituire la fattura' : '📂 Clicca per allegare un file'}
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
              {saving ? '⏳ Salvataggio...' : editId ? '💾 Salva modifiche' : '+ Aggiungi'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
