// Dashboard.jsx — GLS Padroncini
const { useState: useDashState } = React;

const dashKpis = [
  { label: 'Mezzi Totali', value: '33', sub: '26 assegnati · 6 disponibili', variant: '' },
  { label: 'Padroncini Attivi', value: '12', sub: 'su 14 totali', variant: '' },
  { label: 'Conteggi Mese', value: '3/12', sub: 'chiusi / totali', variant: 'orange' },
  { label: 'Da Bonificare', value: '€ 18.420', sub: 'Marzo 2026', variant: 'blue' },
  { label: 'Scadenze Imminenti', value: '30', sub: 'entro 30 giorni', variant: 'yellow' },
  { label: 'DURC Scaduti', value: '3', sub: 'richiedono azione', variant: 'red' },
];

const dashAlerts = [
  { tipo: 'danger',  icon: '⚠️', title: '3 DURC scaduti', desc: 'EL SPEDIZIONI, DI NARDO, IB EXPRESS — scaduti', action: 'Vedi padroncini' },
  { tipo: 'warning', icon: '🔧', title: '30 mezzi con scadenze entro 30gg', desc: 'Assicurazione, revisione o bollo in scadenza', action: 'Vedi flotta' },
  { tipo: 'info',    icon: '📋', title: '9 conteggi ancora in bozza', desc: 'Marzo 2026 — 9 conteggi non ancora chiusi', action: 'Vedi conteggi' },
  { tipo: 'warning', icon: '📱', title: '2 palmari senza assegnazione', desc: 'PAL-007, PAL-008 disponibili', action: 'Vedi palmari' },
];

const dashActivity = [
  { ora: '09:45', azione: 'Creato conteggio', dettaglio: 'MEN LOGISTIC — Marzo 2026' },
  { ora: '09:30', azione: 'Aggiornato mezzo', dettaglio: 'GR507EZ — km 111.814' },
  { ora: '09:15', azione: 'Inserito acconto', dettaglio: 'Marco Rossi — € 200,00' },
  { ora: '08:50', azione: 'Assegnato mezzo', dettaglio: 'GR637XD → QUICK EXPRESS SRLS' },
  { ora: '08:30', azione: 'Chiuso conteggio', dettaglio: 'EL SPEDIZIONI — Febbraio 2026' },
  { ora: 'Ieri',  azione: 'Generati conteggi bulk', dettaglio: '12 conteggi per Marzo 2026' },
];

const dashScadenze = [
  { targa: 'GH627TF', tipo: 'Assicurazione', data: '10/04/2026', gg: 11, g: 'danger' },
  { targa: 'GH628TF', tipo: 'Assicurazione', data: '10/04/2026', gg: 11, g: 'danger' },
  { targa: 'GH627TF', tipo: 'Revisione',     data: '05/05/2026', gg: 36, g: 'warning' },
  { targa: 'GM098FB', tipo: 'Revisione',     data: '20/06/2026', gg: 82, g: 'info' },
];

const kpiVariants = {
  '':       { bg: 'var(--card-bg)', valColor: 'var(--text-primary)' },
  blue:   { bg: '#eff6ff', valColor: '#1d4ed8' },
  red:    { bg: '#fef2f2', valColor: '#b91c1c' },
  green:  { bg: '#f0fdf4', valColor: '#15803d' },
  orange: { bg: '#fff7ed', valColor: '#c2410c' },
  yellow: { bg: '#fefce8', valColor: '#a16207' },
  purple: { bg: '#faf5ff', valColor: '#7c3aed' },
};

const alertColors = {
  danger:  'var(--danger)',
  warning: 'var(--warning)',
  info:    'var(--info)',
};

function KpiCard({ label, value, sub, variant }) {
  const v = kpiVariants[variant] || kpiVariants[''];
  return (
    <div style={{ background: v.bg, border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: v.valColor, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function DashCard({ title, badge, children }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        {badge !== undefined && (
          <span style={{ background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function DashboardScreen() {
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Dashboard</h1>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{today}</span>
        </div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ⚡ Genera conteggi mese
        </button>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        {dashKpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* 2-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DashCard title="Problemi e avvisi" badge={dashAlerts.length}>
            <div style={{ padding: 4 }}>
              {dashAlerts.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 7, marginBottom: 2, borderLeft: `3px solid ${alertColors[a.tipo]}` }}>
                  <span style={{ fontSize: 15 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{a.desc}</div>
                  </div>
                  <button style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
                    {a.action}
                  </button>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title="Prossime scadenze">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['TARGA','TIPO','DATA','GIORNI'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashScadenze.map((s, i) => {
                  const bg = s.g === 'danger' ? {bg:'var(--danger-bg)',c:'var(--danger)'} : s.g === 'warning' ? {bg:'var(--warning-bg)',c:'var(--warning)'} : {bg:'var(--info-bg)',c:'var(--info)'};
                  return (
                    <tr key={i} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{s.targa}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{s.tipo}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{s.data}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ background: bg.bg, color: bg.c, fontWeight: 600, fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>{s.gg}gg</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DashCard>
        </div>

        {/* Right col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DashCard title="Attività recente">
            <div style={{ padding: 4 }}>
              {dashActivity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 14px', borderBottom: i < dashActivity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 40, paddingTop: 1 }}>{a.ora}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.azione}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{a.dettaglio}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3 }}>Admin</span>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title="Stato conteggi — Marzo 2026">
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: '25%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>3</div>
                <div style={{ flex: 1, background: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>9</div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[['var(--success)','Confermati'],['var(--warning)','Bozze']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }}></span>{l}
                  </span>
                ))}
              </div>
            </div>
          </DashCard>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardScreen });
