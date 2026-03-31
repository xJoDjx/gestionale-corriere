// src/features/codici-autista/CodiciAutisti.tsx  — VISTA DETTAGLIO
import { useState, useMemo } from 'react';
import './CodiciAutisti.css';
import NuovoCodiceAutistaModal, { NuovoCodiceAutista } from './NuovoCodiceAutistaModal';

interface Acconto {
  id: string;
  importo: number;
  data: string;
  descrizione?: string | null;
  mese?: string | null;
}

interface AssegnazionePadroncino {
  id: string;
  padroncinoId: string;
  ragioneSociale: string;
  dataInizio: string;
  dataFine?: string | null;
}

interface CodiceAutista {
  id: string;
  codice: string;
  nome: string | null;
  cognome: string | null;
  note: string | null;
  attivo: boolean;
  createdAt: string;
  assegnazioni: AssegnazionePadroncino[];
  acconti: Acconto[];
}

const MOCK: CodiceAutista[] = [
  {
    id: '1', codice: 'AUT001', nome: 'Mario', cognome: 'Rossi',
    note: null, attivo: true, createdAt: '2024-09-01',
    assegnazioni: [
      { id: 'a1', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC SRLS', dataInizio: '2024-09-01' },
    ],
    acconti: [
      { id: 'ac1', importo: 200, data: '2026-01-10', descrizione: 'Acconto gennaio', mese: '2026-01' },
      { id: 'ac2', importo: 150, data: '2026-02-08', descrizione: 'Acconto febbraio', mese: '2026-02' },
      { id: 'ac3', importo: 200, data: '2026-03-12', descrizione: 'Acconto marzo', mese: '2026-03' },
    ],
  },
  {
    id: '2', codice: 'AUT002', nome: 'Luca', cognome: 'Ferrari',
    note: null, attivo: true, createdAt: '2024-10-01',
    assegnazioni: [
      { id: 'a2', padroncinoId: 'p2', ragioneSociale: 'DI NARDO TRASPORTI', dataInizio: '2024-10-01' },
    ],
    acconti: [
      { id: 'ac4', importo: 300, data: '2026-03-05', descrizione: 'Acconto marzo', mese: '2026-03' },
    ],
  },
  {
    id: '3', codice: 'AUT003', nome: 'Ahmed', cognome: 'Benali',
    note: null, attivo: true, createdAt: '2024-11-15',
    assegnazioni: [
      { id: 'a3', padroncinoId: 'p3', ragioneSociale: 'EL SPEDIZIONI', dataInizio: '2024-11-15' },
    ],
    acconti: [],
  },
  {
    id: '4', codice: 'AUT004', nome: 'Piotr', cognome: 'Kowalski',
    note: 'Autista senior', attivo: true, createdAt: '2025-01-01',
    assegnazioni: [
      { id: 'a4', padroncinoId: 'p4', ragioneSociale: 'IB EXPRESS SRLS', dataInizio: '2025-01-01' },
    ],
    acconti: [
      { id: 'ac5', importo: 400, data: '2026-03-01', descrizione: 'Acconto inizio mese', mese: '2026-03' },
    ],
  },
  {
    id: '5', codice: 'AUT005', nome: 'Giuseppe', cognome: 'Marino',
    note: null, attivo: false, createdAt: '2024-06-01',
    assegnazioni: [
      { id: 'a5', padroncinoId: 'p5', ragioneSociale: 'QUICK EXPRESS SRLS', dataInizio: '2024-06-01', dataFine: '2025-01-31' },
    ],
    acconti: [],
  },
  {
    id: '6', codice: 'AUT006', nome: 'Ivan', cognome: 'Petrovic',
    note: null, attivo: true, createdAt: '2025-03-01',
    assegnazioni: [],
    acconti: [],
  },
];

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT');
}

function initials(nome?: string | null, cognome?: string | null) {
  return `${(nome ?? '').charAt(0)}${(cognome ?? '').charAt(0)}`.toUpperCase() || '?';
}

