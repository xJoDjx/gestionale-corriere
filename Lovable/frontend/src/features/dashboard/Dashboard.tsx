import { useState } from 'react';
import './Dashboard.css';

// ─── MOCK DATA ────────────────────────────────────
const MOCK_KPI = {
  mezziTotali: 33,
  mezziAssegnati: 26,
  mezziDisponibili: 6,
  padronciniAttivi: 12,
  conteggiMese: 12,
  conteggiChiusi: 3,
  daBonificare: 18420.50,
  scadenzeImminenti: 30,
  durcScaduti: 3,
};

const MOCK_ALERTS = [
  { id: '1', tipo: 'danger', icona: '⚠️', titolo: '3 DURC scaduti', desc: 'EL SPEDIZIONI, DI NARDO, IB EXPRESS — DURC scaduto o in scadenza', azione: 'Vedi padroncini' },
  { id: '2', tipo: 'warning', icona: '🔧', titolo: '30 mezzi con scadenze entro 30gg', desc: 'Assicurazione, revisione o bollo in scadenza', azione: 'Vedi flotta' },
  { id: '3', tipo: 'info', icona: '📋', titolo: '9 conteggi ancora in bozza', desc: 'Marzo 2026 — 9 conteggi non ancora chiusi', azione: 'Vedi conteggi' },
  { id: '4', tipo: 'warning', icona: '📱', titolo: '2 palmari senza assegnazione', desc: 'PAL-007, PAL-008 disponibili', azione: 'Vedi palmari' },
];

const MOCK_ACTIVITY = [
  { id: '1', ora: '09:45', user: 'Admin', azione: 'Creato conteggio', dettaglio: 'MEN LOGISTIC — Marzo 2026' },
  { id: '2', ora: '09:30', user: 'Admin', azione: 'Aggiornato mezzo', dettaglio: 'GR507EZ — km aggiornati a 111.814' },
  { id: '3', ora: '09:15', user: 'Admin', azione: 'Inserito acconto', dettaglio: 'Marco Rossi — 200,00 € (Marzo)' },
  { id: '4', ora: '08:50', user: 'Admin', azione: 'Assegnato mezzo', dettaglio: 'GR637XD → QUICK EXPRESS SRLS' },
  { id: '5', ora: '08:30', user: 'Admin', azione: 'Chiuso conteggio', dettaglio: 'EL SPEDIZIONI — Febbraio 2026' },
  { id: '6', ora: 'Ieri', user: 'Admin', azione: 'Generati conteggi bulk', dettaglio: '12 conteggi per Marzo 2026' },
];

const MOCK_SCADENZE = [
  { targa: 'GH627TF', tipo: 'Assicurazione', data: '10/04/2026', giorni: 11, gravita: 'danger' },
  { targa: 'GH628TF', tipo: 'Assicurazione', data: '10/04/2026', giorni: 11, gravita: 'danger' },
  { targa: 'GH627TF', tipo: 'Revisione', data: '05/05/2026', giorni: 36, gravita: 'warning' },
  { targa: 'GH628TF', tipo: 'Revisione', data: '05/05/2026', giorni: 36, gravita: 'warning' },
  { targa: 'GM098FB', tipo: 'Revisione', data: '20/06/2026', giorni: 82, gravita: 'info' },
];

function eur(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <span className="dash-date">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="dash-header-actions">
          <button className="btn-primary">⚡ Genera conteggi mese</button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="dash-kpi-grid">
        <KpiCard label="Mezzi totali" value={MOCK_KPI.mezziTotali} sub={`${MOCK_KPI.mezziAssegnati} assegnati · ${MOCK_KPI.mezziDisponibili} disponibili`} />
        <KpiCard label="Padroncini attivi" value={MOCK_KPI.padronciniAttivi} />
        <KpiCard label="Conteggi mese" value={`${MOCK_KPI.conteggiChiusi}/${MOCK_KPI.conteggiMese}`} sub="chiusi / totali" />
        <KpiCard label="Da bonificare" value={`${eur(MOCK_KPI.daBonificare)} €`} variant="primary" />
        <KpiCard label="Scadenze imminenti" value={MOCK_KPI.scadenzeImminenti} variant="warning" sub="entro 30 giorni" />
        <KpiCard label="DURC scaduti" value={MOCK_KPI.durcScaduti} variant="danger" />
      </div>

      <div className="dash-grid">
        {/* Colonna sinistra: Alert + Scadenze */}
        <div className="dash-col">
          {/* Alert */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>Problemi e avvisi</h3>
              <span className="dash-card-count">{MOCK_ALERTS.length}</span>
            </div>
            <div className="dash-alerts">
              {MOCK_ALERTS.map((a) => (
                <div key={a.id} className={`dash-alert dash-alert-${a.tipo}`}>
                  <span className="dash-alert-icon">{a.icona}</span>
                  <div className="dash-alert-body">
                    <span className="dash-alert-title">{a.titolo}</span>
                    <span className="dash-alert-desc">{a.desc}</span>
                  </div>
                  <button className="dash-alert-btn">{a.azione}</button>
                </div>
              ))}
            </div>
          </div>

          {/* Scadenze */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>Prossime scadenze</h3>
            </div>
            <table className="dash-scad-table">
              <thead>
                <tr>
                  <th>Targa</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Giorni</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SCADENZE.map((s, i) => (
                  <tr key={i}>
                    <td className="dash-scad-targa">{s.targa}</td>
                    <td>{s.tipo}</td>
                    <td>{s.data}</td>
                    <td>
                      <span className={`dash-scad-giorni dash-scad-${s.gravita}`}>
                        {s.giorni}gg
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Colonna destra: Attività recente */}
        <div className="dash-col">
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>Attività recente</h3>
            </div>
            <div className="dash-activity">
              {MOCK_ACTIVITY.map((a) => (
                <div key={a.id} className="dash-act-item">
                  <span className="dash-act-time">{a.ora}</span>
                  <div className="dash-act-body">
                    <span className="dash-act-action">{a.azione}</span>
                    <span className="dash-act-detail">{a.dettaglio}</span>
                  </div>
                  <span className="dash-act-user">{a.user}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Riepilogo conteggi */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>Stato conteggi — Marzo 2026</h3>
            </div>
            <div className="dash-conteggi-bar">
              <div className="dash-cb-segment dash-cb-conf" style={{ width: '25%' }} title="Confermati: 3">
                3
              </div>
              <div className="dash-cb-segment dash-cb-chiuso" style={{ width: '0%' }}></div>
              <div className="dash-cb-segment dash-cb-bozza" style={{ width: '75%' }} title="Bozze: 9">
                9
              </div>
            </div>
            <div className="dash-cb-legend">
              <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-conf"></span> Confermati</span>
              <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-chiuso"></span> Chiusi</span>
              <span className="dash-cb-leg-item"><span className="dash-cb-dot dash-cb-dot-bozza"></span> Bozze</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, variant }: {
  label: string; value: string | number; sub?: string; variant?: string;
}) {
  return (
    <div className={`dash-kpi ${variant ? `dash-kpi-${variant}` : ''}`}>
      <span className="dash-kpi-label">{label}</span>
      <span className="dash-kpi-value">{value}</span>
      {sub && <span className="dash-kpi-sub">{sub}</span>}
    </div>
  );
}
