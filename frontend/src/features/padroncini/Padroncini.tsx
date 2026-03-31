// src/features/padroncini/Padroncini.tsx — AssegnaModal usa dati reali da Mezzi/Palmari/CodiciAutisti

import { useState, useMemo } from 'react';
import AssegnaModal from './AssegnaModal';
import NuovoPadroncinoModal, { NuovoPadroncino } from './NuovoPadroncinoModal';
import './Padroncini.css';

// ─── DATI REALI CONDIVISI ─────────────────────────────────────────────────────
// Questi andrebbero letti via API. Per ora sono i MOCK che rispecchiano
// esattamente quelli presenti nelle sezioni Flotta, Palmari, CodiciAutisti.

export const ALL_MEZZI = [
  { id: 'm1', targa: 'GH627TF', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm2', targa: 'GH628TF', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm3', targa: 'GJ198RL', marca: 'Volkswagen', modello: 'CRAFTER', alimentazione: 'GASOLIO', stato: 'DISMESSO', padroncinoId: null },
  { id: 'm4', targa: 'GM098FB', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm5', targa: 'GM099FB', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p2' },
  { id: 'm6', targa: 'GM100FB', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm7', targa: 'GR496EZ', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO_MHEV', stato: 'ASSEGNATO', padroncinoId: 'p3' },
  { id: 'm8', targa: 'GS610JM', marca: 'Cupra', modello: 'BORN', alimentazione: 'ELETTRICO', stato: 'DISPONIBILE', padroncinoId: null },
  { id: 'm9', targa: 'GS690EP', marca: 'Cupra', modello: 'BORN', alimentazione: 'ELETTRICO', stato: 'DISPONIBILE', padroncinoId: null },
  { id: 'm10', targa: 'GR184MD', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO_MHEV', stato: 'ASSEGNATO', padroncinoId: 'p4' },
  { id: 'm11', targa: 'GR498EZ', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO_MHEV', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm12', targa: 'GR500EZ', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO_MHEV', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm13', targa: 'GR507EZ', marca: 'Ford', modello: 'TRANSIT', alimentazione: 'GASOLIO_MHEV', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm14', targa: 'GR628XD', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm15', targa: 'GR637XD', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p5' },
  { id: 'm16', targa: 'GS691VF', marca: 'Man', modello: 'ETGE', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'm17', targa: 'GM709PN', marca: 'Ford', modello: 'E-TRANSIT', alimentazione: 'ELETTRICO', stato: 'ASSEGNATO', padroncinoId: 'p1' },
];

export const ALL_PALMARI = [
  { id: 'pal1', codice: 'PAL-001', modello: 'Zebra TC21', tariffa: 35, stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'pal2', codice: 'PAL-002', modello: 'Zebra TC21', tariffa: 35, stato: 'ASSEGNATO', padroncinoId: 'p1' },
  { id: 'pal3', codice: 'PAL-003', modello: 'Zebra TC21', tariffa: 35, stato: 'ASSEGNATO', padroncinoId: 'p2' },
  { id: 'pal4', codice: 'PAL-004', modello: 'Zebra TC26', tariffa: 45, stato: 'ASSEGNATO', padroncinoId: 'p3' },
  { id: 'pal5', codice: 'PAL-005', modello: 'Zebra TC21', tariffa: 35, stato: 'DISPONIBILE', padroncinoId: null },
  { id: 'pal6', codice: 'PAL-006', modello: 'Honeywell CT47', tariffa: 50, stato: 'GUASTO', padroncinoId: null },
  { id: 'pal7', codice: 'PAL-007', modello: 'Zebra TC21', tariffa: 35, stato: 'DISPONIBILE', padroncinoId: null },
  { id: 'pal8', codice: 'PAL-008', modello: 'Zebra TC21', tariffa: 35, stato: 'DISPONIBILE', padroncinoId: null },
];

export const ALL_CODICI_AUTISTI = [
  { id: 'ca1', codice: 'AUT001', nome: 'Mario', cognome: 'Rossi', attivo: true, padroncinoId: 'p1' },
  { id: 'ca2', codice: 'AUT002', nome: 'Luca', cognome: 'Ferrari', attivo: true, padroncinoId: 'p1' },
  { id: 'ca3', codice: 'AUT003', nome: 'Ahmed', cognome: 'Benali', attivo: true, padroncinoId: 'p2' },
  { id: 'ca4', codice: 'AUT004', nome: 'Piotr', cognome: 'Kowalski', attivo: true, padroncinoId: 'p4' },
  { id: 'ca5', codice: 'AUT005', nome: 'Giuseppe', cognome: 'Marino', attivo: false, padroncinoId: null },
  { id: 'ca6', codice: 'AUT006', nome: 'Ivan', cognome: 'Petrovic', attivo: true, padroncinoId: null },
];

// ─── TIPI ────────────────────────────────────────────────────────────────────
type Padroncino = {
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string | null;
  indirizzo: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  iban: string | null;
  scadenzaDurc: string | null;
  scadenzaDvr: string | null;
  attivo: boolean;
  note: string | null;
  mezziAssegnati: { id: string; targa: string; marca: string; modello: string; dataInizio: string }[];
  palmariAssegnati: { id: string; codice: string; tariffa: number; dataInizio: string }[];
  codiciAutista: { id: string; codice: string; nome: string; cognome: string; dataInizio: string }[];
  conteggiCount: number;
};

const MOCK: Padroncino[] = [
  {
    id: 'p1', ragioneSociale: 'MEN LOGISTIC', partitaIva: '03456789012', codiceFiscale: null,
    indirizzo: 'Via Cosenza 45, Rende', telefono: '0984345678', email: 'info@menlogistic.it',
    pec: null, iban: 'IT60X0542811101000000123456',
    scadenzaDurc: '2026-06-30', scadenzaDvr: '2027-01-15', attivo: true, note: null,
    mezziAssegnati: [
      { id: 'm1', targa: 'GH627TF', marca: 'Ford', modello: 'TRANSIT', dataInizio: '2025-01-01' },
      { id: 'm4', targa: 'GM098FB', marca: 'Ford', modello: 'E-TRANSIT', dataInizio: '2025-03-01' },
    ],
    palmariAssegnati: [
      { id: 'pal1', codice: 'PAL-001', tariffa: 35, dataInizio: '2025-01-01' },
      { id: 'pal2', codice: 'PAL-002', tariffa: 35, dataInizio: '2025-01-01' },
    ],
    codiciAutista: [
      { id: 'ca1', codice: 'AUT001', nome: 'Mario', cognome: 'Rossi', dataInizio: '2025-01-01' },
      { id: 'ca2', codice: 'AUT002', nome: 'Luca', cognome: 'Ferrari', dataInizio: '2025-01-01' },
    ],
    conteggiCount: 12,
  },
  {
    id: 'p2', ragioneSociale: 'DI NARDO', partitaIva: '04567890123', codiceFiscale: null,
    indirizzo: 'Via Napoli 12, Rende', telefono: '0984567890', email: 'info@dinardo.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-04-01', scadenzaDvr: '2026-10-15', attivo: true, note: null,
    mezziAssegnati: [{ id: 'm5', targa: 'GM099FB', marca: 'Ford', modello: 'E-TRANSIT', dataInizio: '2025-03-01' }],
    palmariAssegnati: [{ id: 'pal3', codice: 'PAL-003', tariffa: 35, dataInizio: '2025-01-01' }],
    codiciAutista: [{ id: 'ca3', codice: 'AUT003', nome: 'Ahmed', cognome: 'Benali', dataInizio: '2025-01-01' }],
    conteggiCount: 8,
  },
  {
    id: 'p3', ragioneSociale: 'EL SPEDIZIONI', partitaIva: '05678901234', codiceFiscale: null,
    indirizzo: 'Contrada Piano, Montalto Uffugo', telefono: '0984111222', email: 'info@elspedizioni.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-03-20', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ id: 'm7', targa: 'GR496EZ', marca: 'Ford', modello: 'TRANSIT', dataInizio: '2025-06-01' }],
    palmariAssegnati: [{ id: 'pal4', codice: 'PAL-004', tariffa: 45, dataInizio: '2025-01-01' }],
    codiciAutista: [],
    conteggiCount: 6,
  },
  {
    id: 'p4', ragioneSociale: 'IB EXPRESS SRLS', partitaIva: '06789012345', codiceFiscale: null,
    indirizzo: null, telefono: null, email: 'info@ibexpress.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-08-10', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ id: 'm10', targa: 'GR184MD', marca: 'Ford', modello: 'TRANSIT', dataInizio: '2025-01-01' }],
    palmariAssegnati: [],
    codiciAutista: [{ id: 'ca4', codice: 'AUT004', nome: 'Piotr', cognome: 'Kowalski', dataInizio: '2025-01-01' }],
    conteggiCount: 4,
  },
  {
    id: 'p5', ragioneSociale: 'QUICK EXPRESS SRLS', partitaIva: '07890123456', codiceFiscale: null,
    indirizzo: null, telefono: null, email: 'info@quickexpress.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-07-20', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ id: 'm15', targa: 'GR637XD', marca: 'Ford', modello: 'E-TRANSIT', dataInizio: '2025-01-01' }],
    palmariAssegnati: [],
    codiciAutista: [],
    conteggiCount: 3,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scadenzaInfo(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const oggi = new Date();
  const giorni = Math.ceil((d.getTime() - oggi.getTime()) / 86400000);
  const label = d.toLocaleDateString('it-IT');
  if (giorni < 0) return { label, giorni: `Scaduto ${Math.abs(giorni)}gg fa`, cls: 'pd-scad-expired' };
  if (giorni <= 30) return { label, giorni: `${giorni}gg`, cls: 'pd-scad-warning' };
  return { label, giorni: `${giorni}gg`, cls: 'pd-scad-ok' };
}

