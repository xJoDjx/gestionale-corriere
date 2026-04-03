// src/features/conteggi/ConteggiPage.tsx
// Lista padroncini attivi nel mese — dati reali dal backend
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import { conteggiApi } from '../../lib/conteggi.api';
import type { ConteggioMensile } from '../../lib/conteggi.api';
import './ConteggiPage.css';

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

const eur = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

// Checklist locale per padroncino+mese (localStorage)
const CHECKLIST_KEY = (padroncinoId: string, mese: string) =>
  `checklist_${padroncinoId}_${mese}`;

function loadChecklist(padroncinoId: string, mese: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY(padroncinoId, mese));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false };
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="cp-progress-wrap">
      <div className="cp-progress-bar">
        <div className="cp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cp-progress-label">{done}/{total}</span>
    </div>
  );
}

function StatoBadge({ stato }: { stato: string | null }) {
  if (!stato) return <span className="cp-badge cp-badge-gray">Nessuno</span>;
  const map: Record<string, string> = { BOZZA: 'cp-badge-warning', CHIUSO: 'cp-badge-info', CONFERMATO: 'cp-badge-success' };
  const labels: Record<string, string> = { BOZZA: 'Bozza', CHIUSO: 'Chiuso', CONFERMATO: 'Confermato' };
  return <span className={`cp-badge ${map[stato] ?? 'cp-badge-gray'}`}>{labels[stato] ?? stato}</span>;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span className={`cp-check ${done ? 'cp-check-done' : 'cp-check-pending'}`}>
      {done ? '✓' : '○'}
    </span>
  );
}

interface RigaPadroncino {
  padroncino: Padroncino;
  conteggio: ConteggioMensile | null;
  checklist: Record<string, boolean>;
}

