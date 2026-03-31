import { useState, useMemo } from 'react';
import type { Mezzo, MezziStats } from '../../lib/api';
import NuovoMezzoModal from './NuovoMezzoModal';


// ─── MOCK DATA (sostituire con API reali) ──────────
const MOCK_STATS: MezziStats = {
  totali: 33,
  disponibili: 6,
  assegnati: 26,
  entrateNoleggio: 17134,
  margine: -6863.18,
  scadenzeImminenti: 30,
};

const MOCK_MEZZI: Mezzo[] = [
  { id: '1', targa: 'GH627TF', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE', alimentazione: 'GASOLIO', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: null, canoneNoleggio: null, kmAttuali: 185449, kmLimite: 200000, scadenzaAssicurazione: '2026-04-10', scadenzaRevisione: '2026-05-05', assegnazioni: [{ id: 'a1', dataInizio: '2025-01-01', dataFine: null, padroncino: { id: 'p1', ragioneSociale: 'MEN LOGISTIC' } }], tags: [] },
  { id: '2', targa: 'GH628TF', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE', alimentazione: 'GASOLIO', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: null, canoneNoleggio: null, kmAttuali: 158048, kmLimite: 200000, scadenzaAssicurazione: '2026-04-10', scadenzaRevisione: '2026-05-05', assegnazioni: [{ id: 'a2', dataInizio: '2025-01-01', dataFine: null, padroncino: { id: 'p1', ragioneSociale: 'MEN LOGISTIC' } }], tags: [] },
  { id: '3', targa: 'GJ198RL', marca: 'Volkswagen', modello: 'CRAFTER', tipo: 'FURGONE', alimentazione: 'GASOLIO', categoria: 'DISTRIBUZIONE', stato: 'DISMESSO', rataNoleggio: null, canoneNoleggio: null, kmAttuali: 74853, kmLimite: 150000, scadenzaAssicurazione: '2026-08-15', scadenzaRevisione: '2027-02-10', assegnazioni: [], tags: [] },
  { id: '4', targa: 'GM098FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE', alimentazione: 'ELETTRICO', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: 850, canoneNoleggio: null, kmAttuali: 107271, kmLimite: 130000, scadenzaAssicurazione: '2026-12-01', scadenzaRevisione: '2026-06-20', assegnazioni: [{ id: 'a4', dataInizio: '2025-03-01', dataFine: null, padroncino: { id: 'p1', ragioneSociale: 'MEN LOGISTIC' } }], tags: [] },
  { id: '5', targa: 'GM099FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE', alimentazione: 'ELETTRICO', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: 850, canoneNoleggio: null, kmAttuali: 104209, kmLimite: 130000, scadenzaAssicurazione: '2026-12-01', scadenzaRevisione: '2026-06-20', assegnazioni: [{ id: 'a5', dataInizio: '2025-03-01', dataFine: null, padroncino: { id: 'p2', ragioneSociale: 'DI NARDO' } }], tags: [] },
  { id: '6', targa: 'GM100FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE', alimentazione: 'ELETTRICO', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: 930, canoneNoleggio: null, kmAttuali: 84714, kmLimite: 130000, scadenzaAssicurazione: '2026-12-01', scadenzaRevisione: '2026-06-20', assegnazioni: [{ id: 'a6', dataInizio: '2025-03-01', dataFine: null, padroncino: { id: 'p1', ragioneSociale: 'MEN LOGISTIC' } }], tags: [] },
  { id: '7', targa: 'GR496EZ', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE', alimentazione: 'GASOLIO_MHEV', categoria: 'DISTRIBUZIONE', stato: 'ASSEGNATO', rataNoleggio: 150, canoneNoleggio: null, kmAttuali: 66153, kmLimite: 200000, scadenzaAssicurazione: '2026-10-15', scadenzaRevisione: '2027-07-01', assegnazioni: [{ id: 'a7', dataInizio: '2025-06-01', dataFine: null, padroncino: { id: 'p3', ragioneSociale: 'EL SPEDIZIONI' } }], tags: [] },
  { id: '8', targa: 'GS610JM', marca: 'Cupra', modello: 'BORN', tipo: 'AUTO', alimentazione: 'ELETTRICO', categoria: 'AUTO_AZIENDALE', stato: 'DISPONIBILE', rataNoleggio: null, canoneNoleggio: null, kmAttuali: 31786, kmLimite: null, scadenzaAssicurazione: '2026-08-15', scadenzaRevisione: '2027-04-01', assegnazioni: [{ id: 'a8', dataInizio: '2025-01-01', dataFine: null, padroncino: { id: 'p4', ragioneSociale: 'Vinicio Altomare' } }], tags: [] },
];

type StatoFilter = 'TUTTI' | 'DISPONIBILE' | 'ASSEGNATO' | 'IN_REVISIONE' | 'FUORI_SERVIZIO' | 'VENDUTO';
type CategoriaFilter = 'TUTTI' | 'DISTRIBUZIONE' | 'AUTO_AZIENDALE';

export default function FlottaMezzi() {
  const [search, setSearch] = useState('');
  const [statoFilter, setStatoFilter] = useState<StatoFilter>('TUTTI');
  const [categoriaFilter, setCategoriaFilter] = useState<CategoriaFilter>('TUTTI');
  const [showNuovo, setShowNuovo] = useState(false);
  const stats = MOCK_STATS;

  const filteredMezzi = useMemo(() => {
    return MOCK_MEZZI.filter((m) => {
      if (statoFilter !== 'TUTTI' && m.stato !== statoFilter) return false;
      if (categoriaFilter !== 'TUTTI' && m.categoria !== categoriaFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          m.targa.toLowerCase().includes(s) ||
          m.marca.toLowerCase().includes(s) ||
          m.modello.toLowerCase().includes(s) ||
          m.assegnazioni?.[0]?.padroncino.ragioneSociale.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [search, statoFilter, categoriaFilter]);

  return (
    <div className="flotta-page">
      {/* Header */}
      <div className="page-header">
        <h1>Flotta Mezzi</h1>
        <div className="header-actions">
          <button className="btn-ghost">
            <WarningIcon /> 3 DURC scaduti
          </button>
          <button className="btn-ghost">
            <SearchIcon /> Cerca
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard label="TOTALI" value={stats.totali} sub={`${stats.assegnati} assegnati`} icon="🚛" />
        <StatCard label="DISPONIBILI" value={stats.disponibili} sub="pronti" icon="✅" />
        <StatCard
          label="ENTRATE NOLEGGIO"
          value={`${stats.entrateNoleggio.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`}
          sub="mensile"
          variant="warning"
        />
        <StatCard
          label="MARGINE"
          value={`${stats.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`}
          sub="rata – canone"
          variant={stats.margine < 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Alert scadenze */}
      {stats.scadenzeImminenti > 0 && (
        <div className="alert-bar">
          <WarningIcon /> {stats.scadenzeImminenti} mezzo/i con scadenze entro 30 giorni
        </div>
      )}

      {/* Filtri */}
      <div className="filters-bar">
        <div className="search-input">
          <SearchIcon />
          <input
            type="text"
            placeholder="Cerca targa, marca, modello, padroncino..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-chips">
          {(['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'IN_REVISIONE', 'FUORI_SERVIZIO', 'VENDUTO'] as StatoFilter[]).map(
            (s) => (
              <button
                key={s}
                className={`chip ${statoFilter === s ? 'chip-active' : ''}`}
                onClick={() => setStatoFilter(s)}
              >
                {s === 'TUTTI' ? 'Tutti' : s.replace('_', ' ')}
              </button>
            ),
          )}
        </div>

        <div className="filter-chips">
          {(['TUTTI', 'DISTRIBUZIONE', 'AUTO_AZIENDALE'] as CategoriaFilter[]).map((c) => (
            <button
              key={c}
              className={`chip chip-categoria ${categoriaFilter === c ? 'chip-active' : ''}`}
              onClick={() => setCategoriaFilter(c)}
            >
              {c === 'TUTTI' ? 'Tutti' : c === 'DISTRIBUZIONE' ? '🟣 Distrib.' : '🟢 Auto Az.'}
            </button>
          ))}
        </div>

        <div className="filter-actions">
          <button className="btn-primary" onClick={() => setShowNuovo(true)}>+ Distribuzione</button>
          <NuovoMezzoModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={(d) => console.log(d)} />
          <button className="btn-outline">+ Auto Aziendale</button>
          <button className="btn-ghost">📥 Importa Excel</button>
        </div>
      </div>

      {/* Tabella */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>TARGA</th>
              <th>MARCA/MODELLO</th>
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
            {filteredMezzi.map((mezzo) => (
              <MezzoRow key={mezzo.id} mezzo={mezzo} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── COMPONENTS ───────────────────────────────────────

function StatCard({
  label, value, sub, icon, variant,
}: {
  label: string; value: string | number; sub: string; icon?: string; variant?: string;
}) {
  return (
    <div className={`stat-card ${variant ? `stat-${variant}` : ''}`}>
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function MezzoRow({ mezzo }: { mezzo: Mezzo }) {
  const padroncino = mezzo.assegnazioni?.[0]?.padroncino;
  const kmPercent = mezzo.kmLimite ? Math.round((mezzo.kmAttuali || 0) / mezzo.kmLimite * 100) : null;

  const alimentazioneLabel = ({
    GASOLIO: 'Gasolio',
    ELETTRICO: 'Elettrico',
    GASOLIO_MHEV: 'Gasolio+mhev',
    BENZINA: 'Benzina',
    IBRIDO: 'Ibrido',
  } as Record<string, string>)[mezzo.alimentazione] || mezzo.alimentazione;

  const scadAssicurazione = mezzo.scadenzaAssicurazione ? formatScadenza(mezzo.scadenzaAssicurazione) : null;
  const scadRevisione = mezzo.scadenzaRevisione ? formatScadenza(mezzo.scadenzaRevisione) : null;

  return (
    <tr>
      <td>
        <div className="targa-cell">
          <span className="targa">{mezzo.targa}</span>
          <span className={`cat-badge cat-${mezzo.categoria.toLowerCase()}`}>
            {mezzo.categoria === 'DISTRIBUZIONE' ? 'DISTRIB.' : 'AUTO AZ.'}
          </span>
        </div>
      </td>
      <td>
        <div className="marca-cell">
          <span className="marca">{mezzo.marca} {mezzo.modello}</span>
          <span className="alimentazione">• {alimentazioneLabel}</span>
        </div>
      </td>
      <td className="text-muted">{mezzo.tipo === 'FURGONE' ? 'Furgone' : mezzo.tipo === 'AUTO' ? 'Auto' : mezzo.tipo}</td>
      <td><StatoBadge stato={mezzo.stato} /></td>
      <td className="padroncino-cell">{padroncino?.ragioneSociale || '—'}</td>
      <td>{scadAssicurazione ? <ScadenzaBadge {...scadAssicurazione} /> : '—'}</td>
      <td>{scadRevisione ? <ScadenzaBadge {...scadRevisione} /> : '—'}</td>
      <td className="text-right">{mezzo.rataNoleggio ? `${mezzo.rataNoleggio.toLocaleString('it-IT')} €` : '—'}</td>
      <td className="text-right mono">{mezzo.kmAttuali?.toLocaleString('it-IT') || '—'}</td>
      <td>
        {kmPercent !== null && (
          <div className="km-bar-container">
            <div
              className={`km-bar ${kmPercent > 80 ? 'km-danger' : kmPercent > 60 ? 'km-warning' : 'km-ok'}`}
              style={{ width: `${Math.min(kmPercent, 100)}%` }}
            />
            <span className="km-label">{kmPercent}%</span>
          </div>
        )}
      </td>
      <td>
        <button className="btn-detail">Dettaglio</button>
      </td>
    </tr>
  );
}

function StatoBadge({ stato }: { stato: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    ASSEGNATO: { label: 'ASSEGNATO', cls: 'badge-green' },
    DISPONIBILE: { label: 'DISPONIBILE', cls: 'badge-blue' },
    DISMESSO: { label: 'DISMESSO', cls: 'badge-gray' },
    IN_REVISIONE: { label: 'IN REVISIONE', cls: 'badge-orange' },
    FUORI_SERVIZIO: { label: 'FUORI SERVIZIO', cls: 'badge-red' },
    VENDUTO: { label: 'VENDUTO', cls: 'badge-gray' },
  };
  const c = config[stato] || { label: stato, cls: 'badge-gray' };
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

function ScadenzaBadge({ label, variant }: { label: string; variant: string }) {
  const icon = variant === 'danger' ? '⚠️' : variant === 'warning' ? '⚠️' : '✅';
  return (
    <span className={`scadenza-badge scadenza-${variant}`}>
      {icon} {label}
    </span>
  );
}

function formatScadenza(dateStr: string): { label: string; variant: string } {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: `${Math.abs(diff)}gg fa`, variant: 'danger' };
  if (diff <= 30) return { label: `${diff}gg`, variant: 'warning' };
  if (diff <= 90) return { label: `${diff}gg`, variant: 'info' };
  return { label: `${diff}gg`, variant: 'ok' };
}

// ─── ICONS ────────────────────────────────────────────
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
