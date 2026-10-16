// src/components/layout/Sidebar.tsx
import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import ThemeToggle from '../ui/ThemeToggle';
import '../ui/ThemeToggle.css';
import './Sidebar.css';

type NavItem =
  | { path: string; label: string; icon: string; key: string }
  | { divider: true };

export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊', key: 'dashboard' },
  { path: '/padroncini', label: 'Padroncini', icon: '👤', key: 'padroncini' },
  { path: '/conteggi', label: 'Conteggi', icon: '📋', key: 'conteggi' },
  { path: '/flotta', label: 'Flotta Mezzi', icon: '🚛', key: 'flotta' },
  { path: '/palmari', label: 'Palmari', icon: '📱', key: 'palmari' },
  { path: '/codici-autista', label: 'Cod. Autisti', icon: '🏷️', key: 'codici-autista' },
  { path: '/ricariche', label: 'Ricariche', icon: '⚡', key: 'ricariche' },
  { path: '/carte-eni', label: 'Carte Eni', icon: '⛽', key: 'carte-eni' },
  { path: '/acconti', label: 'Acconti', icon: '💰', key: 'acconti' },
  { path: '/addebiti-sospesi', label: 'Sospesi', icon: '⏳', key: 'addebiti-sospesi' },
  { path: '/analisi-spedizioni', label: 'Analisi Sped.', icon: '📦', key: 'analisi-spedizioni' },
  { path: '/margini', label: 'Statistiche COD', icon: '📊', key: 'margini' },
  { divider: true },
  { path: '/ricerca', label: 'Ricerca', icon: '🔍', key: 'ricerca' },
  { path: '/log', label: 'Log Storico', icon: '📜', key: 'log' },
  { path: '/esportazione', label: 'Esportazione', icon: '📥', key: 'esportazione' },
  { path: '/impostazioni', label: 'Impostazioni', icon: '⚙️', key: 'impostazioni' },
  { path: '/utenti', label: 'Utenti', icon: '👥', key: 'utenti' },
];

const COLLAPSED_KEY = 'gc.sidebar.collapsed';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem(COLLAPSED_KEY) === '1';
  });
  const [sospesiCount, setSospesiCount] = useState(0);
  const location = useLocation();

  // Filtra le voci di menu in base alle sezioni visibili dell'utente.
  // ADMIN (sezioniVisibili === null) e utenti senza restrizioni (array vuoto) vedono tutto.
  const visibleNavItems = navItems.filter(item => {
    if ('divider' in item) return true;
    if (!user || user.ruolo === 'ADMIN' || !user.sezioniVisibili || user.sezioniVisibili.length === 0) return true;
    return user.sezioniVisibili.includes(item.key);
  });

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '72px' : '220px',
    );
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Aggiorna il conteggio addebiti pendenti ad ogni navigazione
  useEffect(() => {
    addebitivSospesoApi.list({ stato: 'PENDENTE' })
      .then(data => setSospesiCount(data.length))
      .catch(() => {});
  }, [location.pathname]);

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon" aria-hidden>🚚</div>
        {!collapsed && (
          <div className="brand-text">
            <span className="brand-title">GLS</span>
            <span className="brand-sub">PADRONCINI</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {visibleNavItems.map((item, i) =>
          'divider' in item ? (
            <div key={`div-${i}`} className="nav-divider" />
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon" style={{ position: 'relative' }}>
                {item.icon}
                {item.path === '/addebiti-sospesi' && sospesiCount > 0 && collapsed && (
                  <span className="nav-badge-dot">{sospesiCount > 9 ? '9+' : sospesiCount}</span>
                )}
              </span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {!collapsed && item.path === '/addebiti-sospesi' && sospesiCount > 0 && (
                <span className="nav-badge">{sospesiCount > 99 ? '99+' : sospesiCount}</span>
              )}
            </NavLink>
          ),
        )}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-user">
            <div className="user-avatar">{user?.nome?.[0] || 'A'}</div>
            <div className="user-info">
              <span className="user-name">{user?.nome || 'Amministratore'}</span>
              <span className="user-role">{user?.ruolo || 'Admin'}</span>
            </div>
          </div>
        )}
        {!collapsed && (
          <button className="logout-btn-full" onClick={handleLogout} title="Esci dall'applicazione">
            ⏻ Esci
          </button>
        )}

        <div className="footer-controls">
          {!collapsed && <ThemeToggle />}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Espandi' : 'Comprimi'}
            aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
      </div>
    </aside>
  );
}
