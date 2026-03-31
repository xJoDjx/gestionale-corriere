// src/components/ui/ThemeToggle.tsx
import { useEffect } from 'react';
import { useThemeStore } from '../../stores/theme.store';
import './ThemeToggle.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  // Applica il tema all'avvio
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
    >
      <span className="theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Tema Chiaro' : 'Tema Scuro'}</span>
    </button>
  );
}
