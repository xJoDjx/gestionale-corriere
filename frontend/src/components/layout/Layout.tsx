import { useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { navItems, useCanSee } from './Sidebar';
import { useAuthStore } from '../../stores/auth.store';
import { Icon } from '../ds';
import './Layout.css';

/** Percorso in alto: sezione dal menu, più "Dettaglio" per le schede con :id. */
function useCrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const base = '/' + (parts[0] || '');
  const sec = navItems.find(i => i.path === base);
  const out: { label: string; to?: string }[] = [];
  if (sec && base !== '/') out.push({ label: sec.label, to: parts.length > 1 ? base : undefined });
  if (!sec && base === '/') out.push({ label: 'Panoramica' });
  if (parts.length > 1) out.push({ label: 'Dettaglio' });
  return out;
}

export default function Layout() {
  const { user, token, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const crumbs = useCrumbs();
  const canSee = useCanSee();

  // Se il token esiste ma l'oggetto user è mancante o incompleto, lo ripristina
  useEffect(() => {
    if (token && (!user || !user.nome || !user.ruolo)) refreshUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd + K apre la ricerca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); navigate('/ricerca'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const initials = `${user?.nome?.[0] || ''}${user?.cognome?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <header className="topbar">
          <nav aria-label="Percorso" className="topbar-crumbs">
            <Link to="/">Gestionale</Link>
            {crumbs.map((c, i) => (
              <span key={i} className="topbar-crumb">
                <span aria-hidden="true">/</span>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="topbar-right">
            {canSee('ricerca') && (
              <Link to="/ricerca" className="topbar-search">
                <Icon name="search" size={14} />
                <span>Cerca ovunque…</span>
                <kbd>Ctrl K</kbd>
              </Link>
            )}
            <span aria-hidden="true" className="topbar-avatar" title={[user?.nome, user?.cognome].filter(Boolean).join(' ')}>{initials}</span>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
