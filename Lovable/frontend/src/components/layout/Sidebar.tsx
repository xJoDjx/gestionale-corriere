// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import ThemeToggle from '../ui/ThemeToggle';
import '../ui/ThemeToggle.css';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/padroncini', label: 'Padroncini', icon: '👤' },
  { path: '/conteggi', label: 'Conteggi Mensili', icon: '📋' },
  { path: '/flotta', label: 'Flotta Mezzi', icon: '🚛' },
  { path: '/palmari', label: 'Palmari', icon: '📱' },
  { path: '/codici-autista', label: 'Cod. Autisti', icon: '🏷️' },
  { divider: true },
  { path: '/ricariche', label: 'Ricariche Elettriche', icon: '⚡' },
  { path: '/acconti', label: 'Acconti', icon: '💰' },
  { path: '/ricerca', label: 'Ricerca Globale', icon: '🔍' },
  { path: '/esportazione', label: 'Esportazione', icon: '📥' },
  { divider: true },
  { path: '/impostazioni', label: 'Impostazioni', icon: '⚙️' },
  { path: '/utenti', label: 'Gestione Utenti', icon: '👥' },
  { path: '/log', label: 'Log Storico', icon: '📜' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🚚</div>
        <div className="logo-text">
          <span className="logo-title">GLS</span>
          <span className="logo-sub">PADRONCINI</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, i) =>
          'divider' in item ? (
            <div key={i} className="nav-divider" />
          ) : (
            <NavLink
              key={item.path}
              to={item.path!}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ),
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <div className="status-row">
            <span className="status-label">STATO MESE</span>
          </div>
          <div className="status-row">
            <span>Da bonificare</span>
            <span className="status-value">0,00 €</span>
          </div>
          <div className="status-row">
            <span>Completati</span>
            <span className="status-value">0/0</span>
          </div>
        </div>

        <div style={{ padding: '8px 0' }}>
          <ThemeToggle />
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">
            {user?.nome?.[0] || 'A'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.nome || 'Amministratore'}</span>
            <span className="user-role">{user?.ruolo || 'Admin'}</span>
          </div>
          <button className="logout-btn" onClick={logout} title="Logout">
            ↗
          </button>
        </div>
      </div>
    </aside>
  );
}
