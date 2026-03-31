import { useState, useMemo } from 'react';
import './CodiciAutisti.css';

interface CodiceAutista {
  id: string;
  codice: string;
  nome: string;
  cognome: string;
  attivo: boolean;
  padroncino: string | null;
  padroncinoId: string | null;
  assegnatoDal: string | null;
  accontiMese: number;
  totaleAcconti: number;
}

const MOCK: CodiceAutista[] = [
  { id: '1', codice: 'AUT001', nome: 'Marco', cognome: 'Rossi', attivo: true, padroncino: 'MEN LOGISTIC', padroncinoId: 'p1', assegnatoDal: '2025-01-01', accontiMese: 1, totaleAcconti: 200 },
  { id: '2', codice: 'AUT002', nome: 'Giuseppe', cognome: 'Bianchi', attivo: true, padroncino: 'DI NARDO', padroncinoId: 'p2', assegnatoDal: '2025-01-01', accontiMese: 1, totaleAcconti: 250 },
  { id: '3', codice: 'AUT003', nome: 'Antonio', cognome: 'Esposito', attivo: true, padroncino: 'EL SPEDIZIONI', padroncinoId: 'p3', assegnatoDal: '2025-02-01', accontiMese: 1, totaleAcconti: 300 },
  { id: '4', codice: 'AUT004', nome: 'Luigi', cognome: 'Russo', attivo: true, padroncino: 'IB EXPRESS SRLS', padroncinoId: 'p4', assegnatoDal: '2025-03-01', accontiMese: 1, totaleAcconti: 350 },
  { id: '5', codice: 'AUT005', nome: 'Francesco', cognome: 'Romano', attivo: true, padroncino: 'QUICK EXPRESS SRLS', padroncinoId: 'p5', assegnatoDal: '2025-03-15', accontiMese: 0, totaleAcconti: 0 },
  { id: '6', codice: 'AUT006', nome: 'Paolo', cognome: 'Colombo', attivo: true, padroncino: 'MEN LOGISTIC', padroncinoId: 'p1', assegnatoDal: '2025-04-01', accontiMese: 0, totaleAcconti: 0 },
  { id: '7', codice: 'AUT007', nome: 'Salvatore', cognome: 'Ferrara', attivo: false, padroncino: null, padroncinoId: null, assegnatoDal: null, accontiMese: 0, totaleAcconti: 0 },
  { id: '8', codice: 'AUT008', nome: 'Giovanni', cognome: 'Ricci', attivo: true, padroncino: null, padroncinoId: null, assegnatoDal: null, accontiMese: 0, totaleAcconti: 0 },
];

function eur(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2 });
}

export default function CodiciAutistiPage() {
  const [search, setSearch] = useState('');
  const [showInattivi, setShowInattivi] = useState(false);

  const filtered = useMemo(() => {
    return MOCK.filter((c) => {
      if (!showInattivi && !c.attivo) return false;
      if (search) {
        const s = search.toLowerCase();
        return c.codice.toLowerCase().includes(s) || c.nome.toLowerCase().includes(s) || c.cognome.toLowerCase().includes(s) || c.padroncino?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, showInattivi]);

  const totAccontiMese = MOCK.reduce((s, c) => s + c.totaleAcconti, 0);

  return (
    <div className="ca-page">
      <div className="ca-header">
        <h1>Codici Autisti</h1>
        <div className="ca-header-actions">
          <button className="btn-primary">+ Nuovo codice</button>
          <button className="btn-outline">+ Inserisci acconto</button>
        </div>
      </div>

      <div className="ca-stats">
        <div className="ca-stat"><span className="ca-stat-l">TOTALI</span><span className="ca-stat-v">{MOCK.filter((c) => c.attivo).length}</span><span className="ca-stat-s">{MOCK.filter((c) => !c.attivo).length} inattivi</span></div>
        <div className="ca-stat"><span className="ca-stat-l">ASSEGNATI</span><span className="ca-stat-v">{MOCK.filter((c) => c.padroncino).length}</span></div>
        <div className="ca-stat"><span className="ca-stat-l">NON ASSEGNATI</span><span className="ca-stat-v ca-v-warn">{MOCK.filter((c) => c.attivo && !c.padroncino).length}</span></div>
        <div className="ca-stat"><span className="ca-stat-l">ACCONTI MESE</span><span className="ca-stat-v ca-v-neg">{eur(totAccontiMese)} €</span></div>
      </div>

      <div className="ca-filters">
        <div className="ca-search">
          <span>🔍</span>
          <input placeholder="Cerca codice, nome, padroncino..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="ca-toggle">
          <input type="checkbox" checked={showInattivi} onChange={(e) => setShowInattivi(e.target.checked)} />
          <span>Mostra inattivi</span>
        </label>
      </div>

      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead>
            <tr>
              <th>CODICE</th>
              <th>AUTISTA</th>
              <th>STATO</th>
              <th>PADRONCINO</th>
              <th>DAL</th>
              <th style={{ textAlign: 'right' }}>ACCONTI MESE</th>
              <th style={{ textAlign: 'right' }}>TOT. ACCONTI</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={!c.attivo ? 'ca-row-inactive' : ''}>
                <td>
                  <span className="ca-codice">{c.codice}</span>
                </td>
                <td>
                  <div className="ca-autista">
                    <div className="ca-autista-avatar">{c.nome[0]}{c.cognome[0]}</div>
                    <div className="ca-autista-info">
                      <span className="ca-autista-name">{c.nome} {c.cognome}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`ca-badge ${c.attivo ? 'ca-badge-attivo' : 'ca-badge-inattivo'}`}>
                    {c.attivo ? 'Attivo' : 'Inattivo'}
                  </span>
                </td>
                <td>
                  {c.padroncino ? (
                    <span className="ca-padroncino">{c.padroncino}</span>
                  ) : (
                    <span className="ca-no-assign">Non assegnato</span>
                  )}
                </td>
                <td className="ca-date">
                  {c.assegnatoDal ? new Date(c.assegnatoDal).toLocaleDateString('it-IT') : '—'}
                </td>
                <td className="ca-num">
                  {c.accontiMese > 0 ? (
                    <span className="ca-acconti-count">{c.accontiMese}</span>
                  ) : '—'}
                </td>
                <td className="ca-num ca-num-bold">
                  {c.totaleAcconti > 0 ? (
                    <span className="ca-neg">{eur(c.totaleAcconti)} €</span>
                  ) : '—'}
                </td>
                <td>
                  <div className="ca-actions">
                    {c.attivo && !c.padroncino && <button className="btn-primary btn-xs">Assegna</button>}
                    {c.attivo && c.padroncino && <button className="btn-outline btn-xs">Acconto</button>}
                    <button className="ca-btn-more">⋯</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
