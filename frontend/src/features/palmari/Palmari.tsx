// src/features/palmari/Palmari.tsx  — VISTA DETTAGLIO
import { useState, useMemo } from 'react';
import './Palmari.css';
import NuovoPalmareModal, { NuovoPalmare } from './NuovoPalmareModal';

interface Assegnazione {
  id: string;
  padroncinoId: string;
  ragioneSociale: string;
  dataInizio: string;
  dataFine?: string | null;
}

interface Palmare {
  id: string;
  codice: string;
  marca: string | null;
  modello: string | null;
  imei: string | null;
  simNumero: string | null;
  tariffaMensile: number | null;
  stato: 'DISPONIBILE' | 'ASSEGNATO' | 'GUASTO' | 'DISMESSO';
  note: string | null;
  createdAt: string;
  assegnazioni: Assegnazione[];
}

const MOCK: Palmare[] = [
  {
    id: '1', codice: 'PAL-001', marca: 'Zebra', modello: 'TC21',
    imei: '352345678901234', simNumero: '3331234001', tariffaMensile: 35,
    stato: 'ASSEGNATO', note: null, createdAt: '2025-01-01',
    assegnazioni: [
      { id: 'a1', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC SRLS', dataInizio: '2025-01-01' },
    ],
  },
  {
    id: '2', codice: 'PAL-002', marca: 'Zebra', modello: 'TC21',
    imei: '352345678901235', simNumero: '3331234002', tariffaMensile: 35,
    stato: 'ASSEGNATO', note: null, createdAt: '2025-01-15',
    assegnazioni: [
      { id: 'a2', padroncinoId: 'p2', ragioneSociale: 'DI NARDO TRASPORTI', dataInizio: '2025-01-15' },
    ],
  },
  {
    id: '3', codice: 'PAL-003', marca: 'Zebra', modello: 'TC21',
    imei: '352345678901236', simNumero: '3331234003', tariffaMensile: 35,
    stato: 'ASSEGNATO', note: null, createdAt: '2025-02-01',
    assegnazioni: [
      { id: 'a3', padroncinoId: 'p3', ragioneSociale: 'EL SPEDIZIONI', dataInizio: '2025-02-01' },
    ],
  },
  {
    id: '4', codice: 'PAL-004', marca: 'Zebra', modello: 'TC26',
    imei: '352345678901237', simNumero: '3331234004', tariffaMensile: 45,
    stato: 'ASSEGNATO', note: 'Modello premium', createdAt: '2025-03-01',
    assegnazioni: [
      { id: 'a4', padroncinoId: 'p4', ragioneSociale: 'IB EXPRESS SRLS', dataInizio: '2025-03-01' },
    ],
  },
  {
    id: '5', codice: 'PAL-005', marca: 'Zebra', modello: 'TC21',
    imei: '352345678901238', simNumero: '3331234005', tariffaMensile: 35,
    stato: 'DISPONIBILE', note: null, createdAt: '2025-03-15',
    assegnazioni: [],
  },
  {
    id: '6', codice: 'PAL-006', marca: 'Honeywell', modello: 'CT47',
    imei: '352345678901239', simNumero: null, tariffaMensile: 50,
    stato: 'GUASTO', note: 'Schermo rotto, in riparazione', createdAt: '2024-11-01',
    assegnazioni: [
      { id: 'a6', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC SRLS', dataInizio: '2024-11-01', dataFine: '2025-02-15' },
    ],
  },
  {
    id: '7', codice: 'PAL-007', marca: 'Zebra', modello: 'TC21',
    imei: '352345678901240', simNumero: '3331234007', tariffaMensile: 35,
    stato: 'DISPONIBILE', note: null, createdAt: '2025-04-01',
    assegnazioni: [],
  },
];

const STATO_META: Record<string, { label: string; cls: string }> = {
  DISPONIBILE: { label: 'Disponibile', cls: 'palm-badge-disponibile' },
  ASSEGNATO:   { label: 'Assegnato',   cls: 'palm-badge-assegnato' },
  GUASTO:      { label: 'Guasto',      cls: 'palm-badge-guasto' },
  DISMESSO:    { label: 'Dismesso',    cls: 'palm-badge-dismesso' },
};

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT');
}

function StatoBadge({ stato }: { stato: string }) {
  const m = STATO_META[stato] ?? { label: stato, cls: '' };
  return <span className={`palm-badge ${m.cls}`}>{m.label}</span>;
}

// ─── PANNELLO DETTAGLIO ──────────────────────────────────
function PalmareDetail({ p, onClose }: { p: Palmare; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'storico'>('info');
  const assegnazioneAttiva = p.assegnazioni.find((a) => !a.dataFine);
  const storicoPassato = p.assegnazioni.filter((a) => !!a.dataFine);

  return (
    <div className="palm-detail">
      {/* Header dettaglio */}
      <div className="palm-detail-header">
        <div className="palm-detail-icon">📱</div>
        <div className="palm-detail-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="palm-detail-codice">{p.codice}</span>
            <StatoBadge stato={p.stato} />
          </div>
          <span className="palm-detail-sub">{p.marca} {p.modello ?? '—'}</span>
        </div>
        <button className="palm-detail-close" onClick={onClose} title="Chiudi">✕</button>
      </div>

      {/* Assegnazione attiva */}
      {assegnazioneAttiva && (
        <div className="palm-detail-assigned-bar">
          <span className="palm-detail-assigned-icon">👤</span>
          <div>
            <span className="palm-detail-assigned-name">{assegnazioneAttiva.ragioneSociale}</span>
            <span className="palm-detail-assigned-since">dal {fmt(assegnazioneAttiva.dataInizio)}</span>
          </div>
          <button className="btn-danger-sm" style={{ marginLeft: 'auto' }}>Rimuovi</button>
        </div>
      )}
      {!assegnazioneAttiva && (
        <div className="palm-detail-available-bar">
          <span>✅</span>
          <span>Palmare disponibile per l'assegnazione</span>
          <button className="btn-primary btn-sm" style={{ marginLeft: 'auto' }}>+ Assegna</button>
        </div>
      )}

      {/* Tabs */}
      <div className="palm-detail-tabs">
        {(['info', 'storico'] as const).map((t) => (
          <button key={t} className={`palm-detail-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'info' ? '📋 Informazioni' : `📜 Storico (${p.assegnazioni.length})`}
          </button>
        ))}
      </div>

      <div className="palm-detail-body">
        {tab === 'info' && (
          <div className="palm-detail-fields">
            <div className="palm-detail-section">
              <span className="palm-detail-section-title">DATI IDENTIFICATIVI</span>
              <div className="palm-detail-grid">
                <Field label="Codice" value={p.codice} mono />
                <Field label="Stato" value={STATO_META[p.stato]?.label ?? p.stato} />
                <Field label="Marca" value={p.marca} />
                <Field label="Modello" value={p.modello} />
                <Field label="IMEI" value={p.imei} mono />
                <Field label="Numero SIM" value={p.simNumero} mono />
              </div>
            </div>

            <div className="palm-detail-section">
              <span className="palm-detail-section-title">CONTRATTO</span>
              <div className="palm-detail-grid">
                <Field label="Tariffa mensile" value={p.tariffaMensile != null ? `${p.tariffaMensile} €/mese` : null} />
                <Field label="Inserito il" value={fmt(p.createdAt)} />
              </div>
            </div>

            {p.note && (
              <div className="palm-detail-section">
                <span className="palm-detail-section-title">NOTE</span>
                <div className="palm-detail-note">{p.note}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'storico' && (
          <div>
            {p.assegnazioni.length === 0 ? (
              <div className="palm-detail-empty">
                <span>📋</span>
                <p>Nessuna assegnazione registrata</p>
              </div>
            ) : (
              <div className="palm-storico-list">
                {p.assegnazioni.map((a) => (
                  <div key={a.id} className={`palm-storico-item ${!a.dataFine ? 'palm-storico-active' : ''}`}>
                    <div className="palm-storico-avatar">
                      {a.ragioneSociale.charAt(0)}
                    </div>
                    <div className="palm-storico-info">
                      <span className="palm-storico-name">{a.ragioneSociale}</span>
                      <span className="palm-storico-period">
                        {fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : <strong style={{ color: 'var(--success)' }}>In corso</strong>}
                      </span>
                    </div>
                    {!a.dataFine && <span className="palm-badge palm-badge-assegnato">Attivo</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer azioni */}
      <div className="palm-detail-footer">
        <button className="btn-outline btn-sm">✏️ Modifica</button>
        <button className="btn-danger-outline btn-sm">🗑 Elimina</button>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="palm-detail-field">
      <span className="palm-detail-field-label">{label}</span>
      <span className={`palm-detail-field-value ${mono ? 'palm-detail-mono' : ''} ${!value ? 'palm-detail-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── PAGINA PRINCIPALE ──────────────────────────────────
export default function Palmari() {
  const [search, setSearch] = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [selected, setSelected] = useState<Palmare | null>(null);
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [data, setData] = useState<Palmare[]>(MOCK);

  const stati = ['TUTTI', 'ASSEGNATO', 'DISPONIBILE', 'GUASTO', 'DISMESSO'];

  const filtered = useMemo(() => {
    return data.filter((p) => {
      const matchSearch =
        p.codice.toLowerCase().includes(search.toLowerCase()) ||
        (p.marca ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.modello ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.imei ?? '').includes(search) ||
        (p.assegnazioni.find(a => !a.dataFine)?.ragioneSociale ?? '').toLowerCase().includes(search.toLowerCase());
      const matchStato = filtroStato === 'TUTTI' || p.stato === filtroStato;
      return matchSearch && matchStato;
    });
  }, [data, search, filtroStato]);

  const stats = useMemo(() => ({
    totale: data.length,
    assegnati: data.filter((p) => p.stato === 'ASSEGNATO').length,
    disponibili: data.filter((p) => p.stato === 'DISPONIBILE').length,
    guasti: data.filter((p) => p.stato === 'GUASTO').length,
    entrate: data.filter((p) => p.stato === 'ASSEGNATO').reduce((s, p) => s + (p.tariffaMensile ?? 0), 0),
  }), [data]);

  const handleSave = (form: NuovoPalmare) => {
    const nuovo: Palmare = {
      id: Date.now().toString(),
      codice: form.codice,
      marca: form.marca ? form.marca.split(' ')[0] : null,
      modello: form.modello || null,
      imei: form.seriale || null,
      simNumero: form.sim || null,
      tariffaMensile: form.tariffa ? parseFloat(form.tariffa) : null,
      stato: 'DISPONIBILE',
      note: form.note || null,
      createdAt: new Date().toISOString(),
      assegnazioni: [],
    };
    setData((d) => [...d, nuovo]);
  };

  return (
    <div className="palm-page-master">
      {/* ── SIDEBAR LISTA ── */}
      <div className="palm-sidebar">
        <div className="palm-sidebar-header">
          <h1>📱 Palmari</h1>
          <button className="btn-primary btn-sm" onClick={() => setNuovoOpen(true)}>+ Nuovo</button>
        </div>

        {/* Stats compatte */}
        <div className="palm-sidebar-stats">
          <div className="palm-ss-item">
            <span className="palm-ss-val">{stats.totale}</span>
            <span className="palm-ss-label">Totale</span>
          </div>
          <div className="palm-ss-item palm-ss-assegnati">
            <span className="palm-ss-val">{stats.assegnati}</span>
            <span className="palm-ss-label">Assegnati</span>
          </div>
          <div className="palm-ss-item palm-ss-disponibili">
            <span className="palm-ss-val">{stats.disponibili}</span>
            <span className="palm-ss-label">Liberi</span>
          </div>
          {stats.guasti > 0 && (
            <div className="palm-ss-item palm-ss-guasti">
              <span className="palm-ss-val">{stats.guasti}</span>
              <span className="palm-ss-label">Guasti</span>
            </div>
          )}
        </div>

        {/* Ricerca */}
        <div className="palm-sidebar-search">
          <span>🔍</span>
          <input
            placeholder="Cerca palmare…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filtro stato */}
        <div className="palm-sidebar-chips">
          {stati.map((s) => (
            <button
              key={s}
              className={`palm-chip ${filtroStato === s ? 'palm-chip-active' : ''}`}
              onClick={() => setFiltroStato(s)}
            >
              {s === 'TUTTI' ? 'Tutti' : STATO_META[s]?.label ?? s}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="palm-sidebar-list">
          {filtered.length === 0 && (
            <div className="palm-sidebar-empty">Nessun palmare trovato</div>
          )}
          {filtered.map((p) => {
            const attiva = p.assegnazioni.find((a) => !a.dataFine);
            return (
              <div
                key={p.id}
                className={`palm-list-item ${selected?.id === p.id ? 'palm-list-active' : ''}`}
                onClick={() => setSelected(p)}
              >
                <div className="palm-list-icon">📱</div>
                <div className="palm-list-info">
                  <span className="palm-list-codice">{p.codice}</span>
                  <span className="palm-list-model">{p.marca} {p.modello}</span>
                  {attiva && <span className="palm-list-assigned">{attiva.ragioneSociale}</span>}
                </div>
                <div className="palm-list-right">
                  <StatoBadge stato={p.stato} />
                  {p.tariffaMensile && <span className="palm-list-tariffa">{p.tariffaMensile}€</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer entrate */}
        <div className="palm-sidebar-footer">
          <span className="palm-sf-label">Entrate mensili</span>
          <span className="palm-sf-value">{stats.entrate.toLocaleString('it-IT')} €/mese</span>
        </div>
      </div>

      {/* ── PANNELLO DETTAGLIO ── */}
      <div className="palm-main">
        {selected ? (
          <PalmareDetail p={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="palm-empty-state">
            <div className="palm-empty-icon">📱</div>
            <h2>Seleziona un palmare</h2>
            <p>Scegli un terminale dalla lista per visualizzare i dettagli</p>
            <button className="btn-primary" onClick={() => setNuovoOpen(true)}>+ Aggiungi Palmare</button>
          </div>
        )}
      </div>

      <NuovoPalmareModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleSave} />
    </div>
  );
}