export default function ConteggiPage() {
  const navigate = useNavigate();
  const [mese, setMese] = useState(getCurrentMonth);
  const [search, setSearch] = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [righe, setRighe] = useState<RigaPadroncino[]>([]);
  const [generando, setGenerando] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [padResp, conteggiList] = await Promise.all([
        padronciniApi.list({ limit: '200' }),
        conteggiApi.list(mese),
      ]);
      const conteggioMap = new Map<string, ConteggioMensile>(
        conteggiList.map((c: ConteggioMensile) => [c.padroncinoId, c])
      );
      const result: RigaPadroncino[] = padResp.data.map((p: Padroncino) => ({
        padroncino: p,
        conteggio: conteggioMap.get(p.id) ?? null,
        checklist: loadChecklist(p.id, mese),
      }));
      setRighe(result);
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [mese]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGeneraBulk = async () => {
    if (!confirm(`Generare conteggi bulk per ${formatMese(mese)}?`)) return;
    setGenerando(true);
    try {
      await conteggiApi.generaBulk(mese);
      await loadData();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setGenerando(false);
    }
  };

  const filtered = useMemo(() => {
    return righe.filter(({ padroncino: p, conteggio: c }) => {
      const matchSearch = p.ragioneSociale.toLowerCase().includes(search.toLowerCase());
      const stato = c?.stato ?? null;
      const matchStato =
        filtroStato === 'TUTTI' ||
        (filtroStato === 'NESSUNO' && !stato) ||
        stato === filtroStato;
      return matchSearch && matchStato;
    });
  }, [righe, search, filtroStato]);

  const stats = useMemo(() => ({
    tot: righe.length,
    completati: righe.filter((r) => r.checklist.fatturaRicevuta).length,
    inCorso: righe.filter((r) => r.conteggio?.stato === 'BOZZA').length,
    totaleFatturato: righe.reduce((s, r) => s + (r.conteggio?.netto ?? 0), 0),
  }), [righe]);

  const STATI = ['TUTTI', 'BOZZA', 'CHIUSO', 'CONFERMATO', 'NESSUNO'];
  const STATI_LABELS: Record<string, string> = {
    TUTTI: 'Tutti', BOZZA: 'Bozza', CHIUSO: 'Chiuso', CONFERMATO: 'Confermato', NESSUNO: 'Senza conteggio',
  };

  return (
    <div className="cp-page">
      <div className="cp-header">
        <div className="cp-header-left">
          <h1>📋 Conteggi Mensili</h1>
          <span className="cp-mese-label">{formatMese(mese)}</span>
        </div>
        <div className="cp-header-right">
          <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} className="cp-month-input" />
          <button className="btn-primary" onClick={handleGeneraBulk} disabled={generando}>
            {generando ? '⏳ Generando...' : '⚡ Genera Bulk'}
          </button>
        </div>
      </div>

      <div className="cp-stats">
        <div className="cp-stat">
          <span className="cp-stat-label">Padroncini Attivi</span>
          <span className="cp-stat-value">{stats.tot}</span>
          <span className="cp-stat-sub">nel mese</span>
        </div>
        <div className="cp-stat">
          <span className="cp-stat-label">In Lavorazione</span>
          <span className="cp-stat-value cp-warn">{stats.inCorso}</span>
          <span className="cp-stat-sub">bozze aperte</span>
        </div>
        <div className="cp-stat">
          <span className="cp-stat-label">Completati</span>
          <span className="cp-stat-value cp-suc">{stats.completati}</span>
          <span className="cp-stat-sub">fattura ricevuta</span>
        </div>
        <div className="cp-stat">
          <span className="cp-stat-label">Netto Totale Stimato</span>
          <span className="cp-stat-value">{eur(stats.totaleFatturato)}</span>
          <span className="cp-stat-sub">da bonificare</span>
        </div>
      </div>

      <div className="cp-filters">
        <div className="cp-search-wrap">
          <span className="cp-search-icon">🔍</span>
          <input className="cp-search" placeholder="Cerca padroncino..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="cp-tabs">
          {STATI.map((s) => (
            <button key={s} className={`cp-tab ${filtroStato === s ? 'cp-tab-active' : ''}`} onClick={() => setFiltroStato(s)}>
              {STATI_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-table-wrap">
        {loading ? (
          <div className="cp-loading">⏳ Caricamento...</div>
        ) : error ? (
          <div className="cp-error">❌ {error} <button onClick={loadData}>Riprova</button></div>
        ) : (
          <table className="cp-table">
            <thead>
              <tr>
                <th>Padroncino</th>
                <th style={{ width: 120 }}>Stato</th>
                <th style={{ width: 80, textAlign: 'center' }}>Mezzi</th>
                <th style={{ width: 80, textAlign: 'center' }}>Palmari</th>
                <th style={{ width: 130, textAlign: 'center' }}>Distribuzione</th>
                <th style={{ width: 130, textAlign: 'center' }}>PDF Addebiti</th>
                <th style={{ width: 130, textAlign: 'center' }}>Fattura Tu</th>
                <th style={{ width: 130, textAlign: 'center' }}>Fattura Ricevuta</th>
                <th style={{ width: 140, textAlign: 'right' }}>Progresso</th>
                <th style={{ width: 140, textAlign: 'right' }}>Netto Stimato</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="cp-empty-row">Nessun padroncino trovato</td></tr>
              ) : (
                filtered.map(({ padroncino: p, conteggio: c, checklist }) => {
                  const checksDone = Object.values(checklist).filter(Boolean).length;
                  return (
                    <tr key={p.id} className="cp-row" onClick={() => navigate(`/conteggi/${p.id}?mese=${mese}`)}>
                      <td>
                        <div className="cp-padroncino-cell">
                          <span className="cp-padroncino-avatar">{p.ragioneSociale.charAt(0)}</span>
                          <div>
                            <div className="cp-padroncino-name">{p.ragioneSociale}</div>
                            <div className="cp-padroncino-cf">{p.partitaIva}</div>
                          </div>
                        </div>
                      </td>
                      <td><StatoBadge stato={c?.stato ?? null} /></td>
                      <td className="cp-center">
                        <span className="cp-pill cp-pill-purple">{p.mezziAssegnati?.length ?? 0}</span>
                      </td>
                      <td className="cp-center">
                        <span className="cp-pill cp-pill-blue">{p.palmariAssegnati?.length ?? 0}</span>
                      </td>
                      <td className="cp-center"><CheckIcon done={checklist.distribuzioneInviata} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.pdfAddebitiCreato} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.fatturaCreata} /></td>
                      <td className="cp-center"><CheckIcon done={checklist.fatturaRicevuta} /></td>
                      <td className="cp-right"><ProgressBar done={checksDone} total={4} /></td>
                      <td className="cp-right cp-netto">
                        {c?.netto != null ? (
                          <span className={c.netto >= 0 ? 'cp-pos' : 'cp-neg'}>{eur(c.netto)}</span>
                        ) : '—'}
                      </td>
                      <td className="cp-center" onClick={(e) => e.stopPropagation()}>
                        <button className="cp-btn-open" onClick={() => navigate(`/conteggi/${p.id}?mese=${mese}`)}>→</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}