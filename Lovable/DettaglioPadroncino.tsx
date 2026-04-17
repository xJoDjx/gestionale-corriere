import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MOCK_PADRONCINI, MOCK_FATTURATO_MENSILE, type Padroncino } from './lib/mock-data';

// ─── HELPERS ──────────────────────────────────────────
function fmtEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtData(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT');
}

function scadenzaInfo(dateStr?: string | null): { days: number; cls: string; label: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  const cls = days < 0 ? 'pd-scad-expired' : days <= 10 ? 'pd-scad-warning' : 'pd-scad-ok';
  const label = days < 0 ? `Scaduto da ${Math.abs(days)}gg` : days === 0 ? 'Scade oggi' : `Tra ${days}gg`;
  return { days, cls, label };
}

function durcStatus(dateStr?: string | null): { label: string; cls: string } {
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const info = scadenzaInfo(dateStr);
  if (!info) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  if (info.days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired' };
  if (info.days <= 30) return { label: 'IN SCADENZA', cls: 'pd-doc-warning' };
  return { label: 'VALIDO', cls: 'pd-doc-ok' };
}

function dvrStatus(dateStr?: string | null, esente?: boolean): { label: string; cls: string } {
  if (esente) return { label: 'ESENTE', cls: 'pd-doc-esente' };
  if (!dateStr) return { label: 'ASSENTE', cls: 'pd-doc-absent' };
  const d = new Date(dateStr);
  const now = new Date(); now.setHours(0,0,0,0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: 'SCADUTO', cls: 'pd-doc-expired' };
  return { label: 'VALIDO', cls: 'pd-doc-ok' };
}

// ─── FIELD COMPONENT ─────────────────────────────────
function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="pd-field">
      <span className="pd-field-label">{label}</span>
      <span className={`pd-field-val ${mono ? 'pd-mono' : ''} ${!value ? 'pd-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── TAB COMPONENTS ──────────────────────────────────
function EmptyTab({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="pd-empty-tab">
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

function TabInfo({ p }: { p: Padroncino }) {
  const durcSt = durcStatus(p.scadenzaDurc);
  const durcInfo = scadenzaInfo(p.scadenzaDurc);

  return (
    <div className="pd-info-grid">
      <div className="pd-section">
        <h4>Dati Anagrafici</h4>
        <Field label="Ragione Sociale" value={p.ragioneSociale} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Partita IVA" value={p.partitaIva} mono />
          <Field label="Codice Fiscale" value={p.codiceFiscale} mono />
        </div>
        <Field label="Indirizzo" value={p.indirizzo} />
      </div>

      <div className="pd-section">
        <h4>Contatti</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Telefono" value={p.telefono} />
          <Field label="Email" value={p.email} />
          <Field label="PEC" value={p.pec} />
          <Field label="IBAN" value={p.iban} mono />
        </div>
      </div>

      <div className="pd-section pd-section-full">
        <h4>Documenti & Scadenze</h4>
        <div className="pd-scadenze">
          <div className={`pd-scad-row ${durcInfo?.cls ?? 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DURC</span>
            {p.scadenzaDurc ? (
              <>
                <span className="pd-scad-date">{fmtData(p.scadenzaDurc)}</span>
                <span className={`pd-doc-badge ${durcSt.cls}`}>{durcSt.label}</span>
                {durcInfo && <span className="pd-scad-days">{durcInfo.label}</span>}
              </>
            ) : (
              <>
                <span className="pd-scad-date pd-empty">Non inserito</span>
                <span className="pd-doc-badge pd-doc-absent">ASSENTE</span>
              </>
            )}
          </div>
          <div className={`pd-scad-row ${p.dvrEsente ? 'pd-scad-esente' : p.scadenzaDvr ? 'pd-scad-ok' : 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DVR</span>
            {p.dvrEsente ? (
              <>
                <span className="pd-scad-date">Non soggetto a DVR</span>
                <span className="pd-doc-badge pd-doc-esente">ESENTE</span>
              </>
            ) : p.scadenzaDvr ? (
              <>
                <span className="pd-scad-date">{fmtData(p.scadenzaDvr)}</span>
                <span className={`pd-doc-badge ${dvrStatus(p.scadenzaDvr).cls}`}>{dvrStatus(p.scadenzaDvr).label}</span>
              </>
            ) : (
              <>
                <span className="pd-scad-date pd-empty">Non caricato</span>
                <span className="pd-doc-badge pd-doc-absent">ASSENTE</span>
              </>
            )}
          </div>
        </div>
      </div>

      {durcInfo && durcInfo.days < 0 && (
        <div className="pd-section-full">
          <div className="pd-alert-banner">
            ⚠️ DURC scaduto — verificare documentazione
          </div>
        </div>
      )}
    </div>
  );
}

function TabMezzi({ p }: { p: Padroncino }) {
  const attivi = (p.mezziAssegnati || []).filter(m => !m.dataFine);
  if (attivi.length === 0) return <EmptyTab icon="🚚" msg="Nessun mezzo assegnato" />;
  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm">🔗 Assegna Mezzo</button>
      </div>
      <div className="pd-items-table-wrap">
        <table className="pd-items-table">
          <thead><tr><th>TARGA</th><th>MARCA / MODELLO</th><th>TIPO</th><th>DATA INIZIO</th><th>TARIFFA</th></tr></thead>
          <tbody>
            {attivi.map(m => (
              <tr key={m.id} className="pd-item-row">
                <td className="pd-item-targa">{m.targa}</td>
                <td><span className="pd-item-marca">{m.marca}</span> <span className="pd-item-modello">{m.modello}</span></td>
                <td>{m.alimentazione}</td>
                <td>{fmtData(m.dataInizio)}</td>
                <td>{m.tariffa != null ? fmtEur(m.tariffa) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabPalmari({ p }: { p: Padroncino }) {
  const attivi = (p.palmariAssegnati || []).filter(pal => !pal.dataFine);
  if (attivi.length === 0) return <EmptyTab icon="📱" msg="Nessun palmare assegnato" />;
  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm">🔗 Assegna Palmare</button>
      </div>
      <div className="pd-items-table-wrap">
        <table className="pd-items-table">
          <thead><tr><th>CODICE</th><th>TARIFFA</th><th>DATA INIZIO</th></tr></thead>
          <tbody>
            {attivi.map(pal => (
              <tr key={pal.id} className="pd-item-row">
                <td className="pd-item-targa">{pal.codice}</td>
                <td>{pal.tariffa != null ? fmtEur(pal.tariffa) : '—'}</td>
                <td>{fmtData(pal.dataInizio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabAutisti({ p }: { p: Padroncino }) {
  const attivi = (p.codiciAutista || []).filter(a => !a.dataFine);
  if (attivi.length === 0) return <EmptyTab icon="👤" msg="Nessun codice autista assegnato" />;
  return (
    <div>
      <div className="pd-tab-actions">
        <button className="btn-primary btn-sm">🔗 Assegna Codice Autista</button>
      </div>
      <div className="pd-items-table-wrap">
        <table className="pd-items-table">
          <thead><tr><th>CODICE</th><th>NOME</th><th>DATA INIZIO</th></tr></thead>
          <tbody>
            {attivi.map(a => (
              <tr key={a.id} className="pd-item-row">
                <td className="pd-item-targa">{a.codice}</td>
                <td>{[a.nome, a.cognome].filter(Boolean).join(' ') || '—'}</td>
                <td>{fmtData(a.dataInizio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN DETAIL COMPONENT ──────────────────────────
export default function DettaglioPadroncino() {
  const { id } = useParams<{ id: string }>();
  const p = MOCK_PADRONCINI.find(x => x.id === id);
  const [tab, setTab] = useState('info');
  const [showModifica, setShowModifica] = useState(false);

  if (!p) {
    return (
      <div className="pd-page">
        <div className="pd-error">
          ⚠️ Padroncino non trovato
          <Link to="/padroncini" className="btn-primary btn-sm">← Torna alla lista</Link>
        </div>
      </div>
    );
  }

  const durcSt = durcStatus(p.scadenzaDurc);
  const dvrSt = dvrStatus(p.scadenzaDvr, p.dvrEsente);
  const nMezzi = p.mezziAssegnati?.filter(m => !m.dataFine).length ?? 0;
  const nPalmari = p.palmariAssegnati?.filter(m => !m.dataFine).length ?? 0;
  const nAutisti = p.codiciAutista?.filter(a => !a.dataFine).length ?? 0;

  const TABS = [
    { key: 'info', icon: '📋', label: 'Anagrafica' },
    { key: 'mezzi', icon: '🚛', label: 'Mezzi', count: nMezzi },
    { key: 'palmari', icon: '📱', label: 'Palmari', count: nPalmari },
    { key: 'autisti', icon: '👤', label: 'Autisti', count: nAutisti },
    { key: 'documenti', icon: '📁', label: 'Documenti' },
    { key: 'conteggi', icon: '📊', label: 'Conteggi', count: 12 },
  ];

  return (
    <div className="pd-page" style={{ position: 'relative' }}>
      <div className="pd-alert-badge">⚠ 4 alert</div>

      <div className="pd-page-header">
        <h1>Padroncini</h1>
      </div>

      <div className="pd-detail-panel">
        <div className="pd-detail-header">
          <div className="pd-detail-header-row">
            <div className="pd-detail-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/padroncini" className="btn-outline btn-sm">← Torna alla lista</Link>
                <h2 className="pd-detail-title">{p.ragioneSociale}</h2>
                <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
                  {p.attivo ? 'ATTIVO' : 'DISMESSO'}
                </span>
                <span className={`pd-doc-badge ${durcSt.cls}`}>DURC: {durcSt.label}</span>
                <span className={`pd-doc-badge ${dvrSt.cls}`}>DVR: {dvrSt.label}</span>
                {p.fatturatoMese != null && (
                  <span className="pd-detail-fatt">Fatt. {fmtEur(p.fatturatoMese)}</span>
                )}
              </div>
              <span className="pd-detail-codice">
                Cod. {p.codice} · {nMezzi} mezzi · {nPalmari} palmari · {nAutisti} autisti
              </span>
            </div>
            <div className="pd-detail-actions">
              <button className="btn-outline btn-sm" onClick={() => setShowModifica(true)}>✏️ Modifica</button>
              <button className="btn-danger btn-sm">🗑 Elimina</button>
            </div>
          </div>
        </div>

        <div className="pd-fin-cards">
          <div className="pd-fin-card">
            <span className="pd-fin-card-label">FATTURATO TOTALE</span>
            <span className="pd-fin-card-val">{fmtEur(p.fatturatoTotale ?? 0)}</span>
          </div>
          <div className="pd-fin-card">
            <span className="pd-fin-card-label">ADDEBITI TOTALI</span>
            <span className="pd-fin-card-val orange">{fmtEur(p.addebitiTotali ?? 0)}</span>
          </div>
          <div className="pd-fin-card">
            <span className="pd-fin-card-label">DA BONIFICARE</span>
            <span className="pd-fin-card-val green">{fmtEur(p.daBonificare ?? 0)}</span>
          </div>
          <div className="pd-fin-card">
            <span className="pd-fin-card-label">MEDIA MENSILE</span>
            <span className="pd-fin-card-val blue">{fmtEur(p.mediaMensile ?? 0)}</span>
            <span className="pd-fin-card-sub">fattura/mese</span>
          </div>
        </div>

        <div className="pd-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`pd-tab ${tab === t.key ? 'pd-tab-active' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
              {t.count !== undefined && <span className="pd-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="pd-tab-body">
          {tab === 'info' && <TabInfo p={p} />}
          {tab === 'mezzi' && <TabMezzi p={p} />}
          {tab === 'palmari' && <TabPalmari p={p} />}
          {tab === 'autisti' && <TabAutisti p={p} />}
          {tab === 'documenti' && <EmptyTab icon="📁" msg="Nessun documento caricato" />}
          {tab === 'conteggi' && <EmptyTab icon="📊" msg="Conteggi in sviluppo" />}
        </div>

        {tab === 'info' && (
          <>
            <div className="pd-chart-section">
              <div className="pd-chart-title">ANDAMENTO FATTURATO</div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={MOCK_FATTURATO_MENSILE} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => fmtEur(Number(value))}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <Bar dataKey="fatturato" fill="oklch(0.52 0.18 260)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="addebiti" fill="oklch(0.6 0.18 145)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {p.note && (
              <div className="pd-note-section">
                <h4>NOTE</h4>
                <p className="pd-note-text">{p.note}</p>
              </div>
            )}
          </>
        )}
      </div>

      {showModifica && (
        <div className="pd-modal-overlay" onClick={() => setShowModifica(false)}>
          <div className="pd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="pd-modal-header">
              <h3>✏️ Modifica Padroncino</h3>
              <button className="pd-modal-close" onClick={() => setShowModifica(false)}>✕</button>
            </div>
            <div className="pd-modal-body">
              <div className="pd-modal-grid2">
                <div className="pd-modal-field pd-modal-full">
                  <label>Ragione Sociale *</label>
                  <input className="pd-modal-input" defaultValue={p.ragioneSociale} />
                </div>
                <div className="pd-modal-field">
                  <label>Partita IVA</label>
                  <input className="pd-modal-input" defaultValue={p.partitaIva} />
                </div>
                <div className="pd-modal-field">
                  <label>Codice Fiscale</label>
                  <input className="pd-modal-input" defaultValue={p.codiceFiscale} />
                </div>
                <div className="pd-modal-field pd-modal-full">
                  <label>Indirizzo</label>
                  <input className="pd-modal-input" defaultValue={p.indirizzo} />
                </div>
                <div className="pd-modal-field">
                  <label>Telefono</label>
                  <input className="pd-modal-input" defaultValue={p.telefono} />
                </div>
                <div className="pd-modal-field">
                  <label>Email</label>
                  <input className="pd-modal-input" defaultValue={p.email} />
                </div>
                <div className="pd-modal-field">
                  <label>PEC</label>
                  <input className="pd-modal-input" defaultValue={p.pec} />
                </div>
                <div className="pd-modal-field">
                  <label>IBAN</label>
                  <input className="pd-modal-input" defaultValue={p.iban} />
                </div>
              </div>
            </div>
            <div className="pd-modal-footer">
              <button className="btn-outline btn-sm" onClick={() => setShowModifica(false)}>Annulla</button>
              <button className="btn-primary btn-sm">✅ Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
