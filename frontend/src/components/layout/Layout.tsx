import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../stores/auth.store';
import './Layout.css';

export default function Layout() {
  const { user, token, refreshUser } = useAuthStore();

  // Se il token esiste ma l'oggetto user è mancante o incompleto, lo ripristina
  useEffect(() => {
    if (token && (!user || !user.nome || !user.ruolo)) {
      refreshUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