type Tab = 'info' | 'mezzi' | 'palmari' | 'codici' | 'documenti' | 'conteggi';

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
export default function PadronciniPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(MOCK[0].id);
  const [padroncini, setPadroncini] = useState<Padroncino[]>(MOCK);
  const [showNuovo, setShowNuovo] = useState(false);
  const [assignModal, setAssignModal] = useState<{ type: 'mezzo' | 'palmare' | 'codice' } | null>(null);

  const filtered = useMemo(() =>
    padroncini.filter((p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return p.ragioneSociale.toLowerCase().includes(s) || p.partitaIva.includes(s);
    }), [search, padroncini]);

  const selectedP = padroncini.find((p) => p.id === selected) ?? null;

  // ── Calcola gli item disponibili per ogni tipo di assegnazione ──
  const availableItems = useMemo(() => {
    if (!selectedP) return { mezzi: [], palmari: [], codici: [] };

    // ID già assegnati al padroncino selezionato
    const mezziGiaAssegnati = new Set(selectedP.mezziAssegnati.map(m => m.id));
    const palmariGiaAssegnati = new Set(selectedP.palmariAssegnati.map(p => p.id));
    const codiciGiaAssegnati = new Set(selectedP.codiciAutista.map(c => c.id));

    // Mezzi: mostra tutti (disponibili liberi + quelli già assegnati a questo padroncino)
    // Esclude solo quelli assegnati ad altri padroncini
    const mezzi = ALL_MEZZI
      .filter(m => m.stato !== 'DISMESSO' && m.stato !== 'FUORI_SERVIZIO')
      .filter(m => m.padroncinoId === null || m.padroncinoId === selectedP.id)
      .map(m => ({
        id: m.id,
        label: m.targa,
        sublabel: `${m.marca} ${m.modello} — ${m.alimentazione.replace('_', '+')}`,
        alreadyAssigned: mezziGiaAssegnati.has(m.id),
        assignedTo: mezziGiaAssegnati.has(m.id) ? selectedP.ragioneSociale : undefined,
      }));

    // Palmari: disponibili + già assegnati a questo padroncino
    const palmari = ALL_PALMARI
      .filter(p => p.stato !== 'DISMESSO' && p.stato !== 'GUASTO')
      .filter(p => p.padroncinoId === null || p.padroncinoId === selectedP.id)
      .map(p => ({
        id: p.id,
        label: p.codice,
        sublabel: `${p.modello} — ${p.tariffa}€/mese`,
        alreadyAssigned: palmariGiaAssegnati.has(p.id),
        assignedTo: palmariGiaAssegnati.has(p.id) ? selectedP.ragioneSociale : undefined,
      }));

    // Codici autisti: attivi non assegnati ad altri + già assegnati a questo
    const codici = ALL_CODICI_AUTISTI
      .filter(c => c.attivo)
      .filter(c => c.padroncinoId === null || c.padroncinoId === selectedP.id)
      .map(c => ({
        id: c.id,
        label: c.codice,
        sublabel: `${c.nome} ${c.cognome}`,
        alreadyAssigned: codiciGiaAssegnati.has(c.id),
        assignedTo: codiciGiaAssegnati.has(c.id) ? selectedP.ragioneSociale : undefined,
      }));

    return { mezzi, palmari, codici };
  }, [selectedP]);

  const handleNuovoPadroncino = (data: NuovoPadroncino) => {
    const np: Padroncino = {
      id: `p${Date.now()}`,
      ragioneSociale: data.ragioneSociale,
      partitaIva: data.partitaIva,
      codiceFiscale: data.codiceFiscale || null,
      indirizzo: data.indirizzo || null,
      telefono: data.telefono || null,
      email: data.email || null,
      pec: data.pec || null,
      iban: data.iban || null,
      scadenzaDurc: data.scadenzaDurc || null,
      scadenzaDvr: data.scadenzaDvr || null,
      attivo: true,
      note: data.note || null,
      mezziAssegnati: [],
      palmariAssegnati: [],
      codiciAutista: [],
      conteggiCount: 0,
    };
    setPadroncini((prev) => [...prev, np]);
    setSelected(np.id);
  };

  const handleAssegna = (itemId: string, dataInizio: string) => {
    if (!selected || !assignModal) return;
    setPadroncini((prev) =>
      prev.map((p) => {
        if (p.id !== selected) return p;
        if (assignModal.type === 'mezzo') {
          const item = ALL_MEZZI.find((m) => m.id === itemId);
          if (!item) return p;
          return { ...p, mezziAssegnati: [...p.mezziAssegnati, { id: item.id, targa: item.targa, marca: item.marca, modello: item.modello, dataInizio }] };
        }
        if (assignModal.type === 'palmare') {
          const item = ALL_PALMARI.find((m) => m.id === itemId);
          if (!item) return p;
          return { ...p, palmariAssegnati: [...p.palmariAssegnati, { id: item.id, codice: item.codice, tariffa: item.tariffa, dataInizio }] };
        }
        if (assignModal.type === 'codice') {
          const item = ALL_CODICI_AUTISTI.find((m) => m.id === itemId);
          if (!item) return p;
          return { ...p, codiciAutista: [...p.codiciAutista, { id: item.id, codice: item.codice, nome: item.nome, cognome: item.cognome, dataInizio }] };
        }
        return p;
      })
    );
  };

  return (
    <div className="pd-page">
      {/* SIDEBAR LISTA */}
      <div className="pd-sidebar">
        <div className="pd-sidebar-header">
          <h1>Padroncini</h1>
          <button className="btn-primary btn-sm" onClick={() => setShowNuovo(true)}>+ Nuovo</button>
        </div>
        <div className="pd-search-wrap">
          <input className="pd-search" placeholder="🔍 Cerca padroncino…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pd-list">
          {filtered.map((p) => {
            const durc = scadenzaInfo(p.scadenzaDurc);
            const isExpired = durc && durc.cls === 'pd-scad-expired';
            const isWarning = durc && durc.cls === 'pd-scad-warning';
            return (
              <div
                key={p.id}
                className={`pd-list-item ${selected === p.id ? 'pd-list-active' : ''}`}
                onClick={() => setSelected(p.id)}
              >
                <div className="pd-list-avatar">{p.ragioneSociale[0]}</div>
                <div className="pd-list-info">
                  <div className="pd-list-name">{p.ragioneSociale}</div>
                  <div className="pd-list-meta">
                    <span>{p.mezziAssegnati.length} mezzi</span>
                    <span>·</span>
                    <span>{p.codiciAutista.length} autisti</span>
                  </div>
                </div>
                {(isExpired || isWarning) && (
                  <span className={`pd-list-alert ${isExpired ? 'alert-red' : 'alert-orange'}`}>!</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DETTAGLIO */}
      {selectedP ? (
        <PadroncinoDetail
          p={selectedP}
          onAssegna={(type) => setAssignModal({ type })}
          onRimuoviMezzo={(id) => setPadroncini(prev => prev.map(p => p.id === selectedP.id ? { ...p, mezziAssegnati: p.mezziAssegnati.filter(m => m.id !== id) } : p))}
          onRimuoviPalmare={(id) => setPadroncini(prev => prev.map(p => p.id === selectedP.id ? { ...p, palmariAssegnati: p.palmariAssegnati.filter(m => m.id !== id) } : p))}
          onRimuoviCodice={(id) => setPadroncini(prev => prev.map(p => p.id === selectedP.id ? { ...p, codiciAutista: p.codiciAutista.filter(m => m.id !== id) } : p))}
        />
      ) : (
        <div className="pd-empty-detail">
          <span>👤</span>
          <p>Seleziona un padroncino</p>
        </div>
      )}

      {/* MODALS */}
      <NuovoPadroncinoModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleNuovoPadroncino} />

      {assignModal && selectedP && (
        <AssegnaModal
          open={true}
          type={assignModal.type}
          padroncinoNome={selectedP.ragioneSociale}
          items={
            assignModal.type === 'mezzo' ? availableItems.mezzi :
            assignModal.type === 'palmare' ? availableItems.palmari :
            availableItems.codici
          }
          onClose={() => setAssignModal(null)}
          onAssegna={handleAssegna}
        />
      )}
    </div>
  );
}

// ─── DETTAGLIO PADRONCINO ─────────────────────────────────────────────────────
function PadroncinoDetail({
  p,
  onAssegna,
  onRimuoviMezzo,
  onRimuoviPalmare,
  onRimuoviCodice,
}: {
  p: Padroncino;
  onAssegna: (type: 'mezzo' | 'palmare' | 'codice') => void;
  onRimuoviMezzo: (id: string) => void;
  onRimuoviPalmare: (id: string) => void;
  onRimuoviCodice: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('info');
  const durc = scadenzaInfo(p.scadenzaDurc);
  const dvr = scadenzaInfo(p.scadenzaDvr);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'info', label: 'Anagrafica' },
    { key: 'mezzi', label: 'Mezzi', count: p.mezziAssegnati.length },
    { key: 'palmari', label: 'Palmari', count: p.palmariAssegnati.length },
    { key: 'codici', label: 'Autisti', count: p.codiciAutista.length },
    { key: 'documenti', label: 'Documenti' },
    { key: 'conteggi', label: 'Storico', count: p.conteggiCount },
  ];

  return (
    <div className="pd-detail">
      <div className="pd-detail-header">
        <div className="pd-detail-avatar">{p.ragioneSociale[0]}</div>
        <div className="pd-detail-title">
          <h2>{p.ragioneSociale}</h2>
          <div className="pd-detail-sub">
            <span className="pd-mono">{p.partitaIva}</span>
            <span className={`pd-badge ${p.attivo ? 'pd-badge-green' : 'pd-badge-gray'}`}>
              {p.attivo ? 'ATTIVO' : 'INATTIVO'}
            </span>
          </div>
        </div>
        <div className="pd-detail-actions">
          <button className="btn-outline btn-sm">✏️ Modifica</button>
          <button className="btn-outline btn-sm">📊 Conteggio</button>
        </div>
      </div>

      <div className="pd-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pd-tab ${tab === t.key ? 'pd-tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="pd-tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="pd-tab-content">
        {tab === 'info' && (
          <div className="pd-info-grid">
            <div className="pd-section">
              <h4>Contatti</h4>
              <Field label="Indirizzo" value={p.indirizzo} />
              <Field label="Telefono" value={p.telefono} />
              <Field label="Email" value={p.email} />
              <Field label="PEC" value={p.pec} />
            </div>
            <div className="pd-section">
              <h4>Dati bancari</h4>
              <Field label="IBAN" value={p.iban} mono />
              <Field label="Codice Fiscale" value={p.codiceFiscale} mono />
            </div>
            <div className="pd-section">
              <h4>Scadenze</h4>
              <div className="pd-scadenze">
                <div className={`pd-scad-row ${durc?.cls || ''}`}>
                  <span className="pd-scad-type">DURC</span>
                  <span className="pd-scad-date">{durc?.label || '—'}</span>
                  {durc && <span className="pd-scad-days">{durc.giorni}</span>}
                </div>
                <div className={`pd-scad-row ${dvr?.cls || ''}`}>
                  <span className="pd-scad-type">DVR</span>
                  <span className="pd-scad-date">{dvr?.label || '—'}</span>
                  {dvr && <span className="pd-scad-days">{dvr.giorni}</span>}
                </div>
              </div>
            </div>
            {p.note && (
              <div className="pd-section pd-section-full">
                <h4>Note</h4>
                <p className="pd-note">{p.note}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'mezzi' && (
          <div>
            <div className="pd-tab-toolbar">
              <span className="pd-tab-toolbar-title">{p.mezziAssegnati.length} mezzi assegnati</span>
              <button className="btn-primary btn-sm" onClick={() => onAssegna('mezzo')}>+ Assegna Mezzo</button>
            </div>
            <div className="pd-assign-list">
              {p.mezziAssegnati.length === 0 && (
                <div className="pd-empty-assign">
                  <span>🚛</span><p>Nessun mezzo assegnato</p>
                  <button className="btn-outline btn-sm" onClick={() => onAssegna('mezzo')}>+ Assegna</button>
                </div>
              )}
              {p.mezziAssegnati.map((m) => (
                <div key={m.id} className="pd-assign-item">
                  <div className="pd-assign-icon">🚛</div>
                  <div className="pd-assign-info">
                    <span className="pd-assign-code">{m.targa}</span>
                    <span className="pd-assign-name">{m.marca} {m.modello}</span>
                    <span className="pd-assign-since">Dal {new Date(m.dataInizio).toLocaleDateString('it-IT')}</span>
                  </div>
                  <div className="pd-assign-actions">
                    <button className="btn-ghost-sm">Dettaglio →</button>
                    <button className="btn-danger-sm" onClick={() => onRimuoviMezzo(m.id)}>Rimuovi</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'palmari' && (
          <div>
            <div className="pd-tab-toolbar">
              <span className="pd-tab-toolbar-title">{p.palmariAssegnati.length} palmari assegnati</span>
              <button className="btn-primary btn-sm" onClick={() => onAssegna('palmare')}>+ Assegna Palmare</button>
            </div>
            <div className="pd-assign-list">
              {p.palmariAssegnati.length === 0 && (
                <div className="pd-empty-assign">
                  <span>📱</span><p>Nessun palmare assegnato</p>
                  <button className="btn-outline btn-sm" onClick={() => onAssegna('palmare')}>+ Assegna</button>
                </div>
              )}
              {p.palmariAssegnati.map((m) => (
                <div key={m.id} className="pd-assign-item">
                  <div className="pd-assign-icon">📱</div>
                  <div className="pd-assign-info">
                    <span className="pd-assign-code">{m.codice}</span>
                    <span className="pd-assign-name">{m.tariffa}€/mese</span>
                    <span className="pd-assign-since">Dal {new Date(m.dataInizio).toLocaleDateString('it-IT')}</span>
                  </div>
                  <div className="pd-assign-actions">
                    <button className="btn-danger-sm" onClick={() => onRimuoviPalmare(m.id)}>Rimuovi</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'codici' && (
          <div>
            <div className="pd-tab-toolbar">
              <span className="pd-tab-toolbar-title">{p.codiciAutista.length} codici autista</span>
              <button className="btn-primary btn-sm" onClick={() => onAssegna('codice')}>+ Assegna Codice</button>
            </div>
            <div className="pd-assign-list">
              {p.codiciAutista.length === 0 && (
                <div className="pd-empty-assign">
                  <span>🏷️</span><p>Nessun codice autista associato</p>
                  <button className="btn-outline btn-sm" onClick={() => onAssegna('codice')}>+ Assegna</button>
                </div>
              )}
              {p.codiciAutista.map((c) => (
                <div key={c.id} className="pd-assign-item">
                  <div className="pd-assign-icon">🏷️</div>
                  <div className="pd-assign-info">
                    <span className="pd-assign-code">{c.codice}</span>
                    <span className="pd-assign-name">{c.nome} {c.cognome}</span>
                    <span className="pd-assign-since">Dal {new Date(c.dataInizio).toLocaleDateString('it-IT')}</span>
                  </div>
                  <div className="pd-assign-actions">
                    <button className="btn-ghost-sm">Acconti →</button>
                    <button className="btn-danger-sm" onClick={() => onRimuoviCodice(c.id)}>Rimuovi</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'documenti' && (
          <div className="pd-docs-empty">
            <span>📂</span>
            <p>Nessun documento caricato</p>
            <button className="btn-outline btn-sm">+ Carica documento</button>
          </div>
        )}

        {tab === 'conteggi' && (
          <div className="pd-docs-empty">
            <span>📊</span>
            <p>{p.conteggiCount} conteggi storici</p>
            <button className="btn-outline btn-sm">Vai ai conteggi</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="pd-field">
      <span className="pd-field-label">{label}</span>
      <span className={`pd-field-value ${mono ? 'pd-mono' : ''} ${!value ? 'pd-field-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}
