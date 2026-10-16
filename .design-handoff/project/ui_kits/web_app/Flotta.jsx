// Flotta.jsx — GLS Padroncini
const { useState: useFlState } = React;

const MOCK_MEZZI = [
  { id:'1', targa:'GR507EZ', marca:'Fiat', modello:'Ducato', tipo:'Furgone', alim:'DIESEL', km:111814, stato:'ASSEGNATO', padroncino:'EL SPEDIZIONI SRL', scadenze:{ assicurazione:'10/04/2026', revisione:'05/05/2026' } },
  { id:'2', targa:'GH627TF', marca:'Iveco', modello:'Daily', tipo:'Furgone', alim:'DIESEL', km:88420, stato:'ASSEGNATO', padroncino:'MEN LOGISTIC SRL', scadenze:{ assicurazione:'10/04/2026', revisione:'05/05/2026' } },
  { id:'3', targa:'GM098FB', marca:'Mercedes', modello:'Sprinter', tipo:'Furgone', alim:'ELETTRICO', km:42300, stato:'ASSEGNATO', padroncino:'QUICK EXPRESS SRLS', scadenze:{ assicurazione:'20/06/2026', revisione:'20/06/2026' } },
  { id:'4', targa:'GR637XD', marca:'Fiat', modello:'Ducato', tipo:'Furgone', alim:'DIESEL', km:134900, stato:'ASSEGNATO', padroncino:'QUICK EXPRESS SRLS', scadenze:{ assicurazione:'15/07/2026', revisione:'15/07/2026' } },
  { id:'5', targa:'EK441LP', marca:'Volkswagen', modello:'Crafter', tipo:'Furgone', alim:'DIESEL', km:67200, stato:'DISPONIBILE', padroncino:null, scadenze:{ assicurazione:'01/08/2026', revisione:'01/08/2026' } },
  { id:'6', targa:'FL882ZZ', marca:'Renault', modello:'Master', tipo:'Furgone', alim:'ELETTRICO', km:18500, stato:'DISPONIBILE', padroncino:null, scadenze:{ assicurazione:'10/09/2026', revisione:'10/09/2026' } },
  { id:'7', targa:'BP334WQ', marca:'Ford', modello:'Transit', tipo:'Furgone', alim:'DIESEL', km:201400, stato:'DISMESSO', padroncino:null, scadenze:{ assicurazione:'SCADUTA', revisione:'SCADUTA' } },
];

const STATO_M = {
  ASSEGNATO:   { bg:'#dbeafe', c:'#1d4ed8' },
  DISPONIBILE: { bg:'#dcfce7', c:'#15803d' },
  DISMESSO:    { bg:'#e2e8f0', c:'#475569' },
};

const ALIM_M = {
  DIESEL:    { bg:'#fef3c7', c:'#a16207' },
  ELETTRICO: { bg:'#dcfce7', c:'#15803d' },
  IBRIDO:    { bg:'#dbeafe', c:'#1d4ed8' },
};

