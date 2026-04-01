// src/features/padroncini/Padroncini.tsx — API reali, senza mock
import { useState, useEffect, useMemo, useCallback } from 'react';
import { padronciniApi } from '../../lib/api';
import type { Padroncino, PadronciniStats } from '../../lib/api';
import NuovoPadroncinoModal, { NuovoPadroncino } from './NuovoPadroncinoModal';
import './Padroncini.css';

// ─── HELPERS ──────────────────────────────────────────
const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '0,00 €' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const daysDiff = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const scadenzaInfo = (d: string | null | undefined) => {
  const diff = daysDiff(d);
  if (diff === null) return null;
  if (diff < 0) return { label: fmt(d), cls: 'pd-scad-expired', giorni: `${Math.abs(diff)}gg fa` };
  if (diff <= 30) return { label: fmt(d), cls: 'pd-scad-warning', giorni: `${diff}gg` };
  if (diff <= 90) return { label: fmt(d), cls: 'pd-scad-near', giorni: `${diff}gg` };
  return { label: fmt(d), cls: 'pd-scad-ok', giorni: `${diff}gg` };
};

// ─── PAGINA ────────────────────────────────────────────
export default function Padroncini() {
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [stats, setStats] = useState<PadronciniStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'mezzi' | 'palmari' | 'autisti' | 'storico' | 'log'>('info');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'TUTTI' | 'ATTIVO' | 'DISMESSO'>('TUTTI');
  const [showNuovo, setShowNuovo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([
        padronciniApi.list({ limit: '200', include: 'mezzi,palmari,codici' }),
        padronciniApi.stats(),
      ]);
      setPadroncini(listResp.data);
      setStats(statsResp);
      if (!selected && listResp.data.length > 0) setSelected(listResp.data[0].id);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return padroncini.filter((p) => {
      const s = search.toLowerCase();
      const matchSearch =
        p.ragioneSociale.toLowerCase().includes(s) ||
        (p.partitaIva ?? '').includes(s) ||
        (p.codice ?? '').toLowerCase().includes(s);
      const matchFiltro =
        filtro === 'TUTTI' ||
        (filtro === 'ATTIVO' && p.attivo) ||
        (filtro === 'DISMESSO' && !p.attivo);
      return matchSearch && matchFiltro;
    });
  }, [padroncini, search, filtro]);

  const selectedP = padroncini.find((p) => p.id === selected) ?? null;

  const handleCreate = async (form: NuovoPadroncino) => {
    try {
      const nuovo = await padronciniApi.create({
        ragioneSociale: form.ragioneSociale,
        partitaIva: form.partitaIva,
        codiceFiscale: form.codiceFiscale || undefined,
        indirizzo: form.indirizzo || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        pec: form.pec || undefined,
        iban: form.iban || undefined,
        scadenzaDurc: form.scadenzaDurc || undefined,
        scadenzaDvr: form.scadenzaDvr || undefined,
        note: form.note || undefined,
      });
      await load();
      setSelected(nuovo.id);
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div className="pd-page">
      <div className="pd-loading"><div className="pd-spinner" /><span>Caricamento padroncini...</span></div>
    </div>
  );
  if (error) return (
    <div className="pd-page">
      <div className="pd-error">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="pd-page">
      {/* ── HEADER con stats ── */}
      <div className="pd-page-header">
        <h1>Padroncini</h1>
        <div className="pd-page-stats">
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.attivi ?? padroncini.filter(p => p.attivo).length}</span>
            <span className="pd-page-stat-label">PADRONCINI ATTIVI</span>
            <span className="pd-page-stat-sub">{stats?.dismissi ?? 0} dismessi · {stats?.totali ?? padroncini.length} totali</span>
          </div>
          <div className="pd-page-stat pd-page-stat-alert">
            <span className="pd-page-stat-val pd-page-stat-val-red">{stats?.alertDocumenti ?? 0}</span>
            <span className="pd-page-stat-label">ALERT DOCUMENTI</span>
            <span className="pd-page-stat-sub">DURC · DVR</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.flottaMezzi ?? 0}</span>
            <span className="pd-page-stat-label">FLOTTA MEZZI</span>
            <span className="pd-page-stat-sub">{stats?.flottaMezzi ?? 0} totali · {stats?.flottaDisponibili ?? 0} disponibili</span>
          </div>
          <div className="pd-page-stat">
            <span className="pd-page-stat-val">{stats?.palmariAttivi ?? 0}</span>
            <span className="pd-page-stat-label">PALMARI ATTIVI</span>
            <span className="pd-page-stat-sub">su {stats?.palmariTotali ?? 0} totali</span>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="pd-toolbar">
        <div className="pd-search-wrap">
          <span>🔍</span>
          <input
            className="pd-search"
            placeholder="Cerca padroncino per nome o codice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pd-filters">
          {(['TUTTI', 'ATTIVO', 'DISMESSO'] as const).map((f) => (
            <button
              key={f}
              className={`pd-filter-btn ${filtro === f ? 'pd-filter-active' : ''}`}
              onClick={() => setFiltro(f)}
            >{f}</button>
          ))}
        </div>
        <button className="btn-primary pd-nuovo-btn" onClick={() => setShowNuovo(true)}>+ Nuovo</button>
      </div>

      {/* ── TABELLA ── */}
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              <th>PADRONCINO</th>
              <th>STATO</th>
              <th>DURC</th>
              <th>DVR</th>
              <th>PALMARI</th>
              <th>MEZZI</th>
              <th>AUTISTI</th>
              <th>FATTURATO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="pd-empty-row">Nessun padroncino trovato</td></tr>
            )}
            {filtered.map((p) => {
              const durc = scadenzaInfo(p.scadenzaDurc);
              const dvr = scadenzaInfo(p.scadenzaDvr);
              const durcLabel = !p.scadenzaDurc ? 'ASSENTE' :
                durc?.cls === 'pd-scad-expired' ? 'SCADUTO' :
                durc?.cls === 'pd-scad-warning' ? 'IN SCADENZA' : 'REGOLARE';
              const dvrLabel = !p.scadenzaDvr ? 'ASSENTE' :
                dvr?.cls === 'pd-scad-expired' ? 'ASSENTE' : 'PRESENTE';
              const durcCls = durcLabel === 'SCADUTO' ? 'pd-doc-expired' :
                durcLabel === 'IN SCADENZA' ? 'pd-doc-warning' :
                durcLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';
              const dvrCls = dvrLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';
              return (
                <tr key={p.id} className={`pd-row ${selected === p.id ? 'pd-row-selected' : ''}`}>
                  <td>
                    <span
                      className="pd-ragsoc"
                      onClick={() => { setSelected(p.id); setTab('info'); }}
                    >{p.ragioneSociale}</span>
                  </td>
                  <td>
                    <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
                      {p.attivo ? 'ATTIVO' : 'DISMESSO'}
                    </span>
                  </td>
                  <td><span className={`pd-doc-badge ${durcCls}`}>{durcLabel}</span></td>
                  <td><span className={`pd-doc-badge ${dvrCls}`}>{dvrLabel}</span></td>
                  <td>
                    <span className="pd-count pd-count-blue">{p.palmariAssegnati?.length ?? 0}</span>
                  </td>
                  <td>
                    <span className="pd-count pd-count-blue">{p.mezziAssegnati?.length ?? 0}</span>
                  </td>
                  <td>
                    <span className="pd-count pd-count-blue">{p.codiciAutista?.length ?? 0}</span>
                  </td>
                  <td>
                    <span className="pd-fatturato">{fmtEur(p.fatturatoMese ?? 0)}</span>
                  </td>
                  <td>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => { setSelected(p.id); setTab('info'); }}
                    >Dettagli</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pd-table-footer">
          {filtered.length} di {padroncini.length} padroncini
        </div>
      </div>

      {/* ── PANNELLO DETTAGLIO ── */}
      {selectedP && (
        <PadroncinoDetail
          p={selectedP}
          tab={tab}
          setTab={setTab}
          onRefresh={load}
        />
      )}

      <NuovoPadroncinoModal open={showNuovo} onClose={() => setShowNuovo(false)} onSave={handleCreate} />
    </div>
  );
}

// ─── DETTAGLIO PADRONCINO ─────────────────────────────
function PadroncinoDetail({
  p, tab, setTab, onRefresh,
}: {
  p: Padroncino;
  tab: string;
  setTab: (t: any) => void;
  onRefresh: () => void;
}) {
  const durc = scadenzaInfo(p.scadenzaDurc);
  const dvr = scadenzaInfo(p.scadenzaDvr);

  const TABS = [
    { key: 'info', label: 'Anagrafica' },
    { key: 'mezzi', label: `Mezzi (${p.mezziAssegnati?.length ?? 0})` },
    { key: 'palmari', label: `Palmari (${p.palmariAssegnati?.length ?? 0})` },
    { key: 'autisti', label: `Autisti (${p.codiciAutista?.length ?? 0})` },
    { key: 'storico', label: 'Storico' },
    { key: 'log', label: 'Log' },
  ];

  const durcLabel = !p.scadenzaDurc ? 'ASSENTE' :
    durc?.cls === 'pd-scad-expired' ? 'SCADUTO' :
    durc?.cls === 'pd-scad-warning' ? 'IN SCADENZA' : 'REGOLARE';
  const durcCls = durcLabel === 'SCADUTO' ? 'pd-doc-expired' :
    durcLabel === 'IN SCADENZA' ? 'pd-doc-warning' :
    durcLabel === 'ASSENTE' ? 'pd-doc-absent' : 'pd-doc-ok';

  return (
    <div className="pd-detail-panel">
      {/* ── Header detail ── */}
      <div className="pd-detail-header">
        <div className="pd-detail-title-row">
          <div>
            <h2 className="pd-detail-title">{p.ragioneSociale}</h2>
            {p.codice && <span className="pd-detail-codice">Cod. {p.codice}</span>}
          </div>
          <div className="pd-detail-badges">
            <span className={`pd-stato-badge ${p.attivo ? 'pd-stato-attivo' : 'pd-stato-dismesso'}`}>
              {p.attivo ? 'ATTIVO' : 'DISMESSO'}
            </span>
            <span className={`pd-doc-badge ${durcCls}`}>DURC: {durcLabel}</span>
            <span className={`pd-doc-badge ${p.scadenzaDvr ? 'pd-doc-ok' : 'pd-doc-absent'}`}>
              DVR: {p.scadenzaDvr ? 'PRESENTE' : 'ASSENTE'}
            </span>
            {p.fatturatoMese != null && (
              <span className="pd-detail-fatt">Fatt. {p.fatturatoMese.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</span>
            )}
            {p.bonifico != null && (
              <span className="pd-detail-bon">Bon. {p.bonifico.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</span>
            )}
          </div>
        </div>
        <div className="pd-detail-actions">
          <button className="btn-outline btn-sm">✏️ Modifica</button>
          <button className="btn-outline btn-sm">📊 Conteggio</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="pd-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pd-tab ${tab === t.key ? 'pd-tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="pd-tab-body">
        {tab === 'info' && <TabInfo p={p} />}
        {tab === 'mezzi' && <TabMezzi p={p} />}
        {tab === 'palmari' && <TabPalmari p={p} />}
        {tab === 'autisti' && <TabAutisti p={p} />}
        {(tab === 'storico' || tab === 'log') && (
          <div className="pd-empty-tab">Sezione in sviluppo</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="pd-field">
      <span className="pd-field-label">{label}</span>
      <span className={`pd-field-val ${mono ? 'pd-mono' : ''} ${!value ? 'pd-empty' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function TabInfo({ p }: { p: Padroncino }) {
  const durc = scadenzaInfo(p.scadenzaDurc);
  const dvr = scadenzaInfo(p.scadenzaDvr);
  return (
    <div className="pd-info-grid">
      <div className="pd-section">
        <h4>Dati Aziendali</h4>
        <Field label="Ragione Sociale" value={p.ragioneSociale} />
        <Field label="Partita IVA" value={p.partitaIva} mono />
        <Field label="Codice Fiscale" value={p.codiceFiscale} mono />
      </div>
      <div className="pd-section">
        <h4>Contatti</h4>
        <Field label="Indirizzo" value={p.indirizzo} />
        <Field label="Telefono" value={p.telefono} />
        <Field label="Email" value={p.email} />
        <Field label="PEC" value={p.pec} />
      </div>
      <div className="pd-section">
        <h4>Dati Bancari</h4>
        <Field label="IBAN" value={p.iban} mono />
      </div>
      <div className="pd-section">
        <h4>Scadenze Documenti</h4>
        <div className="pd-scadenze">
          <div className={`pd-scad-row ${durc?.cls || 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DURC</span>
            <span className="pd-scad-date">{durc?.label || '—'}</span>
            {durc && <span className="pd-scad-days">{durc.giorni}</span>}
          </div>
          <div className={`pd-scad-row ${dvr?.cls || 'pd-scad-absent'}`}>
            <span className="pd-scad-type">DVR</span>
            <span className="pd-scad-date">{dvr?.label || '—'}</span>
            {dvr && <span className="pd-scad-days">{dvr.giorni}</span>}
          </div>
        </div>
      </div>
      {p.note && (
        <div className="pd-section pd-section-full">
          <h4>Note</h4>
          <p className="pd-note-text">{p.note}</p>
        </div>
      )}
    </div>
  );
}

function TabMezzi({ p }: { p: Padroncino }) {
  if (!p.mezziAssegnati?.length) return <EmptyTab icon="🚚" msg="Nessun mezzo assegnato" />;
  return (
    <div className="pd-items-table-wrap">
      <table className="pd-items-table">
        <thead>
          <tr>
            <th>TARGA</th>
            <th>MARCA / MODELLO</th>
            <th>TIPO</th>
            <th>DATA INIZIO</th>
            <th>TARIFFA (IMP.)</th>
            <th>TARIFFA (IVATA)</th>
            <th>NOTE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {p.mezziAssegnati.map((m) => (
            <tr key={m.id} className="pd-item-row">
              <td className="pd-item-targa">{m.targa}</td>
              <td>
                <span className="pd-item-marca">{m.marca}</span>{' '}
                <span className="pd-item-modello">{m.modello}</span>
              </td>
              <td>{m.alimentazione}</td>
              <td>{m.dataInizio ? new Date(m.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
              <td>{m.tariffa != null ? `${m.tariffa.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €` : <span className="pd-empty">—</span>}</td>
              <td>{m.tariffaIvata != null ? `${m.tariffaIvata.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €` : <span className="pd-empty">—</span>}</td>
              <td><span className="pd-note-input">Note...</span></td>
              <td><button className="btn-primary btn-sm">Dettaglio</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabPalmari({ p }: { p: Padroncino }) {
  if (!p.palmariAssegnati?.length) return <EmptyTab icon="📱" msg="Nessun palmare assegnato" />;
  return (
    <div className="pd-items-table-wrap">
      <table className="pd-items-table">
        <thead>
          <tr>
            <th>CODICE</th>
            <th>TARIFFA</th>
            <th>DATA INIZIO</th>
            <th>FINE</th>
          </tr>
        </thead>
        <tbody>
          {p.palmariAssegnati.map((pal) => (
            <tr key={pal.id} className="pd-item-row">
              <td className="pd-item-targa">{pal.codice}</td>
              <td>{pal.tariffa != null ? `${pal.tariffa.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €` : '—'}</td>
              <td>{pal.dataInizio ? new Date(pal.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
              <td>{pal.dataFine ? new Date(pal.dataFine).toLocaleDateString('it-IT') : <span className="pd-empty">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabAutisti({ p }: { p: Padroncino }) {
  if (!p.codiciAutista?.length) return <EmptyTab icon="👤" msg="Nessun autista assegnato" />;
  return (
    <div className="pd-items-table-wrap">
      <table className="pd-items-table">
        <thead>
          <tr>
            <th>CODICE</th>
            <th>NOME</th>
            <th>COGNOME</th>
            <th>DATA INIZIO</th>
            <th>FINE</th>
          </tr>
        </thead>
        <tbody>
          {p.codiciAutista.map((a) => (
            <tr key={a.id} className="pd-item-row">
              <td className="pd-item-targa">{a.codice}</td>
              <td>{a.nome || '—'}</td>
              <td>{a.cognome || '—'}</td>
              <td>{a.dataInizio ? new Date(a.dataInizio).toLocaleDateString('it-IT') : '—'}</td>
              <td>{a.dataFine ? new Date(a.dataFine).toLocaleDateString('it-IT') : <span className="pd-empty">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTab({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="pd-empty-tab">
      <span>{icon}</span>
      <p>{msg}</p>
    </div>
  );
}
