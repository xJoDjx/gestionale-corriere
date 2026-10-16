import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: string;
  /** null = ADMIN (tutte le sezioni). Array vuoto = nessuna restrizione (backward compat). */
  sezioniVisibili: string[] | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  refreshUser: async () => {
    const token = get().token || localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const sezioniVisibili: string[] | null = data.ruolo === 'ADMIN'
        ? null
        : (data.permessi ?? [])
            .filter((p: any) => p.risorsa === 'sezione')
            .map((p: any) => p.azione);
      const user: User = {
        id: data.id,
        email: data.email,
        nome: data.nome,
        cognome: data.cognome,
        ruolo: data.ruolo,
        sezioniVisibili,
      };
      localStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch { /* ignora */ }
  },
}));
