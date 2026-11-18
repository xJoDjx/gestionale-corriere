import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Tema unico chiaro: rimuove un eventuale tema scuro salvato in passato.
document.documentElement.removeAttribute('data-theme');
localStorage.removeItem('gestionale-theme');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
