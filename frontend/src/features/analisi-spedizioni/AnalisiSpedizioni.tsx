// src/features/analisi-spedizioni/AnalisiSpedizioni.tsx
//
// Pagina "Analisi Spedizioni" — split dalla vecchia ContaDoppi.tsx (rimossa la
// parte Margini, ora in features/margini/Margini.tsx). Usa GLI STESSI endpoint
// già esistenti (/conta-doppi/analizza, /conta-doppi/applica*, /conta-doppi/ultima-analisi),
// quindi non serve nessuna modifica al backend. Restyle per uniformità con
// Margini.tsx e RicaricheElettriche.tsx (card KPI, header, palette).
import { useState, useEffect, useCallback, useRef } from 'react';
import './AnalisiSpedizioni.css';
import './Analisi2.css';
import { Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, Tabs, Select, Empty, Alert, Icon, C, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const getToken = () => {
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  try { return JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state?.token ?? null; }
  catch { return null; }
};
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

// ── Types (identici alla vecchia ContaDoppi.tsx) ────────────────────────────
interface RigaDoppi { nome: string; codice: string; spedDoppie: number; spedDoppieMetà: number; }
interface TotaleDoppi { nome: string; spedDoppie: number; spedDoppieMetà: number; }
interface ContaDoppiResult {
  dettaglio: RigaDoppi[];
  totali: TotaleDoppi[];
  codiciNonAssociati: string[];
  totaleSpedizioniAnalizzate: number;
  totaleDoppiTrovati: number;
}

interface RigaIngiustificatiDettaglio {
  nome: string; codice: string; tariffaFissa: number | null; tariffaApplicata: number;
  spedIngiustificate: number; importo: number;
}
interface RigaIngiustificatiTotale { nome: string; spedIngiustificate: number; importo: number; }
interface IngiustificatiResult {
  dettaglio: RigaIngiustificatiDettaglio[];
  totali: RigaIngiustificatiTotale[];
  codiciNonAssociati: string[];
  totaleIngiustificati: number;
  totaleImporto: number;
}

interface RigaForzaMaggioreDettaglio { nome: string; codice: string; tariffaFissa: number; spedizioni: number; importo: number; }
interface RigaForzaMaggioreTotale { nome: string; spedizioni: number; importo: number; }
interface ForzaMaggioreResult {
  dettaglio: RigaForzaMaggioreDettaglio[];
  totali: RigaForzaMaggioreTotale[];
  codiciNonAssociati: string[];
  codiciEsclusi: string[];
  totaleSpedizioni: number;
  totaleImporto: number;
}

interface RigaZonaDettaglio { nome: string; codice: string; zonaControllo: string; tariffaFissa: number; spedizioni: number; importo: number; }
interface RigaZonaTotale { nome: string; spedizioni: number; importo: number; }
interface ZonaGruppo {
  zonaControllo: string;
  dettaglio: RigaZonaDettaglio[];
  totali: RigaZonaTotale[];
  totaleSpedizioni: number;
  totaleImporto: number;
}
interface ControlloZoneResult {
  zone: ZonaGruppo[];
  codiciNonAssociati: string[];
  totaleSpedizioniGlobale: number;
  totaleImportoGlobale: number;
}

interface AnalisiResult { doppie: ContaDoppiResult; ingiustificati: IngiustificatiResult; forzaMaggiore: ForzaMaggioreResult; controlloZone: ControlloZoneResult; }

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
function ultimiMesi(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

interface AnalisiMeseRecord { mese: string; risultato: AnalisiResult; tariffe: Record<string, number>; updatedAt: string; }

async function fetchAnalisiMese(mese: string): Promise<AnalisiMeseRecord | null> {
  try {
    const res = await fetch(`${API_BASE}/conta-doppi/analisi?mese=${mese}`, { headers: authHeader() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function normalizzaRisultato(r: any): AnalisiResult {
  return {
    ...r,
    forzaMaggiore: r.forzaMaggiore ?? {
      dettaglio: [], totali: [], codiciNonAssociati: [], codiciEsclusi: [],
      totaleSpedizioni: 0, totaleImporto: 0,
    },
    controlloZone: r.controlloZone ?? {
      zone: [], codiciNonAssociati: [],
      totaleSpedizioniGlobale: 0, totaleImportoGlobale: 0,
    },
  };
}

const AZIONE_LABEL: Record<AzioneApplica, string> = {
  creato: 'Creato', aggiornato: 'Aggiornato',
  saltato_confermato: 'Confermato',
  conteggio_non_trovato: 'Conteggio assente',
  padroncino_non_trovato: 'Padroncino non trovato',
};
const AZIONE_CLASS: Record<AzioneApplica, string> = {
  creato: 'as-az--ok', aggiornato: 'as-az--update',
  saltato_confermato: 'as-az--lock',
  conteggio_non_trovato: 'as-az--warn',
  padroncino_non_trovato: 'as-az--err',
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
    <div className={`as-applica-result ${result.saltati === 0 ? 'as-applica-result--ok' : 'as-applica-result--partial'}`}>
      <div className="as-applica-result-header">
        <div>
          <strong>{result.applicati} conteggi aggiornati{result.saltati > 0 && `, ${result.saltati} saltati`}</strong>
          <span className="as-applica-result-sub"> — {meseLabelItaliano(mese)}</span>
        </div>
        <button className="as-error-close" onClick={() => setResult(null)}>✕</button>
      </div>
      <div className="as-applica-result-rows">
        {result.risultati.map((r, i) => (
          <div key={i} className={`as-ar-row ${AZIONE_CLASS[r.azione]}`}>
            <span className="as-ar-nome">{r.nome}</span>
            <span className="as-ar-importo">−{r.importo}</span>
            <span className="as-ar-azione">{AZIONE_LABEL[r.azione]}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {!show && (
        <div className="as-action-bar">
          <div className="as-action-info">
            
            <div>
              <strong>Applica ai conteggi di {meseLabelItaliano(mese)}</strong>
              <span className="as-action-sub">{descrizione}</span>
            </div>
          </div>
          <button className="as-btn-applica" onClick={() => setShow(true)}>
            Applica ai conteggi
          </button>
        </div>
      )}

      {show && (
        <div className="as-confirm-panel">
          <div className="as-confirm-header"><strong>Conferma applicazione</strong></div>
          <p className="as-confirm-text">
            Aggiungi/aggiorna la voce <strong>"{descrizione}"</strong> nei conteggi di{' '}
            <strong>{meseLabelItaliano(mese)}</strong> per <strong>{voci.length} padroncini</strong>.
            I conteggi già CONFERMATI verranno saltati.
          </p>
          <div className="as-confirm-preview">
            {voci.map((r) => (
              <div key={r.nome} className="as-confirm-row">
                <span className="as-confirm-nome">{r.nome}</span>
                <span className="as-confirm-val">−{r.importo}</span>
              </div>
            ))}
          </div>
          <div className="as-confirm-actions">
            <button className="as-btn-cancel" onClick={() => setShow(false)} disabled={loading}>Annulla</button>
            <button className="as-btn-confirm" onClick={applica} disabled={loading}>
              {loading ? <><span className="as-spinner-sm" /> Applicazione…</> : 'Conferma e applica'}
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
      {doppie.codiciNonAssociati.length > 0 && (
        <div className="as-warn-box">
          <strong>{doppie.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="as-warn-codes">{doppie.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="as-error"><span>{errore}</span>
          <button className="as-error-close" onClick={() => setErrore(null)}>✕</button>
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

      <div className="as-tabs">
        <button className={`as-tab ${tab === 'totali' ? 'as-tab--active' : ''}`} onClick={() => setTab('totali')}>
          Totali per padroncino <span className="as-tab-badge">{doppie.totali.length}</span>
        </button>
        <button className={`as-tab ${tab === 'dettaglio' ? 'as-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
          Dettaglio per codice <span className="as-tab-badge">{doppie.dettaglio.length}</span>
        </button>
      </div>

      {tab === 'totali' && (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead><tr><th>#</th><th>Padroncino</th><th className="as-th-num">Sped. Doppie</th><th className="as-th-num">Sped. Doppie / 2</th></tr></thead>
            <tbody>
              {doppie.totali.map((r, i) => (
                <tr key={r.nome} className={i % 2 === 0 ? 'as-row-even' : ''}>
                  <td className="as-td-num as-td-idx">{i + 1}</td>
                  <td className="as-td-nome">{r.nome}</td>
                  <td className="as-td-num"><span className="as-badge as-badge--warn">{r.spedDoppie}</span></td>
                  <td className="as-td-num"><span className="as-badge as-badge--primary">{r.spedDoppieMetà}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="as-foot">
              <td /><td><strong>TOTALE</strong></td>
              <td className="as-td-num"><strong>{doppie.totali.reduce((s, r) => s + r.spedDoppie, 0)}</strong></td>
              <td className="as-td-num"><strong>{doppie.totali.reduce((s, r) => s + r.spedDoppieMetà, 0)}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'dettaglio' && (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead><tr><th>#</th><th>Padroncino</th><th>Codice</th><th className="as-th-num">Doppie</th><th className="as-th-num">/ 2</th></tr></thead>
            <tbody>
              {doppie.dettaglio.map((r, i) => (
                <tr key={r.codice} className={i % 2 === 0 ? 'as-row-even' : ''}>
                  <td className="as-td-num as-td-idx">{i + 1}</td>
                  <td className="as-td-nome">{r.nome}</td>
                  <td><code className="as-codice">{r.codice}</code></td>
                  <td className="as-td-num"><span className="as-badge as-badge--warn">{r.spedDoppie}</span></td>
                  <td className="as-td-num"><span className="as-badge as-badge--primary">{r.spedDoppieMetà}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="as-foot">
              <td /><td colSpan={2}><strong>TOTALE</strong></td>
              <td className="as-td-num"><strong>{doppie.dettaglio.reduce((s, r) => s + r.spedDoppie, 0)}</strong></td>
              <td className="as-td-num"><strong>{doppie.dettaglio.reduce((s, r) => s + r.spedDoppieMetà, 0)}</strong></td>
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
      {ing.codiciNonAssociati.length > 0 && (
        <div className="as-warn-box">
          <strong>{ing.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="as-warn-codes">{ing.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="as-error"><span>{errore}</span>
          <button className="as-error-close" onClick={() => setErrore(null)}>✕</button>
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

      <div className="as-tabs">
        <button className={`as-tab ${tab === 'totali' ? 'as-tab--active' : ''}`} onClick={() => setTab('totali')}>
          Totali per padroncino <span className="as-tab-badge">{ing.totali.length}</span>
        </button>
        <button className={`as-tab ${tab === 'dettaglio' ? 'as-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
          Dettaglio per codice <span className="as-tab-badge">{ing.dettaglio.length}</span>
        </button>
      </div>

      {tab === 'totali' && (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead><tr><th>#</th><th>Padroncino</th><th className="as-th-num">Ingiustificate</th><th className="as-th-num">Importo</th></tr></thead>
            <tbody>
              {ing.totali.map((r, i) => (
                <tr key={r.nome} className={i % 2 === 0 ? 'as-row-even' : ''}>
                  <td className="as-td-num as-td-idx">{i + 1}</td>
                  <td className="as-td-nome">{r.nome}</td>
                  <td className="as-td-num"><span className="as-badge as-badge--warn">{r.spedIngiustificate}</span></td>
                  <td className="as-td-num"><span className="as-badge as-badge--danger">{eur(r.importo)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="as-foot">
              <td /><td><strong>TOTALE</strong></td>
              <td className="as-td-num"><strong>{ing.totali.reduce((s, r) => s + r.spedIngiustificate, 0)}</strong></td>
              <td className="as-td-num"><strong>{eur(ing.totali.reduce((s, r) => s + r.importo, 0))}</strong></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'dettaglio' && (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead>
              <tr>
                <th>#</th><th>Padroncino</th><th>Codice</th>
                <th className="as-th-num">Tariffa DB</th>
                <th className="as-th-num">Tariffa applicata</th>
                <th className="as-th-num">Ingiustificate</th>
                <th className="as-th-num">Importo</th>
              </tr>
            </thead>
            <tbody>
              {ing.dettaglio.map((r, i) => (
                <tr key={r.codice} className={i % 2 === 0 ? 'as-row-even' : ''}>
                  <td className="as-td-num as-td-idx">{i + 1}</td>
                  <td className="as-td-nome">{r.nome}</td>
                  <td><code className="as-codice">{r.codice}</code></td>
                  <td className="as-td-num as-tariffa-db">
                    {r.tariffaFissa != null ? eur(r.tariffaFissa) : '—'}
                  </td>
                  <td className="as-td-num">
                    <span className={`as-badge ${r.tariffaApplicata === 1 ? 'as-badge--warn' : 'as-badge--primary'}`}>
                      {eur(r.tariffaApplicata)}
                    </span>
                  </td>
                  <td className="as-td-num">{r.spedIngiustificate}</td>
                  <td className="as-td-num"><span className="as-badge as-badge--danger">{eur(r.importo)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="as-foot">
              <td /><td colSpan={4}><strong>TOTALE</strong></td>
              <td className="as-td-num"><strong>{ing.dettaglio.reduce((s, r) => s + r.spedIngiustificate, 0)}</strong></td>
              <td className="as-td-num"><strong>{eur(ing.dettaglio.reduce((s, r) => s + r.importo, 0))}</strong></td>
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
      {fm.codiciNonAssociati.length > 0 && (
        <div className="as-warn-box">
          <strong>{fm.codiciNonAssociati.length} codici senza padroncino</strong> — esclusi:
          <span className="as-warn-codes">{fm.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {fm.codiciEsclusi.length > 0 && (
        <div className="as-warn-box as-warn-box--info">
          <strong>{fm.codiciEsclusi.length} codici esclusi per tariffa &gt; 5 €:</strong>
          <span className="as-warn-codes">{fm.codiciEsclusi.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="as-error"><span>{errore}</span>
          <button className="as-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {fm.totali.length === 0 ? (
        <div className="as-warn-box" style={{ textAlign: 'center', padding: '32px' }}>
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

          <div className="as-tabs">
            <button className={`as-tab ${tab === 'totali' ? 'as-tab--active' : ''}`} onClick={() => setTab('totali')}>
              Totali per padroncino <span className="as-tab-badge">{fm.totali.length}</span>
            </button>
            <button className={`as-tab ${tab === 'dettaglio' ? 'as-tab--active' : ''}`} onClick={() => setTab('dettaglio')}>
              Dettaglio per codice <span className="as-tab-badge">{fm.dettaglio.length}</span>
            </button>
          </div>

          {tab === 'totali' && (
            <div className="as-table-wrap">
              <table className="as-table">
                <thead><tr><th>#</th><th>Padroncino</th><th className="as-th-num">Spedizioni</th><th className="as-th-num">Importo</th></tr></thead>
                <tbody>
                  {fm.totali.map((r, i) => (
                    <tr key={r.nome} className={i % 2 === 0 ? 'as-row-even' : ''}>
                      <td className="as-td-num as-td-idx">{i + 1}</td>
                      <td className="as-td-nome">{r.nome}</td>
                      <td className="as-td-num"><span className="as-badge as-badge--warn">{r.spedizioni}</span></td>
                      <td className="as-td-num"><span className="as-badge as-badge--danger">{eur(r.importo)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="as-foot">
                  <td /><td><strong>TOTALE</strong></td>
                  <td className="as-td-num"><strong>{fm.totali.reduce((s, r) => s + r.spedizioni, 0)}</strong></td>
                  <td className="as-td-num"><strong>{eur(fm.totali.reduce((s, r) => s + r.importo, 0))}</strong></td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {tab === 'dettaglio' && (
            <div className="as-table-wrap">
              <table className="as-table">
                <thead>
                  <tr>
                    <th>#</th><th>Padroncino</th><th>Codice</th>
                    <th className="as-th-num">Tariffa DB</th>
                    <th className="as-th-num">Spedizioni</th>
                    <th className="as-th-num">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {fm.dettaglio.map((r, i) => (
                    <tr key={r.codice} className={i % 2 === 0 ? 'as-row-even' : ''}>
                      <td className="as-td-num as-td-idx">{i + 1}</td>
                      <td className="as-td-nome">{r.nome}</td>
                      <td><code className="as-codice">{r.codice}</code></td>
                      <td className="as-td-num as-tariffa-db">{eur(r.tariffaFissa)}</td>
                      <td className="as-td-num">{r.spedizioni}</td>
                      <td className="as-td-num"><span className="as-badge as-badge--danger">{eur(r.importo)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="as-foot">
                  <td /><td colSpan={3}><strong>TOTALE</strong></td>
                  <td className="as-td-num"><strong>{fm.dettaglio.reduce((s, r) => s + r.spedizioni, 0)}</strong></td>
                  <td className="as-td-num"><strong>{eur(fm.dettaglio.reduce((s, r) => s + r.importo, 0))}</strong></td>
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
    <div className="as-warn-box" style={{ textAlign: 'center', padding: '32px' }}>
      <strong>Nessun codice configurato</strong> — aggiungi il campo <em>Zona Controllo</em> ai codici autista
      interessati (es. "Cosenza", "Rende") dalla pagina <strong>Cod. Autisti</strong>.
    </div>
  );

  const zonaCorrente = ctrl.zone.find((z) => z.zonaControllo === zonaAttiva) ?? ctrl.zone[0];

  const tariffaZonaStr = tariffe[zonaCorrente.zonaControllo] ?? '';
  const tariffaZona    = parseFloat(tariffaZonaStr.replace(',', '.')) || 0;
  const tariffaInserita = tariffaZona > 0;

  const dettaglioCalc = zonaCorrente.dettaglio.map((r) => {
    const diff    = parseFloat((Math.max(0, r.tariffaFissa - tariffaZona)).toFixed(4));
    const importo = Math.round(diff * r.spedizioni * 100) / 100;
    return { ...r, tariffaZona, diff, importoCalc: importo };
  });

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

  const vociApplica = totaliCalc.map((r) => ({
    nome: r.nome, importo: r.importo,
    zonaControllo: zonaCorrente.zonaControllo,
    spedizioni: r.spedizioni,
  }));

  return (
    <div>
      {ctrl.codiciNonAssociati.length > 0 && (
        <div className="as-warn-box">
          <strong>{ctrl.codiciNonAssociati.length} codici senza tariffa</strong> — esclusi:
          <span className="as-warn-codes">{ctrl.codiciNonAssociati.join(', ')}</span>
        </div>
      )}

      {errore && (
        <div className="as-error"><span>{errore}</span>
          <button className="as-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      <div className="as-tabs" style={{ marginBottom: 0 }}>
        {ctrl.zone.map((z) => (
          <button
            key={z.zonaControllo}
            className={`as-tab ${zonaAttiva === z.zonaControllo ? 'as-tab--active' : ''}`}
            onClick={() => { setZonaAttiva(z.zonaControllo); setSubtab('totali'); }}
          >
            {z.zonaControllo}
            <span className="as-tab-badge">{z.totaleSpedizioni} sped.</span>
          </button>
        ))}
      </div>

      <div className="as-zona-panel">

        <div className="as-mese-bar" style={{ marginBottom: 16 }}>
          <label className="as-mese-label">Tariffa Zona {zonaCorrente.zonaControllo}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              step="0.01"
              min="0"
              className="as-mese-input"
              style={{ width: 100, textAlign: 'right' }}
              value={tariffaZonaStr}
              placeholder="0,00"
              onChange={(e) => onTariffeChange(zonaCorrente.zonaControllo, e.target.value)}
            />
            <span className="as-mese-label">€</span>
          </div>
          {tariffaInserita ? (
            <span className="as-mese-badge">
              Differenza media: {eur(
                dettaglioCalc.reduce((s, r) => s + r.diff, 0) / (dettaglioCalc.length || 1)
              )} · Importo totale: {eur(totaleImporto)}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Inserisci la tariffa concordata per la zona per calcolare la differenza
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

        <div className="as-tabs">
          <button className={`as-tab ${subtab === 'totali' ? 'as-tab--active' : ''}`} onClick={() => setSubtab('totali')}>
            Totali per padroncino <span className="as-tab-badge">{totaliCalc.length}</span>
          </button>
          <button className={`as-tab ${subtab === 'dettaglio' ? 'as-tab--active' : ''}`} onClick={() => setSubtab('dettaglio')}>
            Dettaglio per codice <span className="as-tab-badge">{zonaCorrente.dettaglio.length}</span>
          </button>
        </div>

        {subtab === 'totali' && (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>#</th><th>Padroncino</th>
                  <th className="as-th-num">Spedizioni</th>
                  <th className="as-th-num">Importo</th>
                </tr>
              </thead>
              <tbody>
                {(tariffaInserita ? totaliCalc : zonaCorrente.totali).map((r, i) => (
                  <tr key={r.nome} className={i % 2 === 0 ? 'as-row-even' : ''}>
                    <td className="as-td-num as-td-idx">{i + 1}</td>
                    <td className="as-td-nome">{r.nome}</td>
                    <td className="as-td-num"><span className="as-badge as-badge--warn">{r.spedizioni}</span></td>
                    <td className="as-td-num">
                      <span className="as-badge as-badge--danger">{eur(r.importo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="as-foot">
                <td /><td><strong>TOTALE</strong></td>
                <td className="as-td-num"><strong>{totaleSpedizioni}</strong></td>
                <td className="as-td-num"><strong>{tariffaInserita ? eur(totaleImporto) : '—'}</strong></td>
              </tr></tfoot>
            </table>
          </div>
        )}

        {subtab === 'dettaglio' && (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>#</th><th>Padroncino</th><th>Codice</th>
                  <th className="as-th-num">Tariffa DB</th>
                  <th className="as-th-num">Tariffa Zona</th>
                  <th className="as-th-num">Differenza</th>
                  <th className="as-th-num">Spedizioni</th>
                  <th className="as-th-num">Importo</th>
                </tr>
              </thead>
              <tbody>
                {dettaglioCalc.map((r, i) => (
                  <tr key={r.codice} className={i % 2 === 0 ? 'as-row-even' : ''}>
                    <td className="as-td-num as-td-idx">{i + 1}</td>
                    <td className="as-td-nome">{r.nome}</td>
                    <td><code className="as-codice">{r.codice}</code></td>
                    <td className="as-td-num as-tariffa-db">{eur(r.tariffaFissa)}</td>
                    <td className="as-td-num">
                      {tariffaInserita
                        ? <span className="as-badge as-badge--primary">{eur(tariffaZona)}</span>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="as-td-num">
                      {tariffaInserita
                        ? <span className={`as-badge ${r.diff > 0 ? 'as-badge--warn' : ''}`}>{eur(r.diff)}</span>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="as-td-num">{r.spedizioni}</td>
                    <td className="as-td-num">
                      {tariffaInserita
                        ? <span className="as-badge as-badge--danger">{eur(r.importoCalc)}</span>
                        : <span className="as-badge as-badge--danger">{eur(r.importo)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="as-foot">
                <td /><td colSpan={5}><strong>TOTALE</strong></td>
                <td className="as-td-num"><strong>{totaleSpedizioni}</strong></td>
                <td className="as-td-num"><strong>{tariffaInserita ? eur(totaleImporto) : eur(zonaCorrente.dettaglio.reduce((s,r) => s + r.importo, 0))}</strong></td>
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

function ApplicaTuttoPanel({ risultato, mese, tariffe, show, setShow }: ApplicaTuttoPanelProps & { show: boolean; setShow: (v: boolean) => void }) {
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
      { key: 'doppie',         label: 'Consegne doppie',          r: results.doppie },
      { key: 'ingiustificati', label: 'Ingiustificate',            r: results.ingiustificati },
      { key: 'forzaMaggiore',  label: 'Forza maggiore / 48-72h',  r: results.forzaMaggiore },
      { key: 'zone',           label: 'Controllo zone',            r: results.zone },
    ] as const;
    const totApplicati = sez.reduce((s, x) => s + (x.r?.applicati ?? 0), 0);
    const totSaltati   = sez.reduce((s, x) => s + (x.r?.saltati   ?? 0), 0);

    return (
      <div className={`as-applica-result ${totSaltati === 0 ? 'as-applica-result--ok' : 'as-applica-result--partial'}`}
           style={{ marginBottom: 16 }}>
        <div className="as-applica-result-header">
          
          <div>
            <strong>Applica tutto: {totApplicati} righe aggiornate{totSaltati > 0 && `, ${totSaltati} saltate`}</strong>
            <span className="as-applica-result-sub"> — {meseLabelItaliano(mese)}</span>
          </div>
          <button className="as-error-close" onClick={() => setResults(null)}>✕</button>
        </div>
        {sez.map(({ label, r }) => r && (
          <div key={label} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>{label}</div>
            <div className="as-applica-result-rows">
              {r.risultati.map((row, i) => (
                <div key={i} className={`as-ar-row ${AZIONE_CLASS[row.azione]}`}>
                  <span className="as-ar-nome">{row.nome}</span>
                  <span className="as-ar-importo">−{row.importo}</span>
                  <span className="as-ar-azione">{AZIONE_LABEL[row.azione]}</span>
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
        <div className="as-error" style={{ marginBottom: 12 }}>
          <span>{errore}</span>
          <button className="as-error-close" onClick={() => setErrore(null)}>✕</button>
        </div>
      )}

      {show && (
        <div className="as-confirm-panel" style={{ marginBottom: 16 }}>
          <div className="as-confirm-header"><strong>Applica ai conteggi di {meseLabelItaliano(mese)}</strong></div>
          <p className="as-confirm-text">
            Verranno aggiunte/aggiornate <strong>4 voci di trattenuta</strong> nei conteggi di{' '}
            <strong>{meseLabelItaliano(mese)}</strong> per <strong>{totPadroncini} padroncini</strong>.
            I conteggi già CONFERMATI verranno saltati automaticamente.
            {zone.length === 0 && tariffe && Object.keys(tariffe).length > 0 && (
              <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                Nessuna zona calcolabile — inserisci le tariffe zona nel tab Controllo Zone.
              </span>
            )}
          </p>
          <div className="as-confirm-preview">
            {[
              { label: 'Consegne doppie', items: doppie.map((r) => ({ nome: r.nome, importo: r['spedDoppieMetà'] })) },
              { label: 'Ingiustificate',   items: ingiustificati.map((r) => ({ nome: r.nome, importo: r.importo })) },
              { label: 'Forza maggiore',  items: forzaMaggiore.map((r) => ({ nome: r.nome, importo: r.importo })) },
              { label: 'Controllo zone',   items: zone.map((r) => ({ nome: `${r.nome} (${r.zonaControllo})`, importo: r.importo })) },
            ].map(({ label, items }) => items.length > 0 && (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
                {items.map((r) => (
                  <div key={r.nome} className="as-confirm-row">
                    <span className="as-confirm-nome">{r.nome}</span>
                    <span className="as-confirm-val">−{r.importo}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="as-confirm-actions">
            <button className="as-btn-cancel" onClick={() => setShow(false)} disabled={loading}>Annulla</button>
            <button className="as-btn-confirm" onClick={applica} disabled={loading}>
              {loading ? <><span className="as-spinner-sm" /> Applicazione…</> : 'Conferma e applica'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Pagina principale (Dashboard) ──────────────────────────────────────────────
export default function AnalisiSpedizioni() {
  const [mese, setMese] = useState(meseCorrente());
  const [autoMese, setAutoMese] = useState(false);

  const [mesiStats, setMesiStats] = useState<Record<string, AnalisiMeseRecord>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const mesiWindow = ultimiMesi(6);

  const caricaSommari = useCallback(async () => {
    setLoadingStats(true);
    const results = await Promise.all(mesiWindow.map((m) => fetchAnalisiMese(m)));
    const map: Record<string, AnalisiMeseRecord> = {};
    mesiWindow.forEach((m, i) => { if (results[i]) map[m] = results[i]!; });
    setMesiStats(map);
    setLoadingStats(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { caricaSommari(); }, [caricaSommari]);

  const mesiConDati = mesiWindow.filter((m) => mesiStats[m]);
  // All'apertura mostra l'ultimo mese analizzato se il mese corrente non ha dati
  useEffect(() => {
    if (autoMese || loadingStats) return;
    setAutoMese(true);
    if (!mesiStats[mese] && mesiConDati.length) setMese(mesiConDati[0]);
  }, [autoMese, loadingStats, mesiStats, mese, mesiConDati]);


  // ── Aggregati dashboard ──
  const aggMese = (r: AnalisiMeseRecord) => {
    const ris = normalizzaRisultato(r.risultato);
    const doppieMeta = ris.doppie.totali.reduce((s, x) => s + x.spedDoppieMetà, 0);
    const ingiustSped = ris.ingiustificati.totaleIngiustificati;
    const ingiustImp = ris.ingiustificati.totaleImporto;
    const forzaSped = ris.forzaMaggiore.totaleSpedizioni;
    const forzaImp = ris.forzaMaggiore.totaleImporto;
    const zoneCount = ris.controlloZone.zone.length;
    const trattenute = doppieMeta + ingiustImp + forzaImp;
    return { doppieMeta, ingiustSped, ingiustImp, forzaSped, forzaImp, zoneCount, trattenute, spedAnalizzate: ris.doppie.totaleSpedizioniAnalizzate };
  };

  const totSpedizioni = mesiConDati.reduce((a, m) => a + aggMese(mesiStats[m]).spedAnalizzate, 0);
  const totDoppie     = mesiConDati.reduce((a, m) => a + aggMese(mesiStats[m]).doppieMeta, 0);
  const totIngiust    = mesiConDati.reduce((a, m) => a + aggMese(mesiStats[m]).ingiustSped, 0);
  const totForza      = mesiConDati.reduce((a, m) => a + aggMese(mesiStats[m]).forzaSped, 0);
  const totTrattenute = mesiConDati.reduce((a, m) => a + aggMese(mesiStats[m]).trattenute, 0);

  const storico = mesiConDati.map((m) => ({ mese: m, updatedAt: mesiStats[m].updatedAt, ...aggMese(mesiStats[m]) }));

  return (
    <AnalisiSpedizioniDetail
      mese={mese}
      onMeseChange={setMese}
      storico={storico}
      loadingStorico={loadingStats}
      onChanged={caricaSommari}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Vista di dettaglio — logica identica alla vecchia ContaDoppi, restyled.
interface VoceStorico { mese: string; updatedAt: string; doppieMeta: number; ingiustSped: number; ingiustImp: number; forzaSped: number; forzaImp: number; zoneCount: number; trattenute: number; spedAnalizzate: number }
function AnalisiSpedizioniDetail({ mese, onMeseChange, storico, loadingStorico, onChanged }: { mese: string; onMeseChange: (m: string) => void; storico: VoceStorico[]; loadingStorico: boolean; onChanged: () => void }) {
  const onBack = onChanged;
  const [showApplica, setShowApplica] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [loadingDB, setLoadingDB] = useState(true);
  const [errore, setErrore]       = useState<string | null>(null);
  const [risultato, setRisultato] = useState<AnalisiResult | null>(null);
  const [analisiInfo, setAnalisiInfo] = useState<{ updatedAt: string } | null>(null);
  const [analisiTab, setAnalisiTab] = useState<'doppie' | 'ingiustificati' | 'forzaMaggiore' | 'controlloZone'>('doppie');
  const [dragging, setDragging]   = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tariffe, setTariffe]     = useState<Record<string, string>>({});
  const tariffeRef                = useRef<Record<string, string>>({});
  const saveTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  const carica = useCallback(async (m: string) => {
    setLoadingDB(true);
    const rec = await fetchAnalisiMese(m);
    if (rec) {
      setRisultato(normalizzaRisultato(rec.risultato));
      setAnalisiInfo({ updatedAt: rec.updatedAt });
      const t: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec.tariffe ?? {})) t[k] = String(v);
      setTariffe(t);
      tariffeRef.current = t;
      setShowImport(false);
    } else {
      setRisultato(null);
      setAnalisiInfo(null);
      setTariffe({});
      tariffeRef.current = {};
      setShowImport(true);
    }
    setLoadingDB(false);
  }, []);

  useEffect(() => { carica(mese); }, [mese, carica]);

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
        const numeric: Record<string, number> = {};
        for (const [k, v] of Object.entries(current)) {
          const n = parseFloat(v.replace(',', '.'));
          if (!isNaN(n) && n > 0) numeric[k] = n;
        }
        await fetch(`${API_BASE}/conta-doppi/salva-tariffe`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ mese, tariffe: numeric }),
        });
      } catch { /* silenzioso */ }
    }, 500);
  }, [mese]);

  const analizza = useCallback(async (file: File) => {
    setLoading(true);
    setErrore(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/analizza?mese=${mese}`, { method: 'POST', headers: authHeader(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore durante l'analisi");
      setRisultato(normalizzaRisultato(data));
      setAnalisiInfo({ updatedAt: new Date().toISOString() });
      setAnalisiTab('doppie');
      setShowImport(false);
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

  const eliminaAnalisi = useCallback(async () => {
    setDeleting(true);
    setErrore(null);
    try {
      const res = await fetch(`${API_BASE}/conta-doppi/analisi?mese=${mese}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Errore durante l'eliminazione");
      setShowDeleteConfirm(false);
      onBack();
    } catch (e: any) {
      setErrore(e.message || 'Errore sconosciuto');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }, [mese, onBack]);

  const totDoppie      = risultato?.doppie.totali.reduce((s, r) => s + r.spedDoppie, 0) ?? 0;
  const totDoppieMetà = risultato?.doppie.totali.reduce((s, r) => s + r.spedDoppieMetà, 0) ?? 0;
  const totIngiustSped = risultato?.ingiustificati.totaleIngiustificati ?? 0;
  const totForzaSped   = risultato?.forzaMaggiore.totaleSpedizioni ?? 0;
  const totZone        = risultato?.controlloZone?.zone?.length ?? 0;
  // Solo visualizzazione: trattenute per padroncino come verranno applicate (doppie = metà, 1 € l'una)
  const zonePay = risultato ? calcolaZonePayload(risultato.controlloZone, tariffe) : [];
  const zoneImp = zonePay.reduce((s, r) => s + r.importo, 0);
  const perPad = (() => {
    if (!risultato) return [];
    const m = new Map<string, [number, number, number, number]>();
    const add = (n: string, i: number, v: number) => { const e = m.get(n) ?? [0, 0, 0, 0]; e[i] += v; m.set(n, e); };
    risultato.doppie.totali.forEach((r) => add(r.nome, 0, r.spedDoppieMetà));
    risultato.ingiustificati.totali.forEach((r) => add(r.nome, 1, r.importo));
    risultato.forzaMaggiore.totali.forEach((r) => add(r.nome, 2, r.importo));
    zonePay.forEach((r) => add(r.nome, 3, r.importo));
    return [...m.entries()].map(([n, v]) => ({ n, v, tot: v[0] + v[1] + v[2] + v[3] })).sort((x, y) => y.tot - x.tot);
  })();
  const maxPad = Math.max(1, ...perPad.map((p) => p.tot));
  const logScale = maxPad > 5000;
  const scala = (x: number) => (logScale ? Math.log10(x + 1) / Math.log10(maxPad + 1) : x / maxPad) * 100;
  const SERIE = [['Doppie', C.blue], ['Ingiustificate', C.red], ['Forza maggiore', C.purple], ['Zone', C.orange]] as const;
  const mesiOpts = Array.from(new Set([...ultimiMesi(12), ...storico.map((x) => x.mese), mese])).sort().reverse();
  const meseNome = meseLabelItaliano(mese);
  const TAB_ITEMS = risultato ? [
    { value: 'doppie' as const, label: 'Consegne doppie', count: totDoppieMetà },
    { value: 'ingiustificati' as const, label: 'Ingiustificate', count: totIngiustSped },
    { value: 'forzaMaggiore' as const, label: 'Forza maggiore / 48-72h', count: totForzaSped },
    { value: 'controlloZone' as const, label: 'Controllo zone', count: `${totZone} zone` },
  ] : [];

  return (
    <Page>
      <PageHeader
        eyebrow="Analisi"
        title="Analisi spedizioni"
        sub="Anomalie di consegna del mese da trattenere nei conteggi dei padroncini"
        actions={<>
          <Select label="Analisi" value={mese} onChange={onMeseChange}
            options={mesiOpts.map((m) => ({ value: m, label: `${meseLabelItaliano(m)}${storico.some((x) => x.mese === m) ? '' : ' · vuoto'}` }))} />
          <Button icon="upload" onClick={() => setShowImport((v) => !v)}>{showImport ? 'Chiudi' : 'Nuova analisi'}</Button>
          {risultato && <Button icon="check" variant="primary" onClick={() => setShowApplica(true)}>Applica ai conteggi di {meseNome.split(' ')[0].toLowerCase()}</Button>}
          {risultato && <Button icon="trash" variant="danger" onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>Elimina analisi</Button>}
        </>}
      />

      {showDeleteConfirm && (
        <Alert tone="ko" title={`Eliminare l'analisi di ${meseNome}?`}
          actions={<>
            <Button size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Annulla</Button>
            <Button size="sm" variant="danger" onClick={eliminaAnalisi} disabled={deleting}>{deleting ? 'Eliminazione…' : 'Conferma eliminazione'}</Button>
          </>}>
          L'analisi verrà eliminata definitivamente. Le trattenute già applicate ai conteggi non verranno rimosse automaticamente.
        </Alert>
      )}

      {loadingDB ? <Card pad><Empty>Caricamento {meseNome.toLowerCase()}…</Empty></Card> : (<>
        {risultato && (
          <Kpis items={[
            { label: 'Consegne doppie', value: fmtNum2(totDoppie), color: C.blue, icon: 'swap',
              sub: `Trattenuta metà: ${fmtEur2(totDoppieMetà)} · ${fmtNum2(risultato.doppie.totaleSpedizioniAnalizzate)} spedizioni lette` },
            { label: 'Ingiustificate', value: fmtEur2(risultato.ingiustificati.totaleImporto), color: C.red, icon: 'close',
              sub: `${fmtNum2(totIngiustSped)} spedizioni` },
            { label: 'Forza maggiore 48-72h', value: fmtEur2(risultato.forzaMaggiore.totaleImporto), color: C.purple, icon: 'warn',
              sub: `${fmtNum2(totForzaSped)} spedizioni${risultato.forzaMaggiore.codiciEsclusi?.length ? ` · ${risultato.forzaMaggiore.codiciEsclusi.length} codici a tariffa giornaliera esclusi` : ''}` },
            { label: 'Controllo zone', value: fmtEur2(zoneImp), color: C.orange, icon: 'pin',
              sub: `${fmtNum2(risultato.controlloZone?.totaleSpedizioniGlobale ?? 0)} spedizioni · ${totZone} zone` },
          ]} />
        )}

        {showImport && (
          <Card pad>
            <div className={`an2-drop${dragging ? ' is-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
              <Icon name="upload" size={20} />
              <span style={{ fontWeight: 600 }}>{risultato ? `Sostituisci i dati di ${meseNome.toLowerCase()}` : 'Trascina il file delle spedizioni'} oppure clicca per sceglierlo</span>
              <span className="ds-cardsub">File Excel (.xlsx / .xls) con le colonne Spedizione, Esito e Codice Autista. Un solo file genera le quattro analisi.</span>
            </div>
          </Card>
        )}

        {loading && <Card pad><Empty>Analisi in corso…</Empty></Card>}
        {errore && <Alert tone="ko" title="Errore" actions={<IconButton icon="close" label="Chiudi" onClick={() => setErrore(null)} />}>{errore}</Alert>}

        <div className="ds-g4">
          <Card pad className="ds-s2">
            <CardHead title="Trattenute per padroncino" sub="Somma delle quattro analisi che verranno inserite come addebito" />
            {perPad.length === 0 ? <Empty>{risultato ? 'Nessuna trattenuta' : 'Nessuna analisi per questo mese'}</Empty> : (<>
              <div className="an2-legend">{SERIE.map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}{logScale && <span className="ds-cardsub">scala logaritmica</span>}</div>
              <div className="an2-rip">
                {perPad.map((p) => (
                  <div key={p.n} className="an2-riprow" title={`Doppie ${fmtEur2(p.v[0])} · ingiustificate ${fmtEur2(p.v[1])} · forza maggiore ${fmtEur2(p.v[2])} · zone ${fmtEur2(p.v[3])}`}>
                    <span className="an2-ripn">{p.n}</span>
                    <span className="an2-ripbar" style={{ width: `${Math.max(2, scala(p.tot))}%` }}>
                      {p.v.map((x, i) => x > 0 ? <i key={i} style={{ flexGrow: x, background: SERIE[i][1] }} /> : null)}
                    </span>
                    <span className="an2-ripv">{fmtEur2(p.tot)}</span>
                  </div>
                ))}
              </div>
            </>)}
          </Card>
          <Card pad>
            <CardHead title="Tariffe per zona" sub="Usate dal controllo zone" />
            {!risultato || totZone === 0 ? <Empty>Nessuna zona di controllo</Empty> : (
              <div className="an2-tariffe">
                {risultato.controlloZone.zone.map((z) => {
                  const v = tariffe[z.zonaControllo] ?? '';
                  const n = parseFloat(v.replace(',', '.'));
                  return (
                    <div key={z.zonaControllo}>
                      <label className="an2-tz">
                        <span>{z.zonaControllo}<em>{fmtNum2(z.totaleSpedizioni)} sped.</em></span>
                        <span className={`an2-tzin${n > 5 ? ' is-warn' : ''}`}>€<input inputMode="decimal" value={v} onChange={(e) => handleTariffeChange(z.zonaControllo, e.target.value)} /></span>
                      </label>
                      {n > 5 && <span className="an2-warn">{z.zonaControllo} a {fmtEur2(n)} sembra una tariffa giornaliera</span>}
                    </div>
                  );
                })}
                <span className="ds-cardsub">Le tariffe si salvano da sole mentre scrivi.</span>
              </div>
            )}
          </Card>
          <Card pad>
            <CardHead title="Storico analisi" sub="Una per mese, si può riaprire o eliminare" />
            {loadingStorico ? <Empty>Caricamento…</Empty> : storico.length === 0 ? <Empty>Nessuna analisi salvata</Empty> : (
              <div className="an2-storico">
                {storico.map((x) => (
                  <div key={x.mese} className={`an2-st${x.mese === mese ? ' is-on' : ''}`}>
                    <i style={{ background: x.mese === mese ? C.blue : '#D4D4D8' }} />
                    <button type="button" onClick={() => onMeseChange(x.mese)}>{meseLabelItaliano(x.mese)}</button>
                    <span className="ds-cardsub">{fmtNum2(x.doppieMeta)} doppie · {fmtEur2(x.trattenute)}</span>
                    <IconButton icon="trash" label={`Elimina analisi di ${meseLabelItaliano(x.mese)}`} danger onClick={() => { onMeseChange(x.mese); setShowDeleteConfirm(true); }} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {risultato && !loading && (
          <div className="an2">
            <ApplicaTuttoPanel risultato={risultato} mese={mese} tariffe={tariffe} show={showApplica} setShow={setShowApplica} />
            <Card>
              <div style={{ padding: '6px 18px 0' }}>
                <Tabs items={TAB_ITEMS} value={analisiTab} onChange={setAnalisiTab} label="Analisi" />
              </div>
              <div className="an2-body">
                {analisiTab === 'doppie' && <TabDoppie doppie={risultato.doppie} mese={mese} />}
                {analisiTab === 'ingiustificati' && <TabIngiustificati ing={risultato.ingiustificati} mese={mese} />}
                {analisiTab === 'forzaMaggiore' && risultato.forzaMaggiore && <TabForzaMaggiore fm={risultato.forzaMaggiore} mese={mese} />}
                {analisiTab === 'controlloZone' && risultato.controlloZone && (
                  <TabControlloZone ctrl={risultato.controlloZone} mese={mese} tariffe={tariffe} onTariffeChange={handleTariffeChange} />
                )}
              </div>
            </Card>
          </div>
        )}

        {!risultato && !loading && !showImport && (
          <Card pad><Empty>Nessuna analisi per {meseNome.toLowerCase()}. Usa "Nuova analisi" per caricare il file delle spedizioni.</Empty></Card>
        )}
        {analisiInfo && risultato && (
          <span className="ds-cardsub">Ultima analisi di {meseNome.toLowerCase()}: {new Date(analisiInfo.updatedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </>)}
    </Page>
  );
}
