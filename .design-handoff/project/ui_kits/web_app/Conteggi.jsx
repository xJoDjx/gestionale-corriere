// Conteggi.jsx — GLS Padroncini
const { useState: useCgState } = React;

const MOCK_CONTEGGI = [
  { id:'1', padroncino:'EL SPEDIZIONI SRL',    mese:'Marzo 2026', stato:'CONFERMATO', fatturato:4820.00, addebiti:320.00, netto:4500.00, spedizioni:1204 },
  { id:'2', padroncino:'QUICK EXPRESS SRLS',   mese:'Marzo 2026', stato:'BOZZA',      fatturato:3610.00, addebiti:210.00, netto:3400.00, spedizioni:980 },
  { id:'3', padroncino:'MEN LOGISTIC SRL',     mese:'Marzo 2026', stato:'BOZZA',      fatturato:6240.00, addebiti:440.00, netto:5800.00, spedizioni:1610 },
  { id:'4', padroncino:'IB EXPRESS SRL',       mese:'Marzo 2026', stato:'CHIUSO',     fatturato:3100.00, addebiti:180.00, netto:2920.00, spedizioni:820 },
  { id:'5', padroncino:'ALFA LOGISTICA SRL',   mese:'Marzo 2026', stato:'BOZZA',      fatturato:5510.00, addebiti:390.00, netto:5120.00, spedizioni:1380 },
  { id:'6', padroncino:'EL SPEDIZIONI SRL',    mese:'Febbraio 2026', stato:'CHIUSO',  fatturato:4410.00, addebiti:310.00, netto:4100.00, spedizioni:1100 },
  { id:'7', padroncino:'QUICK EXPRESS SRLS',   mese:'Febbraio 2026', stato:'CHIUSO',  fatturato:3400.00, addebiti:200.00, netto:3200.00, spedizioni:940 },
];

const STATO_COLORS = {
  BOZZA:      { bg:'#fef3c7', c:'#a16207' },
  CONFERMATO: { bg:'#dbeafe', c:'#1d4ed8' },
  CHIUSO:     { bg:'#dcfce7', c:'#15803d' },
};

function eur(n) {
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' }).format(n);
}

