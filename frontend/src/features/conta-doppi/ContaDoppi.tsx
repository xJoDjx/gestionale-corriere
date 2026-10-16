import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './ContaDoppi.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const getToken = () => {
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  try { return JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state?.token ?? null; }
  catch { return null; }
};
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

// ── Types Doppie ───────────────────────────────────────────────────────────────
interface RigaDettaglio   { nome: string; codice: string; spedDoppie: number; spedDoppieMetà: number; }
interface RigaTotale      { nome: string; spedDoppie: number; spedDoppieMetà: number; }
interface ContaDoppiResult {
  dettaglio: RigaDettaglio[];
  totali: RigaTotale[];
  codiciNonAssociati: string[];
  totaleSpedizioniAnalizzate: number;
  totaleDoppiTrovati: number;
}

// ── Types Ingiustificati ───────────────────────────────────────────────────────
interface RigaIngiustificatiDettaglio {
  nome: string; codice: string;
  tariffaFissa: number | null; tariffaApplicata: number;
  spedIngiustificate: number; importo: number;
}
interface RigaIngiustificatiTotale { nome: string; spedIngiustificate: number; importo: number; }
interface IngiustificatiResult {
  dettaglio: RigaIngiustificatiDettaglio[];
  totali: RigaIngiustificatiTotale[];
  codiciNonAssociati: string[];
  totaleSpedizioniAnalizzate: number;
  totaleIngiustificati: number;
  totaleImporto: number;
}

// ── Types Forza Maggiore ───────────────────────────────────────────────────────
interface RigaForzaMaggioreDettaglio {
  nome: string; codice: string;
  tariffaFissa: number; spedizioni: number; importo: number;
}
interface RigaForzaMaggioreTotale { nome: string; spedizioni: number; importo: number; }
interface ForzaMaggioreResult {
  dettaglio: RigaForzaMaggioreDettaglio[];
  totali: RigaForzaMaggioreTotale[];
  codiciNonAssociati: string[];
  codiciEsclusi: string[];        // tariffa > 5€
  totaleSpedizioni: number;
  totaleImporto: number;
}

// ── Types Controllo Zone ───────────────────────────────────────────────────────
interface RigaControlloDettaglio {
  nome: string; codice: string; zonaControllo: string;
  tariffaFissa: number; spedizioni: number; importo: number;
}
interface RigaControlloTotale { nome: string; zonaControllo: string; spedizioni: number; importo: number; }
interface ControlloZonaGroup {
  zonaControllo: string;
  dettaglio: RigaControlloDettaglio[];
  totali: RigaControlloTotale[];
  totaleSpedizioni: number;
  totaleImporto: number;
}
interface ControlloZoneResult {
  zone: ControlloZonaGroup[];
  codiciNonAssociati: string[];
  totaleSpedizioniGlobale: number;
  totaleImportoGlobale: number;
}

interface AnalisiResult { doppie: ContaDoppiResult; ingiustificati: IngiustificatiResult; forzaMaggiore: ForzaMaggioreResult; controlloZone: ControlloZoneResult; }

// ── Types Margini ──────────────────────────────────────────────────────────────
interface RigaMargine {
  codice: string;
  autista: string;
  padroncino: string | null;
  fatturato: number | null;
  competenzeAttive: number | null;
  noli: number | null;
  costi: number | null;
  extra: number | null;
  note: string | null;
  differenza: number | null;
  percentuale: number | null;
}
interface MarginiResult {
  mese: string;
  righe: RigaMargine[];
  statisticaImportata: boolean;
  statisticaAggiornataAl: string | null;
  fatturatoImportato: boolean;
  fatturatoAggiornatoAl: string | null;
  codiciSoloStatistica: string[];
  codiciSoloFatturato: string[];
  totaleFatturato: number;
  totaleCompetenzeAttive: number;
  totaleDifferenza: number;
  totaleFatturatoPda: number;
  esclusi: { codice: string; autista: string }[];
}

// Sotto questa soglia di %Margine, riga e badge vengono evidenziati in rosso.
const SOGLIA_MARGINE_MIN = 30;

type SortFieldMargini = 'codice' | 'autista' | 'padroncino' | 'fatturato' | 'competenzeAttive' | 'extra' | 'differenza' | 'percentuale';

// ── Types Applica ──────────────────────────────────────────────────────────────
type AzioneApplica = 'creato' | 'aggiornato' | 'saltato_confermato' | 'conteggio_non_trovato' | 'padroncino_non_trovato';
interface ApplicaRigaRisultato { nome: string; importo: number; azione: AzioneApplica; }
interface ApplicaResult { applicati: number; saltati: number; risultati: ApplicaRigaRisultato[]; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function meseLabelItaliano(mese: string): string {
  const [anno, m] = mese.split('-');
  const nomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  return `${nomi[parseInt(m, 10) - 1]} ${anno}`;
}
function meseCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function eur(v: number) {
  return v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const AZIONE_LABEL: Record<AzioneApplica, string> = {
  creato: '✅ Creato', aggiornato: '🔄 Aggiornato',
  saltato_confermato: '🔒 Confermato',
  conteggio_non_trovato: '⚠️ Conteggio assente',
  padroncino_non_trovato: '❌ Padroncino non trovato',
};
const AZIONE_CLASS: Record<AzioneApplica, string> = {
  creato: 'cd-az--ok', aggiornato: 'cd-az--update',
  saltato_confermato: 'cd-az--lock',
  conteggio_non_trovato: 'cd-az--warn',
  padroncino_non_trovato: 'cd-az--err',
};

// ── Pannello Applica (riusabile) ───────────────────────────────────────────────
interface ApplicaPanelProps {
  mese: string;
  voci: { nome: string; importo: number }[];
  descrizione: string;
  endpoint: string;
  buildPayload: () => object;
  onDone: (r: ApplicaResult) => void;
  onError: (msg: string) => void;
}
function ApplicaPanel({ mese, voci, descrizione, endpoint, buildPayload, onDone, onError }: ApplicaPanelProps) {
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<ApplicaResult | null>(null);

  const applica = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore');
      setResult(data);
      setShow(false);
      onDone(data);
    } catch (e: any) {
      onError(e.message);
      setShow(false);
    } finally {
      setLoading(false);
    }
  };

