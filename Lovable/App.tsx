import { useState } from 'react';
import { Link, useLocation, BrowserRouter, Routes, Route } from 'react-router-dom';
import Padroncini from './Padroncini';
import DettaglioPadroncino from './DettaglioPadroncino';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/padroncini', icon: '👥', label: 'Padroncini' },
  { to: '/conteggi', icon: '📋', label: 'Conteggi' },
  { to: '/flotta', icon: '🚛', label: 'Flotta Mezzi' },
  { to: '/palmari', icon: '📱', label: 'Palmari' },
  { to: '/codici-autista', icon: '🏷️', label: 'Cod. Autisti' },
  { to: '/ricariche', icon: '⚡', label: 'Ricariche' },
  { to: '/log', icon: '📜', label: 'Log Storico' },
];

function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (to: string) => {
    if (to === '/') return pathname === '/';
    return pathname.startsWith(to);
  };

  return (
    <div className="gls-layout">
      <aside className={`gls-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="gls-sidebar-logo">
          <div className="gls-sidebar-logo-icon">GLS</div>
          {!collapsed && (
            <div className="gls-sidebar-logo-text">
              <strong>GLS</strong>
              <span>Padroncini</span>
            </div>
          )}
        </div>
        <nav className="gls-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`gls-sidebar-link ${isActive(item.to) ? 'active' : ''}`}
            >
              <span className="gls-sidebar-link-icon">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <button className="gls-sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '›' : '‹'}
        </button>
      </aside>
      <main className="gls-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<div style={{padding:24}}>Dashboard (in sviluppo)</div>} />
          <Route path="/padroncini" element={<Padroncini />} />
          <Route path="/padroncini/:id" element={<DettaglioPadroncino />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
