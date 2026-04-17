import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MOCK_PADRONCINI, type Padroncino } from './lib/mock-data';
import './Padroncini.css';

// ─── HELPERS ──────────────────────────────────────────
function fmtEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function durcStatus(dateStr?: string | null): { label: string; cls: string; days?: number } {
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired', days };
  if (days <= 30) return { label: 'IN SCADENZA', cls: 'pd-doc-warning', days };
  return { label: 'VALIDO', cls: 'pd-doc-ok', days };
}

function dvrStatus(dateStr?: string | null, esente?: boolean): { label: string; cls: string } {
  if (esente) return { label: 'ESENTE', cls: 'pd-doc-esente' };
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired' };
  return { label: 'VALIDO', cls: 'pd-doc-ok' };
}

type Filtro = 'TUTTI' | 'ATTIVO' | 'DISMESSO';

export default function Padroncini() {
  const [padroncini] = useState<Padroncino[]>(MOCK_PADRONCINI);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TUTTI');
  const [showNuovo, setShowNuovo] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return padroncini.filter((p) => {
      const matchSearch = !s || p.ragioneSociale.toLowerCase().includes(s) ||
        (p.partitaIva || '').toLowerCase().includes(s) ||
        (p.codice || '').toLowerCase().includes(s);
      const matchFiltro =
        filtro === 'TUTTI' ||
        (filtro === 'ATTIVO' && p.attivo) ||
        (filtro === 'DISMESSO' && !p.attivo);
      return matchSearch && matchFiltro;
    });
  }, [padroncini, search, filtro]);

  const attivi = padroncini.filter(p => p.attivo).length;
  const dismessi = padroncini.length - attivi;
  const alertDoc = padroncini.filter(p => {
    const d = durcStatus(p.scadenzaDurc);
    return d.cls === 'pd-doc-expired' || d.cls === 'pd-doc-warning';
  }).length;
  const totMezzi = padroncini.reduce((sum, p) => sum + (p.mezziAssegnati?.filter(m => !m.dataFine).length ?? 0), 0);
  const totPalmari = padroncini.reduce((sum, p) => sum + (p.palmariAssegnati?.filter(m => !m.dataFine).length ?? 0), 0);

  return (
    <div className="pd-page" style={{ position: 'relative' }}>
      <div className="pd-alert-badge">⚠ {alertDoc} alert</div>

      <div className="pd-page-header">
        <h1>Padroncini</h1>
        <div className="pd-page-stats">
          <div className="pd-page-stat">
            <span className="pd-page-stat-icon">👥</span>
            <span className="pd-page-stat-val">{attivi}</span>
            <span className="pd-page-stat-label">PADRONCINI ATTIVI</span>
            <span className="pd-page-stat-sub">{dismessi} dismessi · {padroncini.length} totali</span>
          </div>
          <div className="pd-page-stat pd-page-stat-alert">
            <span className="pd-page-stat-icon">⚠️</span>
            <span className="pd-page-stat-val pd-page-stat-val-red">{alertDoc}</span>
            <span className="pd-page-stat-label">ALERT DOCUMENTI</span>
            <span className="pd-page-stat-sub">DURC scaduti o in scadenza</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-icon">🚛</span>
            <span className="pd-page-stat-val">{totMezzi}</span>
            <span className="pd-page-stat-label">FLOTTA MEZZI</span>
            <span className="pd-page-stat-sub">1 disponibili</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-icon">📱</span>
            <span className="pd-page-stat-val">{totPalmari}</span>
            <span className="pd-page-stat-label">PALMARI ATTIVI</span>
            <span className="pd-page-stat-sub">su 8 totali</span>
          </div>
        </div>
      </div>

      <div className="pd-toolbar">
        <div className="pd-search-wrap">
          <span>🔍</span>
          <input className="pd-search" placeholder="Cerca per nome, codice o P.IVA..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pd-filters">
          {(['TUTTI', 'ATTIVO', 'DISMESSO'] as const).map((f) => (
            <button key={f} className={`pd-filter-btn ${filtro === f ? 'pd-filter-active' : ''}`}
              onClick={() => setFiltro(f)}>{f}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} />
          <button className="btn-outline pd-nuovo-btn" onClick={() => importInputRef.current?.click()}>
            📥 Importa Excel
          </button>
          <button className="btn-primary pd-nuovo-btn" onClick={() => setShowNuovo(true)}>+ Nuovo</button>
        </div>
      </div>

      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              <th>PADRONCINO</th>
              <th>STATO</th>
              <th>DURC</th>
              <th>DVR</th>
              <th style={{ textAlign: 'center' }}>PALM.</th>
              <th style={{ textAlign: 'center' }}>MEZZI</th>
              <th style={{ textAlign: 'center' }}>AUTISTI</th>
              <th style={{ textAlign: 'right' }}>FATTURATO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="pd-empty-row">Nessun padroncino trovato</td></tr>
            )}
            {filtered.map((p) => {
              const durcSt = durcStatus(p.scadenzaDurc);
              const dvrSt = dvrStatus(p.scadenzaDvr, p.dvrEsente);
              const nMezzi = p.mezziAssegnati?.filter(m => !m.dataFine).length ?? 0;
              const nPalmari = p.palmariAssegnati?.filter(m => !m.dataFine).length ?? 0;
              const nAutisti = p.codiciAutista?.filter(a => !a.dataFine).length ?? 0;
              return (
                <tr key={p.id} className="pd-row">
                  <td>
                    <Link to={`/padroncini/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span className="pd-ragsoc">{p.ragioneSociale}</span>
                      <div className="pd-codice-row">Cod. {p.codice} · PI: {p.partitaIva}</div>
                    </Link>
                  </td>
                  <td>
                    <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
                      {p.attivo ? 'ATTIVO' : 'DISMESSO'}
                    </span>
                  </td>
                  <td>
                    <span className={`pd-doc-badge ${durcSt.cls}`}>{durcSt.label}</span>
                    {durcSt.days !== undefined && (
                      <span className="pd-scad-sub">Scaduto da {Math.abs(durcSt.days)}gg</span>
                    )}
                  </td>
                  <td><span className={`pd-doc-badge ${dvrSt.cls}`}>{dvrSt.label}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="pd-count pd-count-blue">{nPalmari}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="pd-count pd-count-blue">{nMezzi}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="pd-count pd-count-blue">{nAutisti}</span>
                  </td>
                  <td className="pd-fatturato">
                    {p.fatturatoTotale ? fmtEur(p.fatturatoTotale) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pd-table-footer">{filtered.length} di {padroncini.length} padroncini</div>
      </div>

      {showNuovo && (
        <div className="pd-modal-overlay" onClick={() => setShowNuovo(false)}>
          <div className="pd-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="pd-modal-header">
              <h3>➕ Nuovo Padroncino</h3>
              <button className="pd-modal-close" onClick={() => setShowNuovo(false)}>✕</button>
            </div>
            <div className="pd-modal-body">
              <div className="pd-modal-grid2">
                <div className="pd-modal-field pd-modal-full">
                  <label>Ragione Sociale *</label>
                  <input className="pd-modal-input" placeholder="ES: MEN LOGISTIC SRLS" />
                </div>
                <div className="pd-modal-field">
                  <label>Partita IVA *</label>
                  <input className="pd-modal-input" placeholder="01234567890" />
                </div>
                <div className="pd-modal-field">
                  <label>Codice Fiscale</label>
                  <input className="pd-modal-input" />
                </div>
                <div className="pd-modal-field pd-modal-full">
                  <label>Indirizzo</label>
                  <input className="pd-modal-input" />
                </div>
                <div className="pd-modal-field">
                  <label>Telefono</label>
                  <input className="pd-modal-input" />
                </div>
                <div className="pd-modal-field">
                  <label>Email</label>
                  <input className="pd-modal-input" type="email" />
                </div>
                <div className="pd-modal-field">
                  <label>PEC</label>
                  <input className="pd-modal-input" />
                </div>
                <div className="pd-modal-field">
                  <label>IBAN</label>
                  <input className="pd-modal-input" />
                </div>
              </div>
            </div>
            <div className="pd-modal-footer">
              <button className="btn-outline btn-sm" onClick={() => setShowNuovo(false)}>Annulla</button>
              <button className="btn-primary btn-sm">✅ Crea Padroncino</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
