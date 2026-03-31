import { useState, useMemo } from 'react';
import './Padroncini.css';

interface Padroncino {
  id: string;
  ragioneSociale: string;
  partitaIva: string | null;
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
  mezziAssegnati: { targa: string; marca: string; modello: string }[];
  palmariAssegnati: { codice: string }[];
  codiciAutista: { codice: string; nome: string; cognome: string }[];
  conteggiCount: number;
}

const MOCK: Padroncino[] = [
  {
    id: 'p1', ragioneSociale: 'MEN LOGISTIC', partitaIva: '03456789012', codiceFiscale: '03456789012',
    indirizzo: 'Via Roma 45, Cosenza', telefono: '0984123456', email: 'info@menlogistic.it',
    pec: 'menlogistic@pec.it', iban: 'IT60X0542811101000000123456',
    scadenzaDurc: '2026-06-15', scadenzaDvr: '2026-12-01', attivo: true, note: 'Partner principale distribuzione',
    mezziAssegnati: [
      { targa: 'GH627TF', marca: 'Ford', modello: 'TRANSIT' },
      { targa: 'GH628TF', marca: 'Ford', modello: 'TRANSIT' },
      { targa: 'GM098FB', marca: 'Ford', modello: 'E-TRANSIT' },
      { targa: 'GM100FB', marca: 'Ford', modello: 'E-TRANSIT' },
      { targa: 'GM709PN', marca: 'Ford', modello: 'E-TRANSIT' },
      { targa: 'GR498EZ', marca: 'Ford', modello: 'TRANSIT' },
      { targa: 'GR500EZ', marca: 'Ford', modello: 'TRANSIT' },
      { targa: 'GR507EZ', marca: 'Ford', modello: 'TRANSIT' },
      { targa: 'GR628XD', marca: 'Ford', modello: 'E-TRANSIT' },
      { targa: 'GS691VF', marca: 'Man', modello: 'ETGE' },
    ],
    palmariAssegnati: [{ codice: 'PAL-001' }],
    codiciAutista: [{ codice: 'AUT001', nome: 'Marco', cognome: 'Rossi' }],
    conteggiCount: 12,
  },
  {
    id: 'p2', ragioneSociale: 'DI NARDO', partitaIva: '04567890123', codiceFiscale: null,
    indirizzo: 'Via Napoli 12, Rende', telefono: '0984567890', email: 'info@dinardo.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-04-01', scadenzaDvr: '2026-10-15', attivo: true, note: null,
    mezziAssegnati: [{ targa: 'GM099FB', marca: 'Ford', modello: 'E-TRANSIT' }],
    palmariAssegnati: [{ codice: 'PAL-002' }],
    codiciAutista: [{ codice: 'AUT002', nome: 'Giuseppe', cognome: 'Bianchi' }],
    conteggiCount: 8,
  },
  {
    id: 'p3', ragioneSociale: 'EL SPEDIZIONI', partitaIva: '05678901234', codiceFiscale: null,
    indirizzo: 'Contrada Piano, Montalto Uffugo', telefono: '0984111222', email: 'info@elspedizioni.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-03-20', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ targa: 'GR496EZ', marca: 'Ford', modello: 'TRANSIT' }],
    palmariAssegnati: [{ codice: 'PAL-003' }],
    codiciAutista: [{ codice: 'AUT003', nome: 'Antonio', cognome: 'Esposito' }],
    conteggiCount: 6,
  },
  {
    id: 'p4', ragioneSociale: 'IB EXPRESS SRLS', partitaIva: '06789012345', codiceFiscale: null,
    indirizzo: null, telefono: null, email: 'info@ibexpress.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-08-10', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ targa: 'GR184MD', marca: 'Ford', modello: 'TRANSIT' }],
    palmariAssegnati: [],
    codiciAutista: [{ codice: 'AUT004', nome: 'Luigi', cognome: 'Russo' }],
    conteggiCount: 4,
  },
  {
    id: 'p5', ragioneSociale: 'QUICK EXPRESS SRLS', partitaIva: '07890123456', codiceFiscale: null,
    indirizzo: null, telefono: null, email: 'info@quickexpress.it',
    pec: null, iban: null,
    scadenzaDurc: '2026-07-20', scadenzaDvr: null, attivo: true, note: null,
    mezziAssegnati: [{ targa: 'GR637XD', marca: 'Ford', modello: 'E-TRANSIT' }],
    palmariAssegnati: [{ codice: 'PAL-005' }],
    codiciAutista: [{ codice: 'AUT005', nome: 'Francesco', cognome: 'Romano' }],
    conteggiCount: 3,
  },
];