function ConteggiScreen() {
  const [mese, setMese] = useCgState('Marzo 2026');
  const [stato, setStato] = useCgState('TUTTI');
  const [detail, setDetail] = useCgState(null);

  const mesi = [...new Set(MOCK_CONTEGGI.map(c => c.mese))];
  const filtered = MOCK_CONTEGGI.filter(c =>
    c.mese === mese && (stato === 'TUTTI' || c.stato === stato)
  );

  if (detail) return <DettaglioConteggio c={detail} onBack={() => setDetail(null)} />;

  const totFatt   = filtered.reduce((s,c) => s+c.fatturato, 0);
  const totAdd    = filtered.reduce((s,c) => s+c.addebiti, 0);
  const totNetto  = filtered.reduce((s,c) => s+c.netto, 0);

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Conteggi</h1>
          <span style={{ fontSize:13, color:'var(--text-muted)' }}>{filtered.length} conteggi · {mese}</span>
        </div>
        <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          ⚡ Genera conteggi
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Fatturato totale', value: eur(totFatt), color:'var(--primary)' },
          { label:'Addebiti totali',  value: eur(totAdd),  color:'#c2410c' },
          { label:'Netto totale',     value: eur(totNetto),color:'var(--success)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <select value={mese} onChange={e=>setMese(e.target.value)} style={{ padding:'6px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:8, background:'var(--card-bg)', color:'var(--text-primary)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>
          {mesi.map(m => <option key={m}>{m}</option>)}
        </select>
        <div style={{ display:'flex', background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
          {['TUTTI','BOZZA','CONFERMATO','CHIUSO'].map(s => (
            <button key={s} onClick={()=>setStato(s)} style={{ padding:'6px 12px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background: stato===s ? 'var(--primary)' : 'transparent', color: stato===s ? '#fff' : 'var(--text-secondary)', fontFamily:'var(--font-sans)', transition:'all 0.12s' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', boxShadow:'var(--card-shadow)' }}>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13 }}>
          <thead>
            <tr>
              {['PADRONCINO','MESE','STATO','FATTURATO','ADDEBITI','SPEDIZIONI','NETTO'].map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign: h==='NETTO'||h==='FATTURATO'||h==='ADDEBITI'||h==='SPEDIZIONI' ? 'right':'left', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', background:'var(--card-bg)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c,i) => {
              const sc = STATO_COLORS[c.stato] || STATO_COLORS.BOZZA;
              return (
                <tr key={c.id} onClick={()=>setDetail(c)} style={{ cursor:'pointer' }}
                  onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background='var(--table-row-hover)')}
                  onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background=i%2===1?'var(--table-row-alt)':'')}>
                  <td style={{ padding:'12px 16px', fontWeight:600, borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{c.padroncino}</td>
                  <td style={{ padding:'12px 16px', color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{c.mese}</td>
                  <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>
                    <span style={{ display:'inline-flex', padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase', background:sc.bg, color:sc.c }}>{c.stato}</span>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right', color:'var(--primary)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{eur(c.fatturato)}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right', color:'#ea580c', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{eur(c.addebiti)}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right', color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{c.spedizioni?.toLocaleString('it-IT')}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right', fontWeight:700, color: c.netto>=0?'var(--success)':'var(--danger)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{eur(c.netto)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DettaglioConteggio({ c, onBack }) {
  const sc = STATO_COLORS[c.stato] || STATO_COLORS.BOZZA;
  const voci = [
    { desc:'Spedizioni effettuate', tipo:'fatturato', importo: c.fatturato },
    { desc:'Addebiti carburante',   tipo:'addebito',  importo: -c.addebiti * 0.7 },
    { desc:'Trattenuta attrezzatura', tipo:'addebito', importo: -c.addebiti * 0.3 },
  ];

  return (
    <div style={{ padding:24 }}>
      <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:13, marginBottom:16, display:'flex', alignItems:'center', gap:4, fontFamily:'var(--font-sans)' }}>
        ← Torna ai Conteggi
      </button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>{c.padroncino}</h1>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>{c.mese}</span>
            <span style={{ display:'inline-flex', padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, textTransform:'uppercase', background:sc.bg, color:sc.c }}>{c.stato}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ padding:'7px 14px', fontSize:13, fontWeight:600, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--text-secondary)', fontFamily:'var(--font-sans)' }}>📄 Genera PDF</button>
          {c.stato==='BOZZA' && <button style={{ padding:'7px 14px', fontSize:13, fontWeight:600, background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'var(--font-sans)' }}>✅ Conferma</button>}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          {l:'Fatturato',  v:eur(c.fatturato), col:'var(--primary)'},
          {l:'Addebiti',   v:eur(c.addebiti),  col:'#c2410c'},
          {l:'Spedizioni', v:c.spedizioni?.toLocaleString('it-IT'), col:'var(--text-primary)'},
          {l:'Netto',      v:eur(c.netto),     col:'var(--success)'},
        ].map(k=>(
          <div key={k.l} style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>{k.l}</div>
            <div style={{ fontSize:22, fontWeight:700, color:k.col }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Voci table */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'13px 18px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:13, fontWeight:600 }}>Voci conteggio</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13 }}>
          <thead>
            <tr>
              {['DESCRIZIONE','TIPO','IMPORTO'].map(h=>(
                <th key={h} style={{ padding:'10px 16px', textAlign:h==='IMPORTO'?'right':'left', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', background:'var(--card-bg)', borderBottom:'1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {voci.map((v,i)=>(
              <tr key={i}>
                <td style={{ padding:'12px 16px', borderBottom:i<voci.length-1?'1px solid var(--border)':'none', background:i%2===1?'var(--table-row-alt)':'' }}>{v.desc}</td>
                <td style={{ padding:'12px 16px', borderBottom:i<voci.length-1?'1px solid var(--border)':'none', background:i%2===1?'var(--table-row-alt)':'' }}>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, fontWeight:700, textTransform:'uppercase', background: v.tipo==='fatturato'?'#dbeafe':'#ffedd5', color: v.tipo==='fatturato'?'#1d4ed8':'#c2410c' }}>{v.tipo}</span>
                </td>
                <td style={{ padding:'12px 16px', textAlign:'right', fontWeight:600, color:v.importo>=0?'var(--success)':'var(--danger)', borderBottom:i<voci.length-1?'1px solid var(--border)':'none', background:i%2===1?'var(--table-row-alt)':'' }}>{eur(v.importo)}</td>
              </tr>
            ))}
            <tr style={{ background:'var(--bg-tertiary)' }}>
              <td colSpan={2} style={{ padding:'12px 16px', fontWeight:700, fontSize:13 }}>NETTO TOTALE</td>
              <td style={{ padding:'12px 16px', textAlign:'right', fontWeight:700, fontSize:15, color:'var(--success)' }}>{eur(c.netto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { ConteggiScreen });
