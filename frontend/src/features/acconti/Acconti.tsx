// src/features/acconti/Acconti.tsx
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import './Acconti.css';

interface Acconto {
  id: string;
  codice: string;
  nomeAutista: string;
  ragioneSociale: string;
  padroncinoId: string | null;
  importo: number;
  tipo: 'ACCONTO' | 'RESTITUZIONE';
  data: string;
  descrizione: string | null;
  mese: string | null;
  addebitatoIn: { mese: string; ragioneSociale: string } | null;
}

interface NuovoAccontoForm {
  codiceAutista: string;
  importo: string;
  tipo: 'ACCONTO' | 'RESTITUZIONE';
  data: string;
  descrizione: string;
  mese: string;
}

interface CodiceVerifica {
  found: boolean;
  codice?: string;
  id?: string;
  nome?: string | null;
  cognome?: string | null;
  padroncino?: { id: string; ragioneSociale: string } | null;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function eur(n: number) {
  return Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('it-IT');
}

const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function formatMeseLabel(mese: string): string {
  const [year, month] = mese.split('-');
  return `${MESI_IT[parseInt(month, 10) - 1]} ${year}`;
}

// Determina se un acconto è una restituzione dal campo descrizione (compatibilità)
function isTipoRestituzione(a: any): boolean {
  return a.tipo === 'RESTITUZIONE' || (a.descrizione && String(a.descrizione).startsWith('[RESTITUZIONE]'));
}

function normalizeAcconto(raw: any): Acconto {
  const tipo: 'ACCONTO' | 'RESTITUZIONE' = isTipoRestituzione(raw) ? 'RESTITUZIONE' : 'ACCONTO';
  return {
    id: raw.id,
    codice: raw.codice ?? raw.codiceAutista?.codice ?? '—',
    nomeAutista: raw.nomeAutista ?? ([raw.codiceAutista?.nome, raw.codiceAutista?.cognome].filter(Boolean).join(' ') || 'N/D'),
    ragioneSociale: raw.ragioneSociale ?? 'N/A',
    padroncinoId: raw.padroncinoId ?? null,
    importo: Number(raw.importo),
    tipo,
    data: typeof raw.data === 'string' ? raw.data.split('T')[0] : new Date(raw.data).toISOString().split('T')[0],
    descrizione: raw.descrizione ?? null,
    mese: raw.mese ?? null,
    addebitatoIn: raw.addebitatoIn ?? null,
  };
}

export default function Acconti() {
  const [mese, setMese] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [acconti, setAcconti] = useState<Acconto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<NuovoAccontoForm>({
    codiceAutista: '',
    importo: '',
    tipo: 'ACCONTO',
    data: new Date().toISOString().split('T')[0],
    descrizione: '',
    mese: getCurrentMonth(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof NuovoAccontoForm, string>>>({});
  const [verifica, setVerifica] = useState<CodiceVerifica | null>(null);
  const [verificando, setVerificando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Import Excel
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = mese ? `?mese=${mese}` : '';
      const raw = await api.get<any[]>(`/acconti${params}`);
      setAcconti(raw.map(normalizeAcconto));
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [mese]);

  useEffect(() => { load(); }, [load]);

  // Lookup live del codice autista
  const handleCodiceChange = (val: string) => {
    setF('codiceAutista', val);
    setVerifica(null);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setVerificando(true);
      try {
        const res = await api.get<CodiceVerifica>(`/acconti/verifica-codice/${val.trim().toUpperCase()}`);
        setVerifica(res);
      } catch {
        setVerifica({ found: false });
      } finally {
        setVerificando(false);
      }
    }, 500);
  };

  const filtered = useMemo(() => {
    return acconti.filter((a) => {
      const s = search.toLowerCase();
      return !search ||
        a.codice.toLowerCase().includes(s) ||
        a.nomeAutista.toLowerCase().includes(s) ||
        a.ragioneSociale.toLowerCase().includes(s) ||
        (a.descrizione ?? '').toLowerCase().includes(s);
    });
  }, [acconti, search]);

  const stats = useMemo(() => {
    let totaleAcconti = 0;
    let totaleRestituzioni = 0;
    const byPad: Record<string, { nome: string; totale: number }> = {};

    for (const a of filtered) {
      if (a.tipo === 'RESTITUZIONE') {
        totaleRestituzioni += a.importo;
      } else {
        totaleAcconti += a.importo;
      }
      const key = a.padroncinoId ?? 'na';
      if (!byPad[key]) byPad[key] = { nome: a.ragioneSociale, totale: 0 };
      byPad[key].totale += a.tipo === 'RESTITUZIONE' ? -a.importo : a.importo;
    }

    return {
      totaleAcconti,
      totaleRestituzioni,
      netto: totaleAcconti - totaleRestituzioni,
      count: filtered.length,
      byPadroncino: Object.values(byPad),
    };
  }, [filtered]);

  const setF = (k: keyof NuovoAccontoForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Partial<Record<keyof NuovoAccontoForm, string>> = {};
    if (!form.codiceAutista.trim()) e.codiceAutista = 'Inserisci un codice autista';
    else if (verifica && !verifica.found) e.codiceAutista = `Codice "${form.codiceAutista}" non trovato`;
    if (!form.importo || isNaN(parseFloat(form.importo)) || parseFloat(form.importo) <= 0)
      e.importo = 'Importo non valido';
    if (!form.data) e.data = 'Data obbligatoria';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setForm({
      codiceAutista: '',
      importo: '',
      tipo: 'ACCONTO',
      data: new Date().toISOString().split('T')[0],
      descrizione: '',
      mese: getCurrentMonth(),
    });
    setEditingId(null);
    setVerifica(null);
    setErrors({});
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        codiceAutista: form.codiceAutista.trim().toUpperCase(),
        importo: parseFloat(form.importo),
        tipo: form.tipo,
        data: form.data,
        descrizione: form.descrizione || undefined,
        mese: form.mese || form.data.substring(0, 7),
      };
      if (editingId) {
        await api.put(`/acconti/${editingId}`, payload);
      } else {
        await api.post('/acconti', payload);
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      alert('Errore: ' + (e.message ?? 'Salvataggio fallito'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (a: Acconto) => {
    setEditingId(a.id);
    setForm({
      codiceAutista: a.codice,
      importo: String(a.importo),
      tipo: a.tipo,
      data: a.data,
      descrizione: a.descrizione
        ? a.descrizione.replace(/^\[RESTITUZIONE\]\s*/, '')
        : '',
      mese: a.mese ?? getCurrentMonth(),
    });
    setVerifica(null);
    setErrors({});
    setShowForm(true);
    // Lookup immediato del codice per mostrare feedback autista/padroncino
    if (a.codice && a.codice !== '—') {
      (async () => {
        try {
          const res = await api.get<CodiceVerifica>(`/acconti/verifica-codice/${a.codice}`);
          setVerifica(res);
        } catch {
          /* ignora */
        }
      })();
    }
  };

  const handleImportClick = () => {
    const suggerito = mese || getCurrentMonth();
    const meseScelto = window.prompt(
      'Mese di competenza per gli acconti importati (formato YYYY-MM):',
      suggerito,
    );
    if (!meseScelto) return;
    if (!/^\d{4}-\d{2}$/.test(meseScelto.trim())) {
      alert('Formato mese non valido. Usa YYYY-MM (es. 2026-04).');
      return;
    }
    // Salva il mese scelto nell'input per passarlo al handler del file
    importFileRef.current?.setAttribute('data-mese', meseScelto.trim());
    importFileRef.current?.click();
  };

  const handleImportFile = async (file: File) => {
    const meseScelto = importFileRef.current?.getAttribute('data-mese') || getCurrentMonth();
    setImporting(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api';
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mese', meseScelto);
      const res = await fetch(`${API_BASE}/acconti/importa`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'Errore import');
      }
      const data = await res.json() as {
        creati: number; saltati: number; totaleRighe: number;
        esiti: { riga: number; codice?: string; importo?: number; azione: 'creato' | 'saltato'; motivo?: string }[];
      };
      const saltatiDett = data.esiti
        .filter((e) => e.azione === 'saltato')
        .slice(0, 10)
        .map((e) => `• Riga ${e.riga}${e.codice ? ` (${e.codice})` : ''}: ${e.motivo ?? '—'}`)
        .join('\n');
      let msg = `✅ Import completato (mese ${meseScelto})\n\n`
        + `Creati: ${data.creati}\nSaltati: ${data.saltati}\nTotale righe: ${data.totaleRighe}`;
      if (saltatiDett) msg += `\n\nDettaglio saltati (max 10):\n${saltatiDett}`;
      alert(msg);
      await load();
    } catch (e: any) {
      alert('Errore import: ' + (e.message ?? 'Errore sconosciuto'));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleExport = () => {
    const meseLabel = mese ? formatMeseLabel(mese) : 'Tutti i mesi';
    const fileName = mese
      ? `Acconti_${mese}.xlsx`
      : `Acconti_completo.xlsx`;

    // Righe dati
    const rows = filtered.map((a) => ({
      Tipo: a.tipo === 'RESTITUZIONE' ? 'Restituzione' : 'Acconto',
      Codice: a.codice,
      Autista: a.nomeAutista,
      Padroncino: a.ragioneSociale,
      Descrizione: a.descrizione
        ? a.descrizione.replace('[RESTITUZIONE] ', '')
        : '',
      Data: fmt(a.data),
      'Mese competenza': a.mese ?? '',
      'Addebitato in': a.addebitatoIn
        ? `${a.addebitatoIn.ragioneSociale} – ${formatMeseLabel(a.addebitatoIn.mese)}`
        : '',
      'Importo (€)': a.tipo === 'RESTITUZIONE' ? -a.importo : a.importo,
    }));

    // Riga totali
    rows.push({
      Tipo: '',
      Codice: '',
      Autista: '',
      Padroncino: '',
      Descrizione: '',
      Data: '',
      'Mese competenza': '',
      'Addebitato in': `TOTALE (${filtered.length} movimenti) – Netto`,
      'Importo (€)': stats.netto,
    } as any);

    const ws = XLSX.utils.json_to_sheet(rows);

    // Larghezze colonne
    ws['!cols'] = [
      { wch: 14 }, // Tipo
      { wch: 10 }, // Codice
      { wch: 22 }, // Autista
      { wch: 28 }, // Padroncino
      { wch: 30 }, // Descrizione
      { wch: 12 }, // Data
      { wch: 16 }, // Mese competenza
      { wch: 38 }, // Addebitato in
      { wch: 14 }, // Importo
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, meseLabel.substring(0, 31));
    XLSX.writeFile(wb, fileName);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo acconto?')) return;
    try {
      await api.delete(`/acconti/${id}`);
      setAcconti((a) => a.filter((x) => x.id !== id));
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div className="acc-page">
      <div className="acc-loading"><div className="acc-spinner" /><span>Caricamento acconti...</span></div>
    </div>
  );

  if (error) return (
    <div className="acc-page">
      <div className="acc-error">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="acc-page">
      {/* Header */}
      <div className="acc-header">
        <div>
          <h1>💰 Acconti Autisti</h1>
          <span className="acc-sub">Gestione acconti e restituzioni per codice autista</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <button
            className="btn-outline"
            onClick={handleImportClick}
            disabled={importing}
            title="Importa acconti da file Excel (col A data, col B codice, col D importo, col E descrizione)"
          >
            {importing ? '⏳ Importando...' : '📂 Import Excel'}
          </button>
          <button
            className="btn-outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
            title={mese ? `Esporta report acconti di ${formatMeseLabel(mese)}` : 'Esporta tutti gli acconti'}
          >
            📊 Esporta Report
          </button>
          <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuovo Acconto</button>
        </div>
      </div>

      {/* Stats */}
      <div className="acc-stats">
        <div className="acc-stat">
          <span className="acc-stat-label">MOVIMENTI NEL PERIODO</span>
          <span className="acc-stat-value">{stats.count}</span>
        </div>
        <div className="acc-stat acc-stat-primary">
          <span className="acc-stat-label">TOTALE ACCONTI</span>
          <span className="acc-stat-value">+{eur(stats.totaleAcconti)} €</span>
        </div>
        {stats.totaleRestituzioni > 0 && (
          <div className="acc-stat acc-stat-red">
            <span className="acc-stat-label">RESTITUZIONI</span>
            <span className="acc-stat-value acc-neg">−{eur(stats.totaleRestituzioni)} €</span>
          </div>
        )}
        <div className="acc-stat acc-stat-primary">
          <span className="acc-stat-label">NETTO</span>
          <span className="acc-stat-value">{stats.netto >= 0 ? '+' : '−'}{eur(stats.netto)} €</span>
        </div>
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

      {/* Form Nuovo Acconto */}
      {showForm && (
        <div className="acc-form-panel">
          <div className="acc-form-header">
            <h3>
              {editingId
                ? (form.tipo === 'RESTITUZIONE' ? '↩️ Modifica Restituzione' : '✏️ Modifica Acconto')
                : (form.tipo === 'RESTITUZIONE' ? '↩️ Restituzione' : '💰 Nuovo Acconto')}
            </h3>
            <button className="acc-form-close" onClick={() => { setShowForm(false); resetForm(); }}>✕</button>
          </div>
          <div className="acc-form-grid">
            {/* Tipo */}
            <div className="acc-form-field acc-form-span2">
              <label className="acc-form-label">Tipo operazione</label>
              <div className="acc-tipo-toggle">
                <button
                  className={`acc-tipo-btn ${form.tipo === 'ACCONTO' ? 'acc-tipo-active' : ''}`}
                  onClick={() => setF('tipo', 'ACCONTO')}
                >
                  💰 Acconto
                </button>
                <button
                  className={`acc-tipo-btn acc-tipo-red ${form.tipo === 'RESTITUZIONE' ? 'acc-tipo-active-red' : ''}`}
                  onClick={() => setF('tipo', 'RESTITUZIONE')}
                >
                  ↩️ Restituzione
                </button>
              </div>
            </div>

            {/* Codice autista con lookup */}
            <div className="acc-form-field">
              <label className="acc-form-label">Codice Autista <span className="req">*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  className={`acc-form-input ${errors.codiceAutista ? 'input-error' : ''}`}
                  placeholder="es. AUT001"
                  value={form.codiceAutista}
                  onChange={(e) => handleCodiceChange(e.target.value)}
                  style={{ textTransform: 'uppercase' }}
                />
                {verificando && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-secondary)' }}>🔍</span>
                )}
              </div>
              {errors.codiceAutista && <span className="field-error">{errors.codiceAutista}</span>}
              {/* Feedback lookup */}
              {verifica && !verificando && (
                <div className={`acc-verifica ${verifica.found ? 'acc-verifica-ok' : 'acc-verifica-err'}`}>
                  {verifica.found ? (
                    <>
                      <span>✅ {verifica.nome} {verifica.cognome}</span>
                      <span style={{ marginLeft: 8, opacity: 0.75 }}>
                        → {verifica.padroncino?.ragioneSociale ?? 'N/A (nessun padroncino assegnato)'}
                      </span>
                    </>
                  ) : (
                    <span>❌ Codice non trovato nel sistema</span>
                  )}
                </div>
              )}
            </div>

            <div className="acc-form-field">
              <label className="acc-form-label">Importo (€) <span className="req">*</span></label>
              <input
                className={`acc-form-input ${errors.importo ? 'input-error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
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
                placeholder={form.tipo === 'RESTITUZIONE' ? 'Motivo restituzione…' : 'Acconto inizio mese…'}
                value={form.descrizione}
                onChange={(e) => setF('descrizione', e.target.value)}
              />
            </div>
          </div>
          <div className="acc-form-actions">
            <button className="btn-outline" onClick={() => { setShowForm(false); resetForm(); }}>Annulla</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving
                ? 'Salvataggio…'
                : editingId
                ? '💾 Salva Modifiche'
                : form.tipo === 'RESTITUZIONE'
                ? '↩️ Registra Restituzione'
                : '💾 Salva Acconto'}
            </button>
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
                <th>TIPO</th>
                <th>CODICE</th>
                <th>AUTISTA</th>
                <th>PADRONCINO</th>
                <th>DESCRIZIONE</th>
                <th>DATA</th>
                <th>MESE</th>
                <th>ADDEBITATO IN</th>
                <th style={{ textAlign: 'right' }}>IMPORTO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className={`acc-row ${a.tipo === 'RESTITUZIONE' ? 'acc-row-restituzione' : ''}`}>
                  <td>
                    <span className={`acc-tipo-badge ${a.tipo === 'RESTITUZIONE' ? 'acc-tipo-badge-red' : 'acc-tipo-badge-green'}`}>
                      {a.tipo === 'RESTITUZIONE' ? '↩️' : '💰'}
                    </span>
                  </td>
                  <td>
                    <span className="acc-codice">{a.codice}</span>
                  </td>
                  <td className="acc-autista">{a.nomeAutista}</td>
                  <td>
                    <span className={`acc-padroncino ${a.ragioneSociale === 'N/A' ? 'acc-na' : ''}`}>
                      {a.ragioneSociale}
                    </span>
                  </td>
                  <td className="acc-desc">
                    {a.descrizione
                      ? a.descrizione.replace('[RESTITUZIONE] ', '')
                      : '—'}
                  </td>
                  <td className="acc-data">{fmt(a.data)}</td>
                  <td>
                    {a.mese && <span className="acc-mese-badge">{a.mese}</span>}
                  </td>
                  <td>
                    {a.addebitatoIn ? (
                      <span className="acc-addebitato-badge">
                        Addebitato a <strong>{a.addebitatoIn.ragioneSociale}</strong> nei conteggi di {formatMeseLabel(a.addebitatoIn.mese)}
                      </span>
                    ) : (
                      <span className="acc-na">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={a.tipo === 'RESTITUZIONE' ? 'acc-importo-neg' : 'acc-importo'}>
                      {a.tipo === 'RESTITUZIONE' ? '−' : '+'}{eur(a.importo)} €
                    </span>
                  </td>
                  <td>
                    <div className="acc-actions">
                      <button
                        className="acc-edit-btn"
                        onClick={() => handleEdit(a)}
                        title="Modifica acconto"
                      >✏️</button>
                      <button className="acc-del-btn" onClick={() => handleDelete(a.id)} title="Elimina">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="acc-foot">
                <td colSpan={8}><strong>TOTALE ({filtered.length} movimenti) — Netto</strong></td>
                <td style={{ textAlign: 'right' }}>
                  <strong className={stats.netto >= 0 ? 'acc-importo' : 'acc-importo-neg'}>
                    {stats.netto >= 0 ? '+' : '−'}{eur(stats.netto)} €
                  </strong>
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
