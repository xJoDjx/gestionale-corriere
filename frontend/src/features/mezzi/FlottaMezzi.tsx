// src/features/mezzi/FlottaMezzi.tsx — API reali, dettaglio mezzo con routing
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { mezziApi, padronciniApi } from '../../lib/api';
import type { Mezzo, MezziStats, Padroncino } from '../../lib/api';
import NuovoMezzoModal from './NuovoMezzoModal';
import type { NuovoMezzo } from './NuovoMezzoModal';
import './FlottaMezzi.css';

// ─── HELPERS ──────────────────────────────────────────
const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const scadenzaLabel = (d: string | null | undefined) => {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0) return { label: `${Math.abs(diff)}gg fa`, cls: 'scad-expired', icon: '⚠️' };
  if (diff <= 30) return { label: `${diff}gg`, cls: 'scad-warning', icon: '⚠️' };
  return { label: `${diff}gg`, cls: 'scad-ok', icon: '✅' };
};

const kmPercent = (km: number | null, limite: number | null) => {
  if (!km || !limite) return 0;
  return Math.min(100, Math.round((km / limite) * 100));
};

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

const STATO_COLORS: Record<string, string> = {
  ASSEGNATO: 'badge-blue',
  DISPONIBILE: 'badge-green',
  IN_REVISIONE: 'badge-yellow',
  FUORI_SERVIZIO: 'badge-red',
  VENDUTO: 'badge-gray',
  DISMESSO: 'badge-gray',
};

const CAT_COLORS: Record<string, string> = {
  DISTRIBUZIONE: 'tag-blue',
  AUTO_AZIENDALE: 'tag-purple',
};

