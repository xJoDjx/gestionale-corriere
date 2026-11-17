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
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { taskApi } from '../../lib/api';
import type { TaskItem } from '../../lib/api';
import { fmtEur, fmtNum as fmtNum2 } from '../../components/ds';
import * as XLSX from 'xlsx';
import './DettaglioConteggio.css';
import './DettaglioConteggio2.css';

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
// Solo formattazione a video ("€ 1.234,56"): i valori e i calcoli non cambiano
const eur = (n: number | null | undefined) =>
  n == null ? '—' : fmtEur(n);
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
  { key: 'distribuzioneInviata', label: 'Distribuzione inviata', icon: '📤' },
  { key: 'pdfAddebitiCreato', label: 'PDF addebiti creato', icon: '📄' },
  { key: 'fatturaCreata', label: 'Fattura TU creata', icon: '🧾' },
  { key: 'fatturaRicevuta', label: 'Fattura ricevuta', icon: '✅' },
];

// ─── GRAFICA (restyling) ───────────────────────────────────────────────────────
const C2 = { B: '#3D63F0', V: '#15A06A', O: '#EA6A2A', P: '#7C5CF0', R: '#DC4446', T: '#0E9494', K: '#0B0B0C', D: '#18181B', GR: '#71717A' };
const P2 = {
  riep: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', fat: 'M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  add: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', comp: 'M12 3v18M5 7h14', mese: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
  palm: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', van: 'M3 6h11v10H3zM14 9h4l3 3v4h-7z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', vari: 'M12 3l9.5 17h-19zM12 10v5M12 18h.01', cassa: 'M3 7h18v12H3zM3 11h18',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', nota: 'M4 4h16v12H8l-4 4zM8 9h8M8 12h5', check: 'M9 11l3 3 8-8',
  plus: 'M12 5v14M5 12h14', up: 'M12 15V3M7 8l5-5 5 5M4 21h16', down: 'M12 3v12M7 10l5 5 5-5M4 21h16', copy: 'M8 8h12v12H8zM4 16V4h12',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5', lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8M8 21v-7h8v7', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', x: 'M6 6l12 12M18 6L6 18',
  storno: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3', tick: 'M5 12l5 5 9-10', ext: 'M7 17L17 7M9 7h8v8', chev: 'M9 6l6 6-6 6',
};
type TileKey = 'fat' | 'tratt' | 'acc' | 'totfat' | 'palm' | 'van' | 'bolt' | 'vari' | 'storno' | 'fm' | 'cassa' | 'totadd' | 'totcomp';
const TILES: Record<TileKey, [string, string]> = {
  fat: [C2.V, P2.fat], tratt: [C2.R, P2.vari], acc: [C2.O, P2.cassa], totfat: [C2.K, P2.add],
  palm: [C2.B, P2.palm], van: [C2.T, P2.van], bolt: [C2.V, P2.bolt], vari: [C2.P, P2.vari],
  storno: [C2.T, P2.storno], fm: [C2.B, P2.add], cassa: [C2.D, P2.cassa], totadd: [C2.R, P2.add], totcomp: [C2.B, P2.comp],
};
function Svg2({ d, size = 14, sw = 2, color }: { d: string; size?: number; sw?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
function Tile2({ c, d, size = 26, icon = 13, r = 7 }: { c: string; d: string; size?: number; icon?: number; r?: number }) {
  return <span aria-hidden="true" className="dc2-tile" style={{ flex: `0 0 ${size}px`, width: size, height: size, borderRadius: r, background: c }}><Svg2 d={d} size={icon} sw={2.4} /></span>;
}

/** Mostra l'importo formattato ("€ 1.234,56") sopra il campo numerico quando non è in modifica.
 *  Il campo resta lo stesso input di prima: cambia solo come appare a riposo. */
function NumBox({ v, children }: { v: number | null | undefined; children: React.ReactNode }) {
  const n = v == null || (v as any) === '' ? null : Number(v);
  return (
    <span className={`dc2-numbox${n != null && n < 0 ? ' is-neg' : ''}`}>
      {children}
      <span aria-hidden="true" className="dc2-numfmt">{n == null || Number.isNaN(n) ? '' : eur(n)}</span>
    </span>
  );
}

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
          <tr>{headers.map((h, i) => (
            <th key={i} style={typeof h === 'string' && /^(Importo|Rata|Totale|Tariffa|Valore|Giorni|N° )/.test(h) ? { textAlign: 'right', paddingRight: 16 } : undefined}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SectionBlock({
  title, tile, onAdd, addLabel = 'Aggiungi riga', children, totaleLabel, totale, subTotaleLabel, subTotale, actions, sub,
}: {
  title: string; tile: TileKey; onAdd?: () => void; addLabel?: string; children: React.ReactNode;
  totaleLabel?: string; totale?: number;
  subTotaleLabel?: string; subTotale?: number;
  actions?: React.ReactNode; sub?: React.ReactNode;
}) {
  const [c, d] = TILES[tile];
  return (
    <section className="dc2-card dc-addebiti-section">
      <div className="dc2-shead">
        <div className="dc2-shead-l">
          <Tile2 c={c} d={d} />
          <div className="dc2-col">
            <h2 className="dc2-h2">{title}</h2>
            {sub && <span className="dc2-small dc2-muted">{sub}</span>}
          </div>
        </div>
        <div className="dc2-shead-r">
          {subTotaleLabel != null && subTotale != null && (
            <span className="dc2-small dc2-muted">{subTotaleLabel}: <span className="dc2-num">{eur(subTotale)}</span></span>
          )}
          {totale != null && <span className="dc2-stot" title={totaleLabel}>{eur(totale)}</span>}
          {actions}
          {onAdd && <button type="button" className="dc2-btn dc2-btn-xs" onClick={onAdd}><Svg2 d={P2.plus} size={12} />{addLabel}</button>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Riga di totale nello stile del mockup (sfondo chiaro, grassetto) */
function TotRows({ rows }: { rows: { label: React.ReactNode; value: React.ReactNode; bold?: boolean; tone?: 'neg' | 'pos' | 'muted' }[] }) {
  return (
    <div className="dc2-totrows">
      {rows.map((r, i) => (
        <div key={i} className={`dc2-totrow${r.bold ? ' is-bold' : ''}`}>
          <span>{r.label}</span>
          <span className={`dc2-num${r.tone === 'neg' ? ' dc2-neg' : r.tone === 'pos' ? ' dc2-pos' : r.tone === 'muted' ? ' dc2-muted' : ''}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── TAB RIEPILOGO ─────────────────────────────────────────────────────────────
interface ParteImporto { a: string; v: number; c: string }
function CardImporti({ label, value, c, d, parti }: { label: string; value: number; c: string; d: string; parti: ParteImporto[] }) {
  const tot = parti.reduce((s, p) => s + Math.abs(p.v), 0);
  return (
    <section className="dc2-card dc2-kcard">
      <div className="dc2-row" style={{ gap: 8 }}>
        <Tile2 c={c} d={d} size={18} icon={11} r={5} />
        <h2 className="dc2-klabel">{label}</h2>
      </div>
      <span className="dc2-kval">{eur(value)}</span>
      <div aria-hidden="true" className="dc2-segbar">
        {parti.map((p) => <span key={p.a} style={{ width: tot ? `${(Math.abs(p.v) / tot) * 100}%` : 0, background: p.c }} />)}
      </div>
      <div className="dc2-klist">
        {parti.map((p) => (
          <div key={p.a} className="dc2-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <span aria-hidden="true" className="dc2-sq" style={{ background: p.c }} />
            <span style={{ flex: '1 1 auto', color: '#3F3F46' }}>{p.a}</span>
            <span className="dc2-num" style={{ fontWeight: 500 }}>{eur(p.v)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function scadInfo(d: string | null | undefined): { t: string; sc: string; sd: string } {
  if (!d) return { t: 'Non inserito', sc: '#52525B', sd: '#A1A1AA' };
  const giorni = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const data = new Date(d).toLocaleDateString('it-IT');
  if (giorni < 0) return { t: `Scaduto il ${data}`, sc: '#B91C1C', sd: '#E5484D' };
  if (giorni <= 30) return { t: `Scade il ${data}`, sc: '#C2410C', sd: '#EA6A2A' };
  return { t: `Valido fino al ${data}`, sc: '#15803D', sd: '#15A06A' };
}

function TabRiepilogo({ padroncino, mese, totFatturato, totAddebitiConIva, totCompen, parti, compParti, distribuzione, checklist, onChecklistChange, conteggioId, noteIniziale, onNoteSaved, tasks, onToggleTask, onNewTask, onEditTask, onApriPadroncino }: {
  padroncino: Padroncino; mese: string;
  totFatturato: number; totAddebitiConIva: number; totCompen: number;
  parti: { palmari: number; mezzi: number; ricariche: number; vari: number; bollo: number };
  compParti: { accrediti: number; fineMese: number; cassa: number };
  distribuzione: DistribuzioneJson | null | undefined;
  checklist: Record<string, boolean>; onChecklistChange: (key: string, val: boolean) => void;
  conteggioId: string | null;
  noteIniziale: string;
  onNoteSaved: (note: string) => void;
  tasks: TaskItem[];
  onToggleTask: (t: TaskItem) => void;
  onNewTask: () => void;
  onEditTask: (t: TaskItem) => void;
  onApriPadroncino: () => void;
}) {
  // ── Blocco note con autosave ──────────────────────────
  const [noteText, setNoteText] = useState(noteIniziale);
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

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

  // Resa del mese dalla fattura proforma (solo lettura)
  const rp = distribuzione?.riepilogo;
  const resa = rp ? [
    { l: 'Consegne', f: rp.consegneFatte, a: rp.consegneAffidate, u: 'fatte' },
    { l: 'Consegne Shop', f: rp.consegneFatteShop, a: rp.consegneAffidateShop, u: 'fatte' },
    { l: 'Ritiri', f: rp.ritiriFatti, a: rp.ritiriAffidati, u: 'fatti' },
  ].map((x) => {
    const p = x.a ? ((x.f ?? 0) / x.a) * 100 : null;
    const col = p == null ? ['#A1A1AA', '#52525B'] : p >= 90 ? ['#15A06A', '#15803D'] : p >= 50 ? ['#EA6A2A', '#C2410C'] : ['#E5484D', '#B91C1C'];
    return { ...x, p, c: col[0], tc: col[1] };
  }) : [];

  const durc = scadInfo(padroncino.scadenzaDurc);
  const dvr = padroncino.dvrEsente ? { t: 'Esente', sc: '#52525B', sd: '#A1A1AA' } : scadInfo(padroncino.scadenzaDvr);
  const fatte = CHECKLIST_ITEMS.filter((i) => checklist[i.key]).length;

  return (
    <div className="dc-riepilogo dc2-stack">
      <div className="dc2-g4">
        <CardImporti label="Fatturato distribuzione" value={totFatturato * 1.22} c={C2.V} d={P2.fat} parti={[
          { a: 'Imponibile', v: totFatturato, c: C2.V },
          { a: 'IVA 22%', v: totFatturato * 0.22, c: '#9FDCC2' },
        ]} />
        <CardImporti label="Addebiti (con IVA)" value={totAddebitiConIva} c={C2.R} d={P2.add} parti={[
          { a: 'Noleggi', v: parti.mezzi, c: C2.T },
          { a: 'Palmari', v: parti.palmari, c: C2.B },
          { a: 'Ricariche, vari, bollo', v: parti.ricariche + parti.vari + parti.bollo, c: C2.P },
        ]} />
        <CardImporti label="Compensazioni" value={totCompen} c={C2.B} d={P2.comp} parti={[
          { a: 'Fattura fine mese', v: compParti.fineMese, c: C2.B },
          { a: 'Acconti e cassa', v: compParti.cassa, c: '#AFC0FA' },
          ...(compParti.accrediti ? [{ a: 'Accrediti e storni', v: compParti.accrediti, c: C2.T }] : []),
        ]} />
        <section className="dc2-card dc2-kcard" style={{ gap: 12 }}>
          <div className="dc2-row" style={{ gap: 8 }}>
            <Tile2 c={C2.P} d={P2.mese} size={18} icon={11} r={5} />
            <h2 className="dc2-klabel">Resa del mese</h2>
          </div>
          {resa.length === 0
            ? <span className="dc2-small dc2-muted">Importa la fattura proforma per vedere consegne e ritiri del mese.</span>
            : resa.map((x) => (
              <div key={x.l} className="dc2-col" style={{ gap: 5 }}>
                <div className="dc2-row dc2-num" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{x.l}</span>
                  <span style={{ fontWeight: 600, color: x.tc }}>{x.p == null ? '—' : `${fmtNum2(x.p, 1)}%`}</span>
                </div>
                <div aria-hidden="true" className="dc2-bar"><div style={{ width: `${Math.min(100, x.p ?? 0)}%`, background: x.c }} /></div>
                <span className="dc2-small dc2-muted dc2-num">{fmtNum2(x.f ?? 0)} {x.u} su {fmtNum2(x.a ?? 0)}</span>
              </div>
            ))}
        </section>
      </div>

      <div className="dc2-g4">
        <section className="dc2-card dc2-s3 dc2-list">
          <div className="dc2-lhead">
            <div className="dc2-col" style={{ gap: 2 }}>
              <h2 className="dc2-h2">Note, attività e modifiche</h2>
              <span className="dc2-muted">Le attività di {padroncino.ragioneSociale} aperte in Conteggi compaiono anche qui</span>
            </div>
            <div className="dc2-row" style={{ gap: 6 }}>
              <button type="button" className="dc2-btn dc2-btn-xs" onClick={() => noteRef.current?.focus()} disabled={!conteggioId}><Svg2 d={P2.edit} size={12} />Nota</button>
              <button type="button" className="dc2-btn dc2-btn-xs" onClick={onNewTask}><Svg2 d={P2.check} size={12} />Attività</button>
            </div>
          </div>
          {tasks.map((t) => (
            <div key={t.id} className={`dc2-ev${t.completata ? ' is-done' : ''}`}>
              <span aria-hidden="true" className="dc2-tile" style={{ width: 26, height: 26, borderRadius: 7, background: C2.P }}><Svg2 d={P2.check} size={12} sw={2.4} /></span>
              <span className="dc2-ev-data">{new Date(t.createdAt).toLocaleDateString('it-IT')}</span>
              <span className="dc2-tag" style={{ color: '#6D28D9' }}><span aria-hidden="true" className="dc2-dot" style={{ background: C2.P }} />Promemoria</span>
              <button type="button" className="dc2-ev-tit dc2-link" onClick={() => onEditTask(t)} title="Modifica attività">{t.testo}</button>
              <span className="dc2-row" style={{ gap: 8, justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span className="dc2-ev-txt">{[t.targa, t.codiceAutista, t.palmare].filter(Boolean).join(' · ') || (t.user ? `${t.user.nome} ${t.user.cognome}` : '')}</span>
                <label className="dc2-check" title={t.completata ? 'Segna come da fare' : 'Segna come fatta'}>
                  <input type="checkbox" checked={t.completata} onChange={() => onToggleTask(t)} />Fatta
                </label>
              </span>
            </div>
          ))}
          <LogConteggio conteggioId={conteggioId} limit={8} />
          <div className="dc2-notefoot">
            <label htmlFor="dc2-note" className="sr-only">Note del mese</label>
            <textarea
              id="dc2-note"
              ref={noteRef}
              className="dc2-ta"
              placeholder={conteggioId ? `Note del conteggio di ${formatMese(mese).toLowerCase()}…` : 'Salva prima il conteggio per abilitare le note'}
              value={noteText}
              onChange={(e) => handleNoteChange(e.target.value)}
              rows={Math.min(8, Math.max(2, noteText.split('\n').length))}
              disabled={!conteggioId}
            />
            <span className="dc2-small" style={{ minWidth: 90, textAlign: 'right', color: noteSaveStatus === 'error' ? '#B91C1C' : '#6B6B73' }}>
              {noteSaveStatus === 'saving' && 'Salvataggio…'}
              {noteSaveStatus === 'saved' && 'Salvato'}
              {noteSaveStatus === 'error' && 'Errore'}
              {noteSaveStatus === 'idle' && (conteggioId ? 'Salvataggio automatico' : '')}
            </span>
          </div>
        </section>

        <section className="dc2-card dc2-pad">
          <h2 className="dc2-h2">Padroncino</h2>
          <dl className="dc2-dl">
            <div><dt>Sede</dt><dd>{padroncino.indirizzo || <span className="dc2-muted">Non inserita</span>}</dd></div>
            <div><dt>DURC</dt><dd style={{ color: durc.sc }}><span aria-hidden="true" className="dc2-dot" style={{ background: durc.sd }} />{durc.t}</dd></div>
            <div><dt>DVR</dt><dd style={{ color: dvr.sc }}><span aria-hidden="true" className="dc2-dot" style={{ background: dvr.sd }} />{dvr.t}</dd></div>
            {padroncino.iban && <div><dt>IBAN</dt><dd className="dc2-mono" style={{ fontSize: 12 }}>{padroncino.iban}</dd></div>}
          </dl>
          <div className="dc2-col" style={{ gap: 6 }}>
            <div className="dc2-row" style={{ justifyContent: 'space-between' }}>
              <span className="dc2-small dc2-muted">Stato avanzamento</span>
              <span className="dc2-small dc2-num" style={{ fontWeight: 600 }}>{fatte} di {CHECKLIST_ITEMS.length}</span>
            </div>
            <div aria-hidden="true" className="dc2-bar"><div style={{ width: `${(fatte / CHECKLIST_ITEMS.length) * 100}%`, background: C2.V }} /></div>
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="dc2-check dc2-checkrow">
                <input type="checkbox" checked={checklist[item.key] ?? false} onChange={() => onChecklistChange(item.key, !(checklist[item.key] ?? false))} />
                {item.label}
              </label>
            ))}
          </div>
          <button type="button" className="dc2-alink" onClick={onApriPadroncino}>Apri scheda padroncino ↗</button>
        </section>
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
      <option value="">Voce…</option>
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
  // Una riga della tabella (input e logica invariati: cambia solo la grafica)
  const renderRiga = (r: RigaFatturato, i: number) => (
          <tr
            key={r.id}
            className="dc-excel-row"
          >
            <td className="dc-excel-idx">{i + 1}</td>
            <td>
              {(r as any).isTrattenuta
                ? <span className="dc2-kind" style={{ color: '#B91C1C' }}><span aria-hidden="true" className="dc2-dot" style={{ background: '#E5484D' }} />Trattenuta</span>
                : r.isAcconto
                ? <span className="dc2-kind" style={{ color: '#C2410C' }}><span aria-hidden="true" className="dc2-dot" style={{ background: '#EA6A2A' }} />Acconto</span>
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
              <NumBox v={r.valore}><input
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
              /></NumBox>
            </td>
            <td><input className="dc-excel-input" value={r.nota}
              onChange={(e) => onChange(r.id, 'nota', e.target.value)}
              placeholder="Note..." /></td>
            <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
            <td>
              <button className="dc-del-btn" onClick={() => onDelete(r.id)}>×</button>
            </td>
          </tr>
  );
  const HEAD = ['#', 'Voce', 'Descrizione', 'Conto', 'Importo', 'Nota', 'Modificata', ''];
  const COLS = ['40px', '130px', '', '90px', '130px', '', '84px', '40px'];
  const tabella = (rows: RigaFatturato[], vuoto: string) => (
    <ExcelTable headers={HEAD} colWidths={COLS}>
      {rows.length === 0
        ? <tr><td colSpan={8} className="dc-excel-empty">{vuoto}</td></tr>
        : rows.map((r, i) => renderRiga(r, i))}
    </ExcelTable>
  );

  return (
    <div className="dc-tab-content dc2-stack">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <SectionBlock
        title="Fatturato" tile="fat" totale={totLordo} totaleLabel="Fatturato lordo (imponibile)"
        sub="Righe della fattura proforma di distribuzione"
        onAdd={onAdd}
        actions={<>
          <button
            type="button" className="dc2-btn dc2-btn-xs"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="Carica un file XLS/CSV con le righe della fattura proforma"
          ><Svg2 d={P2.up} size={12} />{importing ? 'Importazione…' : 'Importa da XLS'}</button>
          <button
            type="button" className="dc2-btn dc2-btn-xs"
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
          ><Svg2 d={P2.doc} size={12} color="#DC4446" />PDF distribuzione</button>
          <button
            type="button" className="dc2-btn dc2-btn-xs"
            onClick={onAddAcconto}
            title="Aggiungi un acconto già pagato al padroncino: verrà scalato dalla fattura ma NON dal fatturato nelle statistiche"
          ><Svg2 d={P2.cassa} size={12} color="#EA6A2A" />Aggiungi acconto</button>
        </>}
      >
        {tabella(righeNormali, 'Nessuna voce. Aggiungi una riga.')}
      </SectionBlock>

      {righeAcconto.length > 0 && (
        <SectionBlock title="Acconti già pagati" tile="acc" totale={totAcconti} totaleLabel="Acconti già pagati"
          sub="Scalati dalla fattura, non dal fatturato nelle statistiche" onAdd={onAddAcconto} addLabel="Aggiungi acconto">
          {tabella(righeAcconto, '')}
        </SectionBlock>
      )}

      {righeTrattenute.length > 0 && (
        <SectionBlock title="Trattenute" tile="tratt" totale={totTrattenute} totaleLabel="Trattenute">
          {tabella(righeTrattenute, '')}
        </SectionBlock>
      )}

      <SectionBlock title="Totale fattura" tile="totfat" totale={totImponibile * 1.22} totaleLabel="Totale fattura da ricevere">
        <div className="dc-fatturato-totali">
          <TotRows rows={[
            ...((righeAcconto.length > 0 || righeTrattenute.length > 0) ? [
              { label: 'Fatturato lordo (imponibile)', value: eur(totLordo) },
              ...(righeAcconto.length > 0 ? [{ label: 'Acconti già pagati', value: eur(totAcconti), tone: 'neg' as const }] : []),
              ...(righeTrattenute.length > 0 ? [{ label: 'Trattenute', value: eur(totTrattenute), tone: 'neg' as const }] : []),
              { label: 'Totale imponibile netto', value: eur(totImponibile), bold: true },
            ] : [
              { label: 'Totale imponibile', value: eur(totImponibile), bold: true },
            ]),
            { label: 'IVA 22%', value: eur(totImponibile * 0.22) },
            { label: 'Totale fattura da ricevere', value: eur(totImponibile * 1.22), bold: true },
          ]} />
        </div>
      </SectionBlock>
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
      <SectionBlock title="Palmari" tile="palm" onAdd={onPalmariAdd}
        totaleLabel="Totale Palmari (con IVA)" totale={costoPalmariConIva}
        subTotaleLabel="Senza IVA" subTotale={costoPalmariNoIva}>
        <ExcelTable
          headers={['N° palmari', 'Tariffa al giorno', 'Giorni', 'IVA', 'Totale con IVA', 'Nota', 'Modificata', '']}
          colWidths={['100px', '140px', '80px', '84px', '140px', '', '84px', '40px']}
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
                  <NumBox v={rp.tariffa}><input className="dc-excel-input dc-excel-num" type="number" min={0} step={0.01}
                    value={rp.tariffa}
                    onChange={(e) => onPalmariChange(rp.id, 'tariffa', parseFloat(e.target.value) || 0)}
                    placeholder="0,00" /></NumBox>
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
      <SectionBlock title="Noleggio mezzi" tile="van" onAdd={onMezziAdd}
        totaleLabel="Totale Mezzi (con IVA)" totale={totMezziConIva}>
        <ExcelTable
          headers={['Targa','Rata senza IVA','IVA','Rata con IVA','Alimentazione','Nota','Modificata','']}
          colWidths={['100px','140px','84px','140px','130px','','84px','40px']}
        >
          {mezzi.length === 0 ? (
            <tr><td colSpan={8} className="dc-excel-empty">Nessun mezzo assegnato.</td></tr>
          ) : mezzi.map((r) => {
            const rataIvata = (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100);
            return (
              <tr key={r.id} className="dc-excel-row">
                <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                  onChange={(e) => onMezziChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
                <td><NumBox v={r.valoreRataNoIva}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreRataNoIva ?? ''}
                  onChange={(e) => onMezziChange(r.id, 'valoreRataNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></NumBox></td>
                <td><select className="dc-excel-select dc-excel-num" value={r.percIva}
                  onChange={(e) => onMezziChange(r.id, 'percIva', parseFloat(e.target.value))}>
                  <option value={0}>0%</option>
                  <option value={22}>22%</option>
                </select></td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(rataIvata || null)}</td>
                <td>
                  <select className="dc-excel-select" value={r.alimentazione}
                    onChange={(e) => onMezziChange(r.id, 'alimentazione', e.target.value)}>
                    <option value="DIESEL">Diesel</option>
                    <option value="ELETTRICO">Elettrico</option>
                    <option value="BENZINA">Benzina</option>
                    <option value="IBRIDO">Ibrido</option>
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
      <SectionBlock title="Ricariche elettriche" tile="bolt" onAdd={onRicaricheAdd}
        totaleLabel="Totale Ricariche" totale={totRicaricheConIva}>
        <ExcelTable
          headers={['Targa','Importo addebito','IVA','Totale','Nota','Modificata','']}
          colWidths={['100px','160px','70px','130px','','84px','40px']}
        >
          {ricariche.length === 0 ? (
            <tr><td colSpan={7} className="dc-excel-empty">Nessun mezzo elettrico assegnato.</td></tr>
          ) : ricariche.map((r) => (
            <tr key={r.id} className="dc-excel-row">
              <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                onChange={(e) => onRicaricheChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
              <td><NumBox v={r.costoRicarica}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.costoRicarica != null ? Number(r.costoRicarica).toFixed(2) : ''}
                onChange={(e) => onRicaricheChange(r.id, 'costoRicarica', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" title="Valore finale già comprensivo di maggiorazione, IVA 0%" /></NumBox></td>
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
      <SectionBlock title={bolloAttivo ? 'Addebiti vari e bollo' : 'Addebiti vari'} tile="vari" onAdd={onAddebitiVariAdd}
        totaleLabel="Totale vari (con IVA)" totale={totVariConIva + (bolloAttivo ? COSTO_BOLLO : 0)}>
        <ExcelTable
          headers={['Voce','Descrizione','Conto','Importo senza IVA','IVA','Valore IVA','Nota','Modificata','']}
          colWidths={['130px','','90px','140px','84px','100px','','84px','40px']}
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
                <td><NumBox v={r.valoreNoIva}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreNoIva ?? ''}
                  onChange={(e) => onAddebitiVariChange(r.id, 'valoreNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></NumBox></td>
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
          {/* Bollo: attivato automaticamente, stessa regola di prima */}
          {bolloAttivo && (
            <tr className="dc-excel-row dc2-row-auto" title="Totale addebiti esenti IVA (ricariche + vari con IVA ≠ 22%) sopra la soglia di legge">
              <td colSpan={3}><span className="dc2-b">Bollo su importi esenti</span> <span className="dc2-muted">· automatico</span></td>
              <td colSpan={4} className="dc2-muted">Esenti {eur(totEsentiIva)}, sopra la soglia di {eur(SOGLIA_BOLLO)}</td>
              <td colSpan={2} className="dc-excel-computed dc-computed-highlight">{eur(COSTO_BOLLO)}</td>
            </tr>
          )}
        </ExcelTable>
      </SectionBlock>

      {/* Totale finale */}
      <SectionBlock title="Totale addebiti da inserire in fattura" tile="totadd" totale={totaleAddebiti} totaleLabel="Totale addebiti">
        <div className="dc-addebiti-finale">
          <TotRows rows={[
            { label: 'Noleggio palmari (con IVA)', value: eur(costoPalmariConIva) },
            { label: 'Noleggio mezzi (con IVA)', value: eur(totMezziConIva) },
            { label: 'Ricariche elettriche (IVA 0%)', value: eur(totRicaricheConIva) },
            { label: 'Addebiti vari (con IVA)', value: eur(totVariConIva) },
            ...(bolloAttivo ? [{ label: 'Bollo virtuale', value: eur(COSTO_BOLLO) }] : []),
            { label: 'Totale addebiti da inserire in fattura', value: eur(totaleAddebiti), bold: true },
          ]} />
        </div>
      </SectionBlock>
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
    <div className="dc2-effetto" style={{ color: trattiene ? '#B91C1C' : '#15803D' }}>
      {trattiene ? `− ${eur(valore)} dal netto` : `+ ${eur(Math.abs(valore))} al netto`}
    </div>
  );
}

function SegnoHint() {
  return (
    <span title="Valore positivo = trattenuto al padroncino (riduce il netto) · valore negativo = restituito al padroncino (es. restituzione banconota sospetta, aumenta il netto)">
      Positivo = trattenuto dal netto · negativo = restituito nel netto
    </span>
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
      <SectionBlock title="Accrediti e storni" tile="storno" onAdd={onAccreditiAdd}
        totaleLabel="Totale accrediti e storni" totale={totAccrediti} sub={<SegnoHint />}>
        <ExcelTable
          headers={['#', 'Voce', 'Descrizione', 'Conto', 'Importo', 'Nota', 'Modificata', '']}
          colWidths={['40px','130px','','90px','140px','','84px','40px']}
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
              <td><NumBox v={r.valore}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onAccreditiChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /></NumBox><EffettoNetto valore={r.valore} /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onAccreditiChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td><button className="dc-del-btn" onClick={() => onAccreditiDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── FATTURA FINE MESE ── */}
      <SectionBlock title="Fatture fine mese" tile="fm" onAdd={onFineMeseAdd}
        totaleLabel="Totale fattura fine mese" totale={totFineMese} sub={<SegnoHint />}>
        <ExcelTable
          headers={['#', 'Voce', 'Descrizione', 'Conto', 'Importo', 'Nota', 'Modificata', '']}
          colWidths={['40px','130px','','90px','140px','','84px','40px']}
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
              <td><NumBox v={r.valore}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onFineMeseChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /></NumBox><EffettoNetto valore={r.valore} /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onFineMeseChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td className="dc-ts-cell">{rigaTimestamps.get(r.id) ?? ''}</td>
              <td><button className="dc-del-btn" onClick={() => onFineMeseDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── CASSA PRIMA NOTA (acconti automatici) ── */}
      <SectionBlock title="Acconti e cassa" tile="cassa" onAdd={onCassaAdd}
        totaleLabel="Totale acconti" totale={totCassa}
        sub="Le righe automatiche arrivano dagli acconti registrati per i codici autista del padroncino nel mese">
        <ExcelTable
          headers={['Codice', 'Descrizione', 'Data', 'Nota', 'Importo', 'Modificata', '']}
          colWidths={['84px', '', '110px', '', '130px', '84px', '40px']}
        >
          {cassa.length === 0 ? (
            <tr><td colSpan={7} className="dc-excel-empty">Nessun acconto associato a questo padroncino nel mese.</td></tr>
          ) : cassa.map((r) => (
            <tr key={r.id} className={`dc-excel-row ${r.readonly ? 'dc-row-readonly' : ''}`}>
              <td>
                <span className="dc-codice-badge">{r.codice}</span>
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-readonly-text">{r.descrizione}</span>
                ) : (
                  <input className="dc-excel-input" value={r.descrizione}
                    onChange={(e) => onCassaChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." />
                )}
              </td>
              <td><span className="dc2-muted dc2-num" style={{ padding: '0 8px' }}>{r.data ? fmtData(r.data) : '—'}</span></td>
              <td>
                <input className="dc-excel-input" value={r.nota}
                  onChange={(e) => onCassaChange(r.id, 'nota', e.target.value)} placeholder="Note..." />
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-excel-computed dc-computed-highlight">{eur(r.valore)}</span>
                ) : (
                  <NumBox v={r.valore}><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                    onChange={(e) => onCassaChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="0,00" /></NumBox>
                )}
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
      </SectionBlock>

      {/* ── RIEPILOGO FINALE COMPENSAZIONI ── */}
      <SectionBlock title="Totale compensazioni" tile="totcomp" totale={compensatiSuDistribuzione} totaleLabel="Compensati su distribuzione">
        <div className="dc-compensazioni-finale">
          <TotRows rows={[
            { label: 'Accrediti e storni', value: eur(totAccrediti) },
            { label: 'Fatture fine mese', value: eur(totFineMese) },
            { label: 'Acconti e cassa', value: eur(totCassa) },
            {
              label: `Compensati su distribuzione ${compensatiSuDistribuzione >= 0 ? '(trattenuti dal netto)' : '(restituiti nel netto)'}`,
              value: eur(compensatiSuDistribuzione), bold: true, tone: compensatiSuDistribuzione >= 0 ? 'neg' : 'pos',
            },
          ]} />
          <div className="dc2-foot dc2-muted">
            Gli addebiti da fattura (mezzi, palmari, ricariche, addebiti vari) restano in fattura e non sono inclusi qui.
          </div>
        </div>
      </SectionBlock>
    </div>
  );
}

// ─── TAB RIEPILOGO MESE (distribuzione da Fattura Proforma) ───────────────────
type RmSortDir = 'asc' | 'desc';

function RmThSort({ label, col, sortKey, sortDir, onSort, left }: {
  label: string; col: string; sortKey: string; sortDir: RmSortDir; onSort: (c: string) => void; left?: boolean;
}) {
  const active = sortKey === col;
  return (
    <th aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ textAlign: left ? 'left' : 'right' }}>
      <button type="button" className={`dc2-sort${active ? ' is-on' : ''}`} onClick={() => onSort(col)}>
        {label}
        <svg aria-hidden="true" width="9" height="12" viewBox="0 0 9 12">
          <path d="M4.5 1L8 5H1z" fill={active && sortDir === 'asc' ? '#0B0B0C' : '#D4D4D8'} />
          <path d="M4.5 11L1 7h7z" fill={active && sortDir === 'desc' ? '#0B0B0C' : '#D4D4D8'} />
        </svg>
      </button>
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
    n == null ? '—' : fmtNum2(n);
  const fmtEur = (n: number | null | undefined) => eur(n);

  // % di consegne effettivamente fatte rispetto a quelle affidate
  const pctConsegne = (fatte: number | null | undefined, affidate: number | null | undefined) =>
    affidate ? (fatte ?? 0) / affidate * 100 : null;
  const fmtPct = (pct: number | null) =>
    pct == null ? '—' : pct.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const pctClass = (pct: number | null) =>
    pct == null ? '' : pct >= 90 ? 'dc-rm-pct-good' : pct >= 85 ? 'dc-rm-pct-warn' : 'dc-rm-pct-bad';

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
        <section className="dc2-card dc2-empty">
          <Tile2 c={C2.P} d={P2.mese} size={40} icon={18} r={10} />
          <span className="dc2-empty-t">Nessun dato di distribuzione</span>
          <span className="dc2-muted" style={{ maxWidth: 460 }}>
            Carica il file Fattura Proforma dalla pagina Conteggi (Importa fattura proforma) per popolare
            automaticamente il riepilogo mensile di questo padroncino.
          </span>
        </section>
      </div>
    );
  }

  const { riepilogo } = distribuzione;
  const cells = (x: { consegneFatte?: number | null; consegneAffidate?: number | null; ritiriFatti?: number | null; ritiriAffidati?: number | null; consegneFatteShop?: number | null; consegneAffidateShop?: number | null; fatturato?: number | null }) => (<>
    <td>{fmtNum(x.consegneFatte)}</td>
    <td className="dc2-muted">{fmtNum(x.consegneAffidate)}</td>
    <td className={`dc2-b ${pctClass(pctConsegne(x.consegneFatte, x.consegneAffidate))}`}>{fmtPct(pctConsegne(x.consegneFatte, x.consegneAffidate))}</td>
    <td>{fmtNum(x.ritiriFatti)}</td>
    <td className="dc2-muted">{fmtNum(x.ritiriAffidati)}</td>
    <td>{fmtNum(x.consegneFatteShop)}</td>
    <td className="dc2-muted">{fmtNum(x.consegneAffidateShop)}</td>
    <td className="dc2-b">{fmtEur(x.fatturato)}</td>
  </>);

  return (
    <div className="dc-tab-content">
      <section className="dc2-card">
        <div className="dc2-shead">
          <div className="dc2-shead-l">
            <Tile2 c={C2.P} d={P2.mese} />
            <div className="dc2-col">
              <h2 className="dc2-h2">Distribuzione per codice autista</h2>
              <span className="dc2-small dc2-muted">{distribuzione.codici.length} codici · clic sulle intestazioni per ordinare, sul codice per il dettaglio giornaliero</span>
            </div>
          </div>
          <div className="dc2-shead-r">
            <span className="dc2-stot">{fmtEur(riepilogo.fatturato)}</span>
          </div>
        </div>
        <div className="dc-rm-wrap">
          <table className="dc-rm-table">
            <thead>
              <tr>
                <RmThSort label="Codice" col="codice" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} left />
                <RmThSort label="Consegne fatte" col="consegneFatte" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Affidate" col="consegneAffidate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="% consegne" col="pctConsegne" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Ritiri fatti" col="ritiriFatti" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Affidati" col="ritiriAffidati" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Shop fatte" col="shopFatte" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Affidate" col="shopAffidate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <RmThSort label="Fatturato" col="fatturato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedCodici.map((c) => {
                const isOpen = expanded[c.codice] ?? false;
                return (
                  <Fragment key={c.codice}>
                    <tr
                      className={`dc-rm-row-codice ${isOpen ? 'dc-rm-expanded' : ''}`}
                      onClick={() => toggle(c.codice)}
                      aria-expanded={isOpen}
                    >
                      <td>
                        <span className="dc-rm-expand" aria-hidden="true"><Svg2 d={P2.chev} size={11} sw={2.4} /></span>
                        <span className="dc-rm-codice-badge">{c.codice}</span>
                      </td>
                      {cells(c)}
                    </tr>
                    {isOpen && c.righe.map((r, i) => (
                      <tr key={`${c.codice}-${i}`} className="dc-rm-row-det">
                        <td>{r.data ? fmtData(r.data) : `Riga ${i + 1}`}</td>
                        {cells(r)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="dc-rm-row-totale">
                <td>Totale</td>
                {cells(riepilogo)}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="dc2-foot dc2-muted">
          Dati dal file Fattura Proforma importato dalla pagina Conteggi. Per aggiornarli, ricarica il file dalla pagina principale.
        </div>
      </section>
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
  // Solo visualizzazione: netto salvato nel DB, per confrontarlo con quello ricalcolato a video
  const [nettoSalvato, setNettoSalvato] = useState<number | null>(null);

  // Attività di Conteggi (stesse della pagina Conteggi) filtrate per questo padroncino
  const [tasksAll, setTasksAll] = useState<TaskItem[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const loadTasks = useCallback(async () => {
    try { setTasksAll(await taskApi.list('conteggi', 'conteggi')); } catch { /* pannello informativo */ }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'conteggi', entityId: 'conteggi', ...data });
      setTaskModalOpen(false); setEditingTask(null);
      await loadTasks();
    } catch (e: any) { alert('Errore attività: ' + (e?.message ?? e)); }
    finally { setTaskSaving(false); }
  };
  const handleToggleTask = async (t: TaskItem) => {
    setTasksAll(prev => prev.map(x => x.id === t.id ? { ...x, completata: !x.completata } : x));
    try { await taskApi.toggle(t.id, !t.completata); } catch { loadTasks(); }
  };

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
      setNettoSalvato(conteggio?.netto != null ? Number(conteggio.netto) : null);
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
      setNettoSalvato(nettoCorrente);

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

  const TABS: Array<{ key: TabKey; label: string; tot: string; c: string; d: string }> = [
    { key: 'riepilogo', label: 'Riepilogo', tot: '', c: C2.K, d: P2.riep },
    { key: 'fatturato', label: 'Fatturato distribuzione', tot: eur(totFatturato * 1.22), c: C2.V, d: P2.fat },
    { key: 'addebiti', label: 'Addebiti da inserire', tot: eur(totAddebitiConIva), c: C2.R, d: P2.add },
    { key: 'compensazioni', label: 'Compensazioni', tot: eur(totCompensazioni), c: C2.B, d: P2.comp },
    { key: 'riepilogo-mese', label: 'Riepilogo mese', tot: distribuzione?.codici?.length ? `${distribuzione.codici.length} codici` : '', c: C2.P, d: P2.mese },
  ];

  if (loading) return <main className="dc-page dc2-page"><section className="dc2-card dc2-empty"><span className="dc2-muted">Caricamento conteggio…</span></section></main>;
  if (error || !padroncino) return (
    <main className="dc-page dc2-page">
      <section className="dc2-card dc2-empty">
        <span className="dc2-empty-t">{error ?? 'Padroncino non trovato'}</span>
        <button type="button" className="dc2-btn" onClick={() => navigate(-1 as any)}>Torna ai conteggi</button>
      </section>
    </main>
  );

  // ── Solo visualizzazione: stessa formula usata al salvataggio (handleSalva) ──
  const nettoVideo = totFatturato * 1.22 - totAddebitiConIva - totCompensazioni;
  const nettoArrot = Math.round(nettoVideo * 100) / 100;
  const coincide = nettoSalvato != null && Math.abs(nettoSalvato - nettoArrot) < 0.005;
  const meseLabel = formatMese(mese);
  const nMezzi = (padroncino.mezziAssegnati ?? []).filter((m: any) => assegnazioneAttivaNelMese(m.dataInizio, m.dataFine, mese)).length;
  const nPalmari = (padroncino.palmariAssegnati ?? []).filter((p: any) => assegnazioneAttivaNelMese(p.dataInizio, p.dataFine, mese)).length;
  const nCodici = (padroncino.codiciAutista ?? []).filter((c: any) => assegnazioneAttivaNelMese(c.dataInizio, c.dataFine, mese)).length;
  const iniziali = padroncino.ragioneSociale.replace(/[^A-Za-zÀ-ú0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const STATO_UI = {
    BOZZA: { t: 'Bozza', c: '#C2410C', d: '#EA6A2A', tip: 'In lavorazione: le righe automatiche si aggiornano dal mese.' },
    CHIUSO: { t: 'Chiuso', c: '#52525B', d: '#A1A1AA', tip: 'Mese chiuso: le righe non si aggiornano più automaticamente. Puoi ancora modificare manualmente e salvare.' },
    CONFERMATO: { t: 'Confermato', c: '#15803D', d: '#15A06A', tip: 'Conteggio confermato: sola lettura.' },
  }[statoConteggio];
  const tasksPad = tasksAll.filter((t) => t.padroncino === padroncino.ragioneSociale && !t.completata);
  const esci = () => {
    if (isDirty && !confirm('Hai modifiche non salvate.\nVuoi uscire senza salvare?')) return;
    navigate(-1 as any);
  };
  const generaPdf = () => {
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
  };

  return (
    <main className="dc-page dc2-page">
      {/* Header */}
      <header className="dc2-head">
        <div className="dc2-head-l">
          <span aria-hidden="true" className="dc2-avatar">{iniziali || '?'}</span>
          <div className="dc2-col" style={{ gap: 2 }}>
            <span className="dc2-small dc2-muted">
              <button type="button" className="dc2-link" onClick={esci}>Conteggio</button> · {meseLabel.toLowerCase()}
            </span>
            <div className="dc2-row" style={{ gap: 10 }}>
              <h1 className="dc2-h1">{padroncino.ragioneSociale}</h1>
              <span className="dc2-tag" style={{ color: STATO_UI.c }} title={STATO_UI.tip}><span aria-hidden="true" className="dc2-dot" style={{ background: STATO_UI.d }} />{STATO_UI.t}</span>
              {isDirty && !isReadonly && (
                <span className="dc2-tag" style={{ color: '#C2410C' }} title="Modifiche non salvate"><span aria-hidden="true" className="dc2-dot" style={{ background: '#EA6A2A' }} />Non salvato</span>
              )}
            </div>
            <span className="dc2-muted">
              {nMezzi} mezz{nMezzi === 1 ? 'o' : 'i'} · {nPalmari} palmar{nPalmari === 1 ? 'e' : 'i'} · {nCodici} codic{nCodici === 1 ? 'e' : 'i'} autista
              {padroncino.partitaIva ? ` · P. IVA ${padroncino.partitaIva}` : ''}
            </span>
          </div>
        </div>
        <div className="dc2-row" style={{ gap: 8 }}>
          <button type="button" className="dc2-btn" onClick={handleAggiornaRicariche} disabled={aggiornaRicariche}
            title="Ricarica i costi delle ricariche elettriche dal modulo ricariche">
            <Svg2 d={P2.bolt} color="#15A06A" />{aggiornaRicariche ? 'Aggiorno…' : 'Aggiorna ricariche'}
          </button>
          {!isReadonly && (
            <button type="button" className="dc2-btn" onClick={handleApriDuplica} title="Duplica le righe di un altro mese come base per questo">
              <Svg2 d={P2.copy} />Duplica
            </button>
          )}
          <button type="button" className="dc2-btn" onClick={generaPdf}>
            <Svg2 d={P2.doc} color="#DC4446" />PDF addebiti
          </button>
          {conteggioId && statoConteggio === 'BOZZA' && (
            <button type="button" className="dc2-btn" onClick={handleChiudiMese}>
              <Svg2 d={P2.lock} />Chiudi mese
            </button>
          )}
          {conteggioId && (
            <button type="button" className="dc2-btn dc2-btn-icon dc2-btn-danger" onClick={handleEliminaConteggio} disabled={deletingConteggio}
              aria-label="Elimina conteggio" title="Elimina conteggio">
              <Svg2 d={P2.trash} />
            </button>
          )}
          <button
            type="button"
            className="dc2-btn dc2-btn-primary"
            onClick={handleSalva}
            disabled={saving || isReadonly}
            title={isReadonly ? 'Conteggio confermato — non modificabile' : ''}
          >
            <Svg2 d={P2.save} />{saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </header>

      {/* Saldo */}
      <section aria-label="Saldo del conteggio" className="dc2-saldo">
        <div className="dc2-col" style={{ gap: 4 }}>
          <span className="dc2-saldo-eyebrow">{meseLabel} · netto da bonificare</span>
          <span className="dc2-saldo-val">{eur(nettoVideo)}</span>
          <span className="dc2-saldo-check" style={{ color: isDirty ? '#FCD9B6' : coincide || nettoSalvato == null ? '#B9EBD4' : '#FCD9B6' }}>
            <Svg2 d={isDirty || (!coincide && nettoSalvato != null) ? P2.vari : P2.tick} size={13} sw={2.6} />
            {isDirty
              ? 'Modifiche non salvate: salva per aggiornare il netto'
              : nettoSalvato == null
                ? 'Ricalcolato dalle righe del conteggio'
                : coincide
                  ? 'Ricalcolato: coincide con il netto salvato'
                  : `Diverso dal netto salvato (${eur(nettoSalvato)}): salva per allinearlo`}
          </span>
        </div>
        <div className="dc2-row" style={{ gap: 22 }}>
          <div className="dc2-col" style={{ gap: 2 }}>
            <span className="dc2-saldo-l">Fattura</span>
            <span className="dc2-saldo-n">{eur(totFatturato * 1.22)}</span>
          </div>
          <span aria-hidden="true" className="dc2-saldo-op">−</span>
          <div className="dc2-col" style={{ gap: 2 }}>
            <span className="dc2-saldo-l">Addebiti</span>
            <span className="dc2-saldo-n">{eur(totAddebitiConIva)}</span>
          </div>
          <span aria-hidden="true" className="dc2-saldo-op">−</span>
          <div className="dc2-col" style={{ gap: 2 }}>
            <span className="dc2-saldo-l">Compensazioni</span>
            <span className="dc2-saldo-n">{eur(totCompensazioni)}</span>
          </div>
          <button type="button" className="dc2-btn dc2-btn-white" onClick={generaPdf}>
            <Svg2 d={P2.down} />Scarica riepilogo
          </button>
        </div>
      </section>

      {statoConteggio === 'CONFERMATO' && (
        <div className="dc2-alert dc2-alert-ok">
          <span aria-hidden="true" className="dc2-dot" style={{ background: '#15A06A' }} />
          <span style={{ flex: '1 1 360px' }}><span className="dc2-b">Conteggio confermato.</span> <span style={{ color: '#3F3F46' }}>È in sola lettura.</span></span>
        </div>
      )}

      {/* Sospesi e promemoria del padroncino per questo mese */}
      {addebitivSospesi.map((a) => {
        const memo = (a as any).tipo === 'MEMO';
        return (
          <div key={a.id} className={`dc2-alert ${memo ? 'dc2-alert-viola' : 'dc2-alert-info'}`}>
            <span aria-hidden="true" className="dc2-dot" style={{ background: memo ? '#7C5CF0' : '#3D63F0' }} />
            <span style={{ flex: '1 1 360px' }}>
              <span className="dc2-b">{memo ? 'Promemoria per questo mese.' : 'Sospeso in attesa.'}</span>{' '}
              <span style={{ color: '#3F3F46' }}>
                {a.descrizione}
                {!memo && a.importo != null ? ` · ${eur(a.importo)}` : ''}
                {!memo && a.meseOrigine ? ` · da ${a.meseOrigine}` : ''}
                {memo && a.note ? ` · ${a.note}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="dc2-btn dc2-btn-xs"
              title={memo ? 'Segna come fatto' : 'Segna come evaso'}
              onClick={async () => {
                await addebitivSospesoApi.evadi(a.id);
                setAddebitivSospesi(prev => prev.filter(x => x.id !== a.id));
              }}
            >{memo ? 'Fatto' : 'Evadi'}</button>
            <button type="button" className="dc2-btn dc2-btn-xs" onClick={() => navigate('/sospesi')}>Vai ai sospesi</button>
          </div>
        );
      })}

      {/* Tabs */}
      <div role="tablist" aria-label="Sezioni del conteggio" className="dc2-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} className="dc2-tab"
            onClick={() => setActiveTab(t.key)}>
            <span aria-hidden="true" className="dc2-tabtile" style={{ background: t.c }}><Svg2 d={t.d} size={10} sw={2.8} /></span>
            {t.label}
            {t.tot && <span className="dc2-tabtot">{t.tot}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="dc-content">
        {activeTab === 'riepilogo' && (
          <TabRiepilogo
            padroncino={padroncino} mese={mese}
            totFatturato={totFatturato} totAddebitiConIva={totAddebitiConIva} totCompen={totCompensazioni}
            parti={{ palmari: costoPalmariConIva, mezzi: totMezziConIva, ricariche: totRicaricheConIva, vari: totVariConIva, bollo: bolloAttivo ? COSTO_BOLLO : 0 }}
            compParti={{ accrediti: totAccrediti, fineMese: totFineMese, cassa: totCassa }}
            distribuzione={distribuzione}
            tasks={tasksPad}
            onToggleTask={handleToggleTask}
            onNewTask={() => { setEditingTask(null); setTaskModalOpen(true); }}
            onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true); }}
            onApriPadroncino={() => { if (isDirty && !confirm('Hai modifiche non salvate.\nVuoi uscire senza salvare?')) return; navigate(`/padroncini/${padroncino.id}`); }}
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

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        editingTask={editingTask}
        defaultPadroncino={padroncino.ragioneSociale}
      />

      {duplicaOpen && (
        <div className="dc-modal-overlay" onClick={() => !duplicaLoading && setDuplicaOpen(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Duplica conteggio</h3>
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
                Le voci manuali attualmente presenti in {formatMese(mese)} verranno sostituite.
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
                {duplicaLoading ? 'Duplicazione…' : 'Duplica'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
