// src/features/acconti/Acconti.tsx
import { useState, useMemo } from 'react';
import './Acconti.css';

interface Acconto {
  id: string;
  codiceAutistaId: string;
  codice: string;
  nomeAutista: string;
  padroncinoId: string;
  ragioneSociale: string;
  importo: number;
  data: string;
  descrizione: string | null;
  mese: string | null;
}

interface NuovoAccontoForm {
  codiceAutistaId: string;
  importo: string;
  data: string;
  descrizione: string;
  mese: string;
}

const MOCK_ACCONTI: Acconto[] = [
  { id: 'ac1', codiceAutistaId: 'ca1', codice: 'AUT001', nomeAutista: 'Marco Rossi', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC', importo: 200, data: '2026-03-15', descrizione: 'Acconto marzo', mese: '2026-03' },
  { id: 'ac2', codiceAutistaId: 'ca2', codice: 'AUT002', nomeAutista: 'Luca Ferrari', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC', importo: 150, data: '2026-03-10', descrizione: 'Acconto marzo', mese: '2026-03' },
  { id: 'ac3', codiceAutistaId: 'ca3', codice: 'AUT003', nomeAutista: 'Ahmed Benali', padroncinoId: 'p2', ragioneSociale: 'DI NARDO', importo: 300, data: '2026-03-05', descrizione: 'Acconto inizio mese', mese: '2026-03' },
  { id: 'ac4', codiceAutistaId: 'ca4', codice: 'AUT004', nomeAutista: 'Piotr Kowalski', padroncinoId: 'p3', ragioneSociale: 'EL SPEDIZIONI', importo: 400, data: '2026-03-01', descrizione: 'Acconto inizio mese', mese: '2026-03' },
  { id: 'ac5', codiceAutistaId: 'ca1', codice: 'AUT001', nomeAutista: 'Marco Rossi', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC', importo: 200, data: '2026-02-10', descrizione: 'Acconto febbraio', mese: '2026-02' },
  { id: 'ac6', codiceAutistaId: 'ca2', codice: 'AUT002', nomeAutista: 'Luca Ferrari', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC', importo: 150, data: '2026-02-08', descrizione: 'Acconto febbraio', mese: '2026-02' },
];

// Autisti disponibili per il form
const CODICI_AUTISTI = [
  { id: 'ca1', codice: 'AUT001', nome: 'Marco', cognome: 'Rossi', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC' },
  { id: 'ca2', codice: 'AUT002', nome: 'Luca', cognome: 'Ferrari', padroncinoId: 'p1', ragioneSociale: 'MEN LOGISTIC' },
  { id: 'ca3', codice: 'AUT003', nome: 'Ahmed', cognome: 'Benali', padroncinoId: 'p2', ragioneSociale: 'DI NARDO' },
  { id: 'ca4', codice: 'AUT004', nome: 'Piotr', cognome: 'Kowalski', padroncinoId: 'p3', ragioneSociale: 'EL SPEDIZIONI' },
  { id: 'ca5', codice: 'AUT005', nome: 'Ivan', cognome: 'Petrovic', padroncinoId: 'p4', ragioneSociale: 'IB EXPRESS SRLS' },
];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function eur(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('it-IT');
}

export default function Acconti() {
  const [mese, setMese] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [acconti, setAcconti] = useState<Acconto[]>(MOCK_ACCONTI);
  const [form, setForm] = useState<NuovoAccontoForm>({
    codiceAutistaId: '',
    importo: '',
    data: new Date().toISOString().split('T')[0],
    descrizione: '',
    mese: getCurrentMonth(),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoAccontoForm, string>>>({});

  const filtered = useMemo(() => {
    return acconti.filter((a) => {
      const matchMese = !mese || a.mese === mese;
      const s = search.toLowerCase();
      const matchSearch = !search || a.codice.toLowerCase().includes(s) || a.nomeAutista.toLowerCase().includes(s) || a.ragioneSociale.toLowerCase().includes(s);
      return matchMese && matchSearch;
    });
  }, [acconti, mese, search]);

  const stats = useMemo(() => {
    const tot = filtered.reduce((s, a) => s + a.importo, 0);
    const byPad: Record<string, { nome: string; totale: number }> = {};
    for (const a of filtered) {
      if (!byPad[a.padroncinoId]) byPad[a.padroncinoId] = { nome: a.ragioneSociale, totale: 0 };
      byPad[a.padroncinoId].totale += a.importo;
    }
    return { totale: tot, count: filtered.length, byPadroncino: Object.values(byPad) };
  }, [filtered]);

  const setF = (k: keyof NuovoAccontoForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoAccontoForm, string>> = {};
    if (!form.codiceAutistaId) e.codiceAutistaId = 'Seleziona un autista';
    if (!form.importo || isNaN(parseFloat(form.importo))) e.importo = 'Importo non valido';
    if (!form.data) e.data = 'Data obbligatoria';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const autista = CODICI_AUTISTI.find((a) => a.id === form.codiceAutistaId)!;
    const nuovo: Acconto = {
      id: `ac${Date.now()}`,
      codiceAutistaId: autista.id,
      codice: autista.codice,
      nomeAutista: `${autista.nome} ${autista.cognome}`,
      padroncinoId: autista.padroncinoId,
      ragioneSociale: autista.ragioneSociale,
      importo: parseFloat(form.importo),
      data: form.data,
      descrizione: form.descrizione || null,
      mese: form.mese || form.data.substring(0, 7),
    };
    setAcconti((a) => [nuovo, ...a]);
    setForm({ codiceAutistaId: '', importo: '', data: new Date().toISOString().split('T')[0], descrizione: '', mese: getCurrentMonth() });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Eliminare questo acconto?')) {
      setAcconti((a) => a.filter((x) => x.id !== id));
    }
  };

  return (
    <div className="acc-page">
      {/* Header */}
      <div className="acc-header">
        <div>
          <h1>💰 Acconti Autisti</h1>
          <span className="acc-sub">Gestione acconti per codice autista</span>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nuovo Acconto</button>
      </div>

      {/* Stats */}
      <div className="acc-stats">
        <div className="acc-stat">
          <span className="acc-stat-label">ACCONTI NEL PERIODO</span>
          <span className="acc-stat-value">{stats.count}</span>
        </div>
        <div className="acc-stat acc-stat-primary">
          <span className="acc-stat-label">TOTALE ACCONTI</span>
          <span className="acc-stat-value">{eur(stats.totale)} €</span>
        </div>
        {stats.byPadroncino.map((p) => (
          <div key={p.nome} className="acc-stat">
            <span className="acc-stat-label">{p.nome}</span>
            <span className="acc-stat-value acc-sub-val">{eur(p.totale)} €</span>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="acc-filters">
        <div className="acc-search">
          <span>🔍</span>
          <input
            placeholder="Cerca autista, codice, padroncino…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="acc-filter-group">
          <label className="acc-filter-label">MESE</label>
          <input
            type="month"
            className="acc-month-input"
            value={mese}
            onChange={(e) => setMese(e.target.value)}
          />
        </div>
        {mese && (
          <button className="btn-outline" onClick={() => setMese('')}>Tutti i mesi</button>
        )}
      </div>

      {/* Form Nuovo Acconto (inline) */}
      {showForm && (
        <div className="acc-form-panel">
          <div className="acc-form-header">
            <h3>Nuovo Acconto</h3>
            <button className="acc-form-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          <div className="acc-form-grid">
            <div className="acc-form-field">
              <label className="acc-form-label">Codice Autista <span className="req">*</span></label>
              <select
                className={`acc-form-select ${errors.codiceAutistaId ? 'input-error' : ''}`}
                value={form.codiceAutistaId}
                onChange={(e) => {
                  setF('codiceAutistaId', e.target.value);
                  const a = CODICI_AUTISTI.find((x) => x.id === e.target.value);
                  if (a) setF('mese', form.mese || getCurrentMonth());
                }}
              >
                <option value="">— Seleziona autista —</option>
                {CODICI_AUTISTI.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codice} — {a.nome} {a.cognome} ({a.ragioneSociale})
                  </option>
                ))}
              </select>
              {errors.codiceAutistaId && <span className="field-error">{errors.codiceAutistaId}</span>}
            </div>

            <div className="acc-form-field">
              <label className="acc-form-label">Importo (€) <span className="req">*</span></label>
              <input
                className={`acc-form-input ${errors.importo ? 'input-error' : ''}`}
                type="number"
                step="0.01"
                placeholder="200,00"
                value={form.importo}
                onChange={(e) => setF('importo', e.target.value)}
              />
              {errors.importo && <span className="field-error">{errors.importo}</span>}
            </div>

            <div className="acc-form-field">
              <label className="acc-form-label">Data <span className="req">*</span></label>
              <input
                className={`acc-form-input ${errors.data ? 'input-error' : ''}`}
                type="date"
                value={form.data}
                onChange={(e) => setF('data', e.target.value)}
              />
              {errors.data && <span className="field-error">{errors.data}</span>}
            </div>

            <div className="acc-form-field">
              <label className="acc-form-label">Mese di competenza</label>
              <input
                className="acc-form-input"
                type="month"
                value={form.mese}
                onChange={(e) => setF('mese', e.target.value)}
              />
            </div>

            <div className="acc-form-field acc-form-span2">
              <label className="acc-form-label">Descrizione</label>
              <input
                className="acc-form-input"
                placeholder="Acconto inizio mese…"
                value={form.descrizione}
                onChange={(e) => setF('descrizione', e.target.value)}
              />
            </div>
          </div>
          <div className="acc-form-actions">
            <button className="btn-outline" onClick={() => setShowForm(false)}>Annulla</button>
            <button className="btn-primary" onClick={handleSave}>💾 Salva Acconto</button>
          </div>
        </div>
      )}

      {/* Tabella */}
      <div className="acc-table-wrap">
        {filtered.length === 0 ? (
          <div className="acc-empty">
            <span>💰</span>
            <p>Nessun acconto trovato per il periodo selezionato</p>
          </div>
        ) : (
          <table className="acc-table">
            <thead>
              <tr>
                <th>CODICE</th>
                <th>AUTISTA</th>
                <th>PADRONCINO</th>
                <th>DESCRIZIONE</th>
                <th>DATA</th>
                <th>MESE</th>
                <th style={{ textAlign: 'right' }}>IMPORTO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="acc-row">
                  <td>
                    <span className="acc-codice">{a.codice}</span>
                  </td>
                  <td className="acc-autista">{a.nomeAutista}</td>
                  <td>
                    <span className="acc-padroncino">{a.ragioneSociale}</span>
                  </td>
                  <td className="acc-desc">{a.descrizione || '—'}</td>
                  <td className="acc-data">{fmt(a.data)}</td>
                  <td>
                    {a.mese && <span className="acc-mese-badge">{a.mese}</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="acc-importo">+{eur(a.importo)} €</span>
                  </td>
                  <td>
                    <div className="acc-actions">
                      <button className="acc-del-btn" onClick={() => handleDelete(a.id)} title="Elimina">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="acc-foot">
                <td colSpan={6}><strong>TOTALE ({filtered.length} acconti)</strong></td>
                <td style={{ textAlign: 'right' }}>
                  <strong className="acc-importo">+{eur(stats.totale)} €</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