function Badge({ label, map }) {
  const s = (map||{})[label] || { bg:'#e2e8f0', c:'#475569' };
  return <span style={{ display:'inline-flex', padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase', background:s.bg, color:s.c }}>{label}</span>;
}

function FlottaScreen() {
  const [filter, setFilter] = useFlState('TUTTI');
  const [selected, setSelected] = useFlState(null);
  const [showNew, setShowNew] = useFlState(false);

  const filtered = MOCK_MEZZI.filter(m => filter==='TUTTI' || m.stato===filter);

  if (selected) return <DettaglioMezzo m={selected} onBack={()=>setSelected(null)} />;

  const totali    = MOCK_MEZZI.length;
  const assegnati = MOCK_MEZZI.filter(m=>m.stato==='ASSEGNATO').length;
  const disp      = MOCK_MEZZI.filter(m=>m.stato==='DISPONIBILE').length;
  const elettrici = MOCK_MEZZI.filter(m=>m.alim==='ELETTRICO').length;

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Flotta Mezzi</h1>
          <span style={{ fontSize:13, color:'var(--text-muted)' }}>{totali} mezzi totali</span>
        </div>
        <button onClick={()=>setShowNew(true)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          ➕ Nuovo Mezzo
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { l:'Totali', v:totali, col:'var(--text-primary)', bg:'var(--card-bg)' },
          { l:'Assegnati', v:assegnati, col:'#1d4ed8', bg:'#eff6ff' },
          { l:'Disponibili', v:disp, col:'#15803d', bg:'#f0fdf4' },
          { l:'Elettrici', v:elettrici, col:'#7c3aed', bg:'#faf5ff' },
        ].map(k=>(
          <div key={k.l} style={{ background:k.bg, border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>{k.l}</div>
            <div style={{ fontSize:26, fontWeight:700, color:k.col }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', width:'fit-content' }}>
          {['TUTTI','ASSEGNATO','DISPONIBILE','DISMESSO'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{ padding:'6px 14px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:filter===f?'var(--primary)':'transparent', color:filter===f?'#fff':'var(--text-secondary)', fontFamily:'var(--font-sans)', transition:'all 0.12s' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', boxShadow:'var(--card-shadow)' }}>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13 }}>
          <thead>
            <tr>
              {['TARGA','MARCA / MODELLO','ALIMENTAZIONE','KM','STATO','PADRONCINO','ASSICURAZIONE'].map(h=>(
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', background:'var(--card-bg)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m,i)=>(
              <tr key={m.id} onClick={()=>setSelected(m)} style={{ cursor:'pointer' }}
                onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background='var(--table-row-hover)')}
                onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background=i%2===1?'var(--table-row-alt)':'')}>
                <td style={{ padding:'12px 16px', fontFamily:'var(--font-mono)', fontWeight:600, fontSize:12, borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{m.targa}</td>
                <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>
                  <span style={{ fontWeight:600 }}>{m.marca}</span> <span style={{ color:'var(--text-muted)' }}>{m.modello}</span>
                </td>
                <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}><Badge label={m.alim} map={ALIM_M} /></td>
                <td style={{ padding:'12px 16px', color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{m.km.toLocaleString('it-IT')}</td>
                <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}><Badge label={m.stato} map={STATO_M} /></td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>{m.padroncino || <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                <td style={{ padding:'12px 16px', fontSize:12, borderBottom:'1px solid var(--border)', background:i%2===1?'var(--table-row-alt)':'' }}>
                  <span style={{ color: m.scadenze.assicurazione==='SCADUTA'?'var(--danger)':m.scadenze.assicurazione<'15/05/2026'?'#c2410c':'var(--text-secondary)' }}>
                    {m.scadenze.assicurazione}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:14, width:480, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:15, fontWeight:600 }}>➕ Nuovo Mezzo</h3>
              <button onClick={()=>setShowNew(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {[['Targa *',''], ['Marca',''], ['Modello',''], ['Anno imm.','']].map(([lbl])=>(
                <div key={lbl} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:12, fontWeight:600 }}>{lbl}</label>
                  <input style={{ padding:'8px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:8, background:'var(--bg-secondary)', color:'var(--text-primary)', fontFamily:'var(--font-sans)', outline:'none' }} />
                </div>
              ))}
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={()=>setShowNew(false)} style={{ padding:'7px 14px', fontSize:13, fontWeight:600, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--text-secondary)', fontFamily:'var(--font-sans)' }}>Annulla</button>
              <button style={{ padding:'7px 14px', fontSize:13, fontWeight:600, background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'var(--font-sans)' }}>✅ Crea Mezzo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DettaglioMezzo({ m, onBack }) {
  return (
    <div style={{ padding:24 }}>
      <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:13, marginBottom:16, display:'flex', alignItems:'center', gap:4, fontFamily:'var(--font-sans)' }}>
        ← Torna alla Flotta
      </button>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, marginBottom:4, fontFamily:'var(--font-mono)' }}>{m.targa}</h1>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{m.marca} {m.modello}</span>
            <Badge label={m.stato} map={STATO_M} />
            <Badge label={m.alim} map={ALIM_M} />
          </div>
        </div>
        <button style={{ padding:'7px 14px', fontSize:13, fontWeight:600, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--text-secondary)', fontFamily:'var(--font-sans)' }}>✏️ Modifica</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:700 }}>
        {[
          ['Targa', m.targa], ['Marca / Modello', `${m.marca} ${m.modello}`],
          ['Alimentazione', m.alim], ['Chilometri', m.km.toLocaleString('it-IT')],
          ['Padroncino assegnato', m.padroncino||'—'], ['Scad. Assicurazione', m.scadenze.assicurazione],
        ].map(([label, val])=>(
          <div key={label} style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:13, fontWeight:500 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { FlottaScreen });