function formatScadenza(d: string | null) {
  if (!d) return null;
  const now = new Date();
  const date = new Date(d);
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  const label = date.toLocaleDateString('it-IT');
  if (diff < 0) return { label, giorni: `${Math.abs(diff)}gg fa`, cls: 'scad-danger' };
  if (diff <= 30) return { label, giorni: `${diff}gg`, cls: 'scad-warning' };
  if (diff <= 90) return { label, giorni: `${diff}gg`, cls: 'scad-info' };
  return { label, giorni: `${diff}gg`, cls: 'scad-ok' };
}

export default function PadronciniPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>('p1');
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return MOCK;
    const s = search.toLowerCase();
    return MOCK.filter(
      (p) =>
        p.ragioneSociale.toLowerCase().includes(s) ||
        p.partitaIva?.includes(s) ||
        p.email?.toLowerCase().includes(s),
    );
  }, [search]);

  const selected = MOCK.find((p) => p.id === selectedId) || null;

  return (
    <div className="pad-page">
      <div className="pad-header">
        <h1>Padroncini</h1>
        <div className="pad-header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Nuovo padroncino
          </button>
        </div>
      </div>

      <div className="pad-stats">
        <div className="pad-stat">
          <span className="pad-stat-label">TOTALI</span>
          <span className="pad-stat-value">{MOCK.length}</span>
        </div>
        <div className="pad-stat">
          <span className="pad-stat-label">ATTIVI</span>
          <span className="pad-stat-value">{MOCK.filter((p) => p.attivo).length}</span>
        </div>
        <div className="pad-stat pad-stat-danger">
          <span className="pad-stat-label">DURC SCADUTI</span>
          <span className="pad-stat-value">
            {MOCK.filter((p) => {
              if (!p.scadenzaDurc) return false;
              return new Date(p.scadenzaDurc) < new Date();
            }).length}
          </span>
        </div>
        <div className="pad-stat">
          <span className="pad-stat-label">MEZZI TOTALI</span>
          <span className="pad-stat-value">
            {MOCK.reduce((s, p) => s + p.mezziAssegnati.length, 0)}
          </span>
        </div>
      </div>

      <div className="pad-layout">
        {/* Lista */}
        <div className="pad-list">
          <div className="pad-search">
            <span className="pad-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Cerca padroncino..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="pad-list-items">
            {filtered.map((p) => {
              const durc = formatScadenza(p.scadenzaDurc);
              return (
                <div
                  key={p.id}
                  className={`pad-list-item ${selectedId === p.id ? 'pad-list-active' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div className="pad-list-avatar">
                    {p.ragioneSociale.substring(0, 2)}
                  </div>
                  <div className="pad-list-info">
                    <span className="pad-list-name">{p.ragioneSociale}</span>
                    <span className="pad-list-meta">
                      {p.mezziAssegnati.length} mezzi · {p.conteggiCount} conteggi
                    </span>
                  </div>
                  {durc && (
                    <span className={`pad-list-durc ${durc.cls}`} title={`DURC: ${durc.label}`}>
                      {durc.giorni}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="pad-detail">
          {selected ? (
            <PadroncinoDetail padroncino={selected} />
          ) : (
            <div className="pad-empty">
              <span>👤</span>
              <p>Seleziona un padroncino</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PadroncinoDetail({ padroncino: p }: { padroncino: Padroncino }) {
  const [tab, setTab] = useState<'info' | 'mezzi' | 'documenti' | 'conteggi'>('info');
  const durc = formatScadenza(p.scadenzaDurc);
  const dvr = formatScadenza(p.scadenzaDvr);

  return (
    <div className="pd">
      <div className="pd-header">
        <div className="pd-avatar">{p.ragioneSociale.substring(0, 2)}</div>
        <div className="pd-title">
          <h2>{p.ragioneSociale}</h2>
          <span className="pd-piva">P.IVA: {p.partitaIva || '—'}</span>
        </div>
        <div className="pd-actions">
          <span className={`pd-status ${p.attivo ? 'pd-active' : 'pd-inactive'}`}>
            {p.attivo ? 'Attivo' : 'Inattivo'}
          </span>
          <button className="btn-outline btn-sm">✏️ Modifica</button>
        </div>
      </div>

      <div className="pd-tabs">
        {(['info', 'mezzi', 'documenti', 'conteggi'] as const).map((t) => (
          <button
            key={t}
            className={`pd-tab ${tab === t ? 'pd-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'info' ? 'Anagrafica' : t === 'mezzi' ? `Mezzi (${p.mezziAssegnati.length})` : t === 'documenti' ? 'Documenti' : 'Conteggi'}
          </button>
        ))}
      </div>

      <div className="pd-body">
        {tab === 'info' && (
          <div className="pd-info-grid">
            <div className="pd-section">
              <h4>Dati anagrafici</h4>
              <div className="pd-fields">
                <Field label="Ragione Sociale" value={p.ragioneSociale} />
                <Field label="P. IVA" value={p.partitaIva} />
                <Field label="Codice Fiscale" value={p.codiceFiscale} />
                <Field label="Indirizzo" value={p.indirizzo} />
                <Field label="Telefono" value={p.telefono} />
                <Field label="Email" value={p.email} />
                <Field label="PEC" value={p.pec} />
                <Field label="IBAN" value={p.iban} mono />
              </div>
            </div>

            <div className="pd-section">
              <h4>Scadenze</h4>
              <div className="pd-scadenze">
                <div className={`pd-scad-card ${durc?.cls || ''}`}>
                  <span className="pd-scad-type">DURC</span>
                  <span className="pd-scad-date">{durc?.label || '—'}</span>
                  {durc && <span className="pd-scad-days">{durc.giorni}</span>}
                </div>
                <div className={`pd-scad-card ${dvr?.cls || ''}`}>
                  <span className="pd-scad-type">DVR</span>
                  <span className="pd-scad-date">{dvr?.label || '—'}</span>
                  {dvr && <span className="pd-scad-days">{dvr.giorni}</span>}
                </div>
              </div>
            </div>

            <div className="pd-section">
              <h4>Codici autista collegati</h4>
              <div className="pd-codici">
                {p.codiciAutista.map((c) => (
                  <div key={c.codice} className="pd-codice-item">
                    <span className="pd-codice-badge">{c.codice}</span>
                    <span>{c.nome} {c.cognome}</span>
                  </div>
                ))}
                {p.codiciAutista.length === 0 && (
                  <span className="pd-empty-text">Nessun codice autista</span>
                )}
              </div>
            </div>

            <div className="pd-section">
              <h4>Palmari assegnati</h4>
              <div className="pd-codici">
                {p.palmariAssegnati.map((pl) => (
                  <div key={pl.codice} className="pd-codice-item">
                    <span className="pd-codice-badge pd-codice-palmare">{pl.codice}</span>
                  </div>
                ))}
                {p.palmariAssegnati.length === 0 && (
                  <span className="pd-empty-text">Nessun palmare</span>
                )}
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
          <div className="pd-mezzi-list">
            {p.mezziAssegnati.map((m) => (
              <div key={m.targa} className="pd-mezzo-item">
                <span className="pd-mezzo-targa">{m.targa}</span>
                <span className="pd-mezzo-model">{m.marca} {m.modello}</span>
                <button className="btn-ghost-sm">Dettaglio</button>
              </div>
            ))}
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
