// TabDocumenti.tsx
import { useState, useEffect, useRef } from 'react';
import { documentiApi } from '../../lib/api';
import type { Documento } from '../../lib/api';
import Modal from '../../components/ui/Modal';

const TIPI_DOC = ['ASSICURAZIONE', 'REVISIONE', 'BOLLO', 'LIBRETTO', 'CONTRATTO', 'ALTRO'];

const fmtSize = (b?: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

/** Converte una data ISO/DB in YYYY-MM-DD per l'input[type=date] */
const toInputDate = (d?: string | null): string => {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
};

const isExpiring = (d?: string | null) => {
  if (!d) return false;
  const diff = (new Date(d).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 30;
};

const isExpired = (d?: string | null) => {
  if (!d) return false;
  return new Date(d) < new Date();
};

interface Props { mezzoId: string; onDocsChange?: (docs: Documento[]) => void }

// ── Form condiviso nome/tipo/scadenza/note ───────────────────────────────
// Definito FUORI dal componente TabDocumenti: se fosse dichiarato dentro,
// verrebbe ricreato come nuovo tipo di componente ad ogni render (es. ad
// ogni tasto premuto nel campo Scadenza), causando lo smontaggio/rimontaggio
// dell'intero form e il conseguente "salto" del focus sul campo Nome
// documento (che ha autoFocus).
const MetaFields = ({
  vNome, setVNome, vTipo, setVTipo, vScadenza, setVScadenza, vNote, setVNote,
}: {
  vNome: string; setVNome: (v: string) => void;
  vTipo: string; setVTipo: (v: string) => void;
  vScadenza: string; setVScadenza: (v: string) => void;
  vNote: string; setVNote: (v: string) => void;
}) => (
  <>
    <div>
      <label className="form-label">Nome documento *</label>
      <input
        className="form-input"
        placeholder="es. Assicurazione 2026"
        value={vNome}
        onChange={(e) => setVNome(e.target.value)}
        autoFocus
      />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <label className="form-label">Tipo</label>
        <select className="form-input" value={vTipo} onChange={(e) => setVTipo(e.target.value)}>
          <option value="">— seleziona —</option>
          {TIPI_DOC.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Scadenza <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opzionale)</span></label>
        <input
          className="form-input"
          type="date"
          value={vScadenza}
          onChange={(e) => setVScadenza(e.target.value)}
        />
      </div>
    </div>
    <div>
      <label className="form-label">Note <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opzionale)</span></label>
      <input
        className="form-input"
        placeholder="Note aggiuntive..."
        value={vNote}
        onChange={(e) => setVNote(e.target.value)}
      />
    </div>
  </>
);

export default function TabDocumenti({ mezzoId, onDocsChange }: Props) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Modal caricamento nuovo documento ──────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Modal modifica documento esistente ─────────────────────────────────
  const [editDoc, setEditDoc] = useState<Documento | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [editScadenza, setEditScadenza] = useState('');
  const [editNote, setEditNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const d = await documentiApi.list('mezzo', mezzoId);
      setDocs(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mezzoId]);
  useEffect(() => { onDocsChange?.(docs); }, [docs, onDocsChange]);

  // ── Upload ─────────────────────────────────────────────────────────────
  const openUpload = () => {
    setNome(''); setTipo(''); setScadenza(''); setNote(''); setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setShowUpload(true);
  };

  const closeUpload = () => { setShowUpload(false); setFile(null); };

  const handleUpload = async () => {
    if (!file || !nome.trim()) return;
    setUploading(true);
    try {
      await documentiApi.upload('mezzo', mezzoId, nome.trim(), file, {
        tipo: tipo || undefined,
        scadenza: scadenza || undefined,
        note: note || undefined,
      });
      closeUpload();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Modifica ───────────────────────────────────────────────────────────
  const openEdit = (doc: Documento) => {
    setEditDoc(doc);
    setEditNome(doc.nome);
    setEditTipo(doc.tipo ?? '');
    setEditScadenza(toInputDate(doc.scadenza));
    setEditNote(doc.note ?? '');
  };

  const closeEdit = () => setEditDoc(null);

  const handleUpdate = async () => {
    if (!editDoc || !editNome.trim()) return;
    setSaving(true);
    try {
      const updated = await documentiApi.update(editDoc.id, {
        nome: editNome.trim(),
        tipo: editTipo || undefined,
        scadenza: editScadenza || undefined,
        note: editNote || undefined,
      });
      setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      closeEdit();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Elimina ────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, n: string) => {
    if (!confirm(`Eliminare il documento "${n}"?`)) return;
    try {
      await documentiApi.remove(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          📎 Documenti ({docs.length})
        </h3>
        <button className="btn-primary btn-sm" onClick={openUpload}>+ Carica documento</button>
      </div>

      {/* Lista documenti */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Caricamento...</div>
      ) : docs.length === 0 ? (
        <div style={{
          textAlign: 'center', color: 'var(--text-muted)', padding: 48,
          border: '1px dashed var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <p style={{ margin: 0 }}>Nessun documento caricato</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map((doc) => {
            const expired = isExpired(doc.scadenza);
            const expiring = !expired && isExpiring(doc.scadenza);
            return (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px',
              }}>
                <span style={{ fontSize: 22 }}>
                  {doc.mimeType?.includes('pdf') ? '📕' :
                   doc.mimeType?.includes('image') ? '🖼️' : '📄'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                    {doc.tipo && <span className="badge-tag">{doc.tipo}</span>}
                    {doc.dimensione && <span>{fmtSize(doc.dimensione)}</span>}
                    <span>Caricato {fmtDate(doc.createdAt)}</span>
                    {doc.note && (
                      <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }} title={doc.note}>
                        📝 {doc.note.length > 40 ? doc.note.slice(0, 40) + '…' : doc.note}
                      </span>
                    )}
                  </div>
                </div>
                {doc.scadenza && (
                  <div style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                    background: expired ? 'var(--danger-bg)' : expiring ? 'var(--warning-bg)' : 'var(--success-bg)',
                    color: expired ? 'var(--danger)' : expiring ? 'var(--warning)' : 'var(--success)',
                  }}>
                    {expired ? '⚠️' : expiring ? '⏰' : '✅'} Scad. {fmtDate(doc.scadenza)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => documentiApi.download(doc.id)}
                    title="Scarica"
                  >⬇️</button>
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => openEdit(doc)}
                    title="Modifica nome, tipo, scadenza, note"
                  >✏️</button>
                  <button
                    className="btn-sm"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 8px' }}
                    onClick={() => handleDelete(doc.id, doc.nome)}
                    title="Elimina"
                  >🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Carica nuovo documento ── */}
      <Modal
        open={showUpload}
        onClose={closeUpload}
        title="📎 Carica documento"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MetaFields
            vNome={nome} setVNome={setNome}
            vTipo={tipo} setVTipo={setTipo}
            vScadenza={scadenza} setVScadenza={setScadenza}
            vNote={note} setVNote={setNote}
          />

          {/* File picker */}
          <div>
            <label className="form-label">File *</label>
            <div
              style={{
                border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8, padding: '20px 16px', cursor: 'pointer',
                background: file ? 'rgba(99,102,241,.06)' : 'var(--bg-tertiary)',
                textAlign: 'center', fontSize: 13,
                color: file ? 'var(--primary)' : 'var(--text-secondary)',
                transition: 'all .15s',
              }}
              onClick={() => fileRef.current?.click()}
            >
              {file
                ? `📄 ${file.name} (${fmtSize(file.size)})`
                : <>📂 <strong>Clicca per scegliere un file</strong><br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>PDF, JPG, PNG, DOC, XLS</span></>}
            </div>
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className="btn-outline btn-sm" onClick={closeUpload}>Annulla</button>
            <button
              className="btn-primary btn-sm"
              disabled={!file || !nome.trim() || uploading}
              onClick={handleUpload}
            >
              {uploading ? '⏳ Caricamento...' : '⬆️ Carica'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Modifica documento esistente ── */}
      <Modal
        open={!!editDoc}
        onClose={closeEdit}
        title="✏️ Modifica documento"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editDoc && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'var(--bg-tertiary)', borderRadius: 6,
              fontSize: 12, color: 'var(--text-muted)',
            }}>
              <span>{editDoc.mimeType?.includes('pdf') ? '📕' : editDoc.mimeType?.includes('image') ? '🖼️' : '📄'}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{editDoc.mimeType}</span>
              <span>·</span>
              <span>{fmtSize(editDoc.dimensione)}</span>
              <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>Il file non viene sostituito</span>
            </div>
          )}

          <MetaFields
            vNome={editNome} setVNome={setEditNome}
            vTipo={editTipo} setVTipo={setEditTipo}
            vScadenza={editScadenza} setVScadenza={setEditScadenza}
            vNote={editNote} setVNote={setEditNote}
          />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className="btn-outline btn-sm" onClick={closeEdit}>Annulla</button>
            <button
              className="btn-primary btn-sm"
              disabled={!editNome.trim() || saving}
              onClick={handleUpdate}
            >
              {saving ? '⏳ Salvataggio...' : '💾 Salva modifiche'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