  if (result) return (
    <div className={`cd-applica-result ${result.saltati === 0 ? 'cd-applica-result--ok' : 'cd-applica-result--partial'}`}>
      <div className="cd-applica-result-header">
        <span>{result.saltati === 0 ? '✅' : '⚠️'}</span>
        <div>
          <strong>{result.applicati} conteggi aggiornati{result.saltati > 0 && `, ${result.saltati} saltati`}</strong>
          <span className="cd-applica-result-sub"> — {meseLabelItaliano(mese)}</span>
        </div>
        <button className="cd-error-close" onClick={() => setResult(null)}>✕</button>
      </div>
      <div className="cd-applica-result-rows">
        {result.risultati.map((r, i) => (
          <div key={i} className={`cd-ar-row ${AZIONE_CLASS[r.azione]}`}>
            <span className="cd-ar-nome">{r.nome}</span>
            <span className="cd-ar-importo">−{r.importo}</span>
            <span className="cd-ar-azione">{AZIONE_LABEL[r.azione]}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {!show && (
        <div className="cd-action-bar">
          <div className="cd-action-info">
            <span className="cd-action-icon">📋</span>
            <div>
              <strong>Applica ai conteggi di {meseLabelItaliano(mese)}</strong>
              <span className="cd-action-sub">{descrizione}</span>
            </div>
          </div>
          <button className="cd-btn-applica" onClick={() => setShow(true)}>
            Applica ai conteggi →
          </button>
        </div>
      )}

      {show && (
        <div className="cd-confirm-panel">
          <div className="cd-confirm-header"><span>⚠️</span><strong>Conferma applicazione</strong></div>
          <p className="cd-confirm-text">
            Aggiungi/aggiorna la voce <strong>"{descrizione}"</strong> nei conteggi di{' '}
            <strong>{meseLabelItaliano(mese)}</strong> per <strong>{voci.length} padroncini</strong>.
            I conteggi già CONFERMATI verranno saltati.
          </p>
          <div className="cd-confirm-preview">
            {voci.map((r) => (
              <div key={r.nome} className="cd-confirm-row">
                <span className="cd-confirm-nome">{r.nome}</span>
                <span className="cd-confirm-val">−{r.importo}</span>
              </div>
            ))}
          </div>
          <div className="cd-confirm-actions">
            <button className="cd-btn-cancel" onClick={() => setShow(false)} disabled={loading}>Annulla</button>
            <button className="cd-btn-confirm" onClick={applica} disabled={loading}>
              {loading ? <><span className="cd-spinner-sm" /> Applicazione…</> : '✅ Conferma e applica'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab Doppie ─────────────────────────────────────────────────────────────────
function TabDoppie({ doppie, mese }: { doppie: ContaDoppiResult; mese: string }) {
  const [tab, setTab] = useState<'totali' | 'dettaglio'>('totali');
  const [errore, setErrore] = useState<string | null>(null);

  const vociApplica = doppie.totali.map((r) => ({ nome: r.nome, importo: r.spedDoppieMetà }));

  return (
    <div>
      {/* Stats */}
      <div className="cd-stats-row">
        <div className="cd-stat">
          <span className="cd-stat-value">{doppie.totaleSpedizioniAnalizzate.toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Righe analizzate</span>
        </div>
        <div className="cd-stat cd-stat--warn">
          <span className="cd-stat-value">{doppie.totaleDoppiTrovati.toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Consegnate doppie</span>
        </div>
        <div className="cd-stat cd-stat--primary">
          <span className="cd-stat-value">{Math.ceil(doppie.totaleDoppiTrovati / 2).toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Totale / 2 ⌈arrotondato⌉</span>
        </div>
        <div className="cd-stat">
          <span className="cd-stat-value">{doppie.totali.length}</span>
          <span className="cd-stat-label">Padroncini coinvolti</span>
        </div>
      </div>

      {doppie.codiciNonAssociati.length > 0 && (
        <div className="cd-warn-box">
          <strong>⚠️ {doppie.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="cd-warn-codes">{doppie.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="cd-error"><span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      <ApplicaPanel
        mese={mese}
        voci={vociApplica}
        descrizione="Aggiunge trattenuta Consegne doppie in ogni conteggio mensile"
        endpoint="/conta-doppi/applica"
        buildPayload={() => ({
          mese,
          totali: doppie.totali.map((r) => ({ nome: r.nome, 'spedDoppieMetà': r.spedDoppieMetà })),
        })}
        onDone={() => {}}
        onError={setErrore}
      />

      {/* Sub-tab */}
      <div className="cd-tabs">
        <button className={`cd-tab ${tab === 'totali' ? 'cd-tab--active' : ''}`} onClick={() => setTab('totali')}>
          Totali per padroncino <span className="cd-tab-badge">{doppie.totali.length}</span>
        </button>
        <button className={`cd-tab ${tab === 'dettaglio' ? 'cd-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
          Dettaglio per codice <span className="cd-tab-badge">{doppie.dettaglio.length}</span>
        </button>
      </div>

      {tab === 'totali' && (
        <div className="cd-table-wrap">
          <table className="cd-table">
            <thead><tr><th>#</th><th>Padroncino</th><th className="cd-th-num">Sped. Doppie</th><th className="cd-th-num">Sped. Doppie / 2</th></tr></thead>
            <tbody>
              {doppie.totali.map((r, i) => (
                <tr key={r.nome} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                  <td className="cd-td-num cd-td-idx">{i + 1}</td>
                  <td className="cd-td-nome">{r.nome}</td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--warn">{r.spedDoppie}</span></td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--primary">{r.spedDoppieMetà}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="cd-foot">
              <td /><td><strong>TOTALE</strong></td>
              <td className="cd-td-num"><strong>{doppie.totali.reduce((s, r) => s + r.spedDoppie, 0)}</strong></td>
              <td className="cd-td-num"><strong>{doppie.totali.reduce((s, r) => s + r.spedDoppieMetà, 0)}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'dettaglio' && (
        <div className="cd-table-wrap">
          <table className="cd-table">
            <thead><tr><th>#</th><th>Padroncino</th><th>Codice</th><th className="cd-th-num">Doppie</th><th className="cd-th-num">/ 2</th></tr></thead>
            <tbody>
              {doppie.dettaglio.map((r, i) => (
                <tr key={r.codice} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                  <td className="cd-td-num cd-td-idx">{i + 1}</td>
                  <td className="cd-td-nome">{r.nome}</td>
                  <td><code className="cd-codice">{r.codice}</code></td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--warn">{r.spedDoppie}</span></td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--primary">{r.spedDoppieMetà}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="cd-foot">
              <td /><td colSpan={2}><strong>TOTALE</strong></td>
              <td className="cd-td-num"><strong>{doppie.dettaglio.reduce((s, r) => s + r.spedDoppie, 0)}</strong></td>
              <td className="cd-td-num"><strong>{doppie.dettaglio.reduce((s, r) => s + r.spedDoppieMetà, 0)}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab Ingiustificati ─────────────────────────────────────────────────────────
function TabIngiustificati({ ing, mese }: { ing: IngiustificatiResult; mese: string }) {
  const [tab, setTab]       = useState<'totali' | 'dettaglio'>('totali');
  const [errore, setErrore] = useState<string | null>(null);

  const vociApplica = ing.totali.map((r) => ({ nome: r.nome, importo: r.importo }));

  return (
    <div>
      {/* Stats */}
      <div className="cd-stats-row">
        <div className="cd-stat">
          <span className="cd-stat-value">{ing.totaleIngiustificati.toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Spedizioni Ingiustificate</span>
        </div>
        <div className="cd-stat cd-stat--warn">
          <span className="cd-stat-value">{ing.totali.length}</span>
          <span className="cd-stat-label">Padroncini coinvolti</span>
        </div>
        <div className="cd-stat cd-stat--danger">
          <span className="cd-stat-value">{eur(ing.totaleImporto)}</span>
          <span className="cd-stat-label">Totale da trattenere</span>
        </div>
      </div>

      {ing.codiciNonAssociati.length > 0 && (
        <div className="cd-warn-box">
          <strong>⚠️ {ing.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="cd-warn-codes">{ing.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="cd-error"><span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      <ApplicaPanel
        mese={mese}
        voci={vociApplica}
        descrizione="Aggiunge trattenuta Malus Spedizioni non giustificate in ogni conteggio mensile"
        endpoint="/conta-doppi/applica-ingiustificati"
        buildPayload={() => ({
          mese,
          totali: ing.totali.map((r) => ({
            nome: r.nome,
            importo: r.importo,
            spedIngiustificate: r.spedIngiustificate,
          })),
        })}
        onDone={() => {}}
        onError={setErrore}
      />

      {/* Sub-tab */}
      <div className="cd-tabs">
        <button className={`cd-tab ${tab === 'totali' ? 'cd-tab--active' : ''}`} onClick={() => setTab('totali')}>
          Totali per padroncino <span className="cd-tab-badge">{ing.totali.length}</span>
        </button>
        <button className={`cd-tab ${tab === 'dettaglio' ? 'cd-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
          Dettaglio per codice <span className="cd-tab-badge">{ing.dettaglio.length}</span>
        </button>
      </div>

      {tab === 'totali' && (
        <div className="cd-table-wrap">
          <table className="cd-table">
            <thead><tr><th>#</th><th>Padroncino</th><th className="cd-th-num">Ingiustificate</th><th className="cd-th-num">Importo</th></tr></thead>
            <tbody>
              {ing.totali.map((r, i) => (
                <tr key={r.nome} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                  <td className="cd-td-num cd-td-idx">{i + 1}</td>
                  <td className="cd-td-nome">{r.nome}</td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--warn">{r.spedIngiustificate}</span></td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--danger">{eur(r.importo)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="cd-foot">
              <td /><td><strong>TOTALE</strong></td>
              <td className="cd-td-num"><strong>{ing.totali.reduce((s, r) => s + r.spedIngiustificate, 0)}</strong></td>
              <td className="cd-td-num"><strong>{eur(ing.totali.reduce((s, r) => s + r.importo, 0))}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'dettaglio' && (
        <div className="cd-table-wrap">
          <table className="cd-table">
            <thead>
              <tr>
                <th>#</th><th>Padroncino</th><th>Codice</th>
                <th className="cd-th-num">Tariffa DB</th>
                <th className="cd-th-num">Tariffa applicata</th>
                <th className="cd-th-num">Ingiustificate</th>
                <th className="cd-th-num">Importo</th>
              </tr>
            </thead>
            <tbody>
              {ing.dettaglio.map((r, i) => (
                <tr key={r.codice} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                  <td className="cd-td-num cd-td-idx">{i + 1}</td>
                  <td className="cd-td-nome">{r.nome}</td>
                  <td><code className="cd-codice">{r.codice}</code></td>
                  <td className="cd-td-num cd-tariffa-db">
                    {r.tariffaFissa != null ? eur(r.tariffaFissa) : '—'}
                  </td>
                  <td className="cd-td-num">
                    <span className={`cd-badge ${r.tariffaApplicata === 1 ? 'cd-badge--warn' : 'cd-badge--primary'}`}>
                      {eur(r.tariffaApplicata)}
                    </span>
                  </td>
                  <td className="cd-td-num">{r.spedIngiustificate}</td>
                  <td className="cd-td-num"><span className="cd-badge cd-badge--danger">{eur(r.importo)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="cd-foot">
              <td /><td colSpan={4}><strong>TOTALE</strong></td>
              <td className="cd-td-num"><strong>{ing.dettaglio.reduce((s, r) => s + r.spedIngiustificate, 0)}</strong></td>
              <td className="cd-td-num"><strong>{eur(ing.dettaglio.reduce((s, r) => s + r.importo, 0))}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab Forza Maggiore / 48-72h ────────────────────────────────────────────────
function TabForzaMaggiore({ fm, mese }: { fm: ForzaMaggioreResult; mese: string }) {
  const [tab, setTab]       = useState<'totali' | 'dettaglio'>('totali');
  const [errore, setErrore] = useState<string | null>(null);

  const vociApplica = fm.totali.map((r) => ({ nome: r.nome, importo: r.importo }));

  return (
    <div>
      {/* Stats */}
      <div className="cd-stats-row">
        <div className="cd-stat">
          <span className="cd-stat-value">{fm.totaleSpedizioni.toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Spedizioni filtrate</span>
        </div>
        <div className="cd-stat cd-stat--warn">
          <span className="cd-stat-value">{fm.totali.length}</span>
          <span className="cd-stat-label">Padroncini coinvolti</span>
        </div>
        <div className="cd-stat cd-stat--danger">
          <span className="cd-stat-value">{eur(fm.totaleImporto)}</span>
          <span className="cd-stat-label">Totale da trattenere</span>
        </div>
        {fm.codiciEsclusi.length > 0 && (
          <div className="cd-stat">
            <span className="cd-stat-value">{fm.codiciEsclusi.length}</span>
            <span className="cd-stat-label">Codici esclusi (tariffa &gt; 5 €)</span>
          </div>
        )}
      </div>

      {fm.codiciNonAssociati.length > 0 && (
        <div className="cd-warn-box">
          <strong>⚠️ {fm.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="cd-warn-codes">{fm.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {fm.codiciEsclusi.length > 0 && (
        <div className="cd-warn-box" style={{ borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)', background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-card))' }}>
          <strong>ℹ️ {fm.codiciEsclusi.length} codici esclusi per tariffa &gt; 5 €:</strong>
          <span className="cd-warn-codes">{fm.codiciEsclusi.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="cd-error"><span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {fm.totali.length === 0 ? (
        <div className="cd-warn-box" style={{ textAlign: 'center', padding: '32px' }}>
          <strong>Nessun dato</strong> — nessuna spedizione corrisponde ai criteri di Forza Maggiore / 48-72h per questo file.
        </div>
      ) : (
        <>
          <ApplicaPanel
            mese={mese}
            voci={vociApplica}
            descrizione="Aggiunge trattenuta Malus Forza Maggiore / 48-72h in ogni conteggio mensile"
            endpoint="/conta-doppi/applica-forza-maggiore"
            buildPayload={() => ({
              mese,
              totali: fm.totali.map((r) => ({ nome: r.nome, importo: r.importo, spedizioni: r.spedizioni })),
            })}
            onDone={() => {}}
            onError={setErrore}
          />

          {/* Sub-tab */}
          <div className="cd-tabs">
            <button className={`cd-tab ${tab === 'totali' ? 'cd-tab--active' : ''}`} onClick={() => setTab('totali')}>
              Totali per padroncino <span className="cd-tab-badge">{fm.totali.length}</span>
            </button>
            <button className={`cd-tab ${tab === 'dettaglio' ? 'cd-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
              Dettaglio per codice <span className="cd-tab-badge">{fm.dettaglio.length}</span>
            </button>
          </div>

          {tab === 'totali' && (
            <div className="cd-table-wrap">
              <table className="cd-table">
                <thead><tr><th>#</th><th>Padroncino</th><th className="cd-th-num">Spedizioni</th><th className="cd-th-num">Importo</th></tr></thead>
                <tbody>
                  {fm.totali.map((r, i) => (
                    <tr key={r.nome} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                      <td className="cd-td-num cd-td-idx">{i + 1}</td>
                      <td className="cd-td-nome">{r.nome}</td>
                      <td className="cd-td-num"><span className="cd-badge cd-badge--warn">{r.spedizioni}</span></td>
                      <td className="cd-td-num"><span className="cd-badge cd-badge--danger">{eur(r.importo)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="cd-foot">
                  <td /><td><strong>TOTALE</strong></td>
                  <td className="cd-td-num"><strong>{fm.totali.reduce((s, r) => s + r.spedizioni, 0)}</strong></td>
                  <td className="cd-td-num"><strong>{eur(fm.totali.reduce((s, r) => s + r.importo, 0))}</strong></td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {tab === 'dettaglio' && (
            <div className="cd-table-wrap">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>#</th><th>Padroncino</th><th>Codice</th>
                    <th className="cd-th-num">Tariffa DB</th>
                    <th className="cd-th-num">Spedizioni</th>
                    <th className="cd-th-num">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {fm.dettaglio.map((r, i) => (
                    <tr key={r.codice} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                      <td className="cd-td-num cd-td-idx">{i + 1}</td>
                      <td className="cd-td-nome">{r.nome}</td>
                      <td><code className="cd-codice">{r.codice}</code></td>
                      <td className="cd-td-num cd-tariffa-db">{eur(r.tariffaFissa)}</td>
                      <td className="cd-td-num">{r.spedizioni}</td>
                      <td className="cd-td-num"><span className="cd-badge cd-badge--danger">{eur(r.importo)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="cd-foot">
                  <td /><td colSpan={3}><strong>TOTALE</strong></td>
                  <td className="cd-td-num"><strong>{fm.dettaglio.reduce((s, r) => s + r.spedizioni, 0)}</strong></td>
                  <td className="cd-td-num"><strong>{eur(fm.dettaglio.reduce((s, r) => s + r.importo, 0))}</strong></td>
                </tr></tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab Controllo Zone ─────────────────────────────────────────────────────────
function TabControlloZone({
  ctrl, mese, tariffe, onTariffeChange,
}: {
  ctrl: ControlloZoneResult;
  mese: string;
  tariffe: Record<string, string>;
  onTariffeChange: (zona: string, val: string) => void;
}) {
  const [zonaAttiva, setZonaAttiva] = useState<string>(ctrl.zone[0]?.zonaControllo ?? '');
  const [subtab, setSubtab]         = useState<'totali' | 'dettaglio'>('totali');
  const [errore, setErrore]         = useState<string | null>(null);

  if (ctrl.zone.length === 0) return (
    <div className="cd-warn-box" style={{ textAlign: 'center', padding: '32px' }}>
      <strong>Nessun codice configurato</strong> — aggiungi il campo <em>Zona Controllo</em> ai codici autista
      interessati (es. "Cosenza", "Rende") dalla pagina <strong>Cod. Autisti</strong>.
    </div>
  );

  const zonaCorrente = ctrl.zone.find((z) => z.zonaControllo === zonaAttiva) ?? ctrl.zone[0];

  // Tariffa zona corrente inserita dall'utente
  const tariffaZonaStr = tariffe[zonaCorrente.zonaControllo] ?? '';
  const tariffaZona    = parseFloat(tariffaZonaStr.replace(',', '.')) || 0;
  const tariffaInserita = tariffaZona > 0;

  // Dettaglio ricalcolato con differenza e importo basato sulla tariffa zona
  const dettaglioCalc = zonaCorrente.dettaglio.map((r) => {
    const diff    = parseFloat((Math.max(0, r.tariffaFissa - tariffaZona)).toFixed(4));
    const importo = Math.round(diff * r.spedizioni * 100) / 100;
    return { ...r, tariffaZona, diff, importoCalc: importo };
  });

  // Totali per padroncino ricalcolati
  const totaliCalc = (() => {
    const map = new Map<string, { spedizioni: number; importo: number }>();
    for (const r of dettaglioCalc) {
      const ex = map.get(r.nome) ?? { spedizioni: 0, importo: 0 };
      map.set(r.nome, {
        spedizioni: ex.spedizioni + r.spedizioni,
        importo: Math.round((ex.importo + r.importoCalc) * 100) / 100,
      });
    }
    return [...map.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .filter((r) => r.importo > 0)
      .sort((a, b) => b.importo - a.importo);
  })();

  const totaleSpedizioni = zonaCorrente.dettaglio.reduce((s, r) => s + r.spedizioni, 0);
  const totaleImporto    = Math.round(totaliCalc.reduce((s, r) => s + r.importo, 0) * 100) / 100;

  // Payload per ApplicaPanel
  const vociApplica = totaliCalc.map((r) => ({
    nome: r.nome, importo: r.importo,
    zonaControllo: zonaCorrente.zonaControllo,
    spedizioni: r.spedizioni,
  }));

  return (
    <div>
      {/* Stats globali */}
      <div className="cd-stats-row">
        <div className="cd-stat">
          <span className="cd-stat-value">{ctrl.zone.length}</span>
          <span className="cd-stat-label">Zone configurate</span>
        </div>
        <div className="cd-stat cd-stat--warn">
          <span className="cd-stat-value">{ctrl.totaleSpedizioniGlobale.toLocaleString('it-IT')}</span>
          <span className="cd-stat-label">Spedizioni totali</span>
        </div>
        <div className="cd-stat cd-stat--danger">
          <span className="cd-stat-value">{tariffaInserita ? eur(totaleImporto) : '—'}</span>
          <span className="cd-stat-label">Totale da trattenere</span>
        </div>
      </div>

      {ctrl.codiciNonAssociati.length > 0 && (
        <div className="cd-warn-box">
          <strong>⚠️ {ctrl.codiciNonAssociati.length} codici senza tariffa</strong> — esclusi:
          <span className="cd-warn-codes">{ctrl.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="cd-error"><span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {/* Selettore zona */}
      <div className="cd-tabs" style={{ marginBottom: 0 }}>
        {ctrl.zone.map((z) => (
          <button
            key={z.zonaControllo}
            className={`cd-tab ${zonaAttiva === z.zonaControllo ? 'cd-tab--active' : ''}`}
            onClick={() => { setZonaAttiva(z.zonaControllo); setSubtab('totali'); }}
          >
            📍 {z.zonaControllo}
            <span className="cd-tab-badge">{z.totaleSpedizioni} sped.</span>
          </button>
        ))}
      </div>

      {/* Pannello zona selezionata */}
      <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '16px', background: 'var(--bg-card)', marginBottom: '16px' }}>

        {/* Input tariffa zona */}
        <div className="cd-mese-bar" style={{ marginBottom: 16 }}>
          <label className="cd-mese-label">Tariffa Zona {zonaCorrente.zonaControllo}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              step="0.01"
              min="0"
              className="cd-mese-input"
              style={{ width: 100, textAlign: 'right' }}
              value={tariffaZonaStr}
              placeholder="0,00"
              onChange={(e) => onTariffeChange(zonaCorrente.zonaControllo, e.target.value)}
            />
            <span className="cd-mese-label">€</span>
          </div>
          {tariffaInserita ? (
            <span className="cd-mese-badge">
              Differenza media: {eur(
                dettaglioCalc.reduce((s, r) => s + r.diff, 0) / (dettaglioCalc.length || 1)
              )} · Importo totale: {eur(totaleImporto)}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              ℹ️ Inserisci la tariffa concordata per la zona per calcolare la differenza
            </span>
          )}
        </div>

        {tariffaInserita && (
          <ApplicaPanel
            mese={mese}
            voci={vociApplica.map((v) => ({ nome: v.nome, importo: v.importo }))}
            descrizione={`Aggiunge trattenuta Controllo Consegne ${zonaCorrente.zonaControllo} (diff. tariffa) in ogni conteggio mensile`}
            endpoint="/conta-doppi/applica-controllo-zona"
            buildPayload={() => ({ mese, totali: vociApplica })}
            onDone={() => {}}
            onError={setErrore}
          />
        )}

        <div className="cd-tabs">
          <button className={`cd-tab ${subtab === 'totali' ? 'cd-tab--active' : ''}`} onClick={() => setSubtab('totali')}>
            Totali per padroncino <span className="cd-tab-badge">{totaliCalc.length}</span>
          </button>
          <button className={`cd-tab ${subtab === 'dettaglio' ? 'cd-tab--active' : ''}`} onClick={() => setSubtab('dettaglio')}>
            Dettaglio per codice <span className="cd-tab-badge">{zonaCorrente.dettaglio.length}</span>
          </button>
        </div>

        {subtab === 'totali' && (
          <div className="cd-table-wrap">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>#</th><th>Padroncino</th>
                  <th className="cd-th-num">Spedizioni</th>
                  <th className="cd-th-num">Importo</th>
                </tr>
              </thead>
              <tbody>
                {(tariffaInserita ? totaliCalc : zonaCorrente.totali).map((r, i) => (
                  <tr key={r.nome} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                    <td className="cd-td-num cd-td-idx">{i + 1}</td>
                    <td className="cd-td-nome">{r.nome}</td>
                    <td className="cd-td-num"><span className="cd-badge cd-badge--warn">{r.spedizioni}</span></td>
                    <td className="cd-td-num">
                      <span className="cd-badge cd-badge--danger">{eur(r.importo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="cd-foot">
                <td /><td><strong>TOTALE</strong></td>
                <td className="cd-td-num"><strong>{totaleSpedizioni}</strong></td>
                <td className="cd-td-num"><strong>{tariffaInserita ? eur(totaleImporto) : '—'}</strong></td>
              </tr></tfoot>
            </table>
          </div>
        )}

        {subtab === 'dettaglio' && (
          <div className="cd-table-wrap">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>#</th><th>Padroncino</th><th>Codice</th>
                  <th className="cd-th-num">Tariffa DB</th>
                  <th className="cd-th-num">Tariffa Zona</th>
                  <th className="cd-th-num">Differenza</th>
                  <th className="cd-th-num">Spedizioni</th>
                  <th className="cd-th-num">Importo</th>
                </tr>
              </thead>
              <tbody>
                {dettaglioCalc.map((r, i) => (
                  <tr key={r.codice} className={i % 2 === 0 ? 'cd-row-even' : ''}>
                    <td className="cd-td-num cd-td-idx">{i + 1}</td>
                    <td className="cd-td-nome">{r.nome}</td>
                    <td><code className="cd-codice">{r.codice}</code></td>
                    <td className="cd-td-num cd-tariffa-db">{eur(r.tariffaFissa)}</td>
                    <td className="cd-td-num">
                      {tariffaInserita
                        ? <span className="cd-badge cd-badge--primary">{eur(tariffaZona)}</span>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="cd-td-num">
                      {tariffaInserita
                        ? <span className={`cd-badge ${r.diff > 0 ? 'cd-badge--warn' : ''}`}>{eur(r.diff)}</span>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="cd-td-num">{r.spedizioni}</td>
                    <td className="cd-td-num">
                      {tariffaInserita
                        ? <span className="cd-badge cd-badge--danger">{eur(r.importoCalc)}</span>
                        : <span className="cd-badge cd-badge--danger">{eur(r.importo)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="cd-foot">
                <td /><td colSpan={5}><strong>TOTALE</strong></td>
                <td className="cd-td-num"><strong>{totaleSpedizioni}</strong></td>
                <td className="cd-td-num"><strong>{tariffaInserita ? eur(totaleImporto) : eur(zonaCorrente.dettaglio.reduce((s,r) => s + r.importo, 0))}</strong></td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pannello Applica Tutto ─────────────────────────────────────────────────────
interface ApplicaTuttoPanelProps {
  risultato: AnalisiResult;
  mese: string;
  tariffe: Record<string, string>;
}

/** Calcola i payload per le zone in base alle tariffe inserite */
function calcolaZonePayload(ctrl: ControlloZoneResult, tariffe: Record<string, string>) {
  const out: { nome: string; zonaControllo: string; importo: number; spedizioni: number }[] = [];
  for (const zona of ctrl.zone) {
    const tz = parseFloat((tariffe[zona.zonaControllo] ?? '').replace(',', '.')) || 0;
    if (tz <= 0) continue;
    const map = new Map<string, { spedizioni: number; importo: number }>();
    for (const r of zona.dettaglio) {
      const diff    = Math.max(0, r.tariffaFissa - tz);
      const importo = Math.round(diff * r.spedizioni * 100) / 100;
      const ex      = map.get(r.nome) ?? { spedizioni: 0, importo: 0 };
      map.set(r.nome, {
        spedizioni: ex.spedizioni + r.spedizioni,
        importo:    Math.round((ex.importo + importo) * 100) / 100,
      });
    }
    for (const [nome, v] of map.entries()) {
      if (v.importo > 0) out.push({ nome, zonaControllo: zona.zonaControllo, ...v });
    }
  }
  return out;
}

function ApplicaTuttoPanel({ risultato, mese, tariffe }: ApplicaTuttoPanelProps) {
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, ApplicaResult | null> | null>(null);
  const [errore, setErrore]   = useState<string | null>(null);

  const doppie         = risultato.doppie.totali.map((r) => ({ nome: r.nome, 'spedDoppieMetà': r.spedDoppieMetà }));
  const ingiustificati = risultato.ingiustificati.totali.map((r) => ({ nome: r.nome, importo: r.importo, spedIngiustificate: r.spedIngiustificate }));
  const forzaMaggiore  = risultato.forzaMaggiore.totali.map((r) => ({ nome: r.nome, importo: r.importo, spedizioni: r.spedizioni }));
  const zone           = calcolaZonePayload(risultato.controlloZone, tariffe);

  const totPadroncini = new Set([
    ...doppie.map((r) => r.nome),
    ...ingiustificati.map((r) => r.nome),
    ...forzaMaggiore.map((r) => r.nome),
    ...zone.map((r) => r.nome),
  ]).size;

  const applica = async () => {
    setLoading(true);
    setErrore(null);
    try {
      const res  = await fetch(`${API_BASE}/conta-doppi/applica-tutto`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({ mese, doppie, ingiustificati, forzaMaggiore, zone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore');
      setResults(data);
      setShow(false);
    } catch (e: any) {
      setErrore(e.message);
      setShow(false);
    } finally {
      setLoading(false);
    }
  };

  if (results) {
    const sez = [
      { key: 'doppie',         label: '🔁 Consegne Doppie',          r: results.doppie },
      { key: 'ingiustificati', label: '⛔ Ingiustificate',            r: results.ingiustificati },
      { key: 'forzaMaggiore',  label: '🌩️ Forza Maggiore / 48-72h',  r: results.forzaMaggiore },
      { key: 'zone',           label: '📍 Controllo Zone',            r: results.zone },
    ] as const;
    const totApplicati = sez.reduce((s, x) => s + (x.r?.applicati ?? 0), 0);
    const totSaltati   = sez.reduce((s, x) => s + (x.r?.saltati   ?? 0), 0);

    return (
      <div className={`cd-applica-result ${totSaltati === 0 ? 'cd-applica-result--ok' : 'cd-applica-result--partial'}`}
           style={{ marginBottom: 16 }}>
        <div className="cd-applica-result-header">
          <span>{totSaltati === 0 ? '✅' : '⚠️'}</span>
          <div>
            <strong>Applica Tutto — {totApplicati} righe aggiornate{totSaltati > 0 && `, ${totSaltati} saltate`}</strong>
            <span className="cd-applica-result-sub"> — {meseLabelItaliano(mese)}</span>
          </div>
          <button className="cd-error-close" onClick={() => setResults(null)}>✕</button>
        </div>
        {sez.map(({ label, r }) => r && (
          <div key={label} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>{label}</div>
            <div className="cd-applica-result-rows">
              {r.risultati.map((row, i) => (
                <div key={i} className={`cd-ar-row ${AZIONE_CLASS[row.azione]}`}>
                  <span className="cd-ar-nome">{row.nome}</span>
                  <span className="cd-ar-importo">−{row.importo}</span>
                  <span className="cd-ar-azione">{AZIONE_LABEL[row.azione]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {errore && (
        <div className="cd-error" style={{ marginBottom: 12 }}>
          <span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {!show && (
        <div className="cd-action-bar cd-action-bar--tutto" style={{ marginBottom: 16 }}>
          <div className="cd-action-info">
            <span className="cd-action-icon">⚡</span>
            <div>
              <strong>Applica Tutto — {meseLabelItaliano(mese)}</strong>
              <span className="cd-action-sub">
                Inserisce tutte e 4 le trattenute in un colpo solo:
                Doppie ({doppie.length}), Ingiustificate ({ingiustificati.length}),
                Forza Maggiore ({forzaMaggiore.length}), Zone ({zone.length})
                — {totPadroncini} padroncini coinvolti
              </span>
            </div>
          </div>
          <button className="cd-btn-applica cd-btn-applica--tutto" onClick={() => setShow(true)}>
            ⚡ Applica Tutto →
          </button>
        </div>
      )}

      {show && (
        <div className="cd-confirm-panel" style={{ marginBottom: 16 }}>
          <div className="cd-confirm-header"><span>⚠️</span><strong>Conferma — Applica Tutto</strong></div>
          <p className="cd-confirm-text">
            Verranno aggiunte/aggiornate <strong>4 voci di trattenuta</strong> nei conteggi di{' '}
            <strong>{meseLabelItaliano(mese)}</strong> per <strong>{totPadroncini} padroncini</strong>.
            I conteggi già CONFERMATI verranno saltati automaticamente.
            {zone.length === 0 && tariffe && Object.keys(tariffe).length > 0 && (
              <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                ℹ️ Nessuna zona calcolabile — inserisci le tariffe zona nel tab Controllo Zone.
              </span>
            )}
          </p>
          <div className="cd-confirm-preview">
            {[
              { label: '🔁 Consegne Doppie', items: doppie.map((r) => ({ nome: r.nome, importo: r['spedDoppieMetà'] })) },
              { label: '⛔ Ingiustificate',   items: ingiustificati.map((r) => ({ nome: r.nome, importo: r.importo })) },
              { label: '🌩️ Forza Maggiore',  items: forzaMaggiore.map((r) => ({ nome: r.nome, importo: r.importo })) },
              { label: '📍 Controllo Zone',   items: zone.map((r) => ({ nome: `${r.nome} (${r.zonaControllo})`, importo: r.importo })) },
            ].map(({ label, items }) => items.length > 0 && (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
                {items.map((r) => (
                  <div key={r.nome} className="cd-confirm-row">
                    <span className="cd-confirm-nome">{r.nome}</span>
                    <span className="cd-confirm-val">−{r.importo}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="cd-confirm-actions">
            <button className="cd-btn-cancel" onClick={() => setShow(false)} disabled={loading}>Annulla</button>
            <button className="cd-btn-confirm" onClick={applica} disabled={loading}>
              {loading ? <><span className="cd-spinner-sm" /> Applicazione…</> : '⚡ Conferma e applica tutto'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Riga tabella Margini con Extra/Note editabili (debounce + salvataggio) ─────
function RigaMarginiRow({
  r, i, onSaveManuale, onEsclude,
}: {
  r: RigaMargine;
  i: number;
  onSaveManuale: (codice: string, extraStr: string, noteStr: string) => void;
  onEsclude: (codice: string) => void;
}) {
  const [extraStr, setExtraStr] = useState(r.extra != null ? String(r.extra) : '');
  const [noteStr, setNoteStr]   = useState(r.note ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setExtraStr(r.extra != null ? String(r.extra) : ''); }, [r.extra]);
  useEffect(() => { setNoteStr(r.note ?? ''); }, [r.note]);

  const schedule = (nextExtra: string, nextNote: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSaveManuale(r.codice, nextExtra, nextNote), 600);
  };

  const fmtEurOrDash = (n: number | null) => (n == null ? '—' : eur(n));
  const fmtPct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

  // Margine sotto la soglia minima → riga e badge evidenziati in rosso.
  const sottoSoglia = r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN;
  const rowClass = [i % 2 === 0 ? 'cd-row-even' : '', sottoSoglia ? 'cd-row-danger' : ''].filter(Boolean).join(' ');

  return (
    <tr className={rowClass}>
      <td className="cd-td-num cd-td-idx">{i + 1}</td>
      <td><code className="cd-codice">{r.codice}</code></td>
      <td className="cd-td-nome">{r.autista}</td>
      <td className="cd-td-nome">{r.padroncino ?? '—'}</td>
      <td className="cd-td-num">{fmtEurOrDash(r.fatturato)}</td>
      <td className="cd-td-num">{fmtEurOrDash(r.competenzeAttive)}</td>
      <td className="cd-td-num">
        <input
          type="number" step="0.01" className="cd-mese-input" style={{ width: 90, textAlign: 'right' }}
          value={extraStr} placeholder="0,00"
          onChange={(e) => { setExtraStr(e.target.value); schedule(e.target.value, noteStr); }}
        />
      </td>
      <td className="cd-td-num">
        <span className={`cd-badge ${r.differenza != null && r.differenza < 0 ? 'cd-badge--danger' : 'cd-badge--primary'}`}>
          {fmtEurOrDash(r.differenza)}
        </span>
      </td>
      <td className="cd-td-num">
        <span className={`cd-badge ${sottoSoglia ? 'cd-badge--danger' : 'cd-badge--warn'}`}>
          {fmtPct(r.percentuale)}
        </span>
      </td>
      <td>
        <input
          type="text" className="cd-mese-input" style={{ width: 180 }}
          value={noteStr} placeholder="Nota…"
          onChange={(e) => { setNoteStr(e.target.value); schedule(extraStr, e.target.value); }}
        />
      </td>
      <td className="cd-td-num">
        <button
          className="cd-error-close" title="Escludi questo codice dal calcolo margini"
          onClick={() => { if (window.confirm(`Escludere il codice ${r.codice} dal calcolo margini di questo mese?`)) onEsclude(r.codice); }}
        >
          🗑️
        </button>
      </td>
    </tr>
  );
}

// ── Tab Margini (Fatturato + Competenze Attive da import diretti, indipendenti dai conteggi) ─
function TabMargini() {
  const [mese, setMese]                 = useState<string>(meseCorrente());
  const [dati, setDati]                 = useState<MarginiResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [importingStat, setImportingStat] = useState(false);
  const [importingFatt, setImportingFatt] = useState(false);
  const [errore, setErrore]             = useState<string | null>(null);
  const [soloProblemi, setSoloProblemi] = useState(false);
  const [ricerca, setRicerca]           = useState('');
  const [sortField, setSortField]       = useState<SortFieldMargini>('percentuale');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc');
  const [nuovoAperto, setNuovoAperto]   = useState(false);
  const [nuovoSalvando, setNuovoSalvando] = useState(false);
  const [nuovo, setNuovo] = useState({
    codice: '', autista: '', fatturato: '', competenzeAttive: '', extra: '', note: '',
  });
  const inputStatRef = useRef<HTMLInputElement>(null);
  const inputFattRef = useRef<HTMLInputElement>(null);

  const carica = useCallback(async (m: string) => {
    setLoading(true);
    setErrore(null);
    try {
      const res  = await fetch(`${API_BASE}/conta-doppi/margini?mese=${m}`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore nel caricamento dei margini');
      setDati(data);
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
      setDati(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(mese); }, [mese, carica]);

  const handleFileStatistica = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    setImportingStat(true);
    setErrore(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res  = await fetch(`${API_BASE}/conta-doppi/margini/importa?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'importazione');
      await carica(mese);
      if (data.nonRiconosciuti?.length) {
        setErrore(
          `Statistica: importate ${data.righeImportate} righe. ${data.nonRiconosciuti.length} autisti senza codice riconoscibile: ` +
          `${data.nonRiconosciuti.slice(0, 5).join(', ')}${data.nonRiconosciuti.length > 5 ? '…' : ''}`,
        );
      }
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
    } finally {
      setImportingStat(false);
      if (inputStatRef.current) inputStatRef.current.value = '';
    }
  }, [mese, carica]);

  const handleFileFattura = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    setImportingFatt(true);
    setErrore(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res  = await fetch(`${API_BASE}/conta-doppi/margini/importa-fattura?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'importazione');
      await carica(mese);
      if (data.nonRiconosciuti?.length) {
        setErrore(
          `Fattura Proforma: importate ${data.righeImportate} righe. ${data.nonRiconosciuti.length} autisti senza codice riconoscibile: ` +
          `${data.nonRiconosciuti.slice(0, 5).join(', ')}${data.nonRiconosciuti.length > 5 ? '…' : ''}`,
        );
      }
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
    } finally {
      setImportingFatt(false);
      if (inputFattRef.current) inputFattRef.current.value = '';
    }
  }, [mese, carica]);

  // Salvataggio Extra/Note: aggiorna localmente (ricalcolando Differenza/%Margine
  // lato client con la stessa formula del backend) per evitare di ricaricare/riordinare
  // la tabella ad ogni battitura, e salva in background sul server.
  const salvaManuale = useCallback((codice: string, extraStr: string, noteStr: string) => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const extraNum = extraStr.trim() === '' ? null : Number(extraStr.replace(',', '.'));
    const extraVal = extraNum != null && !isNaN(extraNum) ? extraNum : null;
    const noteVal  = noteStr.trim() === '' ? null : noteStr;

    setDati((prev) => {
      if (!prev) return prev;
      const righe = prev.righe.map((r) => {
        if (r.codice !== codice) return r;
        let differenza: number | null = null;
        let percentuale: number | null = null;
        if (r.competenzeAttive != null && (r.fatturato != null || extraVal != null)) {
          const fatturatoConExtra = round2((r.fatturato ?? 0) + (extraVal ?? 0));
          differenza = round2(r.competenzeAttive - fatturatoConExtra);
          percentuale = r.competenzeAttive !== 0 ? round2((differenza / r.competenzeAttive) * 100) : null;
        }
        return { ...r, extra: extraVal, note: noteVal, differenza, percentuale };
      });
      return {
        ...prev,
        righe,
        totaleFatturato:   round2(righe.reduce((s, r) => s + (r.fatturato ?? 0) + (r.extra ?? 0), 0)),
        totaleDifferenza:  round2(righe.reduce((s, r) => s + (r.differenza ?? 0), 0)),
      };
    });

    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ mese, codice, extra: extraVal, note: noteVal }),
    }).catch(() => { /* silenzioso — si risincronizza al prossimo caricamento */ });
  }, [mese]);

  // Esclusione/ripristino codice: cambia il set di righe usato per i totali,
  // quindi ricarica dal server (a differenza di Extra/Note non è un'azione
  // frequente battuta su battuta, quindi non serve l'update ottimistico).
  const esclude = useCallback((codice: string) => {
    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ mese, codice, escluso: true }),
    })
      .then(() => carica(mese))
      .catch(() => setErrore('Errore durante l\'esclusione del codice'));
  }, [mese, carica]);

  const ripristina = useCallback((codice: string) => {
    fetch(`${API_BASE}/conta-doppi/margini/riga`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ mese, codice, escluso: false }),
    })
      .then(() => carica(mese))
      .catch(() => setErrore('Errore durante il ripristino del codice'));
  }, [mese, carica]);

  const aggiungiCodice = useCallback(async () => {
    const codice = nuovo.codice.trim();
    if (!codice) { setErrore('Il codice è obbligatorio'); return; }
    const parseNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    setNuovoSalvando(true);
    setErrore(null);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/margini/riga`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          mese, codice,
          autista: nuovo.autista.trim() || null,
          fatturato: parseNum(nuovo.fatturato),
          competenzeAttive: parseNum(nuovo.competenzeAttive),
          extra: parseNum(nuovo.extra),
          note: nuovo.note.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Errore durante il salvataggio'); }
      await carica(mese);
      setNuovo({ codice: '', autista: '', fatturato: '', competenzeAttive: '', extra: '', note: '' });
      setNuovoAperto(false);
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
    } finally {
      setNuovoSalvando(false);
    }
  }, [mese, nuovo, carica]);

  const esporta = () => {
    if (!dati) return;
    const rows = dati.righe.map((r) => ({
      'Codice': r.codice,
      'Autista': r.autista,
      'Padroncino': r.padroncino ?? '',
      'Fatturato (€)': r.fatturato ?? '',
      'Competenze Attive (€)': r.competenzeAttive ?? '',
      'Extra (€)': r.extra ?? '',
      'Differenza (€)': r.differenza ?? '',
      '% Margine': r.percentuale ?? '',
      'Note': r.note ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Margini');
    XLSX.writeFile(wb, `margini_${mese}.xlsx`);
  };

  const toggleSort = (field: SortFieldMargini) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortTh = (label: string, field: SortFieldMargini, numeric = false) => (
    <th className={`cd-th-sortable ${numeric ? 'cd-th-num' : ''}`} onClick={() => toggleSort(field)}>
      {label}
      {sortField === field && <span className="cd-th-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );

  const testoRicerca = ricerca.trim().toLowerCase();

  const righeVisibili = (dati?.righe ?? [])
    .filter((r) => {
      if (soloProblemi) {
        const problema = (r.fatturato == null && r.extra == null) || r.competenzeAttive == null ||
          (r.percentuale != null && r.percentuale < SOGLIA_MARGINE_MIN);
        if (!problema) return false;
      }
      if (testoRicerca) {
        const haystack = `${r.codice} ${r.autista} ${r.padroncino ?? ''}`.toLowerCase();
        if (!haystack.includes(testoRicerca)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortField];
      const vb = b[sortField];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;  // valori mancanti sempre in fondo
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'it', { sensitivity: 'base' }) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });

  return (
    <div>
      {/* Selettore mese */}
      <div className="cd-mese-bar">
        <label className="cd-mese-label">Mese di riferimento</label>
        <input type="month" className="cd-mese-input" value={mese} onChange={(e) => setMese(e.target.value)} />
        <span className="cd-mese-badge">{meseLabelItaliano(mese)}</span>
      </div>

      {/* Upload — Statistica Margini Dist. + Fattura Proforma, indipendenti tra loro */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="cd-drop-zone" style={{ flex: '1 1 300px' }} onClick={() => inputStatRef.current?.click()}>
          <input ref={inputStatRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFileStatistica(e.target.files?.[0])} />
          <div className="cd-drop-icon">📂</div>
          <p className="cd-drop-main">
            {importingStat ? 'Importazione in corso…' : (
              <>Carica <strong>Statistica Margini Dist.</strong> oppure <span className="cd-drop-link">clicca</span></>
            )}
          </p>
          <p className="cd-drop-hint">
            Colonne richieste: <strong>Autista</strong>, <strong>Competenze Attive</strong>
          </p>
          {dati?.statisticaImportata && dati.statisticaAggiornataAl && (
            <p className="cd-drop-hint cd-drop-hint--info">
              Importata il {new Date(dati.statisticaAggiornataAl).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>

        <div className="cd-drop-zone" style={{ flex: '1 1 300px' }} onClick={() => inputFattRef.current?.click()}>
          <input ref={inputFattRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFileFattura(e.target.files?.[0])} />
          <div className="cd-drop-icon">📂</div>
          <p className="cd-drop-main">
            {importingFatt ? 'Importazione in corso…' : (
              <>Carica <strong>Fattura Proforma</strong> oppure <span className="cd-drop-link">clicca</span></>
            )}
          </p>
          <p className="cd-drop-hint">
            Colonne richieste: <strong>Autista</strong>, <strong>Importo Totale</strong> — lettura diretta per codice,
            indipendente dai conteggi (include anche i codici non associati a un Padroncino).
          </p>
          {dati?.fatturatoImportato && dati.fatturatoAggiornatoAl && (
            <p className="cd-drop-hint cd-drop-hint--info">
              Importata il {new Date(dati.fatturatoAggiornatoAl).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>

      {errore && (
        <div className="cd-error"><span>⚠️</span><span>{errore}</span>
          <button className="cd-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {loading && (
        <div className="cd-loading"><div className="cd-spinner" /><p>Caricamento margini…</p></div>
      )}

      {!loading && dati && (
        <>
          <div className="cd-stats-row">
            <div className="cd-stat">
              <span className="cd-stat-value">
                {eur(dati.totaleFatturato)}
                {dati.totaleCompetenzeAttive !== 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    ({(dati.totaleFatturato / dati.totaleCompetenzeAttive * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                  </span>
                )}
              </span>
              <span className="cd-stat-label">Tot. Fatturato (+ Extra)</span>
            </div>
            <div className="cd-stat cd-stat--primary">
              <span className="cd-stat-value">{eur(dati.totaleCompetenzeAttive)}</span>
              <span className="cd-stat-label">Tot. Competenze Attive</span>
            </div>
            <div className="cd-stat cd-stat--warn">
              <span className="cd-stat-value">
                {eur(dati.totaleDifferenza)}
                {dati.totaleCompetenzeAttive !== 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    ({(dati.totaleDifferenza / dati.totaleCompetenzeAttive * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                  </span>
                )}
              </span>
              <span className="cd-stat-label">Tot. Utile</span>
            </div>
            <div className="cd-stat">
              <span className="cd-stat-value">{dati.righe.length}</span>
              <span className="cd-stat-label">Codici analizzati</span>
            </div>
            <div className="cd-stat cd-stat--primary">
              <span className="cd-stat-value">
                {eur(dati.totaleFatturatoPda)}
                {dati.totaleCompetenzeAttive !== 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    ({((dati.totaleCompetenzeAttive - dati.totaleFatturatoPda) / dati.totaleCompetenzeAttive * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                  </span>
                )}
              </span>
              <span className="cd-stat-label">Fatturato PDA no IVA (Dashboard, padroncini attivi)</span>
            </div>
          </div>

          {!dati.statisticaImportata && (
            <div className="cd-warn-box">
              <strong>⚠️ Nessuna Statistica Margini Dist. importata per {meseLabelItaliano(mese)}</strong> — carica il file a sinistra.
            </div>
          )}
          {!dati.fatturatoImportato && (
            <div className="cd-warn-box">
              <strong>⚠️ Nessuna Fattura Proforma importata per {meseLabelItaliano(mese)}</strong> — carica il file a destra per calcolare il Fatturato per codice.
            </div>
          )}

          {(dati.codiciSoloStatistica.length > 0 || dati.codiciSoloFatturato.length > 0) && (
            <div className="cd-warn-box">
              {dati.codiciSoloStatistica.length > 0 && (
                <div>
                  <strong>⚠️ {dati.codiciSoloStatistica.length} codici senza Fatturato/Extra</strong> —{' '}
                  {dati.codiciSoloStatistica.slice(0, 10).join(', ')}{dati.codiciSoloStatistica.length > 10 ? '…' : ''}
                </div>
              )}
              {dati.codiciSoloFatturato.length > 0 && (
                <div>
                  <strong>⚠️ {dati.codiciSoloFatturato.length} codici senza Competenze Attive</strong> —{' '}
                  {dati.codiciSoloFatturato.slice(0, 10).join(', ')}{dati.codiciSoloFatturato.length > 10 ? '…' : ''}{' '}
                  (assenti dal file Statistica importato)
                </div>
              )}
            </div>
          )}

          <div className="cd-search-bar">
            <input
              type="text" className="cd-mese-input cd-search-input"
              placeholder="🔎 Cerca per codice, autista o padroncino…"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
            />
            {ricerca && (
              <button className="cd-error-close" onClick={() => setRicerca('')} title="Cancella ricerca">✕</button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={soloProblemi} onChange={(e) => setSoloProblemi(e.target.checked)} />
              Mostra solo margini sotto il {SOGLIA_MARGINE_MIN}% o dati mancanti
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="cd-btn-reset" onClick={() => setNuovoAperto((v) => !v)}>
                {nuovoAperto ? '✕ Annulla' : '➕ Aggiungi codice'}
              </button>
              <button className="cd-btn-reset" onClick={esporta}>📥 Esporta Excel</button>
            </div>
          </div>

          {nuovoAperto && (
            <div className="cd-warn-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong>➕ Aggiungi codice manualmente</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input className="cd-mese-input" style={{ width: 110 }} placeholder="Codice *"
                  value={nuovo.codice} onChange={(e) => setNuovo((p) => ({ ...p, codice: e.target.value }))} />
                <input className="cd-mese-input" style={{ width: 200 }} placeholder="Autista / Ragione sociale"
                  value={nuovo.autista} onChange={(e) => setNuovo((p) => ({ ...p, autista: e.target.value }))} />
                <input className="cd-mese-input" style={{ width: 120 }} type="number" step="0.01" placeholder="Fatturato €"
                  value={nuovo.fatturato} onChange={(e) => setNuovo((p) => ({ ...p, fatturato: e.target.value }))} />
                <input className="cd-mese-input" style={{ width: 140 }} type="number" step="0.01" placeholder="Competenze Attive €"
                  value={nuovo.competenzeAttive} onChange={(e) => setNuovo((p) => ({ ...p, competenzeAttive: e.target.value }))} />
                <input className="cd-mese-input" style={{ width: 100 }} type="number" step="0.01" placeholder="Extra €"
                  value={nuovo.extra} onChange={(e) => setNuovo((p) => ({ ...p, extra: e.target.value }))} />
                <input className="cd-mese-input" style={{ width: 200 }} placeholder="Nota"
                  value={nuovo.note} onChange={(e) => setNuovo((p) => ({ ...p, note: e.target.value }))} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Fatturato e Competenze Attive inseriti qui valgono solo se il codice non è già presente negli import
                (Statistica/Fattura Proforma) — l'import "vero" ha sempre la precedenza.
              </div>
              <div>
                <button className="cd-btn-confirm" onClick={aggiungiCodice} disabled={nuovoSalvando}>
                  {nuovoSalvando ? 'Salvataggio…' : '✓ Salva codice'}
                </button>
              </div>
            </div>
          )}

          <div className="cd-table-wrap">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>#</th>
                  {renderSortTh('Codice', 'codice')}
                  {renderSortTh('Autista', 'autista')}
                  {renderSortTh('Padroncino', 'padroncino')}
                  {renderSortTh('Fatturato', 'fatturato', true)}
                  {renderSortTh('Competenze Attive', 'competenzeAttive', true)}
                  {renderSortTh('Extra', 'extra', true)}
                  {renderSortTh('Differenza', 'differenza', true)}
                  {renderSortTh('% Margine', 'percentuale', true)}
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {righeVisibili.map((r, i) => (
                  <RigaMarginiRow key={r.codice} r={r} i={i} onSaveManuale={salvaManuale} onEsclude={esclude} />
                ))}
                {righeVisibili.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Nessun dato da mostrare</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {dati.esclusi.length > 0 && (
            <div className="cd-warn-box" style={{ marginTop: 12 }}>
              <strong>🗑️ {dati.esclusi.length} codici esclusi dal calcolo di questo mese</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {dati.esclusi.map((e) => (
                  <span key={e.codice} className="cd-badge cd-badge--danger" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code className="cd-codice">{e.codice}</code> {e.autista}
                    <button className="cd-error-close" title="Ripristina" onClick={() => ripristina(e.codice)}>↺</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pagina principale ──────────────────────────────────────────────────────────
export default function ContaDoppi() {
  const [pageTab, setPageTab]     = useState<'spedizioni' | 'margini'>('spedizioni');
  const [mese, setMese]           = useState<string>(meseCorrente());
  const [loading, setLoading]     = useState(false);
  const [loadingDB, setLoadingDB] = useState(true);
  const [errore, setErrore]       = useState<string | null>(null);
  const [risultato, setRisultato] = useState<AnalisiResult | null>(null);
  const [analisiInfo, setAnalisiInfo] = useState<{ updatedAt: string } | null>(null);
  const [analisiTab, setAnalisiTab] = useState<'doppie' | 'ingiustificati' | 'forzaMaggiore' | 'controlloZone'>('doppie');
  const [dragging, setDragging]   = useState(false);
  // Tariffe zona lifted da TabControlloZone — chiave = nome zona, valore = stringa input
  const [tariffe, setTariffe]     = useState<Record<string, string>>({});
  const tariffeRef                = useRef<Record<string, string>>({});
  const saveTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // Normalizza un risultato caricato dal DB — aggiunge campi mancanti se l'analisi
  // era stata salvata prima dell'aggiunta di nuove sezioni (forzaMaggiore, controlloZone…)
  const normalizzaRisultato = (r: any): AnalisiResult => ({
    ...r,
    forzaMaggiore: r.forzaMaggiore ?? {
      dettaglio: [], totali: [], codiciNonAssociati: [], codiciEsclusi: [],
      totaleSpedizioni: 0, totaleImporto: 0,
    },
    controlloZone: r.controlloZone ?? {
      zone: [], codiciNonAssociati: [],
      totaleSpedizioniGlobale: 0, totaleImportoGlobale: 0,
    },
  });

  // Helper: legge il JWT da Zustand/localStorage
  // Carica l'ultima analisi (+ tariffe zona) dal DB al mount
  useEffect(() => {
    fetch(`${API_BASE}/conta-doppi/ultima-analisi`, { headers: authHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.risultato) {
          setRisultato(normalizzaRisultato(data.risultato));
          setMese(data.mese);
          setAnalisiInfo({ updatedAt: data.updatedAt });
          // Converti tariffe numeriche dal DB → stringhe per i campi input
          if (data.tariffe && typeof data.tariffe === 'object') {
            const t: Record<string, string> = {};
            for (const [k, v] of Object.entries(data.tariffe as Record<string, number>)) {
              t[k] = String(v);
            }
            setTariffe(t);
            tariffeRef.current = t;
          }
        }
      })
      .catch(() => { /* ignora errori di rete */ })
      .finally(() => setLoadingDB(false));
  }, []);

  // Salvataggio debounced delle tariffe (500 ms dopo l'ultima modifica)
  const handleTariffeChange = useCallback((zona: string, val: string) => {
    setTariffe((prev) => {
      const next = { ...prev, [zona]: val };
      tariffeRef.current = next;
      return next;
    });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const current = tariffeRef.current;
        // Converti stringhe → numeri (salta valori non parsabili)
        const numeric: Record<string, number> = {};
        for (const [k, v] of Object.entries(current)) {
          const n = parseFloat(v.replace(',', '.'));
          if (!isNaN(n) && n > 0) numeric[k] = n;
        }
        const token = getToken();
        await fetch(`${API_BASE}/conta-doppi/salva-tariffe`, {
          method:  'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ mese, tariffe: numeric }),
        });
      } catch { /* silenzioso */ }
    }, 500);
  }, [mese]);

  const analizza = useCallback(async (file: File) => {
    setLoading(true);
    setErrore(null);
    setRisultato(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res  = await fetch(`${API_BASE}/conta-doppi/analizza?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore durante l\'analisi');
      setRisultato(data);
      setAnalisiInfo({ updatedAt: new Date().toISOString() });
      setAnalisiTab('doppie');
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, [mese]);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setErrore('Seleziona un file .xlsx o .xls'); return; }
    analizza(file);
  }, [analizza]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleMeseChange = (m: string) => setMese(m);

  const reset = () => {
    setRisultato(null);
    setAnalisiInfo(null);
    setErrore(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (loadingDB) return (
    <div className="cd-loading" style={{ paddingTop: 80 }}>
      <div className="cd-spinner" />
      <p>Caricamento ultima analisi…</p>
    </div>
  );

  return (
    <div className="cd-page">
      {/* Header */}
      <div className="cd-header">
        <div>
          <h1 className="cd-title">Analisi Spedizioni</h1>
          <p className="cd-subtitle">
            {pageTab === 'spedizioni'
              ? 'Consegne Doppie e Spedizioni Ingiustificate — applica automaticamente ai conteggi mensili'
              : 'Margini per codice autista — Fatturato (dai conteggi) vs Competenze Attive (da import mensile)'}
            {pageTab === 'spedizioni' && analisiInfo && (
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                · ultima analisi:{' '}
                {new Date(analisiInfo.updatedAt).toLocaleString('it-IT', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
          </p>
        </div>
        {pageTab === 'spedizioni' && risultato && <button className="cd-btn-reset" onClick={reset}>↺ Nuova analisi</button>}
      </div>

      {/* Tab a livello di pagina */}
      <div className="cd-analisi-tabs">
        <button
          className={`cd-analisi-tab ${pageTab === 'spedizioni' ? 'cd-analisi-tab--active' : ''}`}
          onClick={() => setPageTab('spedizioni')}
        >
          <span>📦</span><span>Analisi Spedizioni</span>
        </button>
        <button
          className={`cd-analisi-tab ${pageTab === 'margini' ? 'cd-analisi-tab--active' : ''}`}
          onClick={() => setPageTab('margini')}
        >
          <span>💶</span><span>Margini</span>
        </button>
      </div>

      {pageTab === 'margini' && <TabMargini />}

      {pageTab === 'spedizioni' && (
        <>
      {/* Selettore mese */}
      <div className="cd-mese-bar">
        <label className="cd-mese-label">Mese di riferimento</label>
        <input type="month" className="cd-mese-input" value={mese} onChange={(e) => handleMeseChange(e.target.value)} />
        <span className="cd-mese-badge">{meseLabelItaliano(mese)}</span>
      </div>

      {/* Upload */}
      {!risultato && !loading && (
        <div
          className={`cd-drop-zone ${dragging ? 'cd-drop-zone--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="cd-drop-icon">📂</div>
          <p className="cd-drop-main">
            Trascina il file delle spedizioni oppure <span className="cd-drop-link">clicca per selezionarlo</span>
          </p>
          <p className="cd-drop-hint">
            File Excel (.xlsx / .xls) — colonne richieste: <strong>Spedizione</strong>, <strong>Esito</strong>, <strong>Codice Autista</strong>
          </p>
          <p className="cd-drop-hint cd-drop-hint--info">
            Un solo upload genera entrambe le analisi: <strong>Consegne Doppie</strong> e <strong>Ingiustificate</strong>.
            Le trattenute verranno applicate ai conteggi di <strong>{meseLabelItaliano(mese)}</strong>.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="cd-loading"><div className="cd-spinner" /><p>Analisi in corso…</p></div>
      )}

      {/* Errore */}
      {errore && (
        <div className="cd-error">
          <span>⚠️</span><span>{errore}</span>
          <button onClick={() => setErrore(null)} className="cd-error-close">✕</button>
        </div>
      )}

      {/* Risultati */}
      {risultato && (
        <>
          {/* Applica Tutto — sopra i tab */}
          <ApplicaTuttoPanel risultato={risultato} mese={mese} tariffe={tariffe} />

          {/* Tab analisi principali */}
          <div className="cd-analisi-tabs">
            <button
              className={`cd-analisi-tab ${analisiTab === 'doppie' ? 'cd-analisi-tab--active' : ''}`}
              onClick={() => setAnalisiTab('doppie')}
            >
              <span>🔁</span>
              <span>Consegne Doppie</span>
              <span className="cd-analisi-badge cd-analisi-badge--warn">
                {risultato.doppie.totali.reduce((s, r) => s + r.spedDoppieMetà, 0)}
              </span>
            </button>
            <button
              className={`cd-analisi-tab ${analisiTab === 'ingiustificati' ? 'cd-analisi-tab--active cd-analisi-tab--danger' : ''}`}
              onClick={() => setAnalisiTab('ingiustificati')}
            >
              <span>⛔</span>
              <span>Ingiustificate</span>
              <span className="cd-analisi-badge cd-analisi-badge--danger">
                {risultato.ingiustificati.totaleIngiustificati}
              </span>
            </button>
            <button
              className={`cd-analisi-tab ${analisiTab === 'forzaMaggiore' ? 'cd-analisi-tab--active cd-analisi-tab--danger' : ''}`}
              onClick={() => setAnalisiTab('forzaMaggiore')}
            >
              <span>🌩️</span>
              <span>Forza Maggiore / 48-72h</span>
              <span className="cd-analisi-badge cd-analisi-badge--danger">
                {risultato.forzaMaggiore.totaleSpedizioni}
              </span>
            </button>
            <button
              className={`cd-analisi-tab ${analisiTab === 'controlloZone' ? 'cd-analisi-tab--active' : ''}`}
              onClick={() => setAnalisiTab('controlloZone')}
            >
              <span>📍</span>
              <span>Controllo Zone</span>
              <span className="cd-analisi-badge cd-analisi-badge--warn">
                {risultato.controlloZone?.zone?.length ?? 0} zone
              </span>
            </button>
          </div>

          {analisiTab === 'doppie' && (
            <TabDoppie doppie={risultato.doppie} mese={mese} />
          )}
          {analisiTab === 'ingiustificati' && (
            <TabIngiustificati ing={risultato.ingiustificati} mese={mese} />
          )}
          {analisiTab === 'forzaMaggiore' && risultato.forzaMaggiore && (
            <TabForzaMaggiore fm={risultato.forzaMaggiore} mese={mese} />
          )}
          {analisiTab === 'controlloZone' && risultato.controlloZone && (
            <TabControlloZone
              ctrl={risultato.controlloZone}
              mese={mese}
              tariffe={tariffe}
              onTariffeChange={handleTariffeChange}
            />
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}
