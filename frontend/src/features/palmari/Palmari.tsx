// src/features/palmari/Palmari.tsx — API reali, con navigazione dettaglio
import { useState, useEffect, useMemo, useCallback } from 'react';
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
    return palmari.filter((p) => {
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
  }, [palmari, search, filtroStato]);

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
        <button className="btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo Palmare</button>
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
              <th>SERIALE / MODELLO ↕</th>
              <th>STATO</th>
              <th>PADRONCINO ↕</th>
              <th>TARIFFA</th>
              <th>DATA ASSEGNAZIONE</th>
              <th>FINE</th>
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
    </div>
  );
}
