// src/components/layout/Sidebar.tsx
import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import { mezziApi } from '../../lib/api';
import { Icon, IconName, C } from '../ds';
import './Sidebar.css';

export interface NavEntry { path: string; label: string; icon: IconName; key: string; color?: string }
interface NavGroup { title: string; items: NavEntry[] }

/** Menu a gruppi. Le chiavi (key) sono quelle dei permessi "sezioni visibili": non cambiarle. */
export const navGroups: NavGroup[] = [
  { title: '', items: [
    { path: '/', label: 'Panoramica', icon: 'oggi', key: 'dashboard' },
    { path: '/padroncini', label: 'Padroncini', icon: 'pad', key: 'padroncini' },
    { path: '/conteggi', label: 'Conteggi', icon: 'cont', key: 'conteggi' },
    { path: '/acconti', label: 'Acconti', icon: 'acconti', key: 'acconti' },
    { path: '/addebiti-sospesi', label: 'Sospesi e memo', icon: 'sospesi', key: 'addebiti-sospesi' },
  ] },
  { title: 'Risorse', items: [
    { path: '/flotta', label: 'Flotta mezzi', icon: 'mezzi', key: 'flotta', color: C.teal },
    { path: '/palmari', label: 'Palmari', icon: 'palm', key: 'palmari', color: C.blue },
    { path: '/codici-autista', label: 'Codici autista', icon: 'cod', key: 'codici-autista', color: C.purple },
  ] },
  { title: 'Costi', items: [
    { path: '/ricariche', label: 'Ricariche elettriche', icon: 'ric', key: 'ricariche', color: C.green },
    { path: '/carte-eni', label: 'Carte Eni', icon: 'eni', key: 'carte-eni', color: C.orange },
  ] },
  { title: 'Analisi', items: [
    { path: '/analisi-spedizioni', label: 'Spedizioni e doppi', icon: 'sped', key: 'analisi-spedizioni', color: C.yellow },
    { path: '/margini', label: 'Margini', icon: 'marg', key: 'margini', color: C.red },
  ] },
  { title: 'Sistema', items: [
    { path: '/log', label: 'Storico modifiche', icon: 'stor', key: 'log' },
    { path: '/esportazione', label: 'Esportazioni', icon: 'download', key: 'esportazione' },
    { path: '/impostazioni', label: 'Impostazioni', icon: 'imp', key: 'impostazioni' },
    { path: '/utenti', label: 'Utenti', icon: 'utenti', key: 'utenti' },
  ] },
];

/** Elenco piatto delle sezioni (usato anche dalla gestione utenti per i permessi). */
export const navItems: NavEntry[] = [
  ...navGroups.flatMap(g => g.items),
  { path: '/ricerca', label: 'Ricerca', icon: 'search', key: 'ricerca' },
];

const COLLAPSED_KEY = 'gc.sidebar.collapsed';

export function useCanSee() {
  const { user } = useAuthStore();
  return (key: string) =>
    !user || user.ruolo === 'ADMIN' || !user.sezioniVisibili || user.sezioniVisibili.length === 0 || user.sezioniVisibili.includes(key);
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const canSee = useCanSee();
  const [collapsed, setCollapsed] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem(COLLAPSED_KEY) === '1');
  const [sospesiCount, setSospesiCount] = useState(0);
  const [scadenze, setScadenze] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '64px' : '248px');
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Aggiorna il conteggio dei sospesi pendenti a ogni cambio pagina (come prima)
  useEffect(() => {
    addebitivSospesoApi.list({ stato: 'PENDENTE' }).then(d => setSospesiCount(d.length)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (!canSee('flotta')) return;
    mezziApi.stats().then(s => setScadenze(s.scadenzeImminenti ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const initials = `${user?.nome?.[0] || ''}${user?.cognome?.[0] || ''}`.toUpperCase() || 'U';
  const ruolo = user?.ruolo === 'ADMIN' ? 'Amministratore' : user?.ruolo === 'OPERATORE' ? 'Operatore' : user?.ruolo === 'VIEWER' ? 'Solo lettura' : '';

  return (
    <nav aria-label="Navigazione principale" className={`sb ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sb-inner">
        <div className="sb-brand">
          {!collapsed && (
            <Link to="/" className="sb-logo">
              <span aria-hidden="true" className="sb-logo-mark"><Icon name="mezzi" size={14} stroke={2.2} /></span>
              Gestionale
            </Link>
          )}
          <button type="button" className="sb-toggle" onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Espandi menu' : 'Comprimi menu'} title={collapsed ? 'Espandi menu' : 'Comprimi menu'}>
            <Icon name={collapsed ? 'chevRight' : 'chevLeft'} size={16} />
          </button>
        </div>

        <div className="sb-scroll">
          {navGroups.map(g => {
            const items = g.items.filter(i => canSee(i.key));
            if (!items.length) return null;
            return (
              <div key={g.title || 'main'} className="sb-group">
                {g.title && !collapsed && <div className="sb-group-title">{g.title}</div>}
                {items.map(it => (
                  <NavLink key={it.path} to={it.path} end={it.path === '/'} title={it.label} aria-label={collapsed ? it.label : undefined}
                    className={({ isActive }) => `sb-item ${isActive ? 'is-active' : ''}`}>
                    <span aria-hidden="true" className={`sb-ico ${it.color ? 'is-tile' : ''}`} style={it.color ? { background: it.color } : undefined}>
                      <Icon name={it.icon} size={it.color ? 12 : 16} stroke={it.color ? 2.4 : 2} />
                    </span>
                    {!collapsed && <span className="sb-label">{it.label}</span>}
                    {it.path === '/addebiti-sospesi' && sospesiCount > 0 && (
                      collapsed
                        ? <span className="sb-badge-dot">{sospesiCount > 9 ? '9+' : sospesiCount}</span>
                        : <span className="sb-count">{sospesiCount > 99 ? '99+' : sospesiCount}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </div>

        <div className="sb-foot">
          {!collapsed && scadenze !== null && scadenze > 0 && (
            <Link to="/flotta" className="sb-alert">
              <span className="ds-dot ds-dot-warn">Scadenze</span>
              <strong>{scadenze} {scadenze === 1 ? 'scadenza imminente' : 'scadenze imminenti'}</strong>
              <span className="sb-alert-sub">Assicurazioni, revisioni, bolli, fine noleggio</span>
              <span className="sb-alert-link">Vedi in Flotta ↗</span>
            </Link>
          )}
          <div className="sb-user">
            <span aria-hidden="true" className="sb-avatar">{initials}</span>
            {!collapsed && (
              <span className="sb-user-text">
                <span className="sb-user-name">{[user?.nome, user?.cognome].filter(Boolean).join(' ') || 'Utente'}</span>
                <span className="sb-user-role">{ruolo}</span>
              </span>
            )}
            <button type="button" className="ds-iconbtn" onClick={handleLogout} aria-label="Esci" title="Esci">
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
