import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './features/auth/Login';
import { useAuthStore } from './stores/auth.store';
import { useParams } from 'react-router-dom';
import { navItems, useCanSee } from './components/layout/Sidebar';
import { Page, Card, Empty } from './components/ds';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/**
 * Mostra la pagina solo se l'utente ha quella sezione tra le visibili.
 * Altrimenti porta alla prima sezione consentita (nell'ordine del menu),
 * così chi ha solo "Flotta mezzi" dopo il login atterra su Flotta e non sulla Panoramica.
 */
/** Storico note/modifiche/attività: visibile a chi vede la sezione da cui si arriva */
const STORICO_SEZ: Record<string, string> = { mezzi: 'flotta', palmari: 'palmari', 'codici-autista': 'codici-autista' };
function SezStorico() {
  const { sezione = 'mezzi' } = useParams();
  return <Sez k={STORICO_SEZ[sezione] ?? 'flotta'}><StoricoAttivita /></Sez>;
}

function Sez({ k, children }: { k: string; children: React.ReactNode }) {
  const canSee = useCanSee();
  if (canSee(k)) return <>{children}</>;
  const prima = navItems.find((i) => i.key !== 'ricerca' && canSee(i.key)) ?? navItems.find((i) => canSee(i.key));
  if (prima) return <Navigate to={prima.path} replace />;
  return (
    <Page>
      <Card pad><Empty>Il tuo utente non ha sezioni abilitate. Chiedi a un amministratore di assegnartene almeno una in Utenti.</Empty></Card>
    </Page>
  );
}
import Dashboard from './features/dashboard/Dashboard';
import FlottaMezzi from './features/mezzi/FlottaMezzi';
import RegistroMezziPage from './features/mezzi/RegistroMezzi';
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
import StoricoAttivita from './features/storico/StoricoAttivita';
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
          <Route path="/" element={<Sez k="dashboard"><Dashboard /></Sez>} />
          <Route path="/flotta" element={<Sez k="flotta"><FlottaMezzi /></Sez>} />
          <Route path="/flotta/verbali" element={<Sez k="flotta"><RegistroMezziPage /></Sez>} />
          <Route path="/flotta/:id" element={<Sez k="flotta"><DettaglioMezzo /></Sez>} />
          <Route path="/conteggi" element={<Sez k="conteggi"><ConteggiPage /></Sez>} />
          <Route path="/conteggi/:id" element={<Sez k="conteggi"><DettaglioConteggio /></Sez>} />
          <Route path="/padroncini" element={<Sez k="padroncini"><PadronciniPage /></Sez>} />
          <Route path="/padroncini/:id" element={<Sez k="padroncini"><DettaglioPadroncino /></Sez>} />
          <Route path="/palmari" element={<Sez k="palmari"><PalmariPage /></Sez>} />
          <Route path="/palmari/:id" element={<Sez k="palmari"><DettaglioPalmare /></Sez>} />
          <Route path="/codici-autista" element={<Sez k="codici-autista"><CodiciAutistiPage /></Sez>} />
          <Route path="/codici-autista/:id" element={<Sez k="codici-autista"><DettaglioCodiceAutista /></Sez>} />
          <Route path="/acconti" element={<Sez k="acconti"><AccontiPage /></Sez>} />
          <Route path="/addebiti-sospesi" element={<Sez k="addebiti-sospesi"><AddebitivSospesiPage /></Sez>} />
          <Route path="/analisi-spedizioni" element={<Sez k="analisi-spedizioni"><AnalisiSpedizioni /></Sez>} />
          <Route path="/margini" element={<Sez k="margini"><Margini /></Sez>} />
          <Route path="/utenti" element={<Sez k="utenti"><GestioneUtenti /></Sez>} />
          <Route path="/log" element={<Sez k="log"><LogStorico /></Sez>} />
          <Route path="/ricariche" element={<Sez k="ricariche"><RicaricheElettriche /></Sez>} />
          <Route path="/carte-eni" element={<Sez k="carte-eni"><CarteEni /></Sez>} />
          <Route path="/ricerca" element={<Sez k="ricerca"><Ricerca /></Sez>} />
          <Route path="/storico/:sezione" element={<SezStorico />} />
          <Route path="/esportazione" element={<Sez k="esportazione"><Esportazione /></Sez>} />
          <Route path="/impostazioni" element={<Sez k="impostazioni"><Impostazioni /></Sez>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