// ─── COMPONENTE PRINCIPALE ────────────────────────────
export default function FlottaMezzi() {
  const navigate = useNavigate();

  const [mezzi, setMezzi] = useState<Mezzo[]>([]);
  const [stats, setStats] = useState<MezziStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [filtroCategoria, setFiltroCategoria] = useState('TUTTI');
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ creati: number; saltati: number; errori: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch dati ─────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([
        mezziApi.list({ limit: '200' }),
        mezziApi.stats(),
      ]);
      setMezzi(listResp.data);
      setStats(statsResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleImportaExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await mezziApi.importaExcel(file);
      setImportResult(result);
      await loadData();
    } catch (err: any) {
      alert('Errore importazione: ' + (err.message ?? 'Errore sconosciuto'));
    } finally {
      setImportando(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  // ─── Filtri ──────────────────────────────────────────
  const STATI = ['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'IN_REVISIONE', 'FUORI_SERVIZIO', 'VENDUTO'];
  const CATEGORIE = ['TUTTI', 'DISTRIB.', 'AUTO AZ.'];

  const filtered = useMemo(() => {
    return mezzi.filter((m) => {
      const s = search.toLowerCase();
      const matchSearch =
        m.targa.toLowerCase().includes(s) ||
        m.marca.toLowerCase().includes(s) ||
        m.modello.toLowerCase().includes(s) ||
        (m.assegnazioni?.[0]?.padroncino.ragioneSociale ?? '').toLowerCase().includes(s);
      const matchStato =
        filtroStato === 'TUTTI' || m.stato.toUpperCase() === filtroStato.replace(' ', '_');
      const matchCat =
        filtroCategoria === 'TUTTI' ||
        (filtroCategoria === 'DISTRIB.' && m.categoria?.toLowerCase().includes('distrib')) ||
        (filtroCategoria === 'AUTO AZ.' && m.categoria?.toLowerCase().includes('auto'));
      return matchSearch && matchStato && matchCat;
    });
  }, [mezzi, search, filtroStato, filtroCategoria]);

  // ─── Conteggio scadenze ──────────────────────────────
  const scadenzeCount = useMemo(
    () => mezzi.filter((m) => {
      const d1 = daysDiff(m.scadenzaAssicurazione);
      const d2 = daysDiff(m.scadenzaRevisione);
      return (d1 !== null && d1 <= 30) || (d2 !== null && d2 <= 30);
    }).length,
    [mezzi]
  );

  // ─── Crea mezzo ─────────────────────────────────────
  const handleCreate = async (form: NuovoMezzo) => {
    try {
      await mezziApi.create({
        targa: form.targa.toUpperCase(),
        marca: form.marca,
        modello: form.modello,
        tipo: form.tipo,
        alimentazione: form.alimentazione,
        categoria: form.categoria,
        kmAttuali: form.kmAttuali ? parseInt(form.kmAttuali) : undefined,
        kmAttualiAl: form.kmAttualiAl || undefined,
        kmLimite: form.kmLimite ? parseInt(form.kmLimite) : undefined,
        rataNoleggio: form.rataNoleggio ? parseFloat(form.rataNoleggio) : undefined,
        canoneNoleggio: form.canoneNoleggio ? parseFloat(form.canoneNoleggio) : undefined,
        scadenzaAssicurazione: form.scadenzaAssicurazione || undefined,
        scadenzaRevisione: form.scadenzaRevisione || undefined,
        scadenzaBollo: form.scadenzaBollo || undefined,
        proprietario: form.societaNoleggio || undefined,
        inizioNoleggio: form.inizioNoleggio || undefined,
        fineNoleggio: form.fineNoleggio || undefined,
        note: form.note || undefined,
      });
      await loadData();
    } catch (e: any) {
      alert('Errore creazione mezzo: ' + e.message);
    }
  };

  const handleDelete = async (id: string, targa: string) => {
    if (!confirm(`Eliminare il mezzo "${targa}"? L'operazione è irreversibile.`)) return;
    try {
      await mezziApi.delete(id);
      await loadData();
    } catch (e: any) {
      alert('Errore eliminazione: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div className="fm-page">
        <div className="fm-loading">
          <div className="fm-spinner" />
          <span>Caricamento flotta...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fm-page">
        <div className="fm-error">
          <span>⚠️ {error}</span>
          <button className="btn-primary" onClick={loadData}>Riprova</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fm-page">
      {/* ── HEADER ── */}
      <div className="fm-header">
        <h1>Flotta Mezzi</h1>
        <div className="fm-header-actions">
          {scadenzeCount > 0 && (
            <span className="fm-durc-badge">
              ⚠️ {scadenzeCount} mezzo/i con scadenze entro 30 giorni
            </span>
          )}
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="fm-stats-row">
        <div className="fm-stat-card">
          <div className="fm-stat-icon">🚚</div>
          <div>
            <div className="fm-stat-val">{stats?.totali ?? mezzi.length}</div>
            <div className="fm-stat-label">TOTALI</div>
            <div className="fm-stat-sub">{stats?.assegnati ?? 0} assegnati</div>
          </div>
        </div>
        <div className="fm-stat-card">
          <div className="fm-stat-icon fm-stat-icon-green">🚚</div>
          <div>
            <div className="fm-stat-val">{stats?.disponibili ?? 0}</div>
            <div className="fm-stat-label">DISPONIBILI</div>
            <div className="fm-stat-sub">pronti</div>
          </div>
        </div>
        <div className="fm-stat-card">
          <div>
            <div className="fm-stat-val">{fmtEur(stats?.entrateNoleggio ?? null)}</div>
            <div className="fm-stat-label">ENTRATE NOLEGGIO</div>
            <div className="fm-stat-sub">mensile</div>
          </div>
          <div className="fm-stat-expand">⊞</div>
        </div>
        <div className="fm-stat-card">
          <div>
            <div className={`fm-stat-val ${(stats?.margine ?? 0) < 0 ? 'fm-stat-negative' : ''}`}>
              {fmtEur(stats?.margine ?? null)}
            </div>
            <div className="fm-stat-label">MARGINE</div>
            <div className="fm-stat-sub">rata – canone</div>
          </div>
          <div className="fm-stat-expand">⊞</div>
        </div>
      </div>

      {/* ── ALERT SCADENZE ── */}
      {scadenzeCount > 0 && (
        <div className="fm-alert-banner">
          ⚠️ {scadenzeCount} mezzo/i con scadenze entro 30 giorni
        </div>
      )}

      {/* ── TOOLBAR ── */}
      <div className="fm-toolbar">
        <div className="fm-search-wrap">
          <span className="fm-search-icon">🔍</span>
          <input
            className="fm-search"
            placeholder="Cerca targa, marca, modello, padroncino..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="fm-filters">
          {STATI.map((s) => (
            <button
              key={s}
              className={`fm-filter-btn ${filtroStato === s ? 'fm-filter-active' : ''}`}
              onClick={() => setFiltroStato(s)}
            >
              {s === 'TUTTI' ? 'TUTTI' : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="fm-cat-filters">
          <button
            className={`fm-cat-btn fm-cat-all ${filtroCategoria === 'TUTTI' ? 'fm-cat-active' : ''}`}
            onClick={() => setFiltroCategoria('TUTTI')}
          >TUTTI</button>
          <button
            className={`fm-cat-btn fm-cat-distrib ${filtroCategoria === 'DISTRIB.' ? 'fm-cat-active' : ''}`}
            onClick={() => setFiltroCategoria('DISTRIB.')}
          >🚛 DISTRIB.</button>
          <button
            className={`fm-cat-btn fm-cat-auto ${filtroCategoria === 'AUTO AZ.' ? 'fm-cat-active' : ''}`}
            onClick={() => setFiltroCategoria('AUTO AZ.')}
          >🚗 AUTO AZ.</button>
        </div>

        <div className="fm-actions">
          <button className="btn-primary" onClick={() => setNuovoOpen(true)}>
            + Distribuzione
          </button>
          <button className="btn-outline" onClick={() => {}}>
            + Auto Aziendale
          </button>
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
        </div>
      </div>

      {/* ── TABELLA ── */}
      <div className="fm-table-wrap">
        <table className="fm-table">
          <thead>
            <tr>
              <th>TARGA ↕</th>
              <th>MARCA/MODELLO ↕</th>
              <th>TIPO</th>
              <th>STATO</th>
              <th>PADRONCINO</th>
              <th>SCAD. ASS.</th>
              <th>SCAD. REV.</th>
              <th>RATA</th>
              <th>KM ATTUALI</th>
              <th>UTILIZZO KM</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="fm-empty-row">Nessun mezzo trovato</td>
              </tr>
            )}
            {filtered.map((m) => {
              const padroncino = m.assegnazioni?.find((a) => !a.dataFine)?.padroncino;
              const assicInfo = scadenzaLabel(m.scadenzaAssicurazione);
              const revInfo = scadenzaLabel(m.scadenzaRevisione);
              const kmPct = kmPercent(m.kmAttuali, m.kmLimite);
              const kmColor = kmPct >= 90 ? 'km-bar-red' : kmPct >= 70 ? 'km-bar-orange' : kmPct >= 40 ? 'km-bar-yellow' : 'km-bar-green';
               const categoryKey = (m.categoria || '').toUpperCase();
              return (
                <tr key={m.id} className="fm-row">
                  <td>
                    <div className="fm-targa-cell">
                      <span className="fm-targa">{m.targa}</span>
                      {m.categoria && (
                        <span className={`fm-cat-tag ${CAT_COLORS[categoryKey] || 'tag-gray'}`}>
                          {m.categoria.startsWith('DISTRIB') ? '🚛 DISTRIB.' : '🚗 AUTO AZ.'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="fm-marca-cell">
                      <span className="fm-marca">{m.marca}</span>
                      <span className="fm-modello-tag"> {m.modello}</span>
                      <span className="fm-alim"> · {m.alimentazione}</span>
                    </div>
                  </td>
                  <td>{m.tipo || 'Furgone'}</td>
                  <td>
                    <span className={`fm-badge ${STATO_COLORS[m.stato.toUpperCase()] || 'badge-gray'}`}>
                      {m.stato}
                    </span>
                  </td>
                  <td>
                    {padroncino ? (
                      <span className="fm-padroncino">{padroncino.ragioneSociale}</span>
                    ) : (
                      <span className="fm-empty">—</span>
                    )}
                  </td>
                  <td>
                    {assicInfo ? (
                      <span className={`fm-scad ${assicInfo.cls}`}>
                        {assicInfo.icon} {assicInfo.label}
                      </span>
                    ) : <span className="fm-empty">—</span>}
                  </td>
                  <td>
                    {revInfo ? (
                      <span className={`fm-scad ${revInfo.cls}`}>
                        {revInfo.icon} {revInfo.label}
                      </span>
                    ) : <span className="fm-empty">—</span>}
                  </td>
                  <td>
                    {m.rataNoleggio ? fmtEur(m.rataNoleggio) : <span className="fm-empty">—</span>}
                  </td>
                  <td>
                    {m.kmAttuali != null ? (
                      <div>
                        <span>{m.kmAttuali.toLocaleString('it-IT')}</span>
                        {m.kmAttualiAl && (
                          <div className="fm-km-date">al {new Date(m.kmAttualiAl).toLocaleDateString('it-IT')}</div>
                        )}
                      </div>
                    ) : <span className="fm-empty">—</span>}
                  </td>
                  <td>
                    {m.kmLimite ? (
                      <div className="fm-km-cell">
                        <div className="fm-km-bar-bg">
                          <div
                            className={`fm-km-bar-fill ${kmColor}`}
                            style={{ width: `${kmPct}%` }}
                          />
                        </div>
                        <span className={`fm-km-pct ${kmColor.replace('bar', 'text')}`}>{kmPct}%</span>
                      </div>
                    ) : <span className="fm-empty">—</span>}
                  </td>
                  <td>
                    <div className="fm-row-actions">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate(`/flotta/${m.id}`)}
                      >
                        Dettaglio
                      </button>
                      <button className="fm-doc-btn">📄</button>
                      <button
                        className="fm-del-btn"
                        onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.targa); }}
                        title="Elimina mezzo"
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NuovoMezzoModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleCreate} />

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
                <span className="fm-import-stat-label">Mezzi creati</span>
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
