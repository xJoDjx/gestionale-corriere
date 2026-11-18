// TabDocumenti.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { documentiApi } from '../../lib/api';
import type { Documento } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import DocumentPreview from '../../components/ui/DocumentPreview';
import type { PreviewTarget } from '../../components/ui/DocumentPreview';

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
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [cerca, setCerca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  // Ricerca su nome, tipo, note e date (caricamento/scadenza); più parole = tutte richieste
  const docsFiltrati = useMemo(() => {
    const words = cerca.toLowerCase().split(/\s+/).filter(Boolean);
    return docs.filter(d => {
      if (filtroTipo && (d.tipo ?? '') !== filtroTipo) return false;
      if (!words.length) return true;
      const h = [d.nome, d.tipo, d.note, fmtDate(d.createdAt), d.scadenza ? fmtDate(d.scadenza) : '']
        .filter(Boolean).join(' ').toLowerCase();
      return words.every(w => h.includes(w));
    });
  }, [docs, cerca, filtroTipo]);
  const tipiPresenti = useMemo(
    () => Array.from(new Set(docs.map(d => d.tipo).filter(Boolean) as string[])).sort(),
    [docs],
  );
  const openPreview = (doc: Documento) => setPreview({
    title: doc.nome, path: `/documenti/${doc.id}/download`,
    fileHint: doc.filePath, mimeType: doc.mimeType,
    onDownload: () => documentiApi.download(doc.id),
  });
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

  const TIPO_LABEL: Record<string, string> = { ASSICURAZIONE: 'Assicurazione', REVISIONE: 'Revisione', BOLLO: 'Bollo', LIBRETTO: 'Libretto', CONTRATTO: 'Contratto', ALTRO: 'Altro' };
  const D_DOC = 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5';
  const ico = (d: string, size = 12, sw = 2) => (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );

  return (
    <>
      <DocumentPreview target={preview} onClose={() => setPreview(null)} />
      {loading ? (
        <section className="dm2-card dm2-empty"><span className="dm2-muted">Caricamento documenti…</span></section>
      ) : docs.length === 0 ? (
        <section className="dm2-card dm2-empty">
          <span aria-hidden="true" className="dm2-tile" style={{ width: 40, height: 40, borderRadius: 10, background: '#7C5CF0' }}>{ico(D_DOC, 18, 2.2)}</span>
          <span className="dm2-empty-t">Nessun documento caricato</span>
          <span className="dm2-muted" style={{ maxWidth: 440 }}>Qui vanno contratto di noleggio, libretto, assicurazione e revisione, ognuno con la sua scadenza.</span>
          <button type="button" className="dm2-btn dm2-btn-primary" onClick={openUpload}>Carica documento</button>
        </section>
      ) : (
        <section className="dm2-card dm2-list">
          <div className="dm2-lhead">
            <div className="dm2-col" style={{ gap: 2 }}>
              <h2 className="dm2-h2">Documenti</h2>
              <span className="dm2-muted">{docs.length} document{docs.length === 1 ? 'o' : 'i'} caricat{docs.length === 1 ? 'o' : 'i'}</span>
            </div>
            <button type="button" className="dm2-btn dm2-btn-sm" onClick={openUpload}>{ico('M12 5v14M5 12h14')}Carica documento</button>
          </div>
          <div className="dm2-docsearch">
            <label className="dm2-docq">
              {ico('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', 13)}
              <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca per nome, tipo, note, data…" aria-label="Cerca documenti" />
              {cerca && <button type="button" onClick={() => setCerca('')} aria-label="Pulisci">{ico('M6 6l12 12M18 6L6 18', 12)}</button>}
            </label>
            <select className="dm2-docsel" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} aria-label="Tipo documento">
              <option value="">Tutti i tipi</option>
              {tipiPresenti.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
            </select>
            {(cerca || filtroTipo) && <span className="dm2-small dm2-muted">{docsFiltrati.length} di {docs.length}</span>}
          </div>
          {docsFiltrati.length === 0 && <div className="dm2-muted" style={{ padding: '18px', textAlign: 'center' }}>Nessun documento corrisponde alla ricerca</div>}
          {docsFiltrati.map((doc) => {
            const expired = isExpired(doc.scadenza);
            const expiring = !expired && isExpiring(doc.scadenza);
            const tone = expired ? ['#B91C1C', '#E5484D'] : expiring ? ['#C2410C', '#EA6A2A'] : ['#15803D', '#15A06A'];
            return (
              <div key={doc.id} className="dm2-ev dm2-ev-doc">
                <span aria-hidden="true" className="dm2-tile" style={{ width: 26, height: 26, borderRadius: 7, background: doc.tipo === 'CONTRATTO' ? '#7C5CF0' : doc.mimeType?.includes('image') ? '#0E9494' : '#3D63F0' }}>{ico(D_DOC, 12, 2.4)}</span>
                <span className="dm2-ev-data">{fmtDate(doc.createdAt)}</span>
                <span className="dm2-small dm2-muted">{doc.tipo ? (TIPO_LABEL[doc.tipo] ?? doc.tipo) : '—'}</span>
                <span className="dm2-col" style={{ minWidth: 0 }}>
                  <button type="button" className="dm2-ev-tit dm2-doclink" style={{ whiteSpace: 'nowrap' }} title={`Anteprima di ${doc.nome}`} onClick={() => openPreview(doc)}>{doc.nome}</button>
                  {(doc.note || doc.dimensione) && (
                    <span className="dm2-small dm2-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.note ?? undefined}>
                      {[fmtSize(doc.dimensione), doc.note].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span>
                  {doc.scadenza
                    ? <span className="dm2-tag" style={{ color: tone[0] }}><span aria-hidden="true" className="dm2-dot" style={{ background: tone[1] }} />{expired ? 'Scaduto il' : 'Scade il'} {fmtDate(doc.scadenza)}</span>
                    : <span className="dm2-small dm2-muted">Senza scadenza</span>}
                </span>
                <span className="dm2-row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" onClick={() => openPreview(doc)} title="Anteprima" aria-label={`Anteprima ${doc.nome}`}>{ico('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}</button>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" onClick={() => documentiApi.download(doc.id)} title="Scarica" aria-label={`Scarica ${doc.nome}`}>{ico('M12 4v12M6 10l6 6 6-6M4 20h16')}</button>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" onClick={() => openEdit(doc)} title="Modifica nome, tipo, scadenza, note" aria-label={`Modifica ${doc.nome}`}>{ico('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')}</button>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon dm2-btn-danger" onClick={() => handleDelete(doc.id, doc.nome)} title="Elimina" aria-label={`Elimina ${doc.nome}`}>{ico('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13')}</button>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* ── Modal: Carica nuovo documento ── */}
      <Modal
        open={showUpload}
        onClose={closeUpload}
        title="Carica documento"
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
                ? `${file.name} (${fmtSize(file.size)})`
                : <><strong>Clicca per scegliere un file</strong><br /><span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>PDF, JPG, PNG, DOC, XLS</span></>}
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
              {uploading ? 'Caricamento…' : 'Carica'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Modifica documento esistente ── */}
      <Modal
        open={!!editDoc}
        onClose={closeEdit}
        title="Modifica documento"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editDoc && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'var(--bg-tertiary)', borderRadius: 6,
              fontSize: 12, color: 'var(--text-muted)',
            }}>
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
              {saving ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
