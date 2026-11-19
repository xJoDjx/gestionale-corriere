// src/features/mezzi/DettaglioMezzo.tsx — Scheda mezzo (grafica restyling), logica API invariata
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, mezziApi, padronciniApi, noteApi, documentiApi, auditApi, taskApi } from '../../lib/api';
import type { Mezzo, Padroncino, Nota, Documento, AuditLogEntry } from '../../lib/api';
import { fmtDate, fmtEur, fmtNum } from '../../components/ds';
import type { Tone } from '../../components/ds';
import Modal from '../../components/ui/Modal';
import ChiudiAssegnazioneModal from '../../components/ui/ChiudiAssegnazioneModal';
import type { ChiudiAssegnazioneTarget } from '../../components/ui/ChiudiAssegnazioneModal';
import TabDocumenti from './TabDocumenti';
import TabManutenzioni from './TabManutenzioni';
import './FlottaMezzi.css';
import './DettaglioMezzo.css';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
};

// ─── MODALE NUOVA ASSEGNAZIONE ────────────────────────────────────────────────

function NuovaAssegnazioneModal({
  open, onClose, padroncini, onSave,
}: {
  open: boolean; onClose: () => void;
  padroncini: Padroncino[];
  onSave: (padroncinoId: string, dataInizio: string) => Promise<void>;
}) {
  const [padroncinoId, setPadroncinoId] = useState('');
  const [dataInizio,   setDataInizio]   = useState(new Date().toISOString().split('T')[0]);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');

  const filtered = padroncini.filter(p =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!padroncinoId || !dataInizio) return;
    setSaving(true);
    try { await onSave(padroncinoId, dataInizio); setPadroncinoId(''); setSearch(''); onClose(); }
    catch (e: any) { alert('Errore: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova assegnazione" width={500}>
      <div className="ncam-body">
        <div className="ncam-field">
          <label className="ncam-label">Cerca padroncino</label>
          <input className="ncam-input" placeholder="Filtra per nome..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dm-pad-list">
          {filtered.map(p => (
            <div key={p.id} className={`dm-pad-item ${padroncinoId === p.id ? 'dm-pad-selected' : ''}`} onClick={() => setPadroncinoId(p.id)}>
              <span className="dm-pad-name">{p.ragioneSociale}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="dm-pad-empty">Nessun padroncino trovato</div>}
        </div>
        <div className="ncam-field">
          <label className="ncam-label">Data Inizio <span className="ncam-req">*</span></label>
          <input className="ncam-input" type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)} />
        </div>
        <div className="ncam-actions">
          <button className="ncam-btn-cancel" onClick={onClose}>Annulla</button>
          <button className="ncam-btn-save" disabled={!padroncinoId || !dataInizio || saving} onClick={handleSave}>
            {saving ? 'Salvataggio…' : 'Assegna'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODALE CONTRATTO PDA ─────────────────────────────────────────────────────

function ContrattoModal({
  open, onClose, mezzoId, targa, rataDefault, isElettrico,
  padronciniList, defaultPadroncinoId, defaultDataFirma,
}: {
  open: boolean; onClose: () => void; mezzoId: string; targa: string;
  rataDefault?: number | null; isElettrico: boolean; padronciniList: Padroncino[];
  defaultPadroncinoId?: string; defaultDataFirma?: string;
}) {
  const [padroncinoId,  setPadroncinoId]  = useState('');
  const [search,        setSearch]        = useState('');
  const [nomeRapp,      setNomeRapp]      = useState('');
  const [cognomeRapp,   setCognomeRapp]   = useState('');
  const [cfRapp,        setCfRapp]        = useState('');
  const [qualificaRapp, setQualificaRapp] = useState('Amministratore Unico');
  const [dataFirma,     setDataFirma]     = useState(defaultDataFirma ?? new Date().toISOString().split('T')[0]);
  const [rataNoleggio,  setRataNoleggio]  = useState<string>(rataDefault != null ? String(rataDefault) : '');
  const [kmInclusi,     setKmInclusi]     = useState<string>('4000');
  const [eccedenzaKm,   setEccedenzaKm]  = useState<string>('0.10');
  const [generating,    setGenerating]    = useState(false);
  const [errMsg,        setErrMsg]        = useState('');

  const padroncinoSel = padronciniList.find(p => p.id === padroncinoId) ?? null;

  useEffect(() => {
    if (open) {
      if (defaultPadroncinoId) setPadroncinoId(defaultPadroncinoId);
      if (defaultDataFirma)    setDataFirma(defaultDataFirma);
    }
  }, [open]);

  useEffect(() => {
    if (!padroncinoSel) return;
    if (padroncinoSel.rappresentanteNome)      setNomeRapp(padroncinoSel.rappresentanteNome);
    if (padroncinoSel.rappresentanteCognome)   setCognomeRapp(padroncinoSel.rappresentanteCognome);
    if (padroncinoSel.cfRappresentante)        setCfRapp(padroncinoSel.cfRappresentante);
    if (padroncinoSel.qualificaRappresentante) setQualificaRapp(padroncinoSel.qualificaRappresentante);
  }, [padroncinoId]);

  const filtered = padronciniList.filter(p =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()) ||
    p.partitaIva.includes(search),
  );

  const handleGenera = async () => {
    if (!padroncinoId) { setErrMsg('Seleziona un padroncino'); return; }
    setErrMsg(''); setGenerating(true);
    try {
      await mezziApi.generaContrattoPda(mezzoId, {
        padroncinoId, nomeRapp: nomeRapp || undefined, cognomeRapp: cognomeRapp || undefined,
        cfRapp: cfRapp || undefined, qualificaRapp: qualificaRapp || undefined, dataFirma,
        rataNoleggio: rataNoleggio ? parseFloat(rataNoleggio) : undefined,
        kmInclusi: kmInclusi ? parseInt(kmInclusi) : undefined,
        eccedenzaKm: eccedenzaKm ? parseFloat(eccedenzaKm) : undefined,
        _targa: targa, _ragioneSociale: padroncinoSel?.ragioneSociale,
      });
      onClose();
    } catch (e: any) { setErrMsg(e.message || 'Errore generazione contratto'); }
    finally { setGenerating(false); }
  };

  const handleClose = () => {
    setPadroncinoId(''); setSearch(''); setNomeRapp(''); setCognomeRapp('');
    setCfRapp(''); setQualificaRapp('Amministratore Unico');
    setDataFirma(new Date().toISOString().split('T')[0]);
    setRataNoleggio(rataDefault != null ? String(rataDefault) : '');
    setKmInclusi('4000'); setEccedenzaKm('0.10'); setErrMsg(''); onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={isElettrico ? 'Contratto di noleggio elettrico' : 'Contratto di noleggio'} width={620}>
      <div className="ncam-body">

        {/* Mezzo info */}
        <div className="dm-mezzo-info-banner">
          Mezzo: <strong style={{ fontFamily: 'monospace' }}>{targa}</strong>
          {isElettrico && <span className="dm-elettrico-tag">Elettrico</span>}
        </div>

        {/* Selezione Padroncino */}
        <div className="ncam-section-label">Padroncino (Noleggiante)</div>
        <div className="ncam-field">
          <input className="ncam-input" placeholder="Filtra per ragione sociale o P.IVA..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dm-pad-list">
          {filtered.map(p => (
            <div key={p.id} className={`dm-pad-item ${padroncinoId === p.id ? 'dm-pad-selected' : ''}`} onClick={() => setPadroncinoId(p.id)}>
              <span className="dm-pad-name">{p.ragioneSociale}</span>
              <span className="dm-pad-piva">P.IVA {p.partitaIva}{p.indirizzo ? ` · ${p.indirizzo}` : ''}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="dm-pad-empty">Nessun padroncino trovato</div>}
        </div>
        {padroncinoSel && (
          <div className="dm-pad-selected-banner">
            Noleggiante: <strong>{padroncinoSel.ragioneSociale}</strong>
            {padroncinoSel.indirizzo && <span> · {padroncinoSel.indirizzo}</span>}
          </div>
        )}

        {/* Rappresentante Legale */}
        <div className="ncam-section-label">Rappresentante Legale Noleggiante</div>
        <div className="ncam-grid-2">
          <div className="ncam-field"><label className="ncam-label">Nome</label><input className="ncam-input" value={nomeRapp} onChange={e => setNomeRapp(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Cognome</label><input className="ncam-input" value={cognomeRapp} onChange={e => setCognomeRapp(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Codice Fiscale</label><input className="ncam-input ncam-mono" value={cfRapp} onChange={e => setCfRapp(e.target.value.toUpperCase())} /></div>
          <div className="ncam-field">
            <label className="ncam-label">Qualifica</label>
            <select className="ncam-input" value={qualificaRapp} onChange={e => setQualificaRapp(e.target.value)}>
              <option>Amministratore Unico</option>
              <option>Legale Rappresentante</option>
              <option>Socio</option>
              <option>Titolare</option>
              <option>Procuratore</option>
            </select>
          </div>
        </div>

        {/* Dettagli Contratto */}
        <div className="ncam-section-label">Dettagli Contratto</div>
        <div className="ncam-grid-2">
          <div className="ncam-field"><label className="ncam-label">Data Firma</label><input className="ncam-input" type="date" value={dataFirma} onChange={e => setDataFirma(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Rata Mensile (€ + IVA)</label><input className="ncam-input" type="number" step="0.01" placeholder="200.00" value={rataNoleggio} onChange={e => setRataNoleggio(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">KM inclusi/mese</label><input className="ncam-input" type="number" placeholder="4000" value={kmInclusi} onChange={e => setKmInclusi(e.target.value)} /></div>
          <div className="ncam-field"><label className="ncam-label">Eccedenza (€/km)</label><input className="ncam-input" type="number" step="0.01" placeholder="0.10" value={eccedenzaKm} onChange={e => setEccedenzaKm(e.target.value)} /></div>
        </div>

        {errMsg && <div className="dm-err-msg">{errMsg}</div>}

        <div className="ncam-actions">
          <button className="ncam-btn-cancel" onClick={handleClose}>Annulla</button>
          <button className="ncam-btn-save" disabled={!padroncinoId || generating} onClick={handleGenera}>
            {generating ? 'Generazione…' : 'Genera e scarica contratto'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────

const COL = { B: '#3D63F0', V: '#15A06A', O: '#EA6A2A', P: '#7C5CF0', R: '#DC4446', T: '#0E9494', GR: '#71717A' };
const ST: Record<Tone, [string, string]> = {
  ko: ['#B91C1C', '#E5484D'], warn: ['#C2410C', '#EA6A2A'], na: ['#52525B', '#A1A1AA'],
  ok: ['#15803D', '#15A06A'], info: ['#1D4ED8', '#3D63F0'],
};
const PATH = {
  id: 'M3 6h11v10H3zM14 9h4l3 3v4h-7z', doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  cal: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', km: 'M12 21a9 9 0 1 1 9-9M12 12l4-4',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', ass: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  man: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z', nota: 'M4 4h16v12H8l-4 4zM8 9h8M8 12h5',
  euro: 'M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  copy: 'M8 8h12v12H8zM4 16V4h12', swap: 'M7 7h11l-3-3M17 17H6l3 3', ext: 'M7 17L17 7M9 7h8v8',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', plus: 'M12 5v14M5 12h14', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
};
function Svg({ d, size = 14, stroke = 2 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
function TileSq({ d, c, size = 26, icon = 13, r = 7 }: { d: string; c: string; size?: number; icon?: number; r?: number }) {
  return <span aria-hidden="true" className="dm2-tile" style={{ flex: `0 0 ${size}px`, width: size, height: size, borderRadius: r, background: c }}><Svg d={d} size={icon} stroke={2.4} /></span>;
}
function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className="dm2-tag" style={{ color: ST[tone][0] }}><span aria-hidden="true" className="dm2-dot" style={{ background: ST[tone][1] }} />{children}</span>;
}

const STATO_LABEL: Record<string, string> = {
  ASSEGNATO: 'Assegnato', DISPONIBILE: 'Disponibile', IN_REVISIONE: 'In revisione',
  FUORI_SERVIZIO: 'Fuori servizio', VENDUTO: 'Venduto', DISMESSO: 'Dismesso',
};
const STATO_TONE: Record<string, Tone> = {
  ASSEGNATO: 'ok', DISPONIBILE: 'info', IN_REVISIONE: 'warn', FUORI_SERVIZIO: 'ko', VENDUTO: 'na', DISMESSO: 'na',
};
const CATEGORIA_LABEL: Record<string, string> = { DISTRIBUZIONE: 'Distribuzione', AUTO_AZIENDALE: 'Auto privata', FLOTTA: 'Flotta aziendale' };
const POSSESSO_LABEL: Record<string, string> = { NOLEGGIO: 'Noleggio', PROPRIETA: 'Proprietà', ESTERNO: 'Esterno' };
const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');
const iniziali = (s: string) => s.replace(/[^A-Za-zÀ-ú ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const ymd = (d?: string | null) => (d ? d.split('T')[0] : '');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Tag di una data di scadenza: scaduta / entro 30 giorni / più avanti */
function dateTag(d?: string | null, expiredLabel = 'Scaduta'): { tag: string; tone: Tone } | null {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0) return { tag: expiredLabel, tone: 'ko' };
  if (diff === 0) return { tag: 'Oggi', tone: 'warn' };
  if (diff <= 30) return { tag: `Tra ${diff} giorn${diff === 1 ? 'o' : 'i'}`, tone: 'warn' };
  return { tag: `tra ${diff} giorni`, tone: 'na' };
}

// Etichette e formattazione dei campi per lo storico
const FIELD_LABEL: Record<string, string> = {
  targa: 'Targa', marca: 'Marca', modello: 'Modello', tipo: 'Tipo', alimentazione: 'Alimentazione',
  categoria: 'Categoria', stato: 'Stato', tipoPossesso: 'Tipo possesso', tipo_possesso: 'Tipo possesso',
  annoImmatricolazione: 'Anno immatricolazione', telaio: 'Telaio', colore: 'Colore', portata: 'Portata',
  volume: 'Volume', tipoCassone: 'Tipo cassone', targaRimorchio: 'Targa rimorchio',
  kmAttuali: 'Chilometri', kmAttualiAl: 'Km aggiornati al', km_attuali_al: 'Km aggiornati al', kmLimite: 'Km limite',
  rataNoleggio: 'Rata padroncino', canoneNoleggio: 'Canone nostro', maggiorazioneRicarica: 'Maggiorazione ricarica',
  scadenzaAssicurazione: 'Scadenza assicurazione', costoAssicurazione: 'Costo assicurazione',
  scadenzaRevisione: 'Scadenza revisione', costoRevisione: 'Costo revisione',
  scadenzaBollo: 'Scadenza bollo', costoBollo: 'Costo bollo', scadenzaTachigrafo: 'Scadenza tachigrafo',
  scadenzaTagliando: 'Scadenza tagliando', proprietario: 'Società di noleggio', societaNoleggio: 'Società di noleggio',
  nContratto: 'N° contratto', riferimento_contratto: 'N° contratto', inizioNoleggio: 'Inizio noleggio',
  fineNoleggio: 'Fine noleggio', utilizzatore: 'Utilizzatore', note: 'Note',
};
const SKIP = new Set(['createdAt', 'updatedAt', 'deletedAt', 'id', 'userId', 'assegnazioni']);
function fmtVal(k: string, v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (/^(scadenza|inizio|fine)|At$|_al$|Al$/.test(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v);
  if (/^(rata|canone|costo)/.test(k)) return fmtEur(Number(v));
  if (k === 'kmAttuali' || k === 'kmLimite') return `${fmtNum(Number(v))} km`;
  if (k === 'maggiorazioneRicarica') return `${v}%`;
  if (k === 'stato') return STATO_LABEL[v] ?? cap(v);
  if (typeof v === 'string' && /^[A-Z_]+$/.test(v)) return cap(v);
  return String(v);
}
interface Evento { key: string; data: string; tipo: string; tone: Tone; tile: string; d: string; titolo: string; prima: string; dopo: string; autore: string }
function eventiDaAudit(entries: AuditLogEntry[]): Evento[] {
  const out: Evento[] = [];
  for (const e of entries) {
    const autore = e.user ? [e.user.nome, e.user.cognome].filter(Boolean).join(' ') || e.user.email : 'Sistema';
    const base = { data: fmtDate(e.createdAt), autore };
    if (e.azione === 'UPDATE' && e.dataPrima && e.dataDopo) {
      const keys = Object.keys({ ...e.dataPrima, ...e.dataDopo }).filter(k => !SKIP.has(k) && k in e.dataPrima && k in e.dataDopo && JSON.stringify(e.dataPrima[k]) !== JSON.stringify(e.dataDopo[k]));
      keys.forEach(k => out.push({ ...base, key: e.id + k, tipo: 'Modifica', tone: 'info', tile: COL.B, d: PATH.edit, titolo: FIELD_LABEL[k] ?? k, prima: fmtVal(k, e.dataPrima[k]), dopo: fmtVal(k, e.dataDopo[k]) }));
      if (!keys.length) out.push({ ...base, key: e.id, tipo: 'Modifica', tone: 'info', tile: COL.B, d: PATH.edit, titolo: 'Salvataggio senza cambi', prima: '', dopo: '' });
    } else if (e.azione === 'CREATE') {
      out.push({ ...base, key: e.id, tipo: 'Creazione', tone: 'ok', tile: COL.V, d: PATH.plus, titolo: 'Mezzo creato', prima: '', dopo: e.dataDopo?.targa ?? '' });
    } else if (e.azione === 'DELETE') {
      out.push({ ...base, key: e.id, tipo: 'Eliminazione', tone: 'ko', tile: COL.R, d: PATH.trash, titolo: e.entityType === 'assegnazione_mezzo' ? 'Assegnazione eliminata' : 'Eliminato', prima: '', dopo: '' });
    } else if (e.azione === 'ASSEGNA') {
      out.push({ ...base, key: e.id, tipo: 'Assegnazione', tone: 'ok', tile: COL.V, d: PATH.ass, titolo: 'Assegnato', prima: '', dopo: [e.dataDopo?.padroncino?.ragioneSociale ?? e.dataDopo?.ragioneSociale, e.dataDopo?.dataInizio ? `dal ${fmtDate(e.dataDopo.dataInizio)}` : ''].filter(Boolean).join(', ') });
    } else if (e.azione === 'CHIUDI_ASSEGNAZIONE') {
      out.push({ ...base, key: e.id, tipo: 'Assegnazione', tone: 'ok', tile: COL.V, d: PATH.ass, titolo: 'Chiusa assegnazione', prima: '', dopo: [e.dataDopo?.ragioneSociale, e.dataDopo?.dataFine ? `fino al ${fmtDate(e.dataDopo.dataFine)}` : ''].filter(Boolean).join(', ') });
    } else if (e.azione === 'GENERA_CONTRATTO') {
      out.push({ ...base, key: e.id, tipo: 'Documento', tone: 'warn', tile: COL.P, d: PATH.doc, titolo: 'Contratto generato', prima: '', dopo: e.dataDopo?.padroncino ? `Per ${e.dataDopo.padroncino}` : (e.dataDopo?.ragioneSociale ?? '') });
    } else {
      out.push({ ...base, key: e.id, tipo: cap(e.azione), tone: 'na', tile: COL.GR, d: PATH.edit, titolo: cap(e.azione), prima: '', dopo: '' });
    }
  }
  return out;
}

// Campo del form: stessa grafica del mockup, sempre modificabile.
// Definito fuori dal componente: altrimenti gli input perderebbero il focus a ogni tasto.
function F({ l, children, tag, wide }: { l: string; children: ReactNode; tag?: { tag: string; tone: Tone } | null; wide?: boolean }) {
  return (
    <label className={`dm2-f${wide ? ' dm2-f-wide' : ''}`}>
      <span className="dm2-fl">{l}</span>
      <span className="dm2-fbox">
        {children}
        {tag && <StatusTag tone={tag.tone}>{tag.tag}</StatusTag>}
      </span>
    </label>
  );
}

function EvRow({ e, full }: { e: Evento; full?: boolean }) {
  return (
    <div className={full ? 'dm2-ev dm2-ev-full' : 'dm2-ev'}>
      <TileSq d={e.d} c={e.tile} icon={12} />
      <span className="dm2-ev-data">{e.data}</span>
      {full && <StatusTag tone={e.tone}>{e.tipo}</StatusTag>}
      <span className="dm2-ev-tit">{e.titolo}</span>
      <span className="dm2-ev-val">
        {e.prima && <><span className="dm2-ev-prima">{e.prima}</span><span aria-hidden="true" className="dm2-muted"> → </span></>}
        <span className="dm2-ev-dopo">{e.dopo}</span>
      </span>
      <span className="dm2-ev-aut">{e.autore}</span>
    </div>
  );
}

type TabKey = 'info' | 'assegnazioni' | 'documenti' | 'manutenzioni' | 'note' | 'log';
type SezKey = 'id' | 'nol' | 'sca' | 'km';

export default function DettaglioMezzo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [mezzo,    setMezzo]    = useState<Mezzo | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [form,     setForm]     = useState<Partial<Mezzo>>({});
  const [dirty,    setDirty]    = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [sez,      setSez]      = useState<SezKey>('id');
  const [showAssegnaModal,  setShowAssegnaModal]  = useState(false);
  const [correggiAss, setCorreggiAss] = useState<{ id: string; dataInizio: string; dataFine: string; inCorso: boolean } | null>(null);
  const [chiudiTarget, setChiudiTarget] = useState<ChiudiAssegnazioneTarget | null>(null);
  const [showContrattoModal,setShowContrattoModal]= useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [noteList,    setNoteList]    = useState<Nota[]>([]);
  const [notaTesto,   setNotaTesto]   = useState('');
  const [notaTask,    setNotaTask]    = useState(false);
  const [notaSaving,  setNotaSaving]  = useState(false);
  const [docs,        setDocs]        = useState<Documento[]>([]);
  const [audit,       setAudit]       = useState<AuditLogEntry[]>([]);
  const [ricariche,   setRicariche]   = useState<{ n: number; costo: number; kwh: number } | null>(null);

  // Mese precedente: lo stesso che i conteggi chiudono
  const mesePrec = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, nome: MESI[d.getMonth()] };
  }, []);

  const loadAudit = useCallback(async () => {
    if (!id) return;
    try {
      const [own, ass] = await Promise.all([
        auditApi.list({ entityType: 'mezzo', entityId: id, limit: 200 }),
        auditApi.list({ entityType: 'assegnazione_mezzo', limit: 1000 }).catch(() => ({ data: [] as AuditLogEntry[] })),
      ]);
      // Gli eventi di assegnazione sono registrati sull'assegnazione: li ricolleghiamo al mezzo per id o targa
      const targa = own.data.find(e => e.dataDopo?.targa)?.dataDopo?.targa;
      const assOwn = ass.data.filter(e => e.entityId === id || e.dataDopo?.mezzoId === id || (targa && e.dataDopo?.targa === targa));
      setAudit([...own.data, ...assOwn].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch { /* storico non disponibile */ }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [m, pResp, noteResp, docResp] = await Promise.all([
        mezziApi.detail(id),
        padronciniApi.list({ limit: '200' }),
        noteApi.list('mezzo', id, 100),
        documentiApi.list('mezzo', id),
      ]);
      setMezzo(m); setForm(m); setPadroncini(pResp.data); setNoteList(noteResp);
      setDocs(docResp);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
    loadAudit();
  }, [id, loadAudit]);

  useEffect(() => { load(); }, [load]);

  // Ricariche del mese precedente per i mezzi elettrici (solo lettura)
  useEffect(() => {
    if (!id || mezzo?.alimentazione !== 'ELETTRICO') { setRicariche(null); return; }
    api.get<{ sessioni: { mezzoId: string | null; costoFinale: number; kwh: number }[] }>(`/ricariche?mese=${mesePrec.key}`)
      .then(r => {
        const s = r.sessioni.filter(x => x.mezzoId === id);
        setRicariche({ n: s.length, costo: s.reduce((a, x) => a + (Number(x.costoFinale) || 0), 0), kwh: s.reduce((a, x) => a + (Number(x.kwh) || 0), 0) });
      })
      .catch(() => setRicariche(null));
  }, [id, mezzo?.alimentazione, mesePrec.key]);

  const docCount = docs.length;
  const haContrattoNoleggio = useMemo(() => docs.some(d => d.tipo === 'CONTRATTO'), [docs]);
  const eventi = useMemo(() => eventiDaAudit(audit), [audit]);

  const handleAddNota = async () => {
    if (!id || !notaTesto.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'mezzo', entityId: id, contenuto: notaTesto.trim() });
      if (notaTask) await taskApi.create({ entityType: 'flotta', entityId: 'mezzi', testo: notaTesto.trim(), targa: mezzo?.targa });
      setNotaTesto(''); setNotaTask(false);
      setNoteList(await noteApi.list('mezzo', id, 100));
    } catch (e: any) { alert('Errore salvataggio nota: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const handleDeleteNota = async (notaId: string) => {
    if (!confirm('Eliminare questa nota?')) return;
    try {
      await noteApi.remove(notaId);
      setNoteList(prev => prev.filter(n => n.id !== notaId));
    } catch (e: any) { alert('Errore eliminazione nota: ' + e.message); }
  };

  const set = (k: keyof Mezzo, v: any) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await mezziApi.update(id, {
        targa: form.targa, marca: form.marca, modello: form.modello, tipo: form.tipo,
        alimentazione: form.alimentazione, categoria: form.categoria,
        tipoPossesso: (form as any).tipoPossesso ?? undefined, stato: form.stato,
        annoImmatricolazione: form.annoImmatricolazione ?? undefined,
        telaio: form.telaio ?? undefined, colore: form.colore ?? undefined,
        kmAttuali: form.kmAttuali ?? undefined,
        kmAttualiAl: form.kmAttualiAl ? form.kmAttualiAl.split('T')[0] : null,
        kmLimite: form.kmLimite ?? undefined,
        rataNoleggio: form.rataNoleggio ?? undefined, canoneNoleggio: form.canoneNoleggio ?? undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione || null,
        costoAssicurazione: form.costoAssicurazione ?? null,
        scadenzaRevisione: form.scadenzaRevisione || null, scadenzaBollo: form.scadenzaBollo || null,
        costoRevisione: form.costoRevisione ?? null, costoBollo: form.costoBollo ?? null,
        scadenzaTachigrafo: form.scadenzaTachigrafo || null,
        scadenzaTagliando: (form as any).scadenzaTagliando || null,
        proprietario: form.proprietario ?? undefined, nContratto: form.nContratto ?? undefined,
        inizioNoleggio: form.inizioNoleggio || null, fineNoleggio: form.fineNoleggio || null,
        maggiorazioneRicarica: form.maggiorazioneRicarica ?? undefined,
        portata: form.portata ?? undefined, volume: form.volume ?? undefined,
        tipoCassone: form.tipoCassone ?? undefined, targaRimorchio: form.targaRimorchio ?? undefined,
        utilizzatore: form.utilizzatore ?? undefined, note: form.note ?? undefined,
      } as any);
      setDirty(false); await load();
    } catch (e: any) { alert('Errore salvataggio: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleAnnulla = () => { if (mezzo) { setForm(mezzo); setDirty(false); } };

  const handleNuovaAssegnazione = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await mezziApi.assegna(id, { padroncinoId, dataInizio });
    await load();
  };

  const handleChiudiAssegnazione = (assegnazioneId: string, nome: string, dataInizio: string) => {
    setChiudiTarget({ id: assegnazioneId, nome, dataInizio });
  };

  const confermaChiusura = async (t: ChiudiAssegnazioneTarget, dataFine: string) => {
    await mezziApi.chiudiAssegnazione(t.id, dataFine);
    setChiudiTarget(null);
    await load();
  };

  const handleEliminaAssegnazione = async (assegnazioneId: string, ragioneSociale: string) => {
    if (!window.confirm(`Eliminare definitivamente l'assegnazione a "${ragioneSociale}"?`)) return;
    try { await mezziApi.deleteAssegnazione(assegnazioneId); await load(); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  const handleDuplica = async () => {
    if (!id || !mezzo) return;
    if (!window.confirm(`Duplicare il mezzo "${mezzo.targa}"? Verrà creata una copia con nuova targa (assegnazioni, note, log e documenti non vengono copiati).`)) return;
    setDuplicating(true);
    try {
      const nuovo = await mezziApi.duplica(id);
      navigate(`/flotta/${nuovo.id}`);
    } catch (e: any) { alert('Errore duplicazione: ' + e.message); }
    finally { setDuplicating(false); }
  };

  const handleDelete = async () => {
    if (!id || !mezzo) return;
    if (!window.confirm(`Eliminare il mezzo "${mezzo.targa}"? L'operazione è irreversibile.`)) return;
    try { await mezziApi.delete(id); navigate('/flotta'); }
    catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  const vaiA = (s: SezKey) => { setActiveTab('info'); setSez(s); };

  if (loading && !mezzo) return <main className="dm2-page"><div className="dm2-card dm2-empty"><span>Caricamento mezzo…</span></div></main>;
  if (error || !mezzo) return (
    <main className="dm2-page"><div className="dm2-card dm2-empty">
      <span className="dm2-empty-t">{error || 'Mezzo non trovato'}</span>
      <button type="button" className="dm2-btn" onClick={() => navigate(-1)}>Torna alla flotta</button>
    </div></main>
  );

  // ── Dati derivati (solo visualizzazione) ──
  const assegnazioni = mezzo.assegnazioni ?? [];
  const salvaCorrezioneAss = async () => {
    if (!correggiAss) return;
    try {
      await mezziApi.correggiDateAssegnazione(correggiAss.id, { dataInizio: correggiAss.dataInizio, dataFine: correggiAss.inCorso ? null : (correggiAss.dataFine || null) });
      setCorreggiAss(null);
      await load();
    } catch (e: any) { alert('Date non salvate: ' + e.message); }
  };
  const assegnazionAttiva = assegnazioni.find(a => !a.dataFine);
  const precedente = assegnazioni.filter(a => a.dataFine).sort((a, b) => (b.dataFine ?? '').localeCompare(a.dataFine ?? ''))[0];
  const documentoContrattoMancante = !!assegnazionAttiva && !haContrattoNoleggio;
  const elettrico = mezzo.alimentazione === 'ELETTRICO';
  const kmA = num(mezzo.kmAttuali), kmL = num(mezzo.kmLimite);
  const kmPctRaw = kmA && kmL ? Math.round((kmA / kmL) * 100) : 0;
  const kmPct = Math.min(100, kmPctRaw);
  const kmColor = kmPctRaw > 100 ? COL.R : COL.O;
  const canone = num(mezzo.canoneNoleggio), rata = num(mezzo.rataNoleggio);
  const societa = mezzo.proprietario || mezzo.societaNoleggio || '';
  const possesso = (mezzo as any).tipoPossesso as string | undefined;
  const fRata = num(form.rataNoleggio);

  const tagAss = dateTag(form.scadenzaAssicurazione), tagRev = dateTag(form.scadenzaRevisione), tagBol = dateTag(form.scadenzaBollo);
  const tagTac = dateTag(form.scadenzaTachigrafo), tagTag = dateTag((form as any).scadenzaTagliando);
  const tagFine = dateTag(form.fineNoleggio, 'Scaduto');
  const kmAgg = daysDiff(form.kmAttualiAl);

  // ── Avvisi ──
  const avvisi: { t: string; s: string; cta: string; tone: 'ko' | 'warn' | 'p'; onClick: () => void }[] = [];
  const scad: [string, string | null | undefined][] = [
    ['Assicurazione', mezzo.scadenzaAssicurazione], ['Revisione', mezzo.scadenzaRevisione], ['Bollo', mezzo.scadenzaBollo], ['Tachigrafo', mezzo.scadenzaTachigrafo],
  ];
  scad.forEach(([l, d]) => {
    const diff = daysDiff(d);
    if (diff === null) return;
    if (diff < 0) avvisi.push({ t: `${l} ferma al ${fmtDate(d)}.`, s: 'La data a sistema è superata: va aggiornata con quella attuale.', cta: 'Aggiorna data', tone: 'ko', onClick: () => vaiA('sca') });
    else if (diff <= 30) avvisi.push({ t: `${l} entro il ${fmtDate(d)}.`, s: diff === 0 ? 'Scade oggi.' : `Mancano ${diff} giorn${diff === 1 ? 'o' : 'i'}.`, cta: 'Aggiorna data', tone: 'warn', onClick: () => vaiA('sca') });
  });
  const fineDiff = daysDiff(mezzo.fineNoleggio);
  if (fineDiff !== null && fineDiff < 0) avvisi.push({ t: `Noleggio scaduto il ${fmtDate(mezzo.fineNoleggio)}.`, s: 'Aggiorna la data di fine o restituisci il mezzo.', cta: 'Aggiorna data', tone: 'ko', onClick: () => vaiA('nol') });
  if (kmPctRaw > 100) avvisi.push({ t: `Chilometri oltre il limite (${kmPctRaw}%).`, s: `${fmtNum(kmA)} km su ${fmtNum(kmL)} previsti dal contratto.`, cta: 'Aggiorna km', tone: 'ko', onClick: () => vaiA('km') });
  if (documentoContrattoMancante) avvisi.push({ t: 'Contratto di noleggio non caricato.', s: 'Il mezzo è assegnato ma nei documenti manca il contratto.', cta: 'Carica documento', tone: 'p', onClick: () => setActiveTab('documenti') });
  const AVV_STYLE = { ko: ['#FEF2F2', '#FBD5D5', '#E5484D'], warn: ['#FFF7ED', '#FBDDC4', '#EA6A2A'], p: ['#F5F3FF', '#E2DBFB', '#7C5CF0'] };

  // ── KPI ──
  const kpi = [
    { c: COL.O, d: PATH.km, label: 'Chilometri', value: kmA != null ? fmtNum(kmA) : '—', w: kmL ? kmPct : null,
      sub: kmL ? `${kmPctRaw}% di ${fmtNum(kmL)}${mezzo.kmAttualiAl ? ` · letti il ${fmtDate(mezzo.kmAttualiAl)}` : ''}` : (mezzo.kmAttualiAl ? `Letti il ${fmtDate(mezzo.kmAttualiAl)}` : 'Limite non impostato') },
    { c: COL.R, d: PATH.euro, label: 'Canone nostro', value: canone != null ? fmtEur(canone) : '—', w: null, sub: canone != null ? `Al mese${societa ? `, a ${cap(societa)}` : ''}` : 'Non inserito' },
    { c: COL.V, d: PATH.euro, label: 'Rata padroncino', value: rata != null ? fmtEur(rata) : '—', w: null, sub: rata != null ? `Al mese${assegnazionAttiva ? `, da ${assegnazionAttiva.padroncino.ragioneSociale.split(' ')[0]}` : ''} · ${fmtEur(rata * 1.22)} con IVA` : 'Non inserita' },
    elettrico
      ? { c: COL.T, d: PATH.bolt, label: `Ricariche · ${mesePrec.nome}`, value: ricariche ? fmtEur(ricariche.costo) : '—', w: null, sub: ricariche ? `${ricariche.n} session${ricariche.n === 1 ? 'e' : 'i'} · ${fmtNum(ricariche.kwh, 1)} kWh` : 'Caricamento…' }
      : { c: COL.T, d: PATH.trend, label: 'Margine mensile', value: canone != null || rata != null ? fmtEur((rata ?? 0) - (canone ?? 0)) : '—', w: null, sub: 'Rata padroncino meno canone nostro' },
  ];

  // ── Sezioni dati ──
  const tagSca = [tagAss, tagRev, tagBol, tagTac, tagTag].filter(t => t && (t.tone === 'ko' || t.tone === 'warn')).length;
  const idCampi = [form.targa, form.stato, form.categoria, form.tipo, form.alimentazione, (form as any).tipoPossesso, form.marca, form.modello, form.annoImmatricolazione, form.colore, form.telaio, form.portata, form.volume, form.tipoCassone, form.targaRimorchio];
  const idPieni = idCampi.filter(v => v !== null && v !== undefined && v !== '').length;
  const SEZ: Record<SezKey, { t: string; sub: string; c: string; d: string; desc: string; stato: string; tone: Tone; alert: boolean }> = {
    id:  { t: 'Identificazione', sub: 'Targa, modello, telaio', c: COL.T, d: PATH.id, desc: 'Come riconosciamo il mezzo', stato: `${idPieni} di ${idCampi.length} compilati`, tone: 'na', alert: false },
    nol: { t: 'Contratto di noleggio', sub: 'Locatore, durata, canone', c: COL.B, d: PATH.doc, desc: 'Cosa paghiamo e a chi lo rifatturiamo',
      stato: documentoContrattoMancante ? 'Contratto non caricato' : tagFine?.tone === 'ko' ? 'Noleggio scaduto' : haContrattoNoleggio ? 'Contratto caricato' : 'Nessun contratto',
      tone: documentoContrattoMancante ? 'warn' : tagFine?.tone === 'ko' ? 'ko' : haContrattoNoleggio ? 'ok' : 'na', alert: documentoContrattoMancante || tagFine?.tone === 'ko' },
    sca: { t: 'Scadenze e costi', sub: 'Assicurazione, revisione, bollo', c: COL.R, d: PATH.cal, desc: 'Le date che generano avvisi in panoramica',
      stato: tagSca ? `${tagSca} da sistemare` : 'Tutto in regola', tone: tagSca ? 'ko' : 'ok', alert: tagSca > 0 },
    km:  { t: 'Chilometri e utilizzo', sub: 'Km, limite, utilizzatore', c: COL.O, d: PATH.km, desc: 'Lettura chilometri e chi usa il mezzo',
      stato: kmL ? `${kmPctRaw}% del limite` : 'Limite non impostato', tone: kmPctRaw > 100 ? 'ko' : kmPctRaw >= 80 ? 'warn' : 'na', alert: kmPctRaw > 100 },
  };
  const cur = SEZ[sez];

  const txt = (k: keyof Mezzo, opts: { upper?: boolean; mono?: boolean; ph?: string } = {}) => (
    <input className={`dm2-in${opts.mono ? ' dm2-mono' : ''}`} placeholder={opts.ph ?? 'Non inserito'} value={(form as any)[k] ?? ''}
      onChange={e => set(k, opts.upper ? e.target.value.toUpperCase() : e.target.value)} />
  );
  const numIn = (k: keyof Mezzo, parse: (s: string) => number, step?: string) => (
    <input className="dm2-in" type="number" step={step} placeholder="Non inserito" value={(form as any)[k] ?? ''}
      onChange={e => set(k, e.target.value ? parse(e.target.value) : null)} />
  );
  const dateIn = (k: keyof Mezzo) => (
    <input className="dm2-in" type="date" value={ymd((form as any)[k])} onChange={e => set(k, e.target.value || null)} />
  );
  const sel = (k: string, opts: [string, string][], def = '') => (
    <select className="dm2-in dm2-sel" value={(form as any)[k] || def} onChange={e => set(k as keyof Mezzo, e.target.value)}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const ro = (v: string) => <span className={`dm2-in dm2-ro${v ? '' : ' dm2-muted'}`}>{v || 'Non inserito'}</span>;

  const campi: Record<SezKey, ReactNode> = {
    id: <>
      <F l="Targa">{txt('targa', { upper: true, mono: true })}</F>
      <F l="Stato">{sel('stato', Object.entries(STATO_LABEL))}</F>
      <F l="Categoria">{sel('categoria', [['DISTRIBUZIONE', 'Distribuzione'], ['AUTO_AZIENDALE', 'Auto privata'], ['FLOTTA', 'Flotta aziendale']])}</F>
      <F l="Tipo">{sel('tipo', [['FURGONE', 'Furgone'], ['AUTOCARRO', 'Autocarro'], ['MOTOCICLO', 'Motociclo'], ['AUTOVETTURA', 'Autovettura'], ['SEMIRIMORCHIO', 'Semirimorchio']])}</F>
      <F l="Alimentazione">{sel('alimentazione', [['GASOLIO', 'Gasolio'], ['BENZINA', 'Benzina'], ['ELETTRICO', 'Elettrico'], ['IBRIDO', 'Ibrido'], ['GPL', 'GPL'], ['METANO', 'Metano']])}</F>
      <F l="Tipo possesso">{sel('tipoPossesso', [['NOLEGGIO', 'Noleggio / leasing'], ['PROPRIETA', 'Proprietà'], ['ESTERNO', 'Esterno / dipendente']], 'NOLEGGIO')}</F>
      <F l="Marca">{txt('marca')}</F>
      <F l="Modello">{txt('modello')}</F>
      <F l="Anno immatricolazione">
        <input className="dm2-in" type="number" placeholder="Non inserito" value={form.annoImmatricolazione ?? ''}
          onChange={e => set('annoImmatricolazione', e.target.value ? parseInt(e.target.value) : null)} />
      </F>
      <F l="Colore">{txt('colore')}</F>
      <F l="Telaio">{txt('telaio', { mono: true })}</F>
      <F l="Portata (kg)">{numIn('portata', parseInt)}</F>
      <F l="Volume (m³)">{numIn('volume', parseFloat)}</F>
      <F l="Tipo cassone">{txt('tipoCassone')}</F>
      <F l="Targa rimorchio">{txt('targaRimorchio', { upper: true, mono: true })}</F>
    </>,
    nol: <>
      <F l="Società di noleggio">
        <input className="dm2-in" placeholder="Non inserito" value={form.proprietario || (form as any).societaNoleggio || ''} onChange={e => set('proprietario', e.target.value)} />
      </F>
      <F l="N° contratto">
        <input className="dm2-in dm2-mono" placeholder="Non inserito" value={form.nContratto || (form as any).riferimentoContratto || ''} onChange={e => set('nContratto', e.target.value)} />
      </F>
      <F l="Inizio noleggio">{dateIn('inizioNoleggio')}</F>
      <F l="Fine noleggio" tag={tagFine}>{dateIn('fineNoleggio')}</F>
      <F l="Canone nostro (€)">{numIn('canoneNoleggio', parseFloat, '0.01')}</F>
      <F l="Rata padroncino (€)">{numIn('rataNoleggio', parseFloat, '0.01')}</F>
      <F l="Rata + IVA 22%">{ro(fRata != null ? fmtEur(fRata * 1.22) : '')}</F>
      <F l="Maggiorazione ricarica (%)">{numIn('maggiorazioneRicarica', parseFloat)}</F>
      <F l="Contratto padroncino">
        <button type="button" className="dm2-in dm2-inbtn" onClick={() => setShowContrattoModal(true)}>
          <Svg d={elettrico ? PATH.bolt : PATH.doc} size={13} />Genera contratto PDA
        </button>
      </F>
    </>,
    sca: <>
      <F l="Assicurazione" tag={tagAss}>{dateIn('scadenzaAssicurazione')}</F>
      <F l="Costo assicurazione (€)">{numIn('costoAssicurazione', parseFloat, '0.01')}</F>
      <F l="Bollo" tag={tagBol}>{dateIn('scadenzaBollo')}</F>
      <F l="Revisione" tag={tagRev}>{dateIn('scadenzaRevisione')}</F>
      <F l="Costo revisione (€)">{numIn('costoRevisione', parseFloat, '0.01')}</F>
      <F l="Costo bollo (€)">{numIn('costoBollo', parseFloat, '0.01')}</F>
      <F l="Tagliando" tag={tagTag}>{dateIn('scadenzaTagliando' as keyof Mezzo)}</F>
      <F l="Tachigrafo" tag={tagTac}>{dateIn('scadenzaTachigrafo')}</F>
    </>,
    km: <>
      <F l="Km attuali">{numIn('kmAttuali', parseInt)}</F>
      <F l="Aggiornati al" tag={kmAgg !== null && kmAgg <= 0 ? { tag: kmAgg === 0 ? 'oggi' : `${-kmAgg} giorni fa`, tone: 'na' } : null}>{dateIn('kmAttualiAl')}</F>
      <F l="Km limite">{numIn('kmLimite', parseInt)}</F>
      <F l="Assegnato a">{ro(assegnazionAttiva?.padroncino.ragioneSociale ?? (form.utilizzatore ? `${form.utilizzatore} (dipendente)` : ''))}</F>
      <F l="Dal">{ro(assegnazionAttiva ? fmtDate(assegnazionAttiva.dataInizio) : '')}</F>
      <F l="Utilizzatore dipendente">
        <input className="dm2-in" placeholder={assegnazionAttiva ? 'Chiudi prima l’assegnazione' : 'Nome e cognome'}
          value={form.utilizzatore || ''}
          disabled={!!assegnazionAttiva}
          title={assegnazionAttiva ? 'Chiudi prima l\'assegnazione al padroncino' : 'Compilando questo campo il mezzo risulta ASSEGNATO al dipendente'}
          onChange={e => {
            const v = e.target.value;
            setForm(f => {
              const next = { ...f, utilizzatore: v };
              if (!assegnazionAttiva) next.stato = v.trim() ? 'ASSEGNATO' : 'DISPONIBILE';
              return next;
            });
            setDirty(true);
          }} />
      </F>
    </>,
  };

  const TABS: { key: TabKey; label: string; n?: number | string; warn?: boolean }[] = [
    { key: 'info', label: 'Info mezzo' },
    { key: 'assegnazioni', label: 'Assegnazioni', n: assegnazioni.length },
    { key: 'documenti', label: 'Documenti', n: docCount, warn: documentoContrattoMancante },
    { key: 'manutenzioni', label: 'Manutenzioni' },
    { key: 'note', label: 'Note', n: noteList.length },
    { key: 'log', label: 'Storico', n: eventi.length },
  ];

  const stato = mezzo.stato?.toUpperCase() ?? '';
  const sottotitolo = [
    [cap(mezzo.marca), mezzo.modello].filter(Boolean).join(' '),
    cap(mezzo.tipo).toLowerCase(),
    (CATEGORIA_LABEL[mezzo.categoria] ?? cap(mezzo.categoria)).toLowerCase(),
    possesso ? `${(POSSESSO_LABEL[possesso] ?? cap(possesso)).toLowerCase()}${possesso === 'NOLEGGIO' && societa ? ' ' + cap(societa) : ''}` : '',
  ].filter(Boolean).join(' · ');


  const Vuoto = ({ t, s, cta, d, c, onClick }: { t: string; s: string; cta?: string; d: string; c: string; onClick?: () => void }) => (
    <section className="dm2-card dm2-empty">
      <TileSq d={d} c={c} size={40} icon={18} r={10} />
      <span className="dm2-empty-t">{t}</span>
      <span className="dm2-muted" style={{ maxWidth: 440 }}>{s}</span>
      {cta && <button type="button" className="dm2-btn dm2-btn-primary" onClick={onClick}>{cta}</button>}
    </section>
  );

  return (
    <main className="dm2-page">
      <ChiudiAssegnazioneModal
        target={chiudiTarget}
        oggetto={`Mezzo ${mezzo.targa}`}
        onClose={() => setChiudiTarget(null)}
        onConfirm={confermaChiusura}
      />

      {/* ── HEADER ── */}
      <header className="dm2-head">
        <div className="dm2-head-l">
          <TileSq d={elettrico ? PATH.bolt : PATH.id} c={COL.T} size={44} icon={20} r={11} />
          <div className="dm2-col" style={{ gap: 2 }}>
            <span className="dm2-eyebrow">
              <button type="button" className="dm2-link" onClick={() => navigate('/flotta')}>Flotta mezzi</button>
              {mezzo.alimentazione ? ` · ${cap(mezzo.alimentazione).toLowerCase()}` : ''}
            </span>
            <div className="dm2-row" style={{ gap: 10 }}>
              <h1 className="dm2-h1">{mezzo.targa}</h1>
              <StatusTag tone={STATO_TONE[stato] ?? 'na'}>{STATO_LABEL[stato] ?? cap(mezzo.stato)}</StatusTag>
            </div>
            <span className="dm2-muted">{sottotitolo}</span>
          </div>
        </div>
        <div className="dm2-row" style={{ gap: 8 }}>
          <button type="button" className="dm2-btn" disabled={duplicating} onClick={handleDuplica}><Svg d={PATH.copy} />{duplicating ? 'Duplicazione…' : 'Duplica'}</button>
          <button type="button" className="dm2-btn" onClick={() => setShowContrattoModal(true)}><Svg d={PATH.doc} />Genera contratto</button>
          <button type="button" className="dm2-btn" onClick={() => setShowAssegnaModal(true)}><Svg d={PATH.swap} />{assegnazionAttiva ? 'Cambia assegnazione' : 'Assegna'}</button>
          <button type="button" className="dm2-btn dm2-btn-icon dm2-btn-danger" onClick={handleDelete} aria-label="Elimina mezzo" title="Elimina mezzo"><Svg d={PATH.trash} /></button>
          {dirty
            ? <button type="button" className="dm2-btn dm2-btn-primary" disabled={saving} onClick={handleSave}><Svg d={PATH.edit} />{saving ? 'Salvataggio…' : 'Salva modifiche'}</button>
            : <button type="button" className="dm2-btn dm2-btn-primary" onClick={() => vaiA('id')}><Svg d={PATH.edit} />Modifica</button>}
        </div>
      </header>

      {/* ── ASSEGNAZIONE ── */}
      <div className="dm2-assbar">
        {assegnazionAttiva ? <>
          <span aria-hidden="true" className="dm2-av" style={{ background: COL.V }}>{iniziali(assegnazionAttiva.padroncino.ragioneSociale)}</span>
          <div className="dm2-col" style={{ flex: '1 1 260px' }}>
            <span className="dm2-b">Assegnato a {assegnazionAttiva.padroncino.ragioneSociale}</span>
            <span className="dm2-small dm2-muted">
              Dal {fmtDate(assegnazionAttiva.dataInizio)}{rata != null ? ` · rata ${fmtEur(rata)} al mese` : ''}
              {precedente ? ` · prima: ${precedente.padroncino.ragioneSociale} dal ${fmtDate(precedente.dataInizio)} al ${fmtDate(precedente.dataFine)}` : ''}
            </span>
          </div>
          <button type="button" className="dm2-btn dm2-btn-sm" onClick={() => handleChiudiAssegnazione(assegnazionAttiva.id, assegnazionAttiva.padroncino.ragioneSociale, assegnazionAttiva.dataInizio)}>Chiudi assegnazione</button>
          <button type="button" className="dm2-btn dm2-btn-sm" onClick={() => navigate(`/padroncini/${assegnazionAttiva.padroncino.id}`)}>Apri padroncino<Svg d={PATH.ext} size={12} /></button>
        </> : form.utilizzatore ? <>
          <span aria-hidden="true" className="dm2-av" style={{ background: COL.P }}>{iniziali(form.utilizzatore)}</span>
          <div className="dm2-col" style={{ flex: '1 1 260px' }}>
            <span className="dm2-b">In uso a {form.utilizzatore}</span>
            <span className="dm2-small dm2-muted">Auto aziendale assegnata al dipendente</span>
          </div>
        </> : <>
          <span aria-hidden="true" className="dm2-av" style={{ background: '#A1A1AA' }}>—</span>
          <div className="dm2-col" style={{ flex: '1 1 260px' }}>
            <span className="dm2-b">Nessun padroncino assegnato</span>
            <span className="dm2-small dm2-muted">{precedente ? `Ultimo: ${precedente.padroncino.ragioneSociale} fino al ${fmtDate(precedente.dataFine)}` : 'Il mezzo è libero'}</span>
          </div>
          <button type="button" className="dm2-btn dm2-btn-sm" onClick={() => setShowAssegnaModal(true)}>Assegna padroncino</button>
        </>}
      </div>

      {/* ── AVVISI ── */}
      {avvisi.length > 0 && (
        <div className="dm2-col" style={{ gap: 8 }}>
          {avvisi.map((a, i) => {
            const [bg, bd, dot] = AVV_STYLE[a.tone];
            return (
              <div key={i} className="dm2-avviso" style={{ background: bg, borderColor: bd }}>
                <span aria-hidden="true" className="dm2-dot" style={{ background: dot }} />
                <span style={{ flex: '1 1 360px' }}><span className="dm2-b">{a.t}</span> <span style={{ color: '#3F3F46' }}>{a.s}</span></span>
                <button type="button" className="dm2-btn dm2-btn-xs" onClick={a.onClick}>{a.cta}</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── KPI ── */}
      <section aria-label="Numeri del mezzo" className="dm2-g4">
        {kpi.map(k => (
          <div key={k.label} className="dm2-card dm2-kpi">
            <div className="dm2-row" style={{ gap: 8 }}>
              <TileSq d={k.d} c={k.c} size={18} icon={11} r={5} />
              <span className="dm2-kpi-l">{k.label}</span>
            </div>
            <span className="dm2-kpi-v">{k.value}</span>
            {k.w !== null && <div aria-hidden="true" className="dm2-bar"><div style={{ width: `${k.w}%`, background: kmColor }} /></div>}
            <span className="dm2-small dm2-muted">{k.sub}</span>
          </div>
        ))}
      </section>

      {/* ── TABS ── */}
      <div role="tablist" aria-label="Sezioni della scheda" className="dm2-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} className="dm2-tab" onClick={() => setActiveTab(t.key)}
            title={t.warn ? 'Mezzo assegnato ma manca il documento del contratto di noleggio' : undefined}>
            {t.label}
            {t.n !== undefined && <span className="dm2-count">{t.n}</span>}
            {t.warn && <span role="img" aria-label="manca il contratto" className="dm2-dot" style={{ background: '#E5484D' }} />}
          </button>
        ))}
      </div>

      {/* ── INFO ── */}
      {activeTab === 'info' && <>
        <div className="dm2-g4">
          <section className="dm2-card dm2-sezioni">
            <div className="dm2-col" style={{ padding: '2px 4px 8px', gap: 2 }}>
              <h2 className="dm2-h2">Dati del mezzo</h2>
              <span className="dm2-muted">Tutto quello che sappiamo su {mezzo.targa}</span>
            </div>
            {(Object.keys(SEZ) as SezKey[]).map(k => {
              const s = SEZ[k];
              return (
                <button key={k} type="button" aria-pressed={sez === k} className="dm2-sez" onClick={() => setSez(k)}>
                  <TileSq d={s.d} c={s.c} />
                  <span className="dm2-col" style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span className="dm2-b">{s.t}</span>
                    <span className="dm2-small dm2-muted">{s.sub}</span>
                  </span>
                  {s.alert && <span role="img" aria-label="da sistemare" className="dm2-dot" style={{ background: '#E5484D' }} />}
                </button>
              );
            })}
          </section>

          <section className="dm2-card dm2-s3 dm2-form">
            <div className="dm2-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div className="dm2-col" style={{ gap: 2 }}>
                <h2 className="dm2-h2">{cur.t}</h2>
                <span className="dm2-muted">{cur.desc}</span>
              </div>
              <StatusTag tone={cur.tone}>{cur.stato}</StatusTag>
            </div>
            <div className="dm2-f3">{campi[sez]}</div>
            <div className="dm2-row" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              {dirty && <span className="dm2-small dm2-muted" style={{ marginRight: 'auto' }}>Modifiche non salvate</span>}
              <button type="button" className="dm2-btn dm2-btn-md" disabled={!dirty || saving} onClick={handleAnnulla}>Annulla</button>
              <button type="button" className="dm2-btn dm2-btn-md dm2-btn-primary" disabled={!dirty || saving} onClick={handleSave}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</button>
            </div>
          </section>
        </div>

        <div className="dm2-g4">
          <section className="dm2-card dm2-s3 dm2-list">
            <div className="dm2-lhead">
              <div className="dm2-col" style={{ gap: 2 }}>
                <h2 className="dm2-h2">Ultime modifiche</h2>
                <span className="dm2-muted">Ogni cambio resta con data, autore e valore precedente</span>
              </div>
              <button type="button" className="dm2-btn dm2-btn-sm" onClick={() => setActiveTab('log')}>Storico completo</button>
            </div>
            {eventi.length === 0
              ? <div className="dm2-ev-empty dm2-muted">Nessuna modifica registrata.</div>
              : eventi.slice(0, 5).map(e => <EvRow key={e.key} e={e} />)}
          </section>

          <section className="dm2-card dm2-nota">
            <div className="dm2-col" style={{ gap: 2 }}>
              <h2 className="dm2-h2">Nuova nota</h2>
              <span className="dm2-muted">Resta nello storico e si trova dalla ricerca</span>
            </div>
            <label htmlFor="dm2-nota" className="sr-only">Testo della nota</label>
            <textarea id="dm2-nota" rows={5} className="dm2-ta" placeholder="Es. revisione prenotata per il 25/11"
              value={notaTesto} onChange={e => setNotaTesto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNota(); }} />
            <label className="dm2-check">
              <input type="checkbox" checked={notaTask} onChange={e => setNotaTask(e.target.checked)} />Trasforma in promemoria
            </label>
            <button type="button" className="dm2-btn dm2-btn-primary dm2-btn-block" disabled={notaSaving || !notaTesto.trim()} onClick={handleAddNota}>
              {notaSaving ? 'Salvo…' : 'Salva nota'}
            </button>
          </section>
        </div>
      </>}

      {/* ── ASSEGNAZIONI ── */}
      {activeTab === 'assegnazioni' && (
        assegnazioni.length === 0
          ? <Vuoto t="Nessuna assegnazione registrata" s="Assegna il mezzo a un padroncino: la rata comparirà nei suoi conteggi." cta="Assegna padroncino" d={PATH.ass} c={COL.V} onClick={() => setShowAssegnaModal(true)} />
          : <section className="dm2-card dm2-list">
            <div className="dm2-lhead">
              <div className="dm2-col" style={{ gap: 2 }}>
                <h2 className="dm2-h2">Assegnazioni</h2>
                <span className="dm2-muted">
                  {assegnazioni.length} padroncin{assegnazioni.length === 1 ? 'o' : 'i'} dal {fmtDate([...assegnazioni].sort((a, b) => a.dataInizio.localeCompare(b.dataInizio))[0].dataInizio)}
                </span>
              </div>
              <button type="button" className="dm2-btn dm2-btn-sm" onClick={() => setShowAssegnaModal(true)}><Svg d={PATH.plus} size={12} />Nuova assegnazione</button>
            </div>
            {assegnazioni.map(a => (
              <div key={a.id} className="dm2-ev dm2-ev-ass">
                <TileSq d={PATH.ass} c={a.dataFine ? COL.GR : COL.V} icon={12} />
                <span className="dm2-ev-data">{fmtDate(a.dataInizio)}</span>
                <StatusTag tone={a.dataFine ? 'na' : 'ok'}>{a.dataFine ? 'Chiusa' : 'In corso'}</StatusTag>
                <button type="button" className="dm2-ev-tit dm2-link" onClick={() => navigate(`/padroncini/${a.padroncino.id}`)}>{a.padroncino.ragioneSociale}</button>
                {correggiAss?.id === a.id ? (
                  <span className="dm2-ev-val dm2-row" style={{ gap: 6 }}>
                    <input type="date" className="dm2-input" aria-label="Data di inizio" value={correggiAss.dataInizio} onChange={e => setCorreggiAss(c => c && ({ ...c, dataInizio: e.target.value }))} />
                    <span className="dm2-muted">→</span>
                    {a.dataFine
                      ? <input type="date" className="dm2-input" aria-label="Data di fine" value={correggiAss.dataFine} onChange={e => setCorreggiAss(c => c && ({ ...c, dataFine: e.target.value }))} />
                      : <span className="dm2-muted">in corso</span>}
                  </span>
                ) : (
                  <span className="dm2-ev-val">
                    {a.dataFine ? `Dal ${fmtDate(a.dataInizio)} al ${fmtDate(a.dataFine)}` : `Dal ${fmtDate(a.dataInizio)}${rata != null ? ` · rata ${fmtEur(rata)}` : ''}`}
                    {!a.dataFine && a.dataInizio.slice(0, 10) > new Date().toISOString().slice(0, 10) && <span style={{ color: '#C2410C', fontWeight: 600 }}> · data nel futuro</span>}
                  </span>
                )}
                <span className="dm2-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {correggiAss?.id === a.id ? (<>
                    <button type="button" className="dm2-btn dm2-btn-xs" onClick={() => setCorreggiAss(null)}>Annulla</button>
                    <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-primary" disabled={!correggiAss.dataInizio} onClick={salvaCorrezioneAss}>Salva date</button>
                  </>) : (
                    <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon" aria-label="Correggi le date" title="Correggi le date (senza chiudere)" onClick={() => setCorreggiAss({ id: a.id, dataInizio: a.dataInizio.slice(0, 10), dataFine: a.dataFine ? a.dataFine.slice(0, 10) : '', inCorso: !a.dataFine })}><Svg d={PATH.edit} size={12} /></button>
                  )}
                  {!a.dataFine && correggiAss?.id !== a.id && <button type="button" className="dm2-btn dm2-btn-xs" onClick={() => handleChiudiAssegnazione(a.id, a.padroncino.ragioneSociale, a.dataInizio)}>Chiudi</button>}
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon dm2-btn-danger" aria-label={`Elimina assegnazione a ${a.padroncino.ragioneSociale}`} title="Elimina dall'archivio" onClick={() => handleEliminaAssegnazione(a.id, a.padroncino.ragioneSociale)}><Svg d={PATH.trash} size={12} /></button>
                </span>
              </div>
            ))}
          </section>
      )}

      {/* ── DOCUMENTI ── */}
      {activeTab === 'documenti' && id && <TabDocumenti mezzoId={id} onDocsChange={setDocs} />}

      {/* ── MANUTENZIONI ── */}
      {activeTab === 'manutenzioni' && id && <TabManutenzioni mezzoId={id} />}

      {/* ── NOTE ── */}
      {activeTab === 'note' && (
        <div className="dm2-g4">
          <section className="dm2-card dm2-s3 dm2-list">
            <div className="dm2-lhead">
              <div className="dm2-col" style={{ gap: 2 }}>
                <h2 className="dm2-h2">Note</h2>
                <span className="dm2-muted">{noteList.length ? `${noteList.length} not${noteList.length === 1 ? 'a' : 'e'} su questo mezzo` : 'Nessuna nota su questo mezzo'}</span>
              </div>
            </div>
            {noteList.length === 0
              ? <div className="dm2-ev-empty dm2-muted">Le note restano con data e autore e si trovano dalla ricerca globale.</div>
              : noteList.map(n => (
                <div key={n.id} className="dm2-nrow">
                  <span aria-hidden="true" className="dm2-av" style={{ background: COL.O }}>{n.user ? (n.user.nome?.[0] ?? '') + (n.user.cognome?.[0] ?? '') : '?'}</span>
                  <div className="dm2-col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span className="dm2-small dm2-muted">
                      <span className="dm2-b" style={{ color: '#0B0B0C' }}>{n.user ? `${n.user.nome} ${n.user.cognome}` : 'Sistema'}</span>
                      {' · '}{new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <p className="dm2-ntext">{n.contenuto}</p>
                  </div>
                  <button type="button" className="dm2-btn dm2-btn-xs dm2-btn-icon dm2-btn-danger" aria-label="Elimina nota" title="Elimina nota" onClick={() => handleDeleteNota(n.id)}><Svg d={PATH.trash} size={12} /></button>
                </div>
              ))}
          </section>
          <section className="dm2-card dm2-nota">
            <div className="dm2-col" style={{ gap: 2 }}>
              <h2 className="dm2-h2">Nuova nota</h2>
              <span className="dm2-muted">Ctrl+Invio per salvare</span>
            </div>
            <label htmlFor="dm2-nota2" className="sr-only">Testo della nota</label>
            <textarea id="dm2-nota2" rows={5} className="dm2-ta" placeholder="Scrivi una nota su questo mezzo…"
              value={notaTesto} onChange={e => setNotaTesto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNota(); }} />
            <label className="dm2-check">
              <input type="checkbox" checked={notaTask} onChange={e => setNotaTask(e.target.checked)} />Trasforma in promemoria
            </label>
            <button type="button" className="dm2-btn dm2-btn-primary dm2-btn-block" disabled={notaSaving || !notaTesto.trim()} onClick={handleAddNota}>
              {notaSaving ? 'Salvo…' : 'Salva nota'}
            </button>
          </section>
        </div>
      )}

      {/* ── STORICO ── */}
      {activeTab === 'log' && (
        eventi.length === 0
          ? <Vuoto t="Nessuna modifica registrata" s="Ogni cambio a questo mezzo comparirà qui con data, autore e valore precedente." d={PATH.edit} c={COL.B} />
          : <section className="dm2-card dm2-list">
            <div className="dm2-lhead">
              <div className="dm2-col" style={{ gap: 2 }}>
                <h2 className="dm2-h2">Storico completo</h2>
                <span className="dm2-muted">{eventi.length} event{eventi.length === 1 ? 'o' : 'i'} dal {eventi[eventi.length - 1].data}</span>
              </div>
            </div>
            {eventi.map(e => <EvRow key={e.key} e={e} full />)}
          </section>
      )}

      {/* ── MODALI ── */}
      <NuovaAssegnazioneModal
        open={showAssegnaModal}
        onClose={() => setShowAssegnaModal(false)}
        padroncini={padroncini}
        onSave={handleNuovaAssegnazione}
      />
      {id && mezzo && (
        <ContrattoModal
          open={showContrattoModal}
          onClose={() => { setShowContrattoModal(false); loadAudit(); }}
          mezzoId={id}
          targa={mezzo.targa}
          rataDefault={num(mezzo.rataNoleggio)}
          isElettrico={elettrico}
          padronciniList={padroncini}
          defaultPadroncinoId={assegnazionAttiva?.padroncino.id}
        />
      )}
    </main>
  );
}
