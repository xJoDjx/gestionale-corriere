// Padroncini.jsx — GLS Padroncini
const { useState: usePdState } = React;

const MOCK_PADRONCINI = [
  { id: '1', ragioneSociale: 'EL SPEDIZIONI SRL', partitaIva: '01234567890', telefono: '320 1234567', email: 'info@elspedizioni.it', durc: 'SCADUTO', dvr: 'VALIDO', mezzi: 3, palmari: 1, stato: 'ATTIVO', note: '' },
  { id: '2', ragioneSociale: 'QUICK EXPRESS SRLS', partitaIva: '09876543210', telefono: '347 9876543', email: 'quick@express.it', durc: 'VALIDO', dvr: 'VALIDO', mezzi: 2, palmari: 2, stato: 'ATTIVO', note: '' },
  { id: '3', ragioneSociale: 'MEN LOGISTIC SRL', partitaIva: '05551234567', telefono: '333 5554321', email: 'info@menlogistic.it', durc: 'IN SCADENZA', dvr: 'ESENTE', mezzi: 4, palmari: 1, stato: 'ATTIVO', note: 'Contratto in rinnovo' },
  { id: '4', ragioneSociale: 'DI NARDO TRASPORTI', partitaIva: '07771234567', telefono: '393 7778899', email: 'dinardo@trasporti.it', durc: 'SCADUTO', dvr: 'ASSENTE', mezzi: 1, palmari: 0, stato: 'DISMESSO', note: '' },
  { id: '5', ragioneSociale: 'IB EXPRESS SRL', partitaIva: '04441239900', telefono: '340 4440011', email: 'ib@express.it', durc: 'VALIDO', dvr: 'VALIDO', mezzi: 2, palmari: 1, stato: 'ATTIVO', note: '' },
  { id: '6', ragioneSociale: 'ALFA LOGISTICA SRL', partitaIva: '06661230099', telefono: '329 6660099', email: 'alfa@logistica.it', durc: 'VALIDO', dvr: 'VALIDO', mezzi: 3, palmari: 2, stato: 'ATTIVO', note: '' },
];

const DURC_BADGE = {
  'VALIDO': { bg: '#dcfce7', c: '#15803d' },
  'IN SCADENZA': { bg: '#ffedd5', c: '#c2410c' },
  'SCADUTO': { bg: '#fee2e2', c: '#b91c1c' },
  'ASSENTE': { bg: '#e2e8f0', c: '#475569' },
};
const STATO_BADGE = {
  'ATTIVO': { bg: '#dcfce7', c: '#15803d' },
  'DISMESSO': { bg: '#ede9fe', c: '#7c3aed' },
};
const DVR_BADGE = {
  'VALIDO': { bg: '#dcfce7', c: '#15803d' },
  'ESENTE': { bg: '#dbeafe', c: '#1d4ed8' },
  'ASSENTE': { bg: '#e2e8f0', c: '#475569' },
  'SCADUTO': { bg: '#fee2e2', c: '#b91c1c' },
};

function Pill({ label, map }) {
  const s = (map || {})[label] || { bg: '#e2e8f0', c: '#475569' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', background: s.bg, color: s.c }}>
      {label}
    </span>
  );
}

function PadronciniScreen() {
  const [filter, setFilter] = usePdState('TUTTI');
  const [search, setSearch] = usePdState('');
  const [selected, setSelected] = usePdState(null);
  const [showNew, setShowNew] = usePdState(false);

  const filtered = MOCK_PADRONCINI.filter(p => {
    const matchFilter = filter === 'TUTTI' || p.stato === filter;
    const matchSearch = !search || p.ragioneSociale.toLowerCase().includes(search.toLowerCase()) || p.partitaIva.includes(search);
    return matchFilter && matchSearch;
  });

  if (selected) return <DettaglioPadroncino p={selected} onBack={() => setSelected(null)} />;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Padroncini</h1>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{MOCK_PADRONCINI.filter(p=>p.stato==='ATTIVO').length} attivi su {MOCK_PADRONCINI.length} totali</span>
        </div>
        <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ➕ Nuovo Padroncino
        </button>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {['TUTTI','ATTIVO','DISMESSO'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === f ? 'var(--primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)', transition: 'all 0.12s' }}>
              {f}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome o P.IVA..." style={{ flex: 1, maxWidth: 280, padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-sans)' }} />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              {['RAGIONE SOCIALE','PARTITA IVA','DURC','DVR','MEZZI','PALMARI','STATO'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--table-row-hover)'); }}
                onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => c.style.background = i % 2 === 1 ? 'var(--table-row-alt)' : ''); }}>
                {[
                  <td style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}>{p.ragioneSociale}</td>,
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}>{p.partitaIva}</td>,
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}><Pill label={p.durc} map={DURC_BADGE} /></td>,
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}><Pill label={p.dvr} map={DVR_BADGE} /></td>,
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}>{p.mezzi}</td>,
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}>{p.palmari}</td>,
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: i%2===1?'var(--table-row-alt)':'' }}><Pill label={p.stato} map={STATO_BADGE} /></td>,
                ].map((cell, ci) => React.cloneElement(cell, { key: ci }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NuovoPadroncinoModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function DettaglioPadroncino({ p, onBack }) {
  const [tab, setTab] = usePdState('info');
  const tabs = [
    { id: 'info', label: '📋 Anagrafica' },
    { id: 'mezzi', label: '🚛 Mezzi ('+p.mezzi+')' },
    { id: 'conteggi', label: '📊 Conteggi' },
    { id: 'documenti', label: '📎 Documenti' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
        ← Torna a Padroncini
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{p.ragioneSociale}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill label={p.stato} map={STATO_BADGE} />
            <Pill label={`DURC: ${p.durc}`} map={DURC_BADGE} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>P.IVA {p.partitaIva}</span>
          </div>
        </div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ✏️ Modifica
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer', color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, fontFamily: 'var(--font-sans)', transition: 'color 0.12s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
          {[['Ragione Sociale', p.ragioneSociale], ['Partita IVA', p.partitaIva], ['Telefono', p.telefono], ['Email', p.email], ['DVR', p.dvr], ['Note', p.note || '—']].map(([label, val]) => (
            <div key={label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'mezzi' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {p.mezzi > 0 ? `${p.mezzi} mezzo/i assegnato/i — vedi scheda dettaglio completa.` : '🚚 Nessun mezzo assegnato attualmente'}
        </div>
      )}

      {tab === 'conteggi' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>📊 Storico conteggi disponibile nella versione completa.</div>
      )}

      {tab === 'documenti' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>📎 Nessun documento caricato.</div>
      )}
    </div>
  );
}

function NuovoPadroncinoModal({ onClose }) {
  const [form, setForm] = usePdState({ ragioneSociale: '', partitaIva: '', email: '', telefono: '' });
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, width: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>➕ Nuovo Padroncino</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[['Ragione Sociale *', 'ragioneSociale'], ['Partita IVA', 'partitaIva'], ['Email', 'email'], ['Telefono', 'telefono']].map(([label, key]) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
              <input value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' }} />
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Annulla</button>
          <button style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>✅ Crea Padroncino</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PadronciniScreen, Pill, DURC_BADGE, STATO_BADGE });
