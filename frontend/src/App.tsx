import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './features/dashboard/Dashboard';
import FlottaMezzi from './features/mezzi/FlottaMezzi';
import DettaglioMezzo from './features/mezzi/DettaglioMezzo';
import ConteggiMensili from './features/conteggi/ConteggiMensili';
import PadronciniPage from './features/padroncini/Padroncini';
import PalmariPage from './features/palmari/Palmari';
import CodiciAutistiPage from './features/codici-autista/CodiciAutisti';
import AccontiPage from './features/acconti/Acconti';
import './styles/global.css';
import './features/mezzi/FlottaMezzi.css';
import './features/conteggi/ConteggiMensili.css';
import './features/dashboard/Dashboard.css';
import './features/padroncini/Padroncini.css';
import './features/palmari/Palmari.css';
import './features/codici-autista/CodiciAutisti.css';
import './features/acconti/Acconti.css';

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
        Sezione in sviluppo — verrà implementata nel prossimo step.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flotta" element={<FlottaMezzi />} />
          <Route path="/flotta/:id" element={<DettaglioMezzo />} />
          <Route path="/conteggi" element={<ConteggiMensili />} />
          <Route path="/padroncini" element={<PadronciniPage />} />
          <Route path="/palmari" element={<PalmariPage />} />
          <Route path="/codici-autista" element={<CodiciAutistiPage />} />
          <Route path="/acconti" element={<AccontiPage />} />
          <Route path="/ricariche" element={<Placeholder title="Ricariche Elettriche" />} />
          <Route path="/ricerca" element={<Placeholder title="Ricerca Globale" />} />
          <Route path="/esportazione" element={<Placeholder title="Esportazione" />} />
          <Route path="/impostazioni" element={<Placeholder title="Impostazioni" />} />
          <Route path="/utenti" element={<Placeholder title="Gestione Utenti" />} />
          <Route path="/log" element={<Placeholder title="Log Storico" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
