// src/features/palmari/Palmari.tsx — API reali, con navigazione dettaglio
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { palmariApi } from '../../lib/api';
import type { Palmare, PalmariStats } from '../../lib/api';
import NuovoPalmareModal, { NuovoPalmare } from './NuovoPalmareModal';
import './Palmari.css';

// ─── HELPERS ──────────────────────────────────────────
const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_META: Record<string, { label: string; cls: string }> = {
  ASSEGNATO:   { label: 'Assegnato',   cls: 'badge-blue' },
  DISPONIBILE: { label: 'Disponibile', cls: 'badge-green' },
  GUASTO:      { label: 'Guasto',      cls: 'badge-red' },
  DISMESSO:    { label: 'Dismesso',    cls: 'badge-gray' },
};

// ─── SORT HEADER ──────────────────────────────────────
type SortDir = 'asc' | 'desc';
function SortTh({
  label, col, sortKey, sortDir, onSort,
}: { label: string; col: string; sortKey: string; sortDir: SortDir; onSort: (c: string) => void }) {
  const active = sortKey === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

// ─── PAGINA ────────────────────────────────────────────
export default function Palmari() {
  const navigate = useNavigate();

  const [palmari, setPalmari] = useState<Palmare[]>([]);
  const [stats, setStats] = useState<PalmariStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ creati: number; saltati: number; errori: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState('codice');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([
        palmariApi.list({ limit: '200' }),
        palmariApi.stats(),
      ]);
      setPalmari(listResp.data);
      setStats(statsResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const list = palmari.filter((p) => {
      const attiva = p.assegnazioni?.find((a) => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        p.codice.toLowerCase().includes(s) ||
        (p.marca ?? '').toLowerCase().includes(s) ||
        (p.modello ?? '').toLowerCase().includes(s) ||
        (p.imei ?? '').includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s);
      const matchStato = filtroStato === 'TUTTI' || p.stato === filtroStato;
      return matchSearch && matchStato;
    });

    list.sort((a, b) => {
      const attA = a.assegnazioni?.find((x) => !x.dataFine);
      const attB = b.assegnazioni?.find((x) => !x.dataFine);
      let va: any, vb: any;
      switch (sortKey) {
        case 'codice':    va = a.codice; vb = b.codice; break;
        case 'stato':     va = a.stato;  vb = b.stato;  break;
        case 'padroncino': va = attA?.ragioneSociale ?? ''; vb = attB?.ragioneSociale ?? ''; break;
        case 'tariffa':   va = a.tariffaMensile ?? -1; vb = b.tariffaMensile ?? -1; break;
        case 'dataAss':   va = attA?.dataInizio ?? ''; vb = attB?.dataInizio ?? ''; break;
        case 'fine':      va = attA?.dataFine ?? ''; vb = attB?.dataFine ?? ''; break;
        default:          va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [palmari, search, filtroStato, sortKey, sortDir]);

  const handleCreate = async (form: NuovoPalmare) => {
    try {
      await palmariApi.create({
        codice: form.codice,
        marca: form.marca || undefined,
        modello: form.modello || undefined,
        imei: form.seriale || undefined,
        simNumero: form.sim || undefined,
        tariffaMensile: form.tariffa ? parseFloat(form.tariffa) : undefined,
        note: form.note || undefined,
      });
      await load();
    } catch (e: any) {
      alert('Errore creazione palmare: ' + e.message);
    }
  };

  const handleImportaExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await palmariApi.importaExcel(file);
      setImportResult(result);
      await load();
    } catch (err: any) {
      alert('Errore importazione: ' + (err.message ?? 'Errore sconosciuto'));
    } finally {
      setImportando(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, codice: string) => {
    if (!confirm(`Eliminare il palmare "${codice}"? L'operazione è irreversibile.`)) return;
    try {
      await palmariApi.delete(id);
      await load();
    } catch (e: any) {
      alert('Errore eliminazione: ' + e.message);
    }
  };

  const STATI_FILTRO = ['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'GUASTO', 'DISMESSO'];

  if (loading) return (
    <div className="palm-page">
      <div className="palm-loading"><div className="palm-spinner" /><span>Caricamento palmari...</span></div>
    </div>
  );
  if (error) return (
    <div className="palm-page">
      <div className="palm-error">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="palm-page">
      {/* ── HEADER ── */}
      <div className="palm-header">
        <h1>Palmari</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImportaExcel}
          />
          <button
            className="btn-outline"
            onClick={() => importInputRef.current?.click()}
            disabled={importando}
          >
            {importando ? '⏳ Importazione...' : '📥 Importa Excel'}
          </button>
          <button className="btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo Palmare</button>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="palm-stats-row">
        <div className="palm-stat-card">
          <div className="palm-stat-icon palm-stat-blue">📱</div>
          <div>
            <div className="palm-stat-val">{stats?.disponibili ?? 0}</div>
            <div className="palm-stat-label">DISPONIBILI</div>
            <div className="palm-stat-sub">pronti</div>
          </div>
        </div>
        <div className="palm-stat-card">
          <div className="palm-stat-icon palm-stat-purple">📱</div>
          <div>
            <div className="palm-stat-val">{stats?.assegnati ?? 0}</div>
            <div className="palm-stat-label">ASSEGNATI</div>
            <div className="palm-stat-sub">in uso</div>
          </div>
        </div>
        <div className="palm-stat-card">
          <div className="palm-stat-icon palm-stat-red">📱</div>
          <div>
            <div className="palm-stat-val">{stats?.guasti ?? 0}</div>
            <div className="palm-stat-label">GUASTI</div>
            <div className="palm-stat-sub">da riparare</div>
          </div>
        </div>
        <div className="palm-stat-card">
          <div>
            <div className="palm-stat-val">{fmtEur(stats?.entrateMensili)}</div>
            <div className="palm-stat-label">ENTRATE MENS.</div>
            <div className="palm-stat-sub">tariffe</div>
          </div>
          <div className="palm-stat-expand">⊞</div>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="palm-toolbar">
        <div className="palm-search-wrap">
          <span>🔍</span>
          <input
            className="palm-search"
            placeholder="Cerca seriale, modello..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="palm-filters">
          {STATI_FILTRO.map((s) => (
            <button
              key={s}
              className={`palm-filter-btn ${filtroStato === s ? 'palm-filter-active' : ''}`}
              onClick={() => setFiltroStato(s)}
            >
              {s === 'TUTTI' ? 'TUTTI' : STATO_META[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABELLA ── */}
      <div className="palm-table-wrap">
        <table className="palm-table">
          <thead>
            <tr>
              <SortTh label="SERIALE / MODELLO" col="codice"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="STATO"              col="stato"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="PADRONCINO"         col="padroncino" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="TARIFFA"            col="tariffa"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="DATA ASSEGNAZIONE"  col="dataAss"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="FINE"               col="fine"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="palm-empty-row">Nessun palmare trovato</td>
              </tr>
            )}
            {filtered.map((p) => {
              const attiva = p.assegnazioni?.find((a) => !a.dataFine);
              const meta = STATO_META[p.stato] || { label: p.stato, cls: 'badge-gray' };
              return (
                <tr key={p.id} className="palm-row">
                  <td>
                    <div className="palm-codice-cell">
                      <span className="palm-codice">{p.codice}</span>
                      {(p.marca || p.modello) && (
                        <span className="palm-modello-sub">
                          {[p.marca, p.modello].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`palm-badge ${meta.cls}`}>{meta.label.toUpperCase()}</span>
                  </td>
                  <td>
                    {attiva ? (
                      <span className="palm-padroncino">{attiva.ragioneSociale}</span>
                    ) : (
                      <span className="palm-empty">—</span>
                    )}
                  </td>
                  <td>
                    {p.tariffaMensile != null ? (
                      <span className="palm-tariffa">{fmtEur(p.tariffaMensile)}</span>
                    ) : (
                      <span className="palm-empty">—</span>
                    )}
                  </td>
                  <td>
                    {attiva ? fmt(attiva.dataInizio) : <span className="palm-empty">—</span>}
                  </td>
                  <td>
                    {attiva?.dataFine ? fmt(attiva.dataFine) : <span className="palm-empty">—</span>}
                  </td>
                  <td>
                  <div className="palm-row-actions">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate(`/palmari/${p.id}`)}
                      >
                        Dettaglio
                      </button>
                      <button className="palm-doc-btn">📄</button>
                      <button
                        className="palm-del-btn"
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.codice); }}
                        title="Elimina palmare"
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="palm-table-footer">
          {filtered.length} di {palmari.length} palmari
        </div>
      </div>

      <NuovoPalmareModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleCreate} />

      {/* ── MODAL RISULTATI IMPORT ── */}
      {importResult && (
        <div className="pd-modal-overlay" onClick={() => setImportResult(null)}>
          <div className="fm-import-result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-import-result-header">
              <h3>📥 Risultati Importazione Excel</h3>
              <button className="pd-modal-close" onClick={() => setImportResult(null)}>✕</button>
            </div>
            <div className="fm-import-result-body">
              <div className="fm-import-stat fm-import-stat-ok">
                <span className="fm-import-stat-val">{importResult.creati}</span>
                <span className="fm-import-stat-label">Palmari creati</span>
              </div>
              <div className="fm-import-stat fm-import-stat-skip">
                <span className="fm-import-stat-val">{importResult.saltati}</span>
                <span className="fm-import-stat-label">Saltati (già esistenti)</span>
              </div>
              <div className="fm-import-stat fm-import-stat-err">
                <span className="fm-import-stat-val">{importResult.errori.length}</span>
                <span className="fm-import-stat-label">Errori</span>
              </div>
            </div>
            {importResult.errori.length > 0 && (
              <div className="fm-import-errors">
                <p className="fm-import-errors-title">Dettaglio errori:</p>
                <ul>
                  {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="fm-import-result-footer">
              <button className="btn-primary btn-sm" onClick={() => setImportResult(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
