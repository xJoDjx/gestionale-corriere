// src/components/ui/DocumentPreview.tsx
// Anteprima documenti in una finestra sopra la pagina (senza doverli scaricare).
// Supporta: PDF, immagini, testo/CSV, Excel (xls/xlsx), Word (docx).
// Per gli altri formati mostra un messaggio con il pulsante "Scarica".
import { useEffect, useRef, useState } from 'react';
import { fetchFileBlob } from '../../lib/api';
import './DocumentPreview.css';
import { Icon } from '../ds';

export interface PreviewTarget {
  /** titolo mostrato in alto (nome documento) */
  title: string;
  /** path API da cui scaricare il file, relativo ad API_BASE (es. /documenti/<id>/download) */
  path: string;
  /** nome file / percorso originale, usato per capire il formato dall'estensione */
  fileHint?: string | null;
  mimeType?: string | null;
  /** download "vero" (con nome file corretto); se assente scarica il blob */
  onDownload?: () => void;
}

type Kind = 'pdf' | 'image' | 'text' | 'sheet' | 'docx' | 'other';

const ext = (s?: string | null) => (s ?? '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1] ?? '';

function detectKind(mime: string, hint?: string | null): Kind {
  const e = ext(hint);
  const m = mime.toLowerCase();
  if (m.includes('pdf') || e === 'pdf') return 'pdf';
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image';
  if (m.includes('spreadsheet') || m.includes('excel') || ['xlsx', 'xls', 'xlsm', 'ods'].includes(e)) return 'sheet';
  if (m.includes('wordprocessingml') || e === 'docx') return 'docx';
  if (m.startsWith('text/') || ['txt', 'csv', 'log', 'json', 'xml'].includes(e)) return 'text';
  return 'other';
}

const MIME_BY_KIND: Partial<Record<Kind, string>> = { pdf: 'application/pdf' };

export default function DocumentPreview({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('other');
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const docxRef = useRef<HTMLDivElement>(null);

  // carica il file
  useEffect(() => {
    if (!target) return;
    let alive = true;
    let objUrl: string | null = null;
    setBlob(null); setUrl(null); setError(null); setText(''); setSheets([]); setSheetIdx(0);

    fetchFileBlob(target.path).then(async (raw) => {
      if (!alive) return;
      const k = detectKind(raw.type || target.mimeType || '', target.fileHint ?? target.title);
      // il server può rispondere application/octet-stream: per il PDF serve il tipo giusto
      const b = MIME_BY_KIND[k] && raw.type !== MIME_BY_KIND[k] ? new Blob([raw], { type: MIME_BY_KIND[k] }) : raw;
      objUrl = URL.createObjectURL(b);
      setKind(k); setBlob(b); setUrl(objUrl);

      if (k === 'text') setText(await b.text());
      if (k === 'sheet') {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await b.arrayBuffer(), { type: 'array', cellDates: true });
        setSheets(wb.SheetNames.map(name => ({ name, html: XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' }) })));
      }
    }).catch(e => alive && setError(e.message ?? 'Errore caricamento'));

    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [target]);

  // render docx quando il contenitore è montato
  useEffect(() => {
    if (kind !== 'docx' || !blob || !docxRef.current) return;
    const el = docxRef.current;
    el.innerHTML = '';
    import('docx-preview')
      .then(({ renderAsync }) => renderAsync(blob, el, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true }))
      .catch(() => setError('Impossibile mostrare questo documento Word: scaricalo per aprirlo.'));
  }, [kind, blob]);

  // ESC per chiudere
  useEffect(() => {
    if (!target) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [target, onClose]);

  if (!target) return null;

  const download = () => {
    if (target.onDownload) return target.onDownload();
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = target.title; a.click();
  };

  const loading = !error && !url;

  return (
    <div className="dp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dp-window" role="dialog" aria-label={`Anteprima ${target.title}`}>
        <div className="dp-head">
          <span className="dp-title" title={target.title}><Icon name="eye" size={15} />{target.title}</span>
          <div className="dp-actions">
            {url && kind !== 'other' && (
              <button className="dp-btn" onClick={() => window.open(url, '_blank')} title="Apri in una nuova scheda"><Icon name="link" size={13} />Nuova scheda</button>
            )}
            <button className="dp-btn" onClick={download} disabled={!url && !target.onDownload}><Icon name="download" size={13} />Scarica</button>
            <button className="dp-btn dp-close" onClick={onClose} title="Chiudi (Esc)" aria-label="Chiudi"><Icon name="close" size={14} /></button>
          </div>
        </div>

        <div className={`dp-body dp-body-${kind}`}>
          {loading && <div className="dp-msg"><div className="dp-spinner" />Caricamento anteprima…</div>}
          {error && <div className="dp-msg dp-error"><Icon name="alert" size={18} />{error}</div>}

          {!error && url && kind === 'pdf'   && <iframe className="dp-frame" src={url} title={target.title} />}
          {!error && url && kind === 'image' && <div className="dp-img-wrap"><img src={url} alt={target.title} /></div>}
          {!error && url && kind === 'text'  && <pre className="dp-text">{text}</pre>}

          {!error && url && kind === 'sheet' && (
            <div className="dp-sheet">
              {sheets.length > 1 && (
                <div className="dp-sheet-tabs">
                  {sheets.map((s, i) => (
                    <button key={s.name} className={`dp-sheet-tab ${i === sheetIdx ? 'active' : ''}`} onClick={() => setSheetIdx(i)}>{s.name}</button>
                  ))}
                </div>
              )}
              <div className="dp-sheet-content" dangerouslySetInnerHTML={{ __html: sheets[sheetIdx]?.html ?? '' }} />
            </div>
          )}

          {!error && url && kind === 'docx' && <div className="dp-docx" ref={docxRef} />}

          {!error && url && kind === 'other' && (
            <div className="dp-msg">
              <Icon name="doc" size={32} />
              Anteprima non disponibile per questo tipo di file.
              <button className="dp-btn dp-btn-primary" onClick={download}><Icon name="download" size={13} />Scarica il file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