// ─── PANNELLO DETTAGLIO ──────────────────────────────────
function CodiceDetail({ c, onClose }: { c: CodiceAutista; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'acconti' | 'storico'>('info');
  const assegnazioneAttiva = c.assegnazioni.find((a) => !a.dataFine);
  const totaleAcconti = c.acconti.reduce((s, a) => s + a.importo, 0);

  return (
    <div className="ca-detail">
      {/* Header */}
      <div className="ca-detail-header">
        <div className="ca-detail-avatar">
          {initials(c.nome, c.cognome)}
        </div>
        <div className="ca-detail-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ca-detail-codice">{c.codice}</span>
            <span className={`ca-badge ${c.attivo ? 'ca-badge-attivo' : 'ca-badge-inattivo'}`}>
              {c.attivo ? 'Attivo' : 'Inattivo'}
            </span>
          </div>
          <span className="ca-detail-name">{c.nome} {c.cognome}</span>
        </div>
        <button className="ca-detail-close" onClick={onClose}>✕</button>
      </div>

      {/* Bar padroncino assegnato */}
      {assegnazioneAttiva ? (
        <div className="ca-detail-assigned-bar">
          <span className="ca-detail-assigned-icon">🏢</span>
          <div>
            <span className="ca-detail-assigned-name">{assegnazioneAttiva.ragioneSociale}</span>
            <span className="ca-detail-assigned-since">dal {fmt(assegnazioneAttiva.dataInizio)}</span>
          </div>
          <button className="btn-danger-sm" style={{ marginLeft: 'auto' }}>Rimuovi</button>
        </div>
      ) : (
        <div className="ca-detail-available-bar">
          <span>✅</span>
          <span>Codice non assegnato a nessun padroncino</span>
          <button className="btn-primary btn-sm" style={{ marginLeft: 'auto' }}>+ Assegna</button>
        </div>
      )}

      {/* Tabs */}
      <div className="ca-detail-tabs">
        {(['info', 'acconti', 'storico'] as const).map((t) => (
          <button key={t} className={`ca-detail-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'info'    && '📋 Informazioni'}
            {t === 'acconti' && `💰 Acconti (${c.acconti.length})`}
            {t === 'storico' && `📜 Storico (${c.assegnazioni.length})`}
          </button>
        ))}
      </div>

      <div className="ca-detail-body">

        {/* ── INFO ── */}
        {tab === 'info' && (
          <div className="ca-detail-fields">
            <div className="ca-detail-section">
              <span className="ca-detail-section-title">DATI AUTISTA</span>
              <div className="ca-detail-grid">
                <Field label="Codice" value={c.codice} mono />
                <Field label="Stato" value={c.attivo ? 'Attivo' : 'Inattivo'} />
                <Field label="Nome" value={c.nome} />
                <Field label="Cognome" value={c.cognome} />
                <Field label="Inserito il" value={fmt(c.createdAt)} />
                <Field label="Padroncino assegnato" value={assegnazioneAttiva?.ragioneSociale ?? null} />
              </div>
            </div>

            <div className="ca-detail-section">
              <span className="ca-detail-section-title">RIEPILOGO ACCONTI</span>
              <div className="ca-detail-grid">
                <Field label="N° acconti registrati" value={String(c.acconti.length)} />
                <Field label="Totale acconti" value={totaleAcconti > 0 ? `${totaleAcconti.toLocaleString('it-IT')} €` : null} />
              </div>
            </div>

            {c.note && (
              <div className="ca-detail-section">
                <span className="ca-detail-section-title">NOTE</span>
                <div className="ca-detail-note">{c.note}</div>
              </div>
            )}
          </div>
        )}

        {/* ── ACCONTI ── */}
        {tab === 'acconti' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Totale: </span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                  {totaleAcconti.toLocaleString('it-IT')} €
                </span>
              </div>
              <button className="btn-primary btn-sm">+ Nuovo Acconto</button>
            </div>
            {c.acconti.length === 0 ? (
              <div className="ca-detail-empty">
                <span>💰</span>
                <p>Nessun acconto registrato</p>
                <button className="btn-outline btn-sm">+ Aggiungi acconto</button>
              </div>
            ) : (
              <div className="ca-acconti-list">
                {c.acconti.map((a) => (
                  <div key={a.id} className="ca-acconto-item">
                    <div className="ca-acconto-left">
                      <span className="ca-acconto-desc">{a.descrizione || 'Acconto'}</span>
                      <span className="ca-acconto-date">{fmt(a.data)}{a.mese && ` — ${a.mese}`}</span>
                    </div>
                    <span className="ca-acconto-importo">+{a.importo.toLocaleString('it-IT')} €</span>
                    <button className="btn-ghost-sm">✏️</button>
                    <button className="btn-danger-sm">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STORICO ── */}
        {tab === 'storico' && (
          <div>
            {c.assegnazioni.length === 0 ? (
              <div className="ca-detail-empty">
                <span>📋</span>
                <p>Nessuna assegnazione registrata</p>
              </div>
            ) : (
              <div className="ca-storico-list">
                {c.assegnazioni.map((a) => (
                  <div key={a.id} className={`ca-storico-item ${!a.dataFine ? 'ca-storico-active' : ''}`}>
                    <div className="ca-storico-avatar">
                      {a.ragioneSociale.charAt(0)}
                    </div>
                    <div className="ca-storico-info">
                      <span className="ca-storico-name">{a.ragioneSociale}</span>
                      <span className="ca-storico-period">
                        {fmt(a.dataInizio)} → {a.dataFine
                          ? fmt(a.dataFine)
                          : <strong style={{ color: 'var(--success)' }}>In corso</strong>
                        }
                      </span>
                    </div>
                    {!a.dataFine && <span className="ca-badge ca-badge-attivo">Attivo</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="ca-detail-footer">
        <button className="btn-outline btn-sm">✏️ Modifica</button>
        <button className={`btn-sm ${c.attivo ? 'btn-warning-outline' : 'btn-outline'}`}>
          {c.attivo ? '🔒 Disattiva' : '🔓 Riattiva'}
        </button>
        <button className="btn-danger-outline btn-sm">🗑 Elimina</button>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="ca-detail-field">
      <span className="ca-detail-field-label">{label}</span>
      <span className={`ca-detail-field-value ${mono ? 'ca-detail-mono' : ''} ${!value ? 'ca-detail-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── PAGINA PRINCIPALE ──────────────────────────────────
export default function CodiciAutisti() {
  const [search, setSearch] = useState('');
  const [mostraInattivi, setMostraInattivi] = useState(false);
  const [selected, setSelected] = useState<CodiceAutista | null>(null);
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [data, setData] = useState<CodiceAutista[]>(MOCK);

  const filtered = useMemo(() => {
    return data.filter((c) => {
      if (!mostraInattivi && !c.attivo) return false;
      const s = search.toLowerCase();
      return (
        c.codice.toLowerCase().includes(s) ||
        (c.nome ?? '').toLowerCase().includes(s) ||
        (c.cognome ?? '').toLowerCase().includes(s) ||
        (c.assegnazioni.find(a => !a.dataFine)?.ragioneSociale ?? '').toLowerCase().includes(s)
      );
    });
  }, [data, search, mostraInattivi]);

  const stats = useMemo(() => ({
    totale: data.length,
    attivi: data.filter((c) => c.attivo).length,
    assegnati: data.filter((c) => c.assegnazioni.some(a => !a.dataFine)).length,
    liberi: data.filter((c) => c.attivo && !c.assegnazioni.some(a => !a.dataFine)).length,
  }), [data]);

  const handleSave = (form: NuovoCodiceAutista) => {
    const nuovo: CodiceAutista = {
      id: Date.now().toString(),
      codice: form.codice,
      nome: form.nome,
      cognome: form.cognome,
      note: form.note || null,
      attivo: true,
      createdAt: new Date().toISOString(),
      assegnazioni: [],
      acconti: [],
    };
    setData((d) => [...d, nuovo]);
  };

  return (
    <div className="ca-page-master">
      {/* ── SIDEBAR ── */}
      <div className="ca-sidebar">
        <div className="ca-sidebar-header">
          <h1>🏷️ Codici Autista</h1>
          <button className="btn-primary btn-sm" onClick={() => setNuovoOpen(true)}>+ Nuovo</button>
        </div>

        {/* Stats */}
        <div className="ca-sidebar-stats">
          <div className="ca-ss-item">
            <span className="ca-ss-val">{stats.totale}</span>
            <span className="ca-ss-label">Totale</span>
          </div>
          <div className="ca-ss-item ca-ss-attivi">
            <span className="ca-ss-val">{stats.attivi}</span>
            <span className="ca-ss-label">Attivi</span>
          </div>
          <div className="ca-ss-item ca-ss-assegnati">
            <span className="ca-ss-val">{stats.assegnati}</span>
            <span className="ca-ss-label">Assegnati</span>
          </div>
          <div className="ca-ss-item ca-ss-liberi">
            <span className="ca-ss-val">{stats.liberi}</span>
            <span className="ca-ss-label">Liberi</span>
          </div>
        </div>

        {/* Ricerca */}
        <div className="ca-sidebar-search">
          <span>🔍</span>
          <input
            placeholder="Cerca codice o autista…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Toggle inattivi */}
        <div className="ca-sidebar-toggle">
          <label className="ca-toggle">
            <input type="checkbox" checked={mostraInattivi} onChange={(e) => setMostraInattivi(e.target.checked)} />
            <span>Mostra inattivi</span>
          </label>
        </div>

        {/* Lista */}
        <div className="ca-sidebar-list">
          {filtered.length === 0 && (
            <div className="ca-sidebar-empty">Nessun codice trovato</div>
          )}
          {filtered.map((c) => {
            const attiva = c.assegnazioni.find((a) => !a.dataFine);
            return (
              <div
                key={c.id}
                className={`ca-list-item ${selected?.id === c.id ? 'ca-list-active' : ''} ${!c.attivo ? 'ca-list-inactive' : ''}`}
                onClick={() => setSelected(c)}
              >
                <div className="ca-list-avatar">
                  {initials(c.nome, c.cognome)}
                </div>
                <div className="ca-list-info">
                  <span className="ca-list-codice">{c.codice}</span>
                  <span className="ca-list-name">{c.nome} {c.cognome}</span>
                  {attiva && <span className="ca-list-assigned">{attiva.ragioneSociale}</span>}
                  {!attiva && c.attivo && <span className="ca-list-free">Non assegnato</span>}
                </div>
                <div className="ca-list-right">
                  <span className={`ca-badge ${c.attivo ? 'ca-badge-attivo' : 'ca-badge-inattivo'}`}>
                    {c.attivo ? '●' : '○'}
                  </span>
                  {c.acconti.length > 0 && (
                    <span className="ca-list-acconti">{c.acconti.length} acc.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div className="ca-main">
        {selected ? (
          <CodiceDetail c={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="ca-empty-state">
            <div className="ca-empty-icon">🏷️</div>
            <h2>Seleziona un codice autista</h2>
            <p>Scegli un codice dalla lista per visualizzare i dettagli, gli acconti e lo storico</p>
            <button className="btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo Codice Autista</button>
          </div>
        )}
      </div>

      <NuovoCodiceAutistaModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleSave} />
    </div>
  );
}
