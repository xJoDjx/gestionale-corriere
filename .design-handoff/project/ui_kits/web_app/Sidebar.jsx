// Sidebar.jsx — GLS Padroncini
const SIDEBAR_SCREENS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { id: 'padroncini',   label: 'Padroncini',    icon: '👤' },
  { id: 'conteggi',     label: 'Conteggi',      icon: '📋' },
  { id: 'flotta',       label: 'Flotta Mezzi',  icon: '🚛' },
  { id: 'palmari',      label: 'Palmari',       icon: '📱' },
  { id: 'codici',       label: 'Cod. Autisti',  icon: '🏷️' },
  { id: 'ricariche',    label: 'Ricariche',     icon: '⚡' },
  null,
  { id: 'acconti',      label: 'Acconti',       icon: '💰' },
  { id: 'impostazioni', label: 'Impostazioni',  icon: '⚙️' },
  { id: 'utenti',       label: 'Utenti',        icon: '👥' },
];

const sidebarStyles = {
  sidebar: {
    position: 'fixed', left: 0, top: 0, height: '100vh',
    background: 'var(--sidebar-bg)',
    display: 'flex', flexDirection: 'column',
    transition: 'width 0.2s ease', zIndex: 100,
    borderRight: '1px solid rgba(255,255,255,0.04)',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '18px 14px',
  },
  brandIcon: {
    width: 38, height: 38, background: '#f97316',
    borderRadius: 8, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 18, flexShrink: 0,
    boxShadow: '0 1px 2px rgba(249,115,22,0.25)',
  },
  brandTitle: { fontSize: 16, fontWeight: 700, color: '#e8eaf0', letterSpacing: '0.02em', lineHeight: 1 },
  brandSub: { fontSize: 9, fontWeight: 700, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 },
  nav: { flex: 1, padding: '4px 10px', overflowY: 'auto' },
  item: {
    display: 'flex', alignItems: 'center', gap: 11,
    padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 500, marginBottom: 2,
    color: 'var(--sidebar-item)', textDecoration: 'none',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap', overflow: 'hidden',
    userSelect: 'none', border: 'none', background: 'none', width: '100%', textAlign: 'left', fontFamily: 'var(--font-sans)',
  },
  itemActive: { background: 'var(--primary)', color: '#fff' },
  itemHover: { background: 'rgba(241,245,249,0.08)', color: '#e8eaf0' },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 12px' },
  footer: { padding: '10px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  userRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.2)', marginBottom: 8 },
  avatar: { width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  footerControls: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  collapseBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b7280', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 'auto', fontFamily: 'var(--font-sans)' },
  themeBtn: { fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: '#6b7280' },
};

function GCsidebar({ active, onNavigate, dark, onToggleDark, collapsed, onToggleCollapsed }) {
  const [hovered, setHovered] = React.useState(null);
  const width = collapsed ? 72 : 220;

  return (
    <aside style={{ ...sidebarStyles.sidebar, width }}>
      {/* Brand */}
      <div style={{ ...sidebarStyles.brand, justifyContent: collapsed ? 'center' : 'flex-start', paddingLeft: collapsed ? 8 : 14 }}>
        <div style={sidebarStyles.brandIcon}>🚚</div>
        {!collapsed && (
          <div>
            <div style={sidebarStyles.brandTitle}>GLS</div>
            <div style={sidebarStyles.brandSub}>PADRONCINI</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={sidebarStyles.nav}>
        {SIDEBAR_SCREENS.map((item, i) => {
          if (item === null) return <div key={`div-${i}`} style={sidebarStyles.divider} />;
          const isActive = active === item.id;
          const isHov = hovered === item.id;
          return (
            <button key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? item.label : undefined}
              style={{
                ...sidebarStyles.item,
                ...(isActive ? sidebarStyles.itemActive : {}),
                ...(!isActive && isHov ? sidebarStyles.itemHover : {}),
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px' : '9px 12px',
              }}>
              <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={sidebarStyles.footer}>
        {!collapsed && (
          <div style={sidebarStyles.userRow}>
            <div style={sidebarStyles.avatar}>A</div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Amministratore</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>Admin</div>
            </div>
          </div>
        )}
        <div style={sidebarStyles.footerControls}>
          {!collapsed && (
            <button style={sidebarStyles.themeBtn} onClick={onToggleDark} title={dark ? 'Tema chiaro' : 'Tema scuro'}>
              {dark ? '☀️' : '🌙'}
            </button>
          )}
          <button style={sidebarStyles.collapseBtn} onClick={onToggleCollapsed}
            title={collapsed ? 'Espandi' : 'Comprimi'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { GCsidebar });
