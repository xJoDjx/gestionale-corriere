// src/features/conteggi/DettaglioConteggio.tsx
// Dettaglio conteggio padroncino — dati reali + tab Compensazioni
import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import { conteggiApi } from '../../lib/conteggi.api';
import type { DistribuzioneJson, DistribuzioneCodice } from '../../lib/conteggi.api';
import { vociConteggioApi } from '../../lib/voci-conteggio.api';
import type { VoceConteggio, CategoriaVoceConteggio } from '../../lib/voci-conteggio.api';
import { generaPdfConteggio } from './generaPdfConteggio';
import { generaPdfDistribuzione } from './generaPdfDistribuzione';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import type { AddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import LogConteggio from './LogConteggio';
import * as XLSX from 'xlsx';
import './DettaglioConteggio.css';

// ─── TIPI ──────────────────────────────────────────────────────────────────────
interface RigaFatturato {
  id: string; descrizione: string; valore: number | null; nota: string; contoVoce?: string | null;
  isAcconto?: boolean; // true = riga di tipo ACCONTO_FATTURA (anticipo già pagato)
}
interface RigaNoleggioMezzo {
  id: string; mezzoId: string | null; targa: string;
  valoreRataNoIva: number | null; percIva: number; alimentazione: string; note: string; isManuale: boolean;
}
interface RigaRicarica {
  id: string; mezzoId: string | null; targa: string;
  costoRicarica: number | null; percIva: number; note: string; isManuale: boolean;
}
interface RigaPalmare {
  id: string;
  numeroPalmari: number;   // quantità palmari
  giorni: number;          // giorni addebitati (default = giorniMese)
  tariffa: number;         // tariffa giornaliera per palmare (€/giorno)
  percIva: number;         // sempre 22%
  note: string;
  isManuale: boolean;
}
interface RigaAddebito {
  id: string; descrizione: string; valoreNoIva: number | null; percIva: number; note: string; contoVoce?: string | null;
}
interface RigaCompensazione {
  id: string; descrizione: string; valore: number | null; nota: string; contoVoce?: string | null;
}
interface RigaFineMese {
  id: string; descrizione: string; valore: number | null; nota: string; contoVoce?: string | null;
}
interface RigaCassaAcconto {
  id: string; accontoId: string | null; codice: string;
  descrizione: string; data: string; valore: number | null; nota: string; readonly: boolean;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function formatMese(m: string) {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}
function getDaysInMonth(mese: string): number {
  const [y, m] = mese.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * True se un'assegnazione (dataInizio/dataFine) risultava attiva in almeno un
 * giorno del mese `mese` (formato "YYYY-MM"). Fondamentale per evitare che
 * mezzi/palmari la cui assegnazione è stata chiusa PRIMA dell'inizio del mese
 * continuino a comparire nei conteggi (bug: senza questo filtro, l'elenco
 * veniva ricalcolato da TUTTE le assegnazioni storiche del padroncino, anche
 * quelle chiuse mesi o anni prima).
 */
function assegnazioneAttivaNelMese(
  dataInizio: string | null | undefined,
  dataFine: string | null | undefined,
  mese: string,
): boolean {
  const [y, m] = mese.split('-').map(Number);
  const inizioMese = new Date(y, m - 1, 1);
  const fineMese = new Date(y, m, 0, 23, 59, 59, 999);
  if (dataInizio) {
    const dIn = new Date(dataInizio);
    if (!isNaN(dIn.getTime()) && dIn > fineMese) return false;
  }
  if (dataFine) {
    const dFin = new Date(dataFine);
    if (!isNaN(dFin.getTime()) && dFin < inizioMese) return false;
  }
  return true;
}
const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtData = (d: string) => {
  if (!d) return '';
  // Formato italiano DD/MM/YYYY (come prodotto da estraiData nel backend) — evita new Date(MM/DD)
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${dd}/${mm}/${yy}`;
  }
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('it-IT');
  } catch {}
  return d;
};

/** Formatta un timestamp ISO in "DD/MM HH:mm" — compatto per la colonna Mod. */
const fmtTs = (d: string | null | undefined): string => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const dd  = dt.getDate().toString().padStart(2, '0');
    const mm  = (dt.getMonth() + 1).toString().padStart(2, '0');
    const hh  = dt.getHours().toString().padStart(2, '0');
    const min = dt.getMinutes().toString().padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
  } catch { return ''; }
};

const SOGLIA_BOLLO = 77.47;
const COSTO_BOLLO = 2.00;
const CHECKLIST_KEY = (padId: string, mese: string) => `checklist_${padId}_${mese}`;
function loadChecklist(padId: string, mese: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY(padId, mese));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false };
}
function saveChecklist(padId: string, mese: string, data: Record<string, boolean>) {
  localStorage.setItem(CHECKLIST_KEY(padId, mese), JSON.stringify(data));
}

let _id = 0;
const newId = () => `new-${++_id}`;

// ─── CHECKLIST CONFIG ──────────────────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { key: 'distribuzioneInviata', label: 'Distribuzione Inviata', icon: '📤' },
  { key: 'pdfAddebitiCreato', label: 'PDF Addebiti Creato', icon: '📄' },
  { key: 'fatturaCreata', label: 'Fattura Tu Creata', icon: '🧾' },
  { key: 'fatturaRicevuta', label: 'Fattura Ricevuta', icon: '✅' },
];

// ─── COMPONENTI TABELLA EXCEL ──────────────────────────────────────────────────
function ExcelTable({ children, headers, colWidths }: {
  children: React.ReactNode;
  headers: React.ReactNode[];
  colWidths?: string[];
}) {
  return (
    <div className="dc-excel-wrap">
      <table className="dc-excel-table">
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SectionBlock({
  title, icon, onAdd, children, totaleLabel, totale, subTotaleLabel, subTotale,
}: {
  title: string; icon: string; onAdd: () => void; children: React.ReactNode;
  totaleLabel?: string; totale?: number;
  subTotaleLabel?: string; subTotale?: number;
}) {
  return (
    <div className="dc-addebiti-section">
      <div className="dc-section-subheader">
        <div className="dc-section-subheader-title"><span>{icon}</span><span>{title}</span></div>
        <button className="dc-btn-add-small" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      {children}
      {(totaleLabel != null && totale != null) && (
        <div className="dc-section-tot">
          {subTotaleLabel != null && subTotale != null && (
            <span className="dc-tot-sub">{subTotaleLabel}: <strong>{eur(subTotale)}</strong></span>
          )}
          <span>{totaleLabel}</span>
          <span className="dc-tot-val">{eur(totale)}</span>
        </div>
      )}
    </div>
  );
}

// ─── TAB RIEPILOGO ─────────────────────────────────────────────────────────────
function TabRiepilogo({ padroncino, mese, totFatturato, totAddebitiConIva, totCompen, checklist, onChecklistChange, conteggioId, noteIniziale, onNoteSaved }: {
  padroncino: Padroncino; mese: string;
  totFatturato: number; totAddebitiConIva: number; totCompen: number;
  checklist: Record<string, boolean>; onChecklistChange: (key: string, val: boolean) => void;
  conteggioId: string | null;
  noteIniziale: string;
  onNoteSaved: (note: string) => void;
}) {
  const netto = totFatturato * 1.22 - totAddebitiConIva - totCompen;

  // ── Blocco note con autosave ──────────────────────────
  const [noteText, setNoteText] = useState(noteIniziale);
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizza se cambia il conteggio (cambio mese)
  useEffect(() => { setNoteText(noteIniziale); setNoteSaveStatus('idle'); }, [noteIniziale]);

  const handleNoteChange = (val: string) => {
    setNoteText(val);
    setNoteSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!conteggioId) { setNoteSaveStatus('idle'); return; }
      try {
        await conteggiApi.updateNote(conteggioId, val);
        onNoteSaved(val);
        setNoteSaveStatus('saved');
        setTimeout(() => setNoteSaveStatus('idle'), 2000);
      } catch {
        setNoteSaveStatus('error');
      }
    }, 900);
  };

  return (
    <div className="dc-riepilogo">
      <div className="dc-riepilogo-grid">
        <div className="dc-riepilogo-numeri">
          {/* Info padroncino */}
          <div className="dc-riepilogo-section">
            <h3>📊 Dati Padroncino</h3>
            <div className="dc-riepilogo-table">
              {[
                ['Ragione Sociale', padroncino.ragioneSociale],
                ['Partita IVA', padroncino.partitaIva],
                ['Mese', formatMese(mese)],
                ['Mezzi assegnati', (padroncino.mezziAssegnati ?? []).filter((m: any) => assegnazioneAttivaNelMese(m.dataInizio, m.dataFine, mese)).length],
                ['Palmari assegnati', (padroncino.palmariAssegnati ?? []).filter((p: any) => assegnazioneAttivaNelMese(p.dataInizio, p.dataFine, mese)).length],
              ].map(([label, val]) => (
                <div key={String(label)} className="dc-riepilogo-row">
                  <span className="dc-riepilogo-label">{label}</span>
                  <span className="dc-riepilogo-val">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fatturato */}
          <div className="dc-riepilogo-section">
            <h3>💶 Fatturato Distribuzione</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row">
                <span className="dc-riepilogo-label">Totale imponibile</span>
                <span className="dc-riepilogo-val dc-val-pos">{eur(totFatturato)}</span>
              </div>
              <div className="dc-riepilogo-row">
                <span className="dc-riepilogo-label">IVA (22%)</span>
                <span className="dc-riepilogo-val">{eur(totFatturato * 0.22)}</span>
              </div>
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale Fattura</span>
                <span className="dc-riepilogo-val dc-val-pos">{eur(totFatturato * 1.22)}</span>
              </div>
            </div>
          </div>

          {/* Addebiti */}
          <div className="dc-riepilogo-section">
            <h3>📋 Addebiti Totali (con IVA)</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale addebiti</span>
                <span className={`dc-riepilogo-val ${totAddebitiConIva < 0 ? 'dc-val-pos' : 'dc-val-neg'}`}>
                  {totAddebitiConIva < 0 ? '+ ' : '- '}{eur(Math.abs(totAddebitiConIva))}
                </span>
              </div>
            </div>
          </div>

          {/* Compensazioni */}
          <div className="dc-riepilogo-section">
            <h3>⚖️ Compensazioni</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale compensazioni</span>
                <span className={`dc-riepilogo-val ${totCompen < 0 ? 'dc-val-pos' : 'dc-val-neg'}`}>
                  {totCompen < 0 ? '+ ' : '- '}{eur(Math.abs(totCompen))}
                </span>
              </div>
            </div>
          </div>

          {/* Saldo finale */}
          <div className="dc-riepilogo-section dc-riepilogo-section-finale">
            <h3>🏁 Saldo Netto da Bonificare</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold dc-riepilogo-row-netto">
                <span className="dc-riepilogo-label">Netto da bonificare</span>
                <span className={`dc-riepilogo-val dc-val-big ${netto >= 0 ? 'dc-val-pos' : 'dc-val-neg'}`}>
                  {eur(netto)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Colonna destra: log + checklist + note */}
        <div className="dc-riepilogo-destra">
          {/* ── BLOCCO LOG CONTEGGIO ── */}
          <LogConteggio conteggioId={conteggioId} />

          <div className="dc-riepilogo-checklist">
            <h3>✅ Stato Avanzamento</h3>
            <div className="dc-checklist-items">
              {CHECKLIST_ITEMS.map((item, i) => {
                const done = checklist[item.key] ?? false;
                return (
                  <div key={item.key} className={`dc-checklist-item ${done ? 'dc-check-done' : ''}`}
                    onClick={() => onChecklistChange(item.key, !done)}>
                    <div className="dc-check-step">{i + 1}</div>
                    <div className="dc-check-icon">{item.icon}</div>
                    <div className="dc-check-content">
                      <span className="dc-check-label">{item.label}</span>
                      <span className="dc-check-status">{done ? 'Completato' : 'Da fare'}</span>
                    </div>
                    <div className={`dc-check-toggle ${done ? 'dc-toggle-on' : ''}`}>{done ? '✓' : '○'}</div>
                  </div>
                );
              })}
            </div>
            <div className="dc-checklist-progress">
              <div className="dc-checklist-prog-bar">
                <div className="dc-checklist-prog-fill"
                  style={{ width: `${(Object.values(checklist).filter(Boolean).length / 4) * 100}%` }} />
              </div>
              <span>{Object.values(checklist).filter(Boolean).length}/4 completati</span>
            </div>

            {/* ── BLOCCO NOTE MESE ── */}
            <div className="dc-note-mese">
              <div className="dc-note-mese-header">
                <div className="dc-note-mese-title">
                  <span className="dc-note-mese-icon">📝</span>
                  <span>Note del Mese</span>
                </div>
                <span className={`dc-note-save-status dc-note-status--${noteSaveStatus}`}>
                  {noteSaveStatus === 'saving' && '⟳ Salvataggio…'}
                  {noteSaveStatus === 'saved'  && '✓ Salvato'}
                  {noteSaveStatus === 'error'  && '⚠ Errore'}
                </span>
              </div>
              <textarea
                className="dc-note-mese-textarea"
                placeholder={`Annotazioni e cose da fare per ${formatMese(mese)}…\n\nEs:\n• Verificare fattura proforma\n• Chiedere documentazione DURC\n• Contattare per cambio mezzo`}
                value={noteText}
                onChange={(e) => handleNoteChange(e.target.value)}
                rows={7}
                disabled={!conteggioId}
              />
              {!conteggioId && (
                <span className="dc-note-mese-hint">Salva prima il conteggio per abilitare le note</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VOCE SELECTOR (preimpostate da Impostazioni) ─────────────────────────────
function VoceSelector({ voci, onPick }: { voci: VoceConteggio[]; onPick: (v: VoceConteggio) => void }) {
  if (!voci || voci.length === 0) return null;
  return (
    <select
      className="dc-excel-select dc-voce-sel"
      value=""
      title="Applica voce preimpostata"
      onChange={(e) => {
        const v = voci.find((x) => x.id === e.target.value);
        if (v) onPick(v);
        e.target.value = '';
      }}
    >
      <option value="">📋 Voce…</option>
      {voci.map((v) => (
        <option key={v.id} value={v.id}>
          {v.descrizione}{v.contoVoce ? ` · ${v.contoVoce}` : ''}
        </option>
      ))}
    </select>
  );
}

// ─── TAB FATTURATO ──────────────────────────────────────────────────────────────
function TabFatturato({ righe, onChange, onAdd, onAddAcconto, onDelete, onImportXls, voci, padroncino, mese, rigaTimestamps }: {
  righe: RigaFatturato[];
  onChange: (id: string, f: keyof RigaFatturato, v: any) => void;
  onAdd: () => void;
  onAddAcconto: () => void;
  onDelete: (id: string) => void;
  onImportXls: (nuove: { descrizione: string; valore: number; nota: string }[]) => void;
  voci: VoceConteggio[];
  padroncino: Padroncino | null;
  mese: string;
  rigaTimestamps: Map<string, string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const nuove: { descrizione: string; valore: number; nota: string }[] = [];

      for (const row of rows) {
        if (!row || row.length < 2) continue;
        // Cerca una cella testuale e una numerica nella stessa riga
        const descCell = row.find((c) => typeof c === 'string' && c.trim().length > 1);
        const valCell  = row.find((c) => typeof c === 'number' && c > 0);
        if (descCell && valCell) {
          nuove.push({
            descrizione: String(descCell).trim(),
            valore: Math.round(valCell * 100) / 100,
            nota: '',
          });
        }
      }

      if (nuove.length === 0) {
        alert('Nessuna riga valida trovata nel file.\nAssicurati che il foglio abbia colonne: Descrizione | Importo');
      } else {
        onImportXls(nuove);
      }
    } catch (err: any) {
      alert('Errore lettura file: ' + (err.message ?? 'Formato non supportato'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const righeNormali    = righe.filter((r) => !r.isAcconto && !(r as any).isTrattenuta);
  const righeAcconto    = righe.filter((r) => r.isAcconto);
  const righeTrattenute = righe.filter((r) => (r as any).isTrattenuta);
  const totLordo        = righeNormali.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totAcconti      = righeAcconto.reduce((s, r) => s + (r.valore ?? 0), 0);    // già negativi
  const totTrattenute   = righeTrattenute.reduce((s, r) => s + (r.valore ?? 0), 0); // già negativi
  const totImponibile   = totLordo + totAcconti + totTrattenute;
  return (
    <div className="dc-tab-content">
      <div className="dc-section-header">
        <h3>💶 Fatturato Distribuzione</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            className="btn-outline btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="Carica un file XLS/CSV con le righe della fattura proforma"
          >
            {importing ? '⏳' : '📥'} Importa da XLS
          </button>
          <button
            className="btn-outline btn-sm"
            onClick={() => {
              if (!padroncino) {
                alert('Padroncino non disponibile');
                return;
              }
              generaPdfDistribuzione({
                padroncino: { ragioneSociale: padroncino.ragioneSociale },
                mese,
                righe: righe.map((r) => ({ descrizione: r.descrizione, valore: r.valore, nota: r.nota })),
              });
            }}
            title="Esporta un PDF semplice con elenco voci e totali finali"
          >
            📄 Esporta PDF Distribuzione
          </button>
          <button className="dc-btn-add-row" onClick={onAdd}>+ Aggiungi riga</button>
          <button
            className="dc-btn-add-row"
            onClick={onAddAcconto}
            title="Aggiungi un acconto già pagato al padroncino: verrà scalato dalla fattura ma NON dal fatturato nelle statistiche"
            style={{ background: 'var(--color-warning, #f59e0b)', color: '#fff', borderColor: 'transparent' }}
          >
            💳 Aggiungi Acconto
          </button>
        </div>
      </div>
      <ExcelTable
        headers={['#','Voce','Descrizione','Conto','Valore (€)','Nota','Mod.','']}
        colWidths={['40px','130px','','90px','120px','','60px','36px']}
      >
        {righe.length === 0 ? (
          <tr><td colSpan={8} className="dc-excel-empty">Nessuna voce. Aggiungi una riga.</td></tr>
        ) : righe.map((r, i) => (
          <tr
            key={r.id}
            className="dc-excel-row"
            style={
              (r as any).isTrattenuta
                ? { background: 'rgba(239,68,68,0.06)', borderLeft: '3px solid #ef4444' }
                : r.isAcconto
                ? { background: 'var(--color-warning-bg, #fffbeb)', borderLeft: '3px solid var(--color-warning, #f59e0b)' }
                : undefined
            }
          >
            <td className="dc-excel-idx">{i + 1}</td>
            <td>
              {(r as any).isTrattenuta
                ? <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', padding: '0 4px' }}>🔻 Trattenuta</span>
                : r.isAcconto
                ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning, #f59e0b)', padding: '0 4px' }}>💳 Acconto</span>
                : <VoceSelector voci={voci} onPick={(v) => {
                    onChange(r.id, 'descrizione', v.descrizione);
                    onChange(r.id, 'contoVoce', v.contoVoce ?? '');
                    if (v.valoreDefault != null) onChange(r.id, 'valore', Number(v.valoreDefault));
                  }} />
              }
            </td>
            <td><input className="dc-excel-input" value={r.descrizione}
              onChange={(e) => onChange(r.id, 'descrizione', e.target.value)}
              placeholder={r.isAcconto ? 'Es. Acconto Fattura 52 del 14/04...' : 'Descrizione...'} /></td>
            <td><input className="dc-excel-input dc-conto-voce" value={r.contoVoce ?? ''}
              onChange={(e) => onChange(r.id, 'contoVoce', e.target.value)}
              placeholder="—" /></td>
            <td>
              <input
                className="dc-excel-input dc-excel-num"
                type="number" step="0.01"
                value={r.valore ?? ''}
                onChange={(e) => {
                  let v = e.target.value === '' ? null : parseFloat(e.target.value);
                  // Gli acconti sono sempre negativi (riducono la fattura)
                  if (r.isAcconto && v !== null && v > 0) v = -v;
                  onChange(r.id, 'valore', v);
                }}
                placeholder={r.isAcconto ? '−0,00' : '0,00'}
                style={
                  (r as any).isTrattenuta
                    ? { color: '#ef4444', fontWeight: 600 }
                    : r.isAcconto
                    ? { color: 'var(--color-warning, #f59e0b)', fontWeight: 600 }
                    : undefined
                }
              />
            </td>
            <td><input className="dc-excel-input" value={r.nota}
              onChange={(e) => onChange(r.id, 'nota', e.target.value)}
              placeholder="Note..." /></td>
            <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
            <td>
              <button className="dc-del-btn" onClick={() => onDelete(r.id)}>×</button>
            </td>
          </tr>
        ))}
      </ExcelTable>
      <div className="dc-fatturato-totali">
        {(righeAcconto.length > 0 || righeTrattenute.length > 0) && (
          <>
            <div className="dc-tot-row">
              <span>Fatturato Lordo (imponibile)</span>
              <span className="dc-tot-val">{eur(totLordo)}</span>
            </div>
            {righeAcconto.length > 0 && (
              <div className="dc-tot-row" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                <span>💳 Acconti già pagati</span>
                <span className="dc-tot-val">{eur(totAcconti)}</span>
              </div>
            )}
            {righeTrattenute.length > 0 && (
              <div className="dc-tot-row" style={{ color: '#ef4444' }}>
                <span>🔻 Trattenute</span>
                <span className="dc-tot-val">{eur(totTrattenute)}</span>
              </div>
            )}
            <div className="dc-tot-row" style={{ borderTop: '1px dashed var(--border-color)' }}>
              <span>Totale Imponibile netto</span>
              <span className="dc-tot-val">{eur(totImponibile)}</span>
            </div>
          </>
        )}
        {righeAcconto.length === 0 && righeTrattenute.length === 0 && (
          <div className="dc-tot-row">
            <span>Totale Imponibile</span>
            <span className="dc-tot-val">{eur(totImponibile)}</span>
          </div>
        )}
        {[
          ['IVA (22%)', totImponibile * 0.22, ''],
          ['Totale Fattura da Ricevere', totImponibile * 1.22, 'dc-val-pos'],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className={`dc-tot-row ${label === 'Totale Fattura da Ricevere' ? 'dc-tot-finale' : ''}`}>
            <span>{label}</span>
            <span className={`dc-tot-val ${cls}`}>{eur(val as number)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TAB ADDEBITI ──────────────────────────────────────────────────────────────
function TabAddebiti({
  giorniMese,
  palmari, onPalmariChange, onPalmariAdd, onPalmariDelete,
  mezzi, onMezziChange, onMezziAdd, onMezziDelete,
  ricariche, onRicaricheChange, onRicaricheAdd, onRicaricheDelete,
  addebitiVari, onAddebitiVariChange, onAddebitiVariAdd, onAddebitiVariDelete,
  voci, rigaTimestamps,
}: {
  giorniMese: number;
  palmari: RigaPalmare[];
  onPalmariChange: (id: string, f: keyof RigaPalmare, v: any) => void;
  onPalmariAdd: () => void; onPalmariDelete: (id: string) => void;
  mezzi: RigaNoleggioMezzo[];
  onMezziChange: (id: string, f: keyof RigaNoleggioMezzo, v: any) => void;
  onMezziAdd: () => void; onMezziDelete: (id: string) => void;
  ricariche: RigaRicarica[];
  onRicaricheChange: (id: string, f: keyof RigaRicarica, v: any) => void;
  onRicaricheAdd: () => void; onRicaricheDelete: (id: string) => void;
  addebitiVari: RigaAddebito[];
  onAddebitiVariChange: (id: string, f: keyof RigaAddebito, v: any) => void;
  onAddebitiVariAdd: () => void; onAddebitiVariDelete: (id: string) => void;
  voci: VoceConteggio[];
  rigaTimestamps: Map<string, string>;
}) {
  // Palmari: somma da tutte le righe
  const costoPalmariNoIva = palmari.reduce(
    (s, rp) => s + rp.numeroPalmari * rp.tariffa * rp.giorni, 0
  );
  const costoPalmariConIva = palmari.reduce(
    (s, rp) => s + rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100), 0
  );

  const totMezziNoIva = mezzi.reduce((s, r) => s + (r.valoreRataNoIva ?? 0), 0);
  const totMezziConIva = mezzi.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);

  const totRicaricheNoIva = ricariche.reduce((s, r) => s + (r.costoRicarica ?? 0), 0);
  const totRicaricheConIva = ricariche.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);

  const totVariNoIva = addebitiVari.reduce((s, r) => s + (r.valoreNoIva ?? 0), 0);
  const totVariConIva = addebitiVari.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);

  // Bollo: scatta se la SOMMA TOTALE degli addebiti esenti IVA (IVA ≠ 22%)
  // supera la soglia di legge (77,47 €). Le ricariche sono sempre IVA 0% e
  // quindi rientrano nel calcolo insieme agli eventuali addebiti vari esenti.
  const totEsentiIva =
    ricariche.reduce((s, r) => s + (r.percIva !== 22 ? (r.costoRicarica ?? 0) : 0), 0) +
    addebitiVari.reduce((s, r) => s + (r.percIva !== 22 ? (r.valoreNoIva ?? 0) : 0), 0);
  const bolloAttivo = totEsentiIva >= SOGLIA_BOLLO;

  const totaleAddebiti = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + (bolloAttivo ? COSTO_BOLLO : 0);

  return (
    <div className="dc-tab-content">

      {/* ── PALMARI: tabella editabile ── */}
      <SectionBlock title="Addebiti Noleggio Palmari" icon="📱" onAdd={onPalmariAdd}
        totaleLabel="Totale Palmari (con IVA)" totale={costoPalmariConIva}
        subTotaleLabel="Senza IVA (da fatturare)" subTotale={costoPalmariNoIva}>
        <ExcelTable
          headers={['N° Palmari', 'Tariffa/giorno (€)', 'Giorni', 'IVA %', 'Totale (con IVA)', 'Note', 'Mod.', '']}
          colWidths={['100px', '160px', '80px', '70px', '150px', '', '60px', '36px']}
        >
          {palmari.length === 0 ? (
            <tr><td colSpan={8} className="dc-excel-empty">Nessun palmare assegnato. Usa "+ Aggiungi riga" per inserirne uno manuale.</td></tr>
          ) : palmari.map((rp) => {
            const totConIva = rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100);
            return (
              <tr key={rp.id} className="dc-excel-row">
                <td>
                  <input className="dc-excel-input dc-excel-num" type="number" min={1} step={1}
                    value={rp.numeroPalmari}
                    onChange={(e) => onPalmariChange(rp.id, 'numeroPalmari', Math.max(1, parseInt(e.target.value) || 1))} />
                </td>
                <td>
                  <input className="dc-excel-input dc-excel-num" type="number" min={0} step={0.01}
                    value={rp.tariffa}
                    onChange={(e) => onPalmariChange(rp.id, 'tariffa', parseFloat(e.target.value) || 0)}
                    placeholder="0,00" />
                </td>
                <td>
                  <input className="dc-excel-input dc-excel-num" type="number" min={1} max={31} step={1}
                    value={rp.giorni}
                    onChange={(e) => onPalmariChange(rp.id, 'giorni', Math.max(1, parseInt(e.target.value) || 1))} />
                </td>
                <td>
                  <select className="dc-excel-select dc-excel-num" value={rp.percIva}
                    onChange={(e) => onPalmariChange(rp.id, 'percIva', parseFloat(e.target.value))}>
                    <option value={0}>0%</option>
                    <option value={22}>22%</option>
                  </select>
                </td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(totConIva || null)}</td>
                <td>
                  <input className="dc-excel-input" value={rp.note}
                    onChange={(e) => onPalmariChange(rp.id, 'note', e.target.value)} placeholder="Note..." />
                </td>
                <td className="dc-ts-cell">{rigaTimestamps.get(rp.id) ?? ''}</td>
                <td>
                  <button className="dc-del-btn" onClick={() => onPalmariDelete(rp.id)}>×</button>
                </td>
              </tr>
            );
          })}
        </ExcelTable>
      </SectionBlock>

      {/* ── MEZZI ── */}
      <SectionBlock title="Addebiti Noleggi Mezzi" icon="🚛" onAdd={onMezziAdd}
        totaleLabel="Totale Mezzi (con IVA)" totale={totMezziConIva}>
        <ExcelTable
          headers={['Targa','Rata No IVA (€)','IVA %','Rata Ivata (€)','Alimentazione','Note','Mod.','']}
          colWidths={['90px','150px','80px','160px','140px','','60px','36px']}
        >
          {mezzi.length === 0 ? (
            <tr><td colSpan={8} className="dc-excel-empty">Nessun mezzo assegnato.</td></tr>
          ) : mezzi.map((r) => {
            const rataIvata = (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100);
            return (
              <tr key={r.id} className="dc-excel-row">
                <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                  onChange={(e) => onMezziChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreRataNoIva ?? ''}
                  onChange={(e) => onMezziChange(r.id, 'valoreRataNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></td>
                <td><select className="dc-excel-select dc-excel-num" value={r.percIva}
                  onChange={(e) => onMezziChange(r.id, 'percIva', parseFloat(e.target.value))}>
                  <option value={0}>0%</option>
                  <option value={22}>22%</option>
                </select></td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(rataIvata || null)}</td>
                <td>
                  <select className="dc-excel-select" value={r.alimentazione}
                    onChange={(e) => onMezziChange(r.id, 'alimentazione', e.target.value)}>
                    <option value="DIESEL">🛢 Diesel</option>
                    <option value="ELETTRICO">⚡ Elettrico</option>
                    <option value="BENZINA">⛽ Benzina</option>
                    <option value="IBRIDO">🔋 Ibrido</option>
                  </select>
                </td>
                <td><input className="dc-excel-input" value={r.note}
                  onChange={(e) => onMezziChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
                <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
                <td>
                  <button
                    className="dc-del-btn"
                    title={r.isManuale ? undefined : 'Rimuovi questo mezzo dal conteggio'}
                    onClick={() => onMezziDelete(r.id)}
                  >×</button>
                </td>
              </tr>
            );
          })}
        </ExcelTable>
      </SectionBlock>

      {/* ── RICARICHE ELETTRICHE ── */}
      <SectionBlock title="Addebiti Ricariche Elettriche" icon="⚡" onAdd={onRicaricheAdd}
        totaleLabel="Totale Ricariche" totale={totRicaricheConIva}>
        <ExcelTable
          headers={['Targa','Importo Addebito (€)','IVA %','Totale','Note','Mod.','']}
          colWidths={['72px','180px','80px','100px','','60px','36px']}
        >
          {ricariche.length === 0 ? (
            <tr><td colSpan={7} className="dc-excel-empty">Nessun mezzo elettrico assegnato.</td></tr>
          ) : ricariche.map((r) => (
            <tr key={r.id} className="dc-excel-row">
              <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                onChange={(e) => onRicaricheChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.costoRicarica != null ? Number(r.costoRicarica).toFixed(2) : ''}
                onChange={(e) => onRicaricheChange(r.id, 'costoRicarica', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" title="Valore finale già comprensivo di maggiorazione, IVA 0%" /></td>
              <td><span className="dc-excel-computed" title="Le ricariche sono sempre IVA 0% — il valore è l'addebito finale">0%</span></td>
              <td className="dc-excel-computed dc-computed-highlight">
                {eur(r.costoRicarica ?? null)}
              </td>
              <td><input className="dc-excel-input" value={r.note}
                onChange={(e) => onRicaricheChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td>
                <button
                  className="dc-del-btn"
                  title={r.isManuale ? undefined : 'Rimuovi questa ricarica dal conteggio'}
                  onClick={() => onRicaricheDelete(r.id)}
                >×</button>
              </td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── ADDEBITI VARI ── */}
      <SectionBlock title="Addebiti Vari" icon="📝" onAdd={onAddebitiVariAdd}
        totaleLabel="Totale Vari (con IVA)" totale={totVariConIva}>
        <ExcelTable
          headers={['Voce','Descrizione','Conto','Valore No IVA (€)','IVA %','Valore IVA (€)','Note','Mod.','']}
          colWidths={['130px','','100px','160px','65px','92px','','60px','36px']}
        >
          {addebitiVari.length === 0 ? (
            <tr><td colSpan={9} className="dc-excel-empty">Nessun addebito vario.</td></tr>
          ) : addebitiVari.map((r) => {
            const ivaCalc = (r.valoreNoIva ?? 0) * (r.percIva / 100);
            return (
              <tr key={r.id} className="dc-excel-row">
                <td>
                  <VoceSelector voci={voci} onPick={(v) => {
                    onAddebitiVariChange(r.id, 'descrizione', v.descrizione);
                    onAddebitiVariChange(r.id, 'contoVoce', v.contoVoce ?? '');
                    onAddebitiVariChange(r.id, 'percIva', Number(v.percIva));
                    if (v.valoreDefault != null) onAddebitiVariChange(r.id, 'valoreNoIva', Number(v.valoreDefault));
                  }} />
                </td>
                <td><input className="dc-excel-input" value={r.descrizione}
                  onChange={(e) => onAddebitiVariChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." /></td>
                <td><input className="dc-excel-input dc-conto-voce" value={r.contoVoce ?? ''}
                  onChange={(e) => onAddebitiVariChange(r.id, 'contoVoce', e.target.value)} placeholder="—" /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreNoIva ?? ''}
                  onChange={(e) => onAddebitiVariChange(r.id, 'valoreNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></td>
                <td><select className="dc-excel-select dc-excel-num" value={r.percIva}
                  onChange={(e) => onAddebitiVariChange(r.id, 'percIva', parseFloat(e.target.value))}>
                  <option value={0}>0%</option>
                  <option value={22}>22%</option>
                </select></td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(ivaCalc || null)}</td>
                <td><input className="dc-excel-input" value={r.note}
                  onChange={(e) => onAddebitiVariChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
                <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
                <td><button className="dc-del-btn" onClick={() => onAddebitiVariDelete(r.id)}>×</button></td>
              </tr>
            );
          })}
        </ExcelTable>
      </SectionBlock>

      {/* Bollo */}
      {bolloAttivo && (
        <div className="dc-bollo-alert">
          <span className="dc-bollo-icon">📮</span>
          <div>
            <strong>Addebito Bollo €2,00 — attivato automaticamente</strong>
            <p>Totale addebiti esenti IVA (ricariche + vari con IVA ≠ 22%) ≥ {SOGLIA_BOLLO.toFixed(2)} € → somma esente: {eur(totEsentiIva)}</p>
          </div>
          <span className="dc-bollo-val">{eur(COSTO_BOLLO)}</span>
        </div>
      )}

      {/* Totale finale */}
      <div className="dc-addebiti-finale">
        {[
          ['Noleggio Palmari (con IVA)', costoPalmariConIva],
          ['Noleggi Mezzi (con IVA)', totMezziConIva],
          ['Ricariche Elettriche (IVA 0%)', totRicaricheConIva],
          ['Addebiti Vari (con IVA)', totVariConIva],
          ...(bolloAttivo ? [['Bollo virtuale', COSTO_BOLLO]] : []),
        ].map(([label, val]) => (
          <div key={String(label)} className="dc-addebiti-finale-row">
            <span>{label}</span>
            <span>{eur(val as number)}</span>
          </div>
        ))}
        <div className="dc-addebiti-finale-row dc-addebiti-finale-total">
          <span>TOTALE ADDEBITI DA INSERIRE IN FATTURA</span>
          <span className="dc-val-neg">{eur(totaleAddebiti)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── TAB COMPENSAZIONI ─────────────────────────────────────────────────────────
/** Mostra sotto il valore che effetto ha sul netto: le compensazioni positive
 *  vengono TRATTENUTE al padroncino, quelle negative gli vengono RESTITUITE. */
function EffettoNetto({ valore }: { valore: number | null | undefined }) {
  if (valore == null || valore === 0 || Number.isNaN(valore)) return null;
  const trattiene = valore > 0;
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, textAlign: 'right', marginTop: 2,
      color: trattiene ? 'var(--danger)' : 'var(--success)' }}>
      {trattiene ? `− ${eur(valore)} dal netto` : `+ ${eur(Math.abs(valore))} al netto`}
    </div>
  );
}

function SegnoHint() {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
      <strong>Valore positivo</strong> = trattenuto al padroncino (riduce il netto) ·{' '}
      <strong>valore negativo</strong> = restituito al padroncino (es. restituzione banconota sospetta, aumenta il netto)
    </div>
  );
}

function TabCompensazioni({
  accrediti, onAccreditiChange, onAccreditiAdd, onAccreditiDelete,
  fineMese, onFineMeseChange, onFineMeseAdd, onFineMeseDelete,
  cassa, onCassaChange, onCassaAdd, onCassaDelete,
  totAddebitiConIva, voci, rigaTimestamps,
}: {
  accrediti: RigaCompensazione[];
  onAccreditiChange: (id: string, f: keyof RigaCompensazione, v: any) => void;
  onAccreditiAdd: () => void; onAccreditiDelete: (id: string) => void;
  fineMese: RigaFineMese[];
  onFineMeseChange: (id: string, f: keyof RigaFineMese, v: any) => void;
  onFineMeseAdd: () => void; onFineMeseDelete: (id: string) => void;
  cassa: RigaCassaAcconto[];
  onCassaChange: (id: string, f: keyof RigaCassaAcconto, v: any) => void;
  onCassaAdd: () => void; onCassaDelete: (id: string) => void;
  totAddebitiConIva: number;
  voci: VoceConteggio[];
  rigaTimestamps: Map<string, string>;
}) {
  const totAccrediti = accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese = fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCassa = cassa.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totaleCompensazioni = totAccrediti + totFineMese + totCassa;
  // Compensati sulla distribuzione: somma di accrediti/storni + fine mese + acconti prima nota.
  // Gli addebiti da fattura (183€) restano in fattura, NON vanno aggiunti qui.
  const compensatiSuDistribuzione = totaleCompensazioni;

  return (
    <div className="dc-tab-content">

      {/* ── ACCREDITI E STORNI ── */}
      <SectionBlock title="Accrediti e Storni" icon="↩️" onAdd={onAccreditiAdd}
        totaleLabel="Totale Accrediti/Storni" totale={totAccrediti}>
        <SegnoHint />
        <ExcelTable
          headers={['#', 'Voce', 'Descrizione', 'Conto', 'Valore (€)', 'Nota', 'Mod.', '']}
          colWidths={['32px','130px','','85px','120px','','60px','36px']}
        >
          {accrediti.length === 0 ? (
            <tr><td colSpan={8} className="dc-excel-empty">Nessun accredito o storno inserito.</td></tr>
          ) : accrediti.map((r, i) => (
            <tr key={r.id} className="dc-excel-row">
              <td className="dc-excel-idx">{i + 1}</td>
              <td>
                <VoceSelector voci={voci} onPick={(v) => {
                  onAccreditiChange(r.id, 'descrizione', v.descrizione);
                  onAccreditiChange(r.id, 'contoVoce', v.contoVoce ?? '');
                  if (v.valoreDefault != null) onAccreditiChange(r.id, 'valore', Number(v.valoreDefault));
                }} />
              </td>
              <td><input className="dc-excel-input" value={r.descrizione}
                onChange={(e) => onAccreditiChange(r.id, 'descrizione', e.target.value)}
                placeholder="es. Storno fattura n.123..." /></td>
              <td><input className="dc-excel-input dc-conto-voce" value={r.contoVoce ?? ''}
                onChange={(e) => onAccreditiChange(r.id, 'contoVoce', e.target.value)} placeholder="—" /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onAccreditiChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /><EffettoNetto valore={r.valore} /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onAccreditiChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td><button className="dc-del-btn" onClick={() => onAccreditiDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── FATTURA FINE MESE ── */}
      <SectionBlock title="Fattura Fine Mese" icon="🧾" onAdd={onFineMeseAdd}
        totaleLabel="Totale Fattura Fine Mese" totale={totFineMese}>
        <SegnoHint />
        <ExcelTable
          headers={['#', 'Voce', 'Descrizione', 'Conto', 'Valore (€)', 'Nota', 'Mod.', '']}
          colWidths={['32px','130px','','85px','120px','','60px','36px']}
        >
          {fineMese.length === 0 ? (
            <tr><td colSpan={8} className="dc-excel-empty">Nessuna voce di fine mese inserita.</td></tr>
          ) : fineMese.map((r, i) => (
            <tr key={r.id} className="dc-excel-row">
              <td className="dc-excel-idx">{i + 1}</td>
              <td>
                <VoceSelector voci={voci} onPick={(v) => {
                  onFineMeseChange(r.id, 'descrizione', v.descrizione);
                  onFineMeseChange(r.id, 'contoVoce', v.contoVoce ?? '');
                  if (v.valoreDefault != null) onFineMeseChange(r.id, 'valore', Number(v.valoreDefault));
                }} />
              </td>
              <td><input className="dc-excel-input" value={r.descrizione}
                onChange={(e) => onFineMeseChange(r.id, 'descrizione', e.target.value)}
                placeholder="es. Fattura fine mese..." /></td>
              <td><input className="dc-excel-input dc-conto-voce" value={r.contoVoce ?? ''}
                onChange={(e) => onFineMeseChange(r.id, 'contoVoce', e.target.value)} placeholder="—" /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onFineMeseChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /><EffettoNetto valore={r.valore} /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onFineMeseChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td><button className="dc-del-btn" onClick={() => onFineMeseDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── CASSA PRIMA NOTA (acconti automatici) ── */}
      <SectionBlock title="Cassa Prima Nota — Acconti" icon="💰" onAdd={onCassaAdd}
        totaleLabel="Totale Acconti" totale={totCassa}>
        <ExcelTable
          headers={['Codice', 'Descrizione / Data', 'Valore (€)', 'Nota', 'Mod.', '']}
          colWidths={['80px','','100px','','60px','36px']}
        >
          {cassa.length === 0 ? (
            <tr><td colSpan={6} className="dc-excel-empty">Nessun acconto associato a questo padroncino nel mese.</td></tr>
          ) : cassa.map((r) => (
            <tr key={r.id} className={`dc-excel-row ${r.readonly ? 'dc-row-readonly' : ''}`}>
              <td>
                <span className="dc-codice-badge">{r.codice}</span>
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-readonly-text">{r.descrizione} {r.data ? `— ${fmtData(r.data)}` : ''}</span>
                ) : (
                  <input className="dc-excel-input" value={r.descrizione}
                    onChange={(e) => onCassaChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." />
                )}
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-excel-computed dc-computed-highlight">{eur(r.valore)}</span>
                ) : (
                  <input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                    onChange={(e) => onCassaChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="0,00" />
                )}
              </td>
              <td>
                <input className="dc-excel-input" value={r.nota}
                  onChange={(e) => onCassaChange(r.id, 'nota', e.target.value)} placeholder="Note..." />
              </td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td>
                <button
                  className="dc-del-btn"
                  title={r.readonly ? 'Rimuovi acconto dal conteggio (la registrazione in Acconti resterà invariata)' : undefined}
                  onClick={() => onCassaDelete(r.id)}
                >×</button>
              </td>
            </tr>
          ))}
        </ExcelTable>
        <div className="dc-cassa-note">
          <span className="dc-cassa-badge">ℹ️ Auto</span>
          Le righe automatiche provengono dagli acconti registrati nella pagina Acconti per i codici autista associati a questo padroncino nel mese.
        </div>
      </SectionBlock>

      {/* ── RIEPILOGO FINALE COMPENSAZIONI ── */}
      <div className="dc-compensazioni-finale">
        <h3>📊 Riepilogo Finale Compensazioni</h3>
        <div className="dc-compen-rows">
          <div className="dc-compen-row">
            <span>Accrediti e Storni</span>
            <span>{eur(totAccrediti)}</span>
          </div>
          <div className="dc-compen-row">
            <span>Fattura Fine Mese</span>
            <span>{eur(totFineMese)}</span>
          </div>
          <div className="dc-compen-row">
            <span>Acconti (Cassa Prima Nota)</span>
            <span>{eur(totCassa)}</span>
          </div>
          <div className="dc-compen-separator" />
          <div className="dc-compen-row dc-compen-saldo">
            <span>Compensati su distribuzione {compensatiSuDistribuzione >= 0 ? '(trattenuti dal netto)' : '(restituiti nel netto)'}</span>
            <span className={compensatiSuDistribuzione >= 0 ? 'dc-val-neg' : 'dc-val-pos'}>{eur(compensatiSuDistribuzione)}</span>
          </div>
          <div className="dc-compen-note" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
            Gli addebiti da fattura (mezzi, palmari, ricariche, addebiti vari) restano in fattura e non sono inclusi qui.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB RIEPILOGO MESE (distribuzione da Fattura Proforma) ───────────────────
type RmSortDir = 'asc' | 'desc';

function RmThSort({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: string; sortKey: string; sortDir: RmSortDir; onSort: (c: string) => void;
}) {
  const active = sortKey === col;
  return (
    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(col)}>
      {label}{' '}
      <span style={{ opacity: active ? 0.9 : 0.3, fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

function TabRiepilogoMese({ distribuzione }: { distribuzione: DistribuzioneJson | null | undefined }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (codice: string) => setExpanded((p) => ({ ...p, [codice]: !p[codice] }));

  const [sortKey, setSortKey] = useState('codice');
  const [sortDir, setSortDir] = useState<RmSortDir>('asc');
  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  };

  const fmtNum = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('it-IT');
  const fmtEur = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // % di consegne effettivamente fatte rispetto a quelle affidate
  const pctConsegne = (fatte: number | null | undefined, affidate: number | null | undefined) =>
    affidate ? (fatte ?? 0) / affidate * 100 : null;
  const fmtPct = (pct: number | null) =>
    pct == null ? '—' : pct.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const pctClass = (pct: number | null) =>
    pct == null ? '' : pct >= 100 ? 'dc-rm-pct-good' : pct >= 80 ? 'dc-rm-pct-warn' : 'dc-rm-pct-bad';

  const sortValue = (c: DistribuzioneCodice, key: string): string | number => {
    switch (key) {
      case 'codice': return c.codice.toLowerCase();
      case 'consegneFatte': return c.consegneFatte ?? 0;
      case 'consegneAffidate': return c.consegneAffidate ?? 0;
      case 'pctConsegne': return pctConsegne(c.consegneFatte, c.consegneAffidate) ?? -1;
      case 'ritiriFatti': return c.ritiriFatti ?? 0;
      case 'ritiriAffidati': return c.ritiriAffidati ?? 0;
      case 'shopFatte': return c.consegneFatteShop ?? 0;
      case 'shopAffidate': return c.consegneAffidateShop ?? 0;
      case 'fatturato': return c.fatturato ?? 0;
      default: return 0;
    }
  };

  const sortedCodici = useMemo(() => {
    const arr = [...(distribuzione?.codici ?? [])];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'it')
        : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [distribuzione, sortKey, sortDir]);

  if (!distribuzione || !distribuzione.codici || distribuzione.codici.length === 0) {
    return (
      <div className="dc-tab-content">
        <div className="dc-rm-empty">
          <strong>📦 Nessun dato di distribuzione</strong>
          Carica il file <b>Fattura Proforma</b> dalla pagina principale Conteggi
          (pulsante "📂 Importa Fattura Proforma") per popolare automaticamente
          il riepilogo mensile di questo padroncino.
        </div>
      </div>
    );
  }

  const { riepilogo } = distribuzione;

  return (
    <div className="dc-tab-content">
      <div className="dc-section-header">
        <h3>📦 Riepilogo Mese — Distribuzione per Codice Autista</h3>
      </div>
      <div className="dc-rm-wrap">
        <table className="dc-rm-table">
          <thead>
            <tr>
              <RmThSort label="Codice / Data" col="codice" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Consegne Fatte" col="consegneFatte" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Consegne Affidate" col="consegneAffidate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="% Consegne" col="pctConsegne" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Ritiri Fatti" col="ritiriFatti" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Ritiri Affidati" col="ritiriAffidati" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Shop Fatte" col="shopFatte" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Shop Affidate" col="shopAffidate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <RmThSort label="Fatturato (€)" col="fatturato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {/* Riga TOTALE */}
            <tr className="dc-rm-row-totale">
              <td>TOTALE MESE</td>
              <td>{fmtNum(riepilogo.consegneFatte)}</td>
              <td>{fmtNum(riepilogo.consegneAffidate)}</td>
              <td className={pctClass(pctConsegne(riepilogo.consegneFatte, riepilogo.consegneAffidate))}>
                {fmtPct(pctConsegne(riepilogo.consegneFatte, riepilogo.consegneAffidate))}
              </td>
              <td>{fmtNum(riepilogo.ritiriFatti)}</td>
              <td>{fmtNum(riepilogo.ritiriAffidati)}</td>
              <td>{fmtNum(riepilogo.consegneFatteShop)}</td>
              <td>{fmtNum(riepilogo.consegneAffidateShop)}</td>
              <td>{fmtEur(riepilogo.fatturato)}</td>
            </tr>

            {/* Righe per codice + expand */}
            {sortedCodici.map((c) => {
              const isOpen = expanded[c.codice] ?? false;
              return (
                <Fragment key={c.codice}>
                  <tr
                    className={`dc-rm-row-codice ${isOpen ? 'dc-rm-expanded' : ''}`}
                    onClick={() => toggle(c.codice)}
                  >
                    <td>
                      <span className="dc-rm-expand">▶</span>
                      <span className="dc-rm-codice-badge">{c.codice}</span>
                    </td>
                    <td>{fmtNum(c.consegneFatte)}</td>
                    <td>{fmtNum(c.consegneAffidate)}</td>
                    <td className={pctClass(pctConsegne(c.consegneFatte, c.consegneAffidate))}>
                      {fmtPct(pctConsegne(c.consegneFatte, c.consegneAffidate))}
                    </td>
                    <td>{fmtNum(c.ritiriFatti)}</td>
                    <td>{fmtNum(c.ritiriAffidati)}</td>
                    <td>{fmtNum(c.consegneFatteShop)}</td>
                    <td>{fmtNum(c.consegneAffidateShop)}</td>
                    <td>{fmtEur(c.fatturato)}</td>
                  </tr>
                  {isOpen && c.righe.map((r, i) => (
                    <tr key={`${c.codice}-${i}`} className="dc-rm-row-det">
                      <td>{r.data ? fmtData(r.data) : `Riga ${i + 1}`}</td>
                      <td>{fmtNum(r.consegneFatte)}</td>
                      <td>{fmtNum(r.consegneAffidate)}</td>
                      <td className={pctClass(pctConsegne(r.consegneFatte, r.consegneAffidate))}>
                        {fmtPct(pctConsegne(r.consegneFatte, r.consegneAffidate))}
                      </td>
                      <td>{fmtNum(r.ritiriFatti)}</td>
                      <td>{fmtNum(r.ritiriAffidati)}</td>
                      <td>{fmtNum(r.consegneFatteShop)}</td>
                      <td>{fmtNum(r.consegneAffidateShop)}</td>
                      <td>{fmtEur(r.fatturato)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="dc-rm-note">
        ℹ️ Questi dati provengono dal file <b>Fattura Proforma</b> importato dalla pagina Conteggi.
        Per aggiornarli, ricarica il file dalla pagina principale.
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPALE ─────────────────────────────────────────────────────
type TabKey = 'riepilogo' | 'fatturato' | 'addebiti' | 'compensazioni' | 'riepilogo-mese';

export default function DettaglioConteggio() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mese = searchParams.get('mese') ?? getCurrentMonth();
  const giorniMese = getDaysInMonth(mese);

  const [activeTab, setActiveTab] = useState<TabKey>('riepilogo');
  const [padroncino, setPadroncino] = useState<Padroncino | null>(null);
  const [conteggioId, setConteggioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingConteggio, setDeletingConteggio] = useState(false);
  const [aggiornaRicariche, setAggiornaRicariche] = useState(false);
  // Modal "Duplica da altro mese"
  const [duplicaOpen, setDuplicaOpen] = useState(false);
  const [duplicaMesiDisponibili, setDuplicaMesiDisponibili] = useState<string[]>([]);
  const [duplicaMeseSorgente, setDuplicaMeseSorgente] = useState<string>('');
  const [duplicaLoading, setDuplicaLoading] = useState(false);
  const [distribuzione, setDistribuzione] = useState<DistribuzioneJson | null>(null);
  const [vociAll, setVociAll] = useState<VoceConteggio[]>([]);
  useEffect(() => {
    vociConteggioApi.list().then(setVociAll).catch(() => setVociAll([]));
  }, []);
  const vociByCat = useMemo(() => {
    const attive = vociAll.filter((v) => v.attivo);
    // Ogni tab mostra solo le voci della propria categoria (lista ridotta e pulita).
    const filterByCat = (c: CategoriaVoceConteggio) =>
      attive.filter((v) => v.categoria === c);
    return {
      FATTURATO: filterByCat('FATTURATO'),
      ADDEBITO: filterByCat('ADDEBITO'),
      COMPENSAZIONE: filterByCat('COMPENSAZIONE'),
    };
  }, [vociAll]);

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false,
  });

  // Fatturato
  const [righeF, setRigheF] = useState<RigaFatturato[]>([]);

  // Addebiti mezzi (auto da assegnazioni)
  const [righeM, setRigheM] = useState<RigaNoleggioMezzo[]>([]);

  // mezzoId esclusi manualmente dall'utente (persistiti come tombstone in DB,
  // categoria 'noleggio_escluso') — evita che un mezzo rimosso col tasto "×"
  // ricompaia al ricaricamento della pagina perché ancora presente tra le
  // assegnazioni storiche del padroncino. Vedi bug: mezzo con assegnazione
  // chiusa ma ancora auto-rigenerato ad ogni load.
  const [mezziEsclusi, setMezziEsclusi] = useState<Set<string>>(new Set());

  // Ricariche (auto da mezzi elettrici)
  const [righeR, setRigheR] = useState<RigaRicarica[]>([]);

  // Palmari (auto da palmari assegnati, editabile a righe)
  const [righePalmari, setRighePalmari] = useState<RigaPalmare[]>([]);

  // True se l'utente ha azzerato esplicitamente i palmari per questo mese
  // (tombstone persistito come riga PALMARE categoria 'palmari_escluso',
  // importo 0, modificaManuale true) — senza questo flag, svuotare la
  // sezione Palmari e salvare fa sì che al prossimo caricamento la riga
  // venga ricreata dal conteggio storico delle assegnazioni palmari.
  const [palmariEsclusi, setPalmariEsclusi] = useState(false);

  // Addebiti vari
  const [righeV, setRigheV] = useState<RigaAddebito[]>([]);

  // Compensazioni
  const [accrediti, setAccrediti] = useState<RigaCompensazione[]>([]);
  const [fineMese, setFineMese] = useState<RigaFineMese[]>([]);
  const [cassaAcconti, setCassaAcconti] = useState<RigaCassaAcconto[]>([]);

  // DB ids esplicitamente eliminati dall'utente via X — da NON ri-preservare al save
  const [deletedDbIds, setDeletedDbIds] = useState<Set<string>>(new Set());
  const markDeleted = (dbId?: string | null) => {
    if (!dbId) return;
    setDeletedDbIds((prev) => { const n = new Set(prev); n.add(dbId); return n; });
  };

  // ─── Dirty tracking: rileva modifiche non salvate ─────────────────────────
  // Approccio esplicito: setIsDirty(true) viene chiamato SOLO dai callback
  // utente (add/delete/change), mai da loadData. loadData chiama setIsDirty(false).
  const [isDirty, setIsDirty] = useState(false);

  // Mappa id-riga DB → timestamp ultima modifica (per colonna "Mod." nelle tabelle)
  const [rigaTimestamps, setRigaTimestamps] = useState<Map<string, string>>(new Map());

  // Caricamento dati reali
  // ─── STATO CONTEGGIO (per blocco su CHIUSO/CONFERMATO) ────────────────────
  const [statoConteggio, setStatoConteggio] = useState<'BOZZA' | 'CHIUSO' | 'CONFERMATO'>('BOZZA');
  const [noteConteggio, setNoteConteggio] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [addebitivSospesi, setAddebitivSospesi] = useState<AddebitoSospeso[]>([]);

  const isReadonly = statoConteggio === 'CONFERMATO';

  // ─── Caricamento dati ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [pad, accontiRaw, conteggiList, sospesi] = await Promise.all([
        padronciniApi.detail(id),
        api.get<any[]>(`/acconti/padroncino/${id}?mese=${mese}`),
        conteggiApi.list(mese, id),
        addebitivSospesoApi.list({ padroncinoId: id, meseTarget: mese, stato: 'PENDENTE' }),
      ]);
      setAddebitivSospesi(sospesi);
      setPadroncino(pad);
 
      const conteggio = conteggiList[0] ?? null;
      const cId = conteggio?.id ?? null;
      setConteggioId(cId);
      setStatoConteggio(conteggio?.stato ?? 'BOZZA');
      setNoteConteggio((conteggio as any)?.note ?? '');
      setChecklist(loadChecklist(id, mese));
      setDistribuzione((conteggio as any)?.distribuzioneJson ?? null);
 
      // ─── Se esiste già un conteggio salvato, RICARICA LE RIGHE DAL DB ───
      if (conteggio && conteggio.righe?.length > 0) {
        const righe = conteggio.righe;

        // Mappa id-riga → timestamp ultima modifica (colonna "Mod.")
        {
          const tsMap = new Map<string, string>();
          for (const r of righe) {
            tsMap.set(r.id, fmtTs((r as any).updatedAt ?? (r as any).createdAt));
          }
          setRigaTimestamps(tsMap);
        }

        // Fatturato — sempre dal DB (include ACCONTO_FATTURA e TRATTENUTA come detrazioni)
        setRigheF(
          righe
            .filter((r: any) => r.tipo === 'FATTURATO' || r.tipo === 'ACCONTO_FATTURA' || r.tipo === 'TRATTENUTA')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              contoVoce: r.contoVoce ?? '',
              isAcconto: r.tipo === 'ACCONTO_FATTURA',
              isTrattenuta: r.tipo === 'TRATTENUTA',
              _dbId: r.id,
            }))
        );
 
        // Addebiti vari — sempre dal DB.
        // Usa percIva persistita (nuovo campo); fallback a 22% per dati legacy
        // (bollo resta 0% come in precedenza).
        setRigheV(
          righe
            .filter((r: any) => r.tipo === 'ADDEBITO')
            .map((r: any) => {
              const percIvaDb = r.percIva != null ? Number(r.percIva) : null;
              const fallback = r.categoria === 'bollo' ? 0 : 22;
              const iva = percIvaDb != null ? percIvaDb : fallback;
              return {
                id: r.id,
                descrizione: r.descrizione,
                valoreNoIva: Number(r.importo) / (1 + iva / 100),
                percIva: iva,
                note: r.note ?? '',
                contoVoce: r.contoVoce ?? '',
                _dbId: r.id,
              };
            })
        );
 
        // Accrediti — sempre dal DB
        setAccrediti(
          righe
            .filter((r: any) => r.tipo === 'ACCREDITO' || r.tipo === 'BONUS')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              contoVoce: r.contoVoce ?? '',
              _dbId: r.id,
            }))
        );
 
        // Fine mese — sempre dal DB
        setFineMese(
          righe
            .filter((r: any) => r.tipo === 'FINE_MESE')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              contoVoce: r.contoVoce ?? '',
              _dbId: r.id,
            }))
        );
 
        // ── Noleggi e Ricariche: comportamento diverso per BOZZA vs CHIUSO/CONFERMATO ──
        if (conteggio.stato === 'BOZZA') {
          // BOZZA → ricalcola dai mezzi assegnati live (così i nuovi mezzi compaiono)
          // Le righe con modificaManuale: true vengono preservate dal DB
          const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Mezzi esclusi manualmente dall'utente (tombstone persistito) — non vanno
          // ripescati anche se l'assegnazione risulta ancora attiva nel mese.
          const mezziEsclusiDb = new Set<string>(
            righe
              .filter((r: any) => r.tipo === 'NOLEGGIO' && r.categoria === 'noleggio_escluso' && r.riferimentoId)
              .map((r: any) => r.riferimentoId)
          );
          setMezziEsclusi(mezziEsclusiDb);

          // Solo i mezzi la cui assegnazione era attiva in almeno un giorno del
          // mese corrente, ed esclusi quelli rimossi manualmente. Senza questo
          // filtro, un mezzo con assegnazione chiusa mesi/anni fa continuava a
          // ricomparire in OGNI conteggio, perché pad.mezziAssegnati include
          // lo storico completo (anche assegnazioni ormai chiuse).
          const mezziAttiviMese = (pad.mezziAssegnati ?? []).filter((m: any) => {
            const mezzoId = m.id ?? m.mezzoId;
            if (mezziEsclusiDb.has(mezzoId)) return false;
            return assegnazioneAttivaNelMese(m.dataInizio, m.dataFine, mese);
          });

          let ricaricheDB: Record<string, number> = {};
          try {
            // Usa endpoint dedicato che cerca per assegnazioni mezzo (non dipende da padroncinoId su ricariche)
            const entryPad = await api.get<any>(`/ricariche/by-padroncino?padroncinoId=${id}&mese=${mese}`);
            if (entryPad?.mezzi) {
              for (const d of entryPad.mezzi) {
                ricaricheDB[normTarga(d.targa)] = Number(d.costo ?? 0);
              }
            }
          } catch { /* ignora */ }

          setRigheM(
            mezziAttiviMese.map((m: any) => {
              const mezzoId = m.id ?? m.mezzoId;
              // Cerca se esiste già una riga manuale per questo mezzo nel DB
              const esistenteManuale = righe.find(
                (r: any) => r.tipo === 'NOLEGGIO' && r.riferimentoId === mezzoId && r.modificaManuale
              );
              if (esistenteManuale) {
                const ivaDb = (esistenteManuale as any).percIva != null ? Number((esistenteManuale as any).percIva) : 22;
                return {
                  id: esistenteManuale.id,
                  mezzoId,
                  targa: m.targa,
                  valoreRataNoIva: Number(esistenteManuale.importo) / (1 + ivaDb / 100),
                  percIva: ivaDb,
                  alimentazione: m.alimentazione ?? 'DIESEL',
                  note: esistenteManuale.note ?? '',
                  isManuale: true,
                  _dbId: esistenteManuale.id,
                };
              }
              // Riga automatica: usa la tariffa attuale del mezzo
              return {
                id: `mez-${mezzoId}`,
                mezzoId,
                targa: m.targa,
                valoreRataNoIva: m.tariffa ?? null,
                percIva: 22,
                alimentazione: m.alimentazione ?? 'DIESEL',
                note: '',
                isManuale: false,
              };
            })
          );

          setRigheR(
            mezziAttiviMese
              .filter((m: any) => m.alimentazione === 'ELETTRICO')
              .map((m: any) => {
                const mezzoId = m.id ?? m.mezzoId;
                const esistenteManuale = righe.find(
                  (r: any) => r.tipo === 'RICARICA' && r.riferimentoId === mezzoId && r.modificaManuale
                );
                if (esistenteManuale) {
                  return {
                    id: esistenteManuale.id,
                    mezzoId,
                    targa: m.targa,
                    costoRicarica: Number(esistenteManuale.importo),
                    percIva: 0,
                    note: esistenteManuale.note ?? '',
                    isManuale: true,
                    _dbId: esistenteManuale.id,
                  };
                }
                return {
                  id: `ric-${mezzoId}`,
                  mezzoId,
                  targa: m.targa,
                  costoRicarica: ricaricheDB[normTarga(m.targa)] ?? null,
                  percIva: 0,
                  note: '',
                  isManuale: false,
                };
              })
          );

          // ── Palmari BOZZA: righe DB se esistono, altrimenti auto-row da padroncino ──
          {
            // Solo assegnazioni palmare attive in almeno un giorno del mese — stesso
            // bug dei mezzi: pad.palmariAssegnati include TUTTO lo storico, anche
            // assegnazioni chiuse mesi/anni fa, che altrimenti gonfiano il conteggio.
            const palmariAttiviMese = (pad.palmariAssegnati ?? []).filter((p: any) =>
              assegnazioneAttivaNelMese(p.dataInizio, p.dataFine, mese)
            );
            const righePalmariDb = righe.filter((r: any) => r.tipo === 'PALMARE' && r.categoria !== 'palmari_escluso');
            const esclusiDb = righe.some((r: any) => r.tipo === 'PALMARE' && r.categoria === 'palmari_escluso');
            setPalmariEsclusi(esclusiDb);
            if (righePalmariDb.length > 0) {
              setRighePalmari(
                righePalmariDb.map((r: any) => {
                  const percIva = r.percIva != null ? Number(r.percIva) : 22;
                  const match = (r.descrizione ?? '').match(/×(\d+)\s*×\s*([\d.]+)€\/g\s*×\s*(\d+)gg/);
                  // Fallback quando la riga NON è nel formato aggregato "×N × X€/g × Ggg"
                  // (es. righe generate dal backend in blocco — una per palmare, formato
                  // "Palmare {codice} — {tariffa} €/gg × {giorni}gg"): senza questa
                  // distinzione ogni riga veniva letta come "N palmari" invece di "1",
                  // moltiplicando l'addebito per il numero di dispositivi (bug di
                  // sovra-fatturazione con 2+ palmari generati via creazione bulk).
                  const giorni       = match ? parseInt(match[3]) : giorniMese;
                  const numeroPalmari = match ? parseInt(match[1]) : 1;
                  const tariffa      = match ? parseFloat(match[2]) : (giorni > 0 ? Number(r.importo) / giorni : 0);
                  return {
                    id: r.id,
                    numeroPalmari,
                    tariffa,
                    giorni,
                    percIva,
                    note: r.note ?? '',
                    isManuale: r.modificaManuale ?? false,
                    _dbId: r.id,
                  } as RigaPalmare & { _dbId: string };
                })
              );
            } else if (esclusiDb) {
              // L'utente ha esplicitamente azzerato i palmari per questo mese: non riproporre l'auto-riga.
              setRighePalmari([]);
            } else {
              const n = palmariAttiviMese.length;
              const tariffa = palmariAttiviMese[0]?.tariffa ?? 0;
              setRighePalmari(
                n > 0 && tariffa > 0
                  ? [{ id: 'pal-auto', numeroPalmari: n, giorni: giorniMese, tariffa, percIva: 22, note: '', isManuale: false }]
                  : []
              );
            }
          }

        } else {
          // CHIUSO o CONFERMATO → righe fisse dal DB, non si ricalcolano
          setMezziEsclusi(new Set());
          setRigheM(
            righe
              .filter((r: any) => r.tipo === 'NOLEGGIO' && r.categoria !== 'noleggio_escluso')
              .map((r: any) => {
                const m = (pad.mezziAssegnati ?? []).find(
                  (x: any) => (x.id ?? x.mezzoId) === r.riferimentoId
                );
                const ivaDb = r.percIva != null ? Number(r.percIva) : 22;
                return {
                  id: r.id,
                  mezzoId: r.riferimentoId,
                  targa: m?.targa ?? r.descrizione.replace('Noleggio ', '').split(' ')[0],
                  valoreRataNoIva: Number(r.importo) / (1 + ivaDb / 100),
                  percIva: ivaDb,
                  alimentazione: m?.alimentazione ?? 'DIESEL',
                  note: r.note ?? '',
                  isManuale: r.modificaManuale,
                  _dbId: r.id,
                };
              })
          );
 
          setRigheR(
            righe
              .filter((r: any) => r.tipo === 'RICARICA')
              .map((r: any) => {
                const m = (pad.mezziAssegnati ?? []).find(
                  (x: any) => (x.id ?? x.mezzoId) === r.riferimentoId
                );
                return {
                  id: r.id,
                  mezzoId: r.riferimentoId,
                  targa: m?.targa ?? '',
                  costoRicarica: Number(r.importo),
                  percIva: 0,
                  note: r.note ?? '',
                  isManuale: r.modificaManuale,
                  _dbId: r.id,
                };
              })
          );

          // ── Palmari CHIUSO/CONFERMATO: righe fisse dal DB ──
          {
            setPalmariEsclusi(false);
            setRighePalmari(
              righe
                .filter((r: any) => r.tipo === 'PALMARE' && r.categoria !== 'palmari_escluso')
                .map((r: any) => {
                  const percIva = r.percIva != null ? Number(r.percIva) : 22;
                  const match = (r.descrizione ?? '').match(/×(\d+)\s*×\s*([\d.]+)€\/g\s*×\s*(\d+)gg/);
                  // Fallback per righe non nel formato aggregato (una riga per
                  // palmare, es. generate da creazione bulk): vanno lette come
                  // "1 palmare" ciascuna, non come il totale dei dispositivi,
                  // altrimenti il totale visualizzato risulta moltiplicato.
                  const giorni       = match ? parseInt(match[3]) : giorniMese;
                  const numeroPalmari = match ? parseInt(match[1]) : 1;
                  const tariffa      = match ? parseFloat(match[2]) : (giorni > 0 ? Number(r.importo) / giorni : 0);
                  return {
                    id: r.id,
                    numeroPalmari,
                    tariffa,
                    giorni,
                    percIva,
                    note: r.note ?? '',
                    isManuale: r.modificaManuale ?? false,
                    _dbId: r.id,
                  } as RigaPalmare & { _dbId: string };
                })
            );
          }
        }

      } else {
        // ─── Nessun conteggio in DB: inizializza da padroncino ────────────
        setRigaTimestamps(new Map());
        setRigheF([]);
        setMezziEsclusi(new Set());

        const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
        let ricaricheDB: Record<string, number> = {};
        try {
          const entryPad = await api.get<any>(`/ricariche/by-padroncino?padroncinoId=${id}&mese=${mese}`);
          if (entryPad?.mezzi) {
            for (const d of entryPad.mezzi) {
              ricaricheDB[normTarga(d.targa)] = Number(d.costo ?? 0);
            }
          }
        } catch { /* ignora */ }

        // Solo i mezzi la cui assegnazione era attiva in almeno un giorno del mese
        const mezziAttiviMese = (pad.mezziAssegnati ?? []).filter((m: any) =>
          assegnazioneAttivaNelMese(m.dataInizio, m.dataFine, mese)
        );

        setRigheM(
          mezziAttiviMese.map((m: any) => ({
            id: `mez-${m.id ?? m.mezzoId}`,
            mezzoId: m.id ?? m.mezzoId,
            targa: m.targa,
            valoreRataNoIva: m.tariffa ?? null,
            percIva: 22,
            alimentazione: m.alimentazione ?? 'DIESEL',
            note: '',
            isManuale: false,
          }))
        );

        setRigheR(
          mezziAttiviMese
            .filter((m: any) => m.alimentazione === 'ELETTRICO')
            .map((m: any) => ({
              id: `ric-${m.id ?? m.mezzoId}`,
              mezzoId: m.id ?? m.mezzoId,
              targa: m.targa,
              costoRicarica: ricaricheDB[normTarga(m.targa)] ?? null,
              percIva: 0,
              note: '',
              isManuale: false,
            }))
        );
 
        // ── Palmari nessun conteggio: auto-row da padroncino ──
        setPalmariEsclusi(false);
        {
          const palmariAttiviMese = (pad.palmariAssegnati ?? []).filter((p: any) =>
            assegnazioneAttivaNelMese(p.dataInizio, p.dataFine, mese)
          );
          const n = palmariAttiviMese.length;
          const tariffa = palmariAttiviMese[0]?.tariffa ?? 0;
          setRighePalmari(
            n > 0 && tariffa > 0
              ? [{ id: 'pal-auto', numeroPalmari: n, giorni: giorniMese, tariffa, percIva: 22, note: '', isManuale: false }]
              : []
          );
        }

        setRigheV([]);
        setAccrediti([]);
        setFineMese([]);
      }

      // Acconti (Cassa Prima Nota)
      // Sorgente di verità: le righe ACCONTO persistite nel conteggio, così il
      // "Netto da bonificare" di questo dettaglio coincide esattamente con il
      // netto calcolato dal backend (che somma proprio quelle righe). Se il
      // conteggio non ha ancora righe ACCONTO salvate, ricadiamo sugli acconti
      // freschi dal modulo /acconti.
      const accontiLookup = new Map<string, any>(
        (accontiRaw ?? []).map((a: any) => [a.id, a])
      );
      const accontoFromAcc = (a: any): RigaCassaAcconto => ({
        id: `acc-${a.id}`,
        accontoId: a.id,
        codice: a.codice ?? a.codiceAutista?.codice ?? '—',
        descrizione: a.descrizione ?? `Acconto ${a.nomeAutista ?? ''}`.trim(),
        data: a.data ? a.data.split('T')[0] : '',
        valore: Number(a.importo),
        nota: a.note ?? '',
        readonly: true,
      });

      const righeAcconto = (conteggio?.righe ?? []).filter((r: any) => r.tipo === 'ACCONTO');
      let cassaRighe: RigaCassaAcconto[];
      if (righeAcconto.length > 0) {
        // Usa le righe ACCONTO del DB, arricchite con i dati del modulo /acconti
        // se il riferimentoId coincide con un acconto esistente.
        cassaRighe = righeAcconto.map((r: any) => {
          const src = r.riferimentoId ? accontiLookup.get(r.riferimentoId) : null;
          return {
            id: r.id,
            accontoId: r.riferimentoId ?? null,
            codice: src?.codice ?? src?.codiceAutista?.codice ?? '—',
            descrizione: r.descrizione ?? (src ? `Acconto ${src.nomeAutista ?? ''}`.trim() : 'Acconto'),
            data: src?.data ? src.data.split('T')[0] : '',
            valore: Number(r.importo),
            nota: r.note ?? src?.note ?? '',
            readonly: true,
          };
        });

        // ─── FIX: aggiungi acconti aggiunti DOPO la creazione del conteggio ───
        // Se esistono acconti nel modulo /acconti che non hanno ancora una riga
        // ACCONTO nel conteggio (confronto per riferimentoId), li mostriamo subito
        // così verranno persistiti al prossimo salvataggio.
        const riferimentiGiaPresenti = new Set(
          righeAcconto.map((r: any) => r.riferimentoId).filter(Boolean)
        );
        const accontiNuovi = (accontiRaw ?? []).filter(
          (a: any) => !riferimentiGiaPresenti.has(a.id)
        );
        if (accontiNuovi.length > 0) {
          cassaRighe = [...cassaRighe, ...accontiNuovi.map(accontoFromAcc)];
        }
      } else {
        // Fallback: conteggio senza righe ACCONTO persistite → mostra gli acconti
        // freschi dal modulo /acconti (saranno materializzati come righe al prossimo
        // salvataggio/rigenera).
        cassaRighe = (accontiRaw ?? []).map(accontoFromAcc);
      }
      setCassaAcconti(cassaRighe);
      setIsDirty(false); // caricamento completato — nessuna modifica pendente
 
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [id, mese]);
 
  useEffect(() => { loadData(); }, [loadData]);

  // ─── Warn before unload se ci sono modifiche non salvate ─────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ─── Elimina conteggio ────────────────────────────────────────────────────
  const handleEliminaConteggio = async () => {
    if (!conteggioId) return;
    if (!confirm(
      `Eliminare il conteggio di ${formatMese(mese)} per ${padroncino?.ragioneSociale}?\n` +
      `Tutte le righe verranno cancellate. Operazione irreversibile.`
    )) return;
    setDeletingConteggio(true);
    try {
      await conteggiApi.remove(conteggioId);
      setConteggioId(null);
      setStatoConteggio('BOZZA');
      setRigheF([]);
      setRigheM([]);  // oppure navigate('/conteggi') se preferisci uscire
      setRigheR([]);
      setRigheV([]);
      setAccrediti([]);
      setFineMese([]);
      alert('✅ Conteggio eliminato. Ora puoi crearne uno nuovo salvando.');
    } catch (e: any) {
      alert('❌ Errore eliminazione: ' + e.message);
    } finally {
      setDeletingConteggio(false);
    }
  };

// ─── DUPLICA DA ALTRO MESE ──────────────────────────────────────────
  const handleApriDuplica = async () => {
    if (!id) return;
    if (isReadonly) {
      alert('Il conteggio è CONFERMATO e non può essere modificato.');
      return;
    }
    try {
      const tutti = await conteggiApi.list(undefined, id);
      const TIPI_DUPLICABILI = ['FATTURATO', 'ACCONTO_FATTURA', 'ADDEBITO', 'FINE_MESE'];
      const mesi = tutti
        .filter((c) =>
          c.mese !== mese &&
          (c.righe ?? []).some((r) => TIPI_DUPLICABILI.includes(r.tipo))
        )
        .map((c) => c.mese)
        .sort((a, b) => b.localeCompare(a));
      if (mesi.length === 0) {
        alert('Nessun altro mese con voci manuali (fatturato / addebiti vari / fine mese) da duplicare.');
        return;
      }
      setDuplicaMesiDisponibili(mesi);
      setDuplicaMeseSorgente(mesi[0]);
      setDuplicaOpen(true);
    } catch (e: any) {
      alert('❌ Errore caricamento mesi: ' + e.message);
    }
  };

  const handleConfermaDuplica = async () => {
    if (!id || !duplicaMeseSorgente) return;
    const conferma = confirm(
      `Duplicare in ${formatMese(mese)} le voci manuali di ${formatMese(duplicaMeseSorgente)}?\n\n` +
      `Verranno copiate solo: Fatturato distribuzione, Addebiti vari, Fatture fine mese.\n` +
      `Le voci manuali attualmente presenti in ${formatMese(mese)} verranno sostituite.\n` +
      `Mezzi, palmari, ricariche e acconti restano invariati.`
    );
    if (!conferma) return;
    setDuplicaLoading(true);
    try {
      await conteggiApi.duplica(id, duplicaMeseSorgente, mese);
      setDuplicaOpen(false);
      await loadData();
      alert('✅ Conteggio duplicato correttamente.');
    } catch (e: any) {
      alert('❌ Errore duplicazione: ' + (e?.message ?? e));
    } finally {
      setDuplicaLoading(false);
    }
  };

// ─── CHIUDI MESE──────────────────────────────────────────────────────
  const handleChiudiMese = async () => {
    if (!conteggioId) {
      alert('Salva prima il conteggio prima di chiuderlo.');
      return;
    }
    if (!confirm(
      `Chiudere il conteggio di ${formatMese(mese)} per ${padroncino?.ragioneSociale}?\n\n` +
      `⚠️ Un conteggio CHIUSO non aggiornerà più automaticamente i mezzi assegnati.\n` +
      `Potrai comunque modificarlo manualmente finché non lo CONFERMI.`
    )) return;
    try {
      await conteggiApi.updateStato(conteggioId, 'CHIUSO');
      setStatoConteggio('CHIUSO');
      alert('✅ Mese chiuso correttamente.');
    } catch (e: any) {
      alert('❌ Errore chiusura: ' + e.message);
    }
  };

  // ─── SALVA TUTTO NEL DB ──────────────────────────────────────────────────
  const handleSalva = async () => {
    if (!id || isReadonly) return;
    setSaving(true);
    try {
      // ✅ NUOVO — crea solo se non esiste, altrimenti usa l'id già in stato
      let cId = conteggioId;
      if (!cId) {
        // Doppio controllo: potrebbe esistere in DB ma non in stato locale
        const esistenti = await conteggiApi.list(mese, id);
        if (esistenti.length > 0) {
          cId = esistenti[0].id;
          setConteggioId(cId);
        } else {
          const nuovoConteggio = await conteggiApi.create(id, mese);
          cId = nuovoConteggio.id;
          setConteggioId(cId);
        }
      }

      // 2. Costruisci il payload in memoria (merge stato locale + righe DB non toccate)
      const conteggioAttuale = await conteggiApi.detail(cId);

      const localIdSet = new Set<string>([
        ...righeF.map((r: any) => r._dbId ?? r.id),
        ...righeM.map((r: any) => r._dbId ?? r.id),
        ...righeR.map((r: any) => r._dbId ?? r.id),
        ...righePalmari.map((r: any) => r._dbId ?? r.id),
        ...righeV.map((r: any) => r._dbId ?? r.id),
        ...accrediti.map((r: any) => r._dbId ?? r.id),
        ...fineMese.map((r: any) => r._dbId ?? r.id),
      ]);
      const daPreservare = (r: any) => !localIdSet.has(r.id) && !deletedDbIds.has(r.id);

      const preservFatturato = conteggioAttuale.righe
        .filter((r: any) => (r.tipo === 'FATTURATO' || r.tipo === 'ACCONTO_FATTURA' || r.tipo === 'TRATTENUTA') && daPreservare(r))
        .map((r: any) => ({ id: r.id, descrizione: r.descrizione, valore: Number(r.importo), nota: r.note ?? '', contoVoce: r.contoVoce ?? '', isAcconto: r.tipo === 'ACCONTO_FATTURA', isTrattenuta: r.tipo === 'TRATTENUTA' }));
      const preservAddebiti = conteggioAttuale.righe
        .filter((r: any) => r.tipo === 'ADDEBITO' && daPreservare(r))
        .map((r: any) => {
          const ivaDb = r.percIva != null ? Number(r.percIva) : (r.categoria === 'bollo' ? 0 : 22);
          return { id: r.id, descrizione: r.descrizione, valoreNoIva: Number(r.importo) / (1 + ivaDb / 100), percIva: ivaDb, note: r.note ?? '', contoVoce: r.contoVoce ?? '' };
        });
      const preservAccrediti = conteggioAttuale.righe
        .filter((r: any) => (r.tipo === 'ACCREDITO' || r.tipo === 'BONUS') && daPreservare(r))
        .map((r: any) => ({ id: r.id, descrizione: r.descrizione, valore: Number(r.importo), nota: r.note ?? '', contoVoce: r.contoVoce ?? '' }));
      const preservFineMese = conteggioAttuale.righe
        .filter((r: any) => r.tipo === 'FINE_MESE' && daPreservare(r))
        .map((r: any) => ({ id: r.id, descrizione: r.descrizione, valore: Number(r.importo), nota: r.note ?? '', contoVoce: r.contoVoce ?? '' }));

      const righeFSave    = [...righeF, ...preservFatturato];
      const righeVSave    = [...righeV, ...preservAddebiti];
      const accreditiSave = [...accrediti, ...preservAccrediti];
      const fineMeseSave  = [...fineMese, ...preservFineMese];

      // 3. Costruisci l'array righe da inviare in un'unica chiamata
      let ordine = 0;
      const righePayload: any[] = [];

      // Helper: includi l'id DB nelle righe già salvate, così il backend può fare UPSERT
      // senza toccare updatedAt per le righe non cambiate.
      const dbId = (r: { id: string }) =>
        r.id && !r.id.startsWith('new-') ? { id: r.id } : {};

      for (const r of righeFSave) {
        if (!r.valore && r.valore !== 0) continue;
        const isAcconto    = (r as any).isAcconto    === true;
        const isTrattenuta = (r as any).isTrattenuta === true;
        righePayload.push({
          ...dbId(r),
          tipo:        isTrattenuta ? 'TRATTENUTA'     : isAcconto ? 'ACCONTO_FATTURA' : 'FATTURATO',
          descrizione: r.descrizione || (isTrattenuta ? 'Trattenuta' : isAcconto ? 'Acconto' : 'Fatturato'),
          importo:     r.valore,
          segno:       isTrattenuta || isAcconto ? 'NEGATIVO' : 'POSITIVO',
          categoria:   isTrattenuta ? 'consegne_doppie' : isAcconto ? 'acconti' : 'fatturato',
          ordine: ordine++, modificaManuale: true,
          contoVoce: r.contoVoce || undefined, note: r.nota || null,
        });
      }

      // Palmari: importo senza IVA (il backend applica ×1.22)
      for (const rp of righePalmari) {
        if (rp.numeroPalmari <= 0 || rp.giorni <= 0 || rp.tariffa <= 0) continue;
        righePayload.push({
          ...dbId(rp),
          tipo: 'PALMARE',
          descrizione: `Palmari ×${rp.numeroPalmari} × ${rp.tariffa.toFixed(2)}€/g × ${rp.giorni}gg`,
          importo: +(rp.numeroPalmari * rp.tariffa * rp.giorni).toFixed(2),
          segno: 'NEGATIVO', categoria: 'palmari',
          ordine: ordine++, modificaManuale: rp.isManuale,
          percIva: rp.percIva, note: rp.note || null,
        });
      }

      // Tombstone Palmari: se l'utente ha svuotato la sezione (tasto ×), persiste
      // l'esclusione così al prossimo caricamento non viene ricreata la riga
      // automatica dalle assegnazioni palmari del padroncino.
      if (righePalmari.length === 0 && palmariEsclusi) {
        righePayload.push({
          tipo: 'PALMARE',
          descrizione: 'Escluso manualmente dal conteggio',
          importo: 0,
          segno: 'NEGATIVO', categoria: 'palmari_escluso',
          ordine: ordine++, modificaManuale: true,
          percIva: 0, note: 'Rimosso manualmente — non fatturare per questo mese',
        });
      }

      for (const r of righeM) {
        if (!r.valoreRataNoIva && r.valoreRataNoIva !== 0) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'NOLEGGIO',
          descrizione: `Noleggio ${r.targa}`,
          importo: +(r.valoreRataNoIva * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO', categoria: 'noleggio',
          riferimentoTipo: 'mezzo', riferimentoId: r.mezzoId ?? undefined,
          ordine: ordine++, modificaManuale: r.isManuale ?? false,
          percIva: r.percIva, note: r.note || null,
        });
      }

      for (const r of righeR) {
        if (!r.costoRicarica && r.costoRicarica !== 0) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'RICARICA',
          descrizione: `Ricarica elettrica ${r.targa}`,
          importo: +(r.costoRicarica * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO', categoria: 'ricariche',
          riferimentoTipo: 'mezzo', riferimentoId: r.mezzoId ?? undefined,
          ordine: ordine++, modificaManuale: r.isManuale ?? false,
          percIva: r.percIva, note: r.note || null,
        });
      }

      // Tombstone per mezzi esclusi manualmente (tasto ×): persiste l'esclusione
      // così al prossimo caricamento il mezzo non viene ri-derivato dalle
      // assegnazioni del padroncino, anche se risulta ancora attivo nel mese.
      for (const mezzoId of mezziEsclusi) {
        if (righeM.some((r) => r.mezzoId === mezzoId)) continue; // ri-aggiunto manualmente: niente tombstone
        righePayload.push({
          tipo: 'NOLEGGIO',
          descrizione: 'Escluso manualmente dal conteggio',
          importo: 0,
          segno: 'NEGATIVO', categoria: 'noleggio_escluso',
          riferimentoTipo: 'mezzo', riferimentoId: mezzoId,
          ordine: ordine++, modificaManuale: true,
          percIva: 0, note: 'Rimosso manualmente — non fatturare per questo mese',
        });
      }

      for (const r of righeVSave) {
        if (!r.valoreNoIva && r.valoreNoIva !== 0) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'ADDEBITO',
          descrizione: r.descrizione || 'Addebito',
          importo: +(r.valoreNoIva * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO', categoria: 'addebiti',
          ordine: ordine++, modificaManuale: true,
          contoVoce: r.contoVoce || undefined, percIva: r.percIva, note: r.note || null,
        });
      }

      for (const r of accreditiSave) {
        if (!r.valore && r.valore !== 0) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'ACCREDITO',
          descrizione: r.descrizione || 'Accredito',
          importo: r.valore, segno: 'POSITIVO', categoria: 'accrediti',
          ordine: ordine++, modificaManuale: true,
          contoVoce: r.contoVoce || undefined, note: r.nota || null,
        });
      }

      for (const r of fineMeseSave) {
        if (!r.valore && r.valore !== 0) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'FINE_MESE',
          descrizione: r.descrizione || 'Fine mese',
          importo: r.valore, segno: 'POSITIVO', categoria: 'fine_mese',
          ordine: ordine++, modificaManuale: true,
          contoVoce: r.contoVoce || undefined, note: r.nota || null,
        });
      }

      for (const r of cassaAcconti) {
        if (r.valore == null || Number.isNaN(r.valore)) continue;
        righePayload.push({
          ...dbId(r),
          tipo: 'ACCONTO',
          descrizione: r.descrizione || `Acconto ${r.codice ?? ''}`.trim(),
          importo: Number(r.valore), segno: 'NEGATIVO', categoria: 'acconti',
          riferimentoTipo: r.accontoId ? 'acconto' : undefined,
          riferimentoId: r.accontoId ?? undefined,
          ordine: ordine++, modificaManuale: !r.readonly, note: r.nota || null,
        });
      }

      // 4. Un'unica chiamata: cancella+ricrea in transazione + un solo evento audit
      const nettoCorrente = Math.round((totFatturato * 1.22 - totAddebitiConIva - totCompensazioni) * 100) / 100;
      await conteggiApi.replaceRighe(cId, righePayload, nettoCorrente);

      alert('✅ Conteggio salvato correttamente!');
      setDeletedDbIds(new Set()); // reset tracker eliminazioni dopo save OK
      setIsDirty(false); // reset dirty subito (loadData lo confermerà)
      await loadData(); // Ricarica dal DB per sincronizzare gli id reali

    } catch (e: any) {
      alert('❌ Errore salvataggio: ' + (e.message ?? 'Errore sconosciuto'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Aggiorna ricariche dal modulo ricariche ──────────────────────────────
  const handleAggiornaRicariche = async () => {
    if (!id) return;
    setAggiornaRicariche(true);
    const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
      // Endpoint dedicato: cerca ricariche per assegnazioni mezzo, non dipende da padroncinoId su ricariche
      const url = `/ricariche/by-padroncino?padroncinoId=${id}&mese=${mese}`;
      console.log('[AggiornaRicariche] GET', url);
      const entryPad = await api.get<any>(url);
      console.log('[AggiornaRicariche] response:', entryPad);
      if (!entryPad?.mezzi?.length) {
        alert(`Nessuna ricarica trovata per questo padroncino (${id}) nel mese ${mese}.\n\nControlla la console del backend per i dettagli.`);
        return;
      }
      const nuoviCosti: Record<string, number> = {};
      for (const d of entryPad.mezzi) {
        nuoviCosti[normTarga(d.targa)] = Number(Number(d.costo ?? 0).toFixed(2));
      }
      setRigheR((prev) => prev.map((r) => ({
        ...r,
        costoRicarica: nuoviCosti[normTarga(r.targa)] ?? r.costoRicarica,
      })));
      const targheEsistenti = new Set(righeR.map((r) => normTarga(r.targa)));
      const nuove: RigaRicarica[] = entryPad.mezzi
        .filter((d: any) => !targheEsistenti.has(normTarga(d.targa)))
        .map((d: any) => ({
          id: newId(),
          mezzoId: null,
          targa: d.targa,
          costoRicarica: Number(Number(d.costo ?? 0).toFixed(2)),
          percIva: 0,
          note: 'Aggiunto da ricariche',
          isManuale: true,
        }));
      if (nuove.length) setRigheR((prev) => [...prev, ...nuove]);
      setIsDirty(true); // ricariche aggiornate — conteggio modificato
    } catch (e: any) {
      console.error('[AggiornaRicariche] ERROR:', e);
      alert('Errore aggiornamento ricariche:\n' + (e?.message ?? 'Errore sconosciuto') + '\n\n(vedi console per dettagli)');
    } finally {
      setAggiornaRicariche(false);
    }
  };
  // ─── Helper setter generici ───────────────────────────────────────────────
  // Ogni modifica di campo inline marca il conteggio come modificato.
  // Se il campo modificato è un valore economico (non solo una nota),
  // imposta isManuale: true così l'override viene preservato al ricaricamento.
  const CAMPI_VALORE = new Set(['valoreRataNoIva', 'costoRicarica', 'tariffa', 'numeroPalmari', 'giorni', 'percIva', 'valore', 'valoreNoIva']);
  function makeSetter<T extends { id: string }>(setFn: React.Dispatch<React.SetStateAction<T[]>>) {
    return (rowId: string, field: keyof T, val: any) => {
      setFn((prev) => prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated: any = { ...r, [field]: val };
        // Se l'utente modifica un campo economico e la riga ha isManuale, lo imposta a true
        if (CAMPI_VALORE.has(String(field)) && 'isManuale' in r) {
          updated.isManuale = true;
        }
        return updated;
      }));
      setIsDirty(true);
    };
  }

  // ─── Totali globali ───────────────────────────────────────────────────────
  const totFatturato = righeF.reduce((s, r) => s + (r.valore ?? 0), 0);

  // Palmari: somma da righePalmari (tutte le righe editabili)
  const costoPalmariConIva = righePalmari.reduce(
    (s, rp) => s + rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100), 0
  );
  const totMezziConIva = righeM.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const totRicaricheConIva = righeR.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);
  const totVariConIva = righeV.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const totEsentiIvaMain =
    righeR.reduce((s, r) => s + (r.percIva !== 22 ? (r.costoRicarica ?? 0) : 0), 0) +
    righeV.reduce((s, r) => s + (r.percIva !== 22 ? (r.valoreNoIva ?? 0) : 0), 0);
  const bolloAttivo = totEsentiIvaMain >= SOGLIA_BOLLO;
  const totAddebitiConIva = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + (bolloAttivo ? COSTO_BOLLO : 0);

  const totAccrediti = accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese = fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCassa = cassaAcconti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCompensazioni = totAccrediti + totFineMese + totCassa;

  const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'riepilogo', label: 'Riepilogo', icon: '📊' },
    { key: 'fatturato', label: 'Fatturato Distribuzione', icon: '💶' },
    { key: 'addebiti', label: 'Addebiti da Inserire', icon: '📋' },
    { key: 'compensazioni', label: 'Compensazioni', icon: '⚖️' },
    { key: 'riepilogo-mese', label: 'Riepilogo Mese', icon: '📦' },
  ];

  if (loading) return <div className="dc-page dc-page-loading">⏳ Caricamento dati padroncino...</div>;
  if (error || !padroncino) return (
    <div className="dc-page dc-page-loading">
      ❌ {error ?? 'Padroncino non trovato'}
      <button onClick={() => navigate(-1 as any)} style={{ marginLeft: 12 }}>← Torna</button>
    </div>
  );

  return (
    <div className="dc-page">
      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-left">
          <button className="dc-back-btn" onClick={() => {
            if (isDirty && !confirm('Hai modifiche non salvate.\nVuoi uscire senza salvare?')) return;
            navigate(-1 as any);
          }}>← Conteggi</button>
          <div>
            <h1>{padroncino.ragioneSociale}</h1>
            <span className="dc-header-mese">📅 {formatMese(mese)}</span>
            {isDirty && !isReadonly && (
              <span className="dc-dirty-badge" title="Modifiche non salvate">● Non salvato</span>
            )}
          </div>
        </div>
        <div className="dc-header-right">
          <div className="dc-mini-checklist">
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.key}
                className={`dc-mini-check ${checklist[item.key] ? 'dc-mini-done' : ''}`}
                title={item.label}
                onClick={() => {
                  const updated = { ...checklist, [item.key]: !checklist[item.key] };
                  setChecklist(updated);
                  saveChecklist(id!, mese, updated);
                }}>
                {item.icon}
              </div>
            ))}
          </div>
          <button
            className="btn-outline btn-sm"
            onClick={handleAggiornaRicariche}
            disabled={aggiornaRicariche}
            title="Ricarica i costi delle ricariche elettriche dal modulo ricariche"
          >
            {aggiornaRicariche ? '⏳' : '⚡'} Aggiorna Ricariche
          </button>

          {!isReadonly && (
            <button
              className="btn-outline btn-sm"
              onClick={handleApriDuplica}
              title="Duplica le righe di un altro mese come base per questo"
            >
              📋 Duplica da...
            </button>
          )}

          {conteggioId && statoConteggio === 'BOZZA' && (
            <button className="btn-outline btn-sm" onClick={handleChiudiMese}>
              🔒 Chiudi Mese
            </button>
          )}

          <button
            className="btn-primary btn-sm"
            onClick={handleSalva}
            disabled={saving || isReadonly}
            title={isReadonly ? 'Conteggio chiuso — non modificabile' : ''}
          >
            {saving ? '⏳ Salvando...' : '💾 Salva'}
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              if (!padroncino) return;
              try {
              // Calcola validità DURC e DVR (giorni rimanenti)
              const calcValido = (dateStr?: string | null) => {
                if (!dateStr) return null;
                const days = Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
                return days >= 0;
              };
              const durcFmt = padroncino.scadenzaDurc
                ? new Date(padroncino.scadenzaDurc).toLocaleDateString('it-IT') : null;
              const dvrFmt = padroncino.scadenzaDvr
                ? new Date(padroncino.scadenzaDvr).toLocaleDateString('it-IT') : null;

              generaPdfConteggio({
                padroncino: {
                  ragioneSociale: padroncino.ragioneSociale,
                  partitaIva:    padroncino.partitaIva,
                  indirizzo:     padroncino.indirizzo,
                  iban:          padroncino.iban,
                },
                mese,
                statoConteggio,
                durcScadenza: durcFmt,
                durcValido:   calcValido(padroncino.scadenzaDurc),
                dvrScadenza:  dvrFmt,
                dvrValido:    padroncino.dvrEsente ? null : calcValido(padroncino.scadenzaDvr),
                dvrEsente:    padroncino.dvrEsente ?? false,
                righePalmari: righePalmari.map((rp) => ({
                  numeroPalmari: rp.numeroPalmari,
                  tariffa: rp.tariffa,
                  giorni: rp.giorni,
                  percIva: rp.percIva,
                  note: rp.note,
                })),
                righeF: righeF.map((r) => ({ descrizione: r.descrizione, valore: r.valore, nota: r.nota })),
                righeM: righeM.map((r) => ({ targa: r.targa, valoreRataNoIva: r.valoreRataNoIva, percIva: r.percIva, alimentazione: r.alimentazione, note: r.note })),
                righeR: righeR.map((r) => ({ targa: r.targa, costoRicarica: r.costoRicarica, percIva: r.percIva, note: r.note })),
                righeV: righeV.map((r) => ({ descrizione: r.descrizione, valoreNoIva: r.valoreNoIva, percIva: r.percIva, note: r.note })),
                accrediti:    accrediti.map((r) => ({ descrizione: r.descrizione, valore: r.valore, nota: r.nota })),
                fineMese:     fineMese.map((r) => ({ descrizione: r.descrizione, valore: r.valore, nota: r.nota })),
                cassaAcconti: cassaAcconti.map((r) => ({ codice: r.codice, descrizione: r.descrizione, data: r.data, valore: r.valore, nota: r.nota })),
              });
              } catch (err: any) {
                console.error('Errore PDF:', err);
                alert('Errore generazione PDF: ' + (err?.message ?? err));
              }
            }}
          >
            📄 Genera PDF
          </button>

          {/* Mostra il tasto elimina SOLO se abbiamo un ID (ovvero se il record esiste nel DB) */}
          {conteggioId && (
            <button
              className="btn-danger btn-sm"
              onClick={handleEliminaConteggio}
              disabled={deletingConteggio}
            >
              {deletingConteggio ? '⏳' : '🗑️'} Elimina conteggio
            </button>
          )}
        </div>
      </div>

      {statoConteggio === 'CHIUSO' && (
        <div className="dc-readonly-banner dc-banner-chiuso">
          🔒 Mese CHIUSO — le righe non si aggiornano più automaticamente.
          Puoi ancora modificare manualmente e salvare.
        </div>
      )}
      {statoConteggio === 'CONFERMATO' && (
        <div className="dc-readonly-banner dc-banner-confermato">
          ✅ Conteggio CONFERMATO — sola lettura assoluta.
        </div>
      )}

      {/* Banner addebiti sospesi e memo */}
      {addebitivSospesi.length > 0 && (() => {
        const addebiti = addebitivSospesi.filter(a => (a as any).tipo !== 'MEMO');
        const memo     = addebitivSospesi.filter(a => (a as any).tipo === 'MEMO');
        return (
          <div className="dc-sospesi-banner-wrap">
            {addebiti.length > 0 && (
              <div className="dc-sospesi-banner dc-sospesi-banner-addebiti">
                <div className="dc-sospesi-banner-title">
                  💳 {addebiti.length} addebito{addebiti.length > 1 ? 'i' : ''} sospeso{addebiti.length > 1 ? 'i' : ''} da evadere
                </div>
                <div className="dc-sospesi-list">
                  {addebiti.map(a => (
                    <div key={a.id} className="dc-sospesi-item">
                      <span className="dc-sospesi-desc">{a.descrizione}</span>
                      {a.importo != null && (
                        <span className="dc-sospesi-importo">
                          {a.importo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </span>
                      )}
                      {a.meseOrigine && (
                        <span className="dc-sospesi-origine">da {a.meseOrigine}</span>
                      )}
                      <button
                        className="dc-sospesi-evadi"
                        title="Segna come evaso"
                        onClick={async () => {
                          await addebitivSospesoApi.evadi(a.id);
                          setAddebitivSospesi(prev => prev.filter(x => x.id !== a.id));
                        }}
                      >
                        ✓ Evadi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {memo.length > 0 && (
              <div className="dc-sospesi-banner dc-sospesi-banner-memo">
                <div className="dc-sospesi-banner-title">
                  📝 {memo.length} promemoria per questo mese
                </div>
                <div className="dc-sospesi-list">
                  {memo.map(a => (
                    <div key={a.id} className="dc-sospesi-item">
                      <span className="dc-sospesi-desc">{a.descrizione}</span>
                      {a.note && <span className="dc-sospesi-origine">{a.note}</span>}
                      <button
                        className="dc-sospesi-evadi"
                        title="Segna come fatto"
                        onClick={async () => {
                          await addebitivSospesoApi.evadi(a.id);
                          setAddebitivSospesi(prev => prev.filter(x => x.id !== a.id));
                        }}
                      >
                        ✓ Fatto
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="dc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`dc-tab-btn ${activeTab === t.key ? 'dc-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="dc-content">
        {activeTab === 'riepilogo' && (
          <TabRiepilogo
            padroncino={padroncino} mese={mese}
            totFatturato={totFatturato} totAddebitiConIva={totAddebitiConIva} totCompen={totCompensazioni}
            checklist={checklist}
            onChecklistChange={(key, val) => {
              const updated = { ...checklist, [key]: val };
              setChecklist(updated);
              saveChecklist(id!, mese, updated);
            }}
            conteggioId={conteggioId}
            noteIniziale={noteConteggio}
            onNoteSaved={setNoteConteggio}
          />
        )}
        {activeTab === 'riepilogo-mese' && (
          <TabRiepilogoMese distribuzione={distribuzione} />
        )}
        {activeTab === 'fatturato' && (
          <TabFatturato
            righe={righeF}
            onChange={makeSetter(setRigheF)}
            onAdd={() => { setRigheF((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '', isAcconto: false }]); setIsDirty(true); }}
            onAddAcconto={() => { setRigheF((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '', isAcconto: true }]); setIsDirty(true); }}
            onDelete={(id) => {
              const riga = righeF.find((r) => r.id === id) as any;
              markDeleted(riga?._dbId);
              setRigheF((p) => p.filter((r) => r.id !== id));
              setIsDirty(true);
            }}
            onImportXls={(nuove) => {
              const righeImportate = nuove.map((r) => ({
                id: newId(),
                descrizione: r.descrizione,
                valore: r.valore,
                nota: r.nota,
                isAcconto: false,
              }));
              setRigheF((prev) => [...prev, ...righeImportate]);
              setIsDirty(true);
            }}
            voci={vociByCat.FATTURATO}
            padroncino={padroncino}
            mese={mese}
            rigaTimestamps={rigaTimestamps}
          />
        )}
        {activeTab === 'addebiti' && (
          <TabAddebiti
            giorniMese={giorniMese}
            palmari={righePalmari}
            onPalmariChange={makeSetter(setRighePalmari)}
            onPalmariAdd={() => {
              const palmariAttiviMese = (padroncino?.palmariAssegnati ?? []).filter((p: any) =>
                assegnazioneAttivaNelMese(p.dataInizio, p.dataFine, mese)
              );
              const n = palmariAttiviMese.length || 1;
              const tariffa = palmariAttiviMese[0]?.tariffa ?? 0;
              setRighePalmari((p) => [...p, { id: newId(), numeroPalmari: n, giorni: giorniMese, tariffa, percIva: 22, note: '', isManuale: true }]);
              setPalmariEsclusi(false); // l'utente sta ri-aggiungendo righe: annulla l'esclusione precedente
              setIsDirty(true);
            }}
            onPalmariDelete={(delId) => {
              const riga = righePalmari.find((r) => r.id === delId) as any;
              markDeleted(riga?._dbId);
              setRighePalmari((p) => {
                const next = p.filter((r) => r.id !== delId);
                // Se questa era l'ultima riga palmari, l'utente vuole azzerare la
                // sezione per il mese: memorizza l'esclusione così al prossimo
                // salvataggio viene persistito un tombstone e la riga non torna
                // più da sola al ricaricamento (bug analogo a quello dei mezzi).
                if (next.length === 0) setPalmariEsclusi(true);
                return next;
              });
              setIsDirty(true);
            }}
            mezzi={righeM}
            onMezziChange={makeSetter(setRigheM)}
            onMezziAdd={() => { setRigheM((p) => [...p, { id: newId(), mezzoId: null, targa: '', valoreRataNoIva: null, percIva: 22, alimentazione: 'DIESEL', note: '', isManuale: true }]); setIsDirty(true); }}
            onMezziDelete={(id) => {
              // Per le righe NOLEGGIO il save sostituisce l'intero array, quindi
              // non serve markDeleted — basta rimuovere dallo stato. Se la riga
              // è legata a un mezzo (mezzoId), va anche segnata come "esclusa"
              // (tombstone persistito al save) altrimenti al prossimo reload
              // il mezzo, se ancora assegnato in questo mese, viene rigenerato
              // automaticamente — è esattamente il bug che ha causato l'errore
              // sul conteggio: un mezzo rimosso manualmente che ricompariva.
              const riga = righeM.find((r) => r.id === id);
              if (riga?.mezzoId) {
                setMezziEsclusi((prev) => new Set(prev).add(riga.mezzoId!));
              }
              setRigheM((p) => p.filter((r) => r.id !== id));
              setIsDirty(true);
            }}
            ricariche={righeR}
            onRicaricheChange={makeSetter(setRigheR)}
            onRicaricheAdd={() => { setRigheR((p) => [...p, { id: newId(), mezzoId: null, targa: '', costoRicarica: null, percIva: 0, note: '', isManuale: true }]); setIsDirty(true); }}
            onRicaricheDelete={(id) => { setRigheR((p) => p.filter((r) => r.id !== id)); setIsDirty(true); }}
            addebitiVari={righeV}
            onAddebitiVariChange={makeSetter(setRigheV)}
            onAddebitiVariAdd={() => { setRigheV((p) => [...p, { id: newId(), descrizione: '', valoreNoIva: null, percIva: 22, note: '' }]); setIsDirty(true); }}
            onAddebitiVariDelete={(id) => {
              const riga = righeV.find((r) => r.id === id) as any;
              markDeleted(riga?._dbId);
              setRigheV((p) => p.filter((r) => r.id !== id));
              setIsDirty(true);
            }}
            voci={vociByCat.ADDEBITO}
            rigaTimestamps={rigaTimestamps}
          />
        )}
        {activeTab === 'compensazioni' && (
          <TabCompensazioni
            accrediti={accrediti}
            onAccreditiChange={makeSetter(setAccrediti)}
            onAccreditiAdd={() => { setAccrediti((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '' }]); setIsDirty(true); }}
            onAccreditiDelete={(id) => {
              const riga = accrediti.find((r) => r.id === id) as any;
              markDeleted(riga?._dbId);
              setAccrediti((p) => p.filter((r) => r.id !== id));
              setIsDirty(true);
            }}
            fineMese={fineMese}
            onFineMeseChange={makeSetter(setFineMese)}
            onFineMeseAdd={() => { setFineMese((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '' }]); setIsDirty(true); }}
            onFineMeseDelete={(id) => {
              const riga = fineMese.find((r) => r.id === id) as any;
              markDeleted(riga?._dbId);
              setFineMese((p) => p.filter((r) => r.id !== id));
              setIsDirty(true);
            }}
            cassa={cassaAcconti}
            onCassaChange={makeSetter(setCassaAcconti)}
            onCassaAdd={() => { setCassaAcconti((p) => [...p, { id: newId(), accontoId: null, codice: '—', descrizione: '', data: '', valore: null, nota: '', readonly: false }]); setIsDirty(true); }}
            onCassaDelete={(id) => { setCassaAcconti((p) => p.filter((r) => r.id !== id)); setIsDirty(true); }}
            totAddebitiConIva={totAddebitiConIva}
            voci={vociByCat.COMPENSAZIONE}
            rigaTimestamps={rigaTimestamps}
          />
        )}
      </div>

      {duplicaOpen && (
        <div className="dc-modal-overlay" onClick={() => !duplicaLoading && setDuplicaOpen(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>📋 Duplica conteggio</h3>
              <button
                className="dc-modal-close"
                onClick={() => !duplicaLoading && setDuplicaOpen(false)}
                aria-label="Chiudi"
              >×</button>
            </div>
            <div className="dc-modal-body">
              <p>
                Copia in <strong>{formatMese(mese)}</strong> solo le voci inserite manualmente:
                <br/><em>Fatturato distribuzione, Addebiti vari, Fatture fine mese</em>.
              </p>
              <p className="dc-modal-warn">
                ⚠️ Le voci manuali attualmente presenti in {formatMese(mese)} verranno sostituite.
                <br/>Mezzi, palmari, ricariche e acconti restano invariati (ricalcolati dal mese).
              </p>
              <label className="dc-modal-label">
                Mese sorgente:
                <select
                  value={duplicaMeseSorgente}
                  onChange={(e) => setDuplicaMeseSorgente(e.target.value)}
                  disabled={duplicaLoading}
                >
                  {duplicaMesiDisponibili.map((m) => (
                    <option key={m} value={m}>{formatMese(m)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dc-modal-footer">
              <button
                className="btn-outline btn-sm"
                onClick={() => setDuplicaOpen(false)}
                disabled={duplicaLoading}
              >Annulla</button>
              <button
                className="btn-primary btn-sm"
                onClick={handleConfermaDuplica}
                disabled={duplicaLoading || !duplicaMeseSorgente}
              >
                {duplicaLoading ? '⏳ Duplicando...' : '📋 Duplica'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
