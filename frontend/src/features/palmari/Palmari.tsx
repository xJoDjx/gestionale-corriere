import { useState, useMemo } from 'react';
import './Palmari.css';
import NuovoPalmareModal, { NuovoPalmare } from './NuovoPalmareModal';  


interface Palmare {
  id: string;
  codice: string;
  marca: string;
  modello: string;
  imei: string | null;
  simNumero: string | null;
  tariffaMensile: number | null;
  stato: string;
  padroncino: string | null;
  assegnatoIl: string | null;
}

const MOCK: Palmare[] = [
  { id: '1', codice: 'PAL-001', marca: 'Zebra', modello: 'TC21', imei: '352345678901234', simNumero: '3331234001', tariffaMensile: 35, stato: 'ASSEGNATO', padroncino: 'MEN LOGISTIC', assegnatoIl: '2025-01-01' },
  { id: '2', codice: 'PAL-002', marca: 'Zebra', modello: 'TC21', imei: '352345678901235', simNumero: '3331234002', tariffaMensile: 35, stato: 'ASSEGNATO', padroncino: 'DI NARDO', assegnatoIl: '2025-01-15' },
  { id: '3', codice: 'PAL-003', marca: 'Zebra', modello: 'TC21', imei: '352345678901236', simNumero: '3331234003', tariffaMensile: 35, stato: 'ASSEGNATO', padroncino: 'EL SPEDIZIONI', assegnatoIl: '2025-02-01' },
  { id: '4', codice: 'PAL-004', marca: 'Zebra', modello: 'TC26', imei: '352345678901237', simNumero: '3331234004', tariffaMensile: 45, stato: 'ASSEGNATO', padroncino: 'IB EXPRESS SRLS', assegnatoIl: '2025-03-01' },
  { id: '5', codice: 'PAL-005', marca: 'Zebra', modello: 'TC21', imei: '352345678901238', simNumero: '3331234005', tariffaMensile: 35, stato: 'ASSEGNATO', padroncino: 'QUICK EXPRESS SRLS', assegnatoIl: '2025-03-15' },
  { id: '6', codice: 'PAL-006', marca: 'Zebra', modello: 'TC26', imei: '352345678901239', simNumero: '3331234006', tariffaMensile: 45, stato: 'ASSEGNATO', padroncino: 'MEN LOGISTIC', assegnatoIl: '2025-04-01' },
  { id: '7', codice: 'PAL-007', marca: 'Zebra', modello: 'TC21', imei: '352345678901240', simNumero: '3331234007', tariffaMensile: 35, stato: 'DISPONIBILE', padroncino: null, assegnatoIl: null },
  { id: '8', codice: 'PAL-008', marca: 'Honeywell', modello: 'CT40', imei: '352345678901241', simNumero: null, tariffaMensile: 40, stato: 'DISPONIBILE', padroncino: null, assegnatoIl: null },
  { id: '9', codice: 'PAL-009', marca: 'Zebra', modello: 'TC21', imei: null, simNumero: null, tariffaMensile: 35, stato: 'GUASTO', padroncino: null, assegnatoIl: null },
];

function eur(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2 });
}

type Filter = 'TUTTI' | 'ASSEGNATO' | 'DISPONIBILE' | 'GUASTO';

export default function PalmariPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('TUTTI');
  const [showNuovo, setShowNuovo] = useState(false);

  const filtered = useMemo(() => {
    return MOCK.filter((p) => {
      if (filter !== 'TUTTI' && p.stato !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.codice.toLowerCase().includes(s) || p.padroncino?.toLowerCase().includes(s) || p.marca.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, filter]);

  const totTariffa = MOCK.filter((p) => p.stato === 'ASSEGNATO').reduce((s, p) => s + (p.tariffaMensile || 0), 0);

  return (
    <div className="palm-page">
      <div className="palm-header">
        <h1>Palmari</h1>
        <button className="btn-primary" onClick={() => setShowNuovo(true)}>+ Nuovo Palmare</button>
        <NuovoPalmareModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={(d) => console.log(d)} />
      </div>

      <div className="palm-stats">
        <div className="palm-stat"><span className="palm-stat-l">TOTALI</span><span className="palm-stat-v">{MOCK.length}</span></div>
        <div className="palm-stat"><span className="palm-stat-l">ASSEGNATI</span><span className="palm-stat-v">{MOCK.filter((p) => p.stato === 'ASSEGNATO').length}</span></div>
        <div className="palm-stat"><span className="palm-stat-l">DISPONIBILI</span><span className="palm-stat-v">{MOCK.filter((p) => p.stato === 'DISPONIBILE').length}</span></div>
        <div className="palm-stat"><span className="palm-stat-l">COSTO MENSILE</span><span className="palm-stat-v palm-v-pri">{eur(totTariffa)} €</span></div>
      </div>

      <div className="palm-filters">
        <div className="palm-search">
          <span>🔍</span>
          <input placeholder="Cerca codice, padroncino..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="palm-chips">
          {(['TUTTI', 'ASSEGNATO', 'DISPONIBILE', 'GUASTO'] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'TUTTI' ? 'Tutti' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="palm-grid">
        {filtered.map((p) => (
          <div key={p.id} className="palm-card">
            <div className="palm-card-top">
              <div className="palm-card-icon">📱</div>
              <div className="palm-card-info">
                <span className="palm-card-codice">{p.codice}</span>
                <span className="palm-card-model">{p.marca} {p.modello}</span>
              </div>
              <span className={`palm-badge palm-badge-${p.stato.toLowerCase()}`}>{p.stato}</span>
            </div>

            <div className="palm-card-fields">
              <div className="palm-card-row">
                <span>IMEI</span>
                <span className="palm-mono">{p.imei || '—'}</span>
              </div>
              <div className="palm-card-row">
                <span>SIM</span>
                <span>{p.simNumero || '—'}</span>
              </div>
              <div className="palm-card-row">
                <span>Tariffa</span>
                <span className="palm-bold">{p.tariffaMensile ? `${eur(p.tariffaMensile)} €/mese` : '—'}</span>
              </div>
            </div>

            {p.padroncino && (
              <div className="palm-card-assign">
                <span className="palm-assign-label">Assegnato a</span>
                <span className="palm-assign-name">{p.padroncino}</span>
                {p.assegnatoIl && <span className="palm-assign-date">dal {new Date(p.assegnatoIl).toLocaleDateString('it-IT')}</span>}
              </div>
            )}

            <div className="palm-card-actions">
              {p.stato === 'DISPONIBILE' && <button className="btn-primary btn-sm palm-btn-full">Assegna</button>}
              {p.stato === 'ASSEGNATO' && <button className="btn-outline btn-sm palm-btn-full">Riassegna</button>}
              <button className="btn-outline btn-sm">Dettaglio</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
