import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './features/auth/Login';
import { useAuthStore } from './stores/auth.store';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
import Dashboard from './features/dashboard/Dashboard';
import FlottaMezzi from './features/mezzi/FlottaMezzi';
import DettaglioMezzo from './features/mezzi/DettaglioMezzo';
import ConteggiMensili from './features/conteggi/ConteggiMensili';
import PadronciniPage from './features/padroncini/Padroncini';
import DettaglioPadroncino from './features/padroncini/DettaglioPadroncino';
import PalmariPage from './features/palmari/Palmari';
import DettaglioPalmare from './features/palmari/DettaglioPalmare';
import CodiciAutistiPage from './features/codici-autista/CodiciAutisti';
import DettaglioCodiceAutista from './features/codici-autista/DettaglioCodiceAutista';
import AccontiPage from './features/acconti/Acconti';
import GestioneUtenti from './features/utenti/GestioneUtenti';
import LogStorico from './features/log/LogStorico';
import RicaricheElettriche from './features/ricariche/RicaricheElettriche';
import CarteEni from './features/carte-eni/CarteEni';
import Impostazioni from './features/impostazioni/Impostazioni';
import Ricerca from './features/ricerca/Ricerca';
import AddebitivSospesiPage from './features/addebiti-sospesi/AddebitivSospesi';
import AnalisiSpedizioni from './features/analisi-spedizioni/AnalisiSpedizioni';
import Margini from './features/margini/Margini';
import Esportazione from './features/esportazione/Esportazione';
import './styles/global.css';
import './features/mezzi/FlottaMezzi.css';
import './features/conteggi/ConteggiMensili.css';
import './features/dashboard/Dashboard.css';
import './features/padroncini/Padroncini.css';
import './features/palmari/Palmari.css';
import './features/codici-autista/CodiciAutisti.css';
import './features/acconti/Acconti.css';
import './features/log/LogStorico.css';
import './features/ricariche/RicaricheElettriche.css';
import './features/carte-eni/CarteEni.css';
import ConteggiPage from './features/conteggi/ConteggiPage';
import DettaglioConteggio from './features/conteggi/DettaglioConteggio';
import './features/conteggi/ConteggiPage.css';
import './features/conteggi/DettaglioConteggio.css';
import './features/analisi-spedizioni/AnalisiSpedizioni.css';
import './features/margini/Margini.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flotta" element={<FlottaMezzi />} />
          <Route path="/flotta/:id" element={<DettaglioMezzo />} />
          <Route path="/conteggi" element={<ConteggiPage />} />
          <Route path="/conteggi/:id" element={<DettaglioConteggio />} />
          <Route path="/padroncini" element={<PadronciniPage />} />
          <Route path="/padroncini/:id" element={<DettaglioPadroncino />} />
          <Route path="/palmari" element={<PalmariPage />} />
          <Route path="/palmari/:id" element={<DettaglioPalmare />} />
          <Route path="/codici-autista" element={<CodiciAutistiPage />} />
          <Route path="/codici-autista/:id" element={<DettaglioCodiceAutista />} />
          <Route path="/acconti" element={<AccontiPage />} />
          <Route path="/addebiti-sospesi" element={<AddebitivSospesiPage />} />
          <Route path="/analisi-spedizioni" element={<AnalisiSpedizioni />} />
          <Route path="/margini" element={<Margini />} />
          <Route path="/utenti" element={<GestioneUtenti />} />
          <Route path="/log" element={<LogStorico />} />
          <Route path="/ricariche" element={<RicaricheElettriche />} />
          <Route path="/carte-eni" element={<CarteEni />} />
          <Route path="/ricerca" element={<Ricerca />} />
          <Route path="/esportazione" element={<Esportazione />} />
          <Route path="/impostazioni" element={<Impostazioni />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
