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
  if (parts[0] === 'storico') {
    // /storico/:sezione → sezione di provenienza, poi "Storico"
    const from = navItems.find(i => i.path === ({ mezzi: '/flotta', palmari: '/palmari', 'codici-autista': '/codici-autista' } as Record<string, string>)[parts[1] ?? '']);
    if (from) out.push({ label: from.label, to: from.path });
    out.push({ label: 'Storico' });
    return out;
  }
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


  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        {/* Nelle schede di dettaglio: piccolo link per tornare all'elenco (al posto della vecchia barra in alto) */}
        {crumbs.length > 1 && crumbs[0].to && (
          <Link to={crumbs[0].to} className="app-back">
            <Icon name="chevLeft" size={13} />{crumbs[0].label}
          </Link>
        )}
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
