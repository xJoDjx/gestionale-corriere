// src/features/acconti/Acconti.tsx
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import './Acconti.css';
import '../padroncini/Padroncini2.css';
import './Acconti2.css';
import { Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SegTabs, SearchBox, Select, Th, Dot, Empty, Alert, C, useSort, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';

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

  // ── Solo visualizzazione: viste, ordinamento, confronto e andamento ──
  const [vista, setVista] = useState<'TUTTI' | 'ACCONTI' | 'RESTITUZIONI' | 'DESC'>('TUTTI');
  const righeVista = useMemo(() => filtered.filter((a) =>
    vista === 'TUTTI' || (vista === 'ACCONTI' && a.tipo === 'ACCONTO') || (vista === 'RESTITUZIONI' && a.tipo === 'RESTITUZIONE') || (vista === 'DESC' && !!a.descrizione)
  ), [filtered, vista]);
  type SK = 'data' | 'codice' | 'padroncino' | 'descrizione' | 'tipo' | 'importo' | 'mese';
  const { sorted, sort, toggle } = useSort<Acconto, SK>(righeVista, (a, k) => {
    switch (k) {
      case 'data': return a.data;
      case 'codice': return a.codice;
      case 'padroncino': return a.ragioneSociale;
      case 'descrizione': return a.descrizione ?? '';
      case 'tipo': return a.tipo;
      case 'importo': return a.tipo === 'RESTITUZIONE' ? -a.importo : a.importo;
      case 'mese': return a.mese ?? '';
    }
  }, { key: 'data', dir: 'desc' });
  const [tuttiMesi, setTuttiMesi] = useState<Acconto[]>([]);
  useEffect(() => {
    api.get<any[]>('/acconti').then((r) => setTuttiMesi(r.map(normalizeAcconto))).catch(() => setTuttiMesi([]));
  }, [acconti]);
  const totMese = (m: string) => tuttiMesi.filter((a) => (a.mese ?? a.data.slice(0, 7)) === m).reduce((s, a) => s + (a.tipo === 'RESTITUZIONE' ? -a.importo : a.importo), 0);
  const mesePrec = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const prev = mese ? totMese(mesePrec(mese)) : 0;
  const delta = mese && prev ? ((stats.totaleAcconti - prev) / Math.abs(prev)) * 100 : null;
  const anno = (mese || getCurrentMonth()).slice(0, 4);
  const andamento = Array.from({ length: 12 }, (_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`)
    .map((m) => ({ m, v: totMese(m) }))
    .filter((x, i, arr) => arr.slice(0, i + 1).some((y) => y.v !== 0) && arr.slice(i).some((y) => y.v !== 0));
  const maxAnd = Math.max(1, ...andamento.map((x) => x.v));
  const mesiOpzioni = Array.from({ length: 18 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const nCodici = new Set(filtered.map((a) => a.codice)).size;
  const PADCOL = [C.green, C.blue, C.orange, C.purple, C.teal, C.red, '#18181B'];
  const perPad = [...stats.byPadroncino].sort((x, y) => y.totale - x.totale);
  const totPad = perPad.reduce((s, p) => s + Math.abs(p.totale), 0) || 1;
  const nomeMese = mese ? formatMeseLabel(mese) : 'Tutti i mesi';
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  if (loading) return <Page><Card pad><Empty>Caricamento acconti…</Empty></Card></Page>;
  if (error) return <Page><Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></Page>;

  return (
    <Page>
      <PageHeader
        eyebrow="Operativo"
        title="Acconti autisti"
        sub="Acconti e restituzioni per codice autista, addebitati nel conteggio del mese"
        actions={<>
          <Select label="Mese" value={mese} onChange={setMese}
            options={[...mesiOpzioni.map((m) => ({ value: m, label: formatMeseLabel(m) })), { value: '', label: 'Tutti i mesi' }]} />
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
          <Button icon="upload" onClick={handleImportClick} disabled={importing}
            title="Importa acconti da file Excel (col A data, col B codice, col D importo, col E descrizione)">
            {importing ? 'Importazione…' : 'Importa Excel'}
          </Button>
          <Button icon="download" onClick={handleExport} disabled={filtered.length === 0}
            title={mese ? `Esporta report acconti di ${formatMeseLabel(mese)}` : 'Esporta tutti gli acconti'}>Esporta Excel</Button>
          <Button icon="plus" variant="primary" onClick={() => { resetForm(); setShowForm(true); }}>Nuovo acconto</Button>
        </>}
      />

      <Kpis items={[
        { label: 'Totale acconti', value: fmtEur2(stats.totaleAcconti), color: C.orange, icon: 'acconti',
          sub: delta == null ? (mese ? 'Nessun confronto col mese prima' : 'Tutti i mesi') : `${delta >= 0 ? '+' : '−'}${fmtNum2(Math.abs(delta), 0)}% su ${formatMeseLabel(mesePrec(mese)).split(' ')[0].toLowerCase()} (${fmtEur2(prev)})`,
          subColor: delta != null && delta > 0 ? '#B91C1C' : undefined },
        { label: 'Restituzioni', value: fmtEur2(stats.totaleRestituzioni), sub: stats.totaleRestituzioni ? 'Restituite agli autisti' : 'Nessuna nel periodo', color: C.green, icon: 'swap' },
        { label: 'Netto', value: fmtEur2(stats.netto), sub: 'Da addebitare nei conteggi', color: C.blue, icon: 'euro' },
        { label: 'Movimenti nel periodo', value: stats.count, sub: `Su ${nCodici} codic${nCodici === 1 ? 'e' : 'i'} autista`, color: C.purple, icon: 'menu' },
      ]} />

      {showForm && (
        <Card pad className="acc2-form">
          <CardHead
            title={editingId ? (form.tipo === 'RESTITUZIONE' ? 'Modifica restituzione' : 'Modifica acconto') : (form.tipo === 'RESTITUZIONE' ? 'Nuova restituzione' : 'Nuovo acconto')}
            actions={<IconButton icon="close" label="Chiudi" onClick={() => { setShowForm(false); resetForm(); }} />}
          />
          <div className="acc2-grid">
            <div className="ds-field acc2-span2">
              <span>Tipo operazione</span>
              <SegTabs<'ACCONTO' | 'RESTITUZIONE'> value={form.tipo} onChange={(v) => setF('tipo', v)} label="Tipo operazione"
                items={[{ value: 'ACCONTO', label: 'Acconto' }, { value: 'RESTITUZIONE', label: 'Restituzione' }]} />
            </div>
            <label className="ds-field">
              <span>Codice autista *</span>
              <input className={`ds-input${errors.codiceAutista ? ' is-err' : ''}`} placeholder="es. 5001" value={form.codiceAutista}
                onChange={(e) => handleCodiceChange(e.target.value)} style={{ textTransform: 'uppercase' }} />
              {errors.codiceAutista && <em className="acc2-err">{errors.codiceAutista}</em>}
              {verificando && <em className="acc2-hint">Verifica in corso…</em>}
              {verifica && !verificando && (
                verifica.found
                  ? <em className="acc2-ok">{[verifica.nome, verifica.cognome].filter(Boolean).join(' ') || 'Codice trovato'} · {verifica.padroncino?.ragioneSociale ?? 'nessun padroncino assegnato'}</em>
                  : <em className="acc2-err">Codice non trovato nel sistema</em>
              )}
            </label>
            <label className="ds-field">
              <span>Importo (€) *</span>
              <input className={`ds-input${errors.importo ? ' is-err' : ''}`} type="number" step="0.01" min="0.01" placeholder="200,00"
                value={form.importo} onChange={(e) => setF('importo', e.target.value)} />
              {errors.importo && <em className="acc2-err">{errors.importo}</em>}
            </label>
            <label className="ds-field">
              <span>Data *</span>
              <input className={`ds-input${errors.data ? ' is-err' : ''}`} type="date" value={form.data} onChange={(e) => setF('data', e.target.value)} />
              {errors.data && <em className="acc2-err">{errors.data}</em>}
            </label>
            <label className="ds-field">
              <span>Mese di competenza</span>
              <input className="ds-input" type="month" value={form.mese} onChange={(e) => setF('mese', e.target.value)} />
            </label>
            <label className="ds-field acc2-span2">
              <span>Descrizione</span>
              <input className="ds-input" placeholder={form.tipo === 'RESTITUZIONE' ? 'Motivo restituzione…' : 'Acconto inizio mese…'}
                value={form.descrizione} onChange={(e) => setF('descrizione', e.target.value)} />
            </label>
          </div>
          <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => { setShowForm(false); resetForm(); }}>Annulla</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvataggio…' : editingId ? 'Salva modifiche' : form.tipo === 'RESTITUZIONE' ? 'Registra restituzione' : 'Salva acconto'}
            </Button>
          </div>
        </Card>
      )}

      <div className="ds-g4">
        <Card className="ds-s3">
          <div className="pl2-toolbar">
            <SegTabs<typeof vista> value={vista} onChange={setVista} label="Vista"
              items={[
                { value: 'TUTTI', label: 'Tutti', count: filtered.length },
                { value: 'ACCONTI', label: 'Acconti', count: filtered.filter((a) => a.tipo === 'ACCONTO').length },
                { value: 'RESTITUZIONI', label: 'Restituzioni', count: filtered.filter((a) => a.tipo === 'RESTITUZIONE').length },
                { value: 'DESC', label: 'Con descrizione', count: filtered.filter((a) => !!a.descrizione).length },
              ]} />
            <SearchBox value={search} onChange={setSearch} placeholder="Cerca autista, codice, padroncino…" width={280} />
          </div>
          {sorted.length === 0 ? <Empty>Nessun acconto trovato per il periodo selezionato</Empty> : (
            <div className="ds-tablewrap">
              <table className="ds-table acc2-table" style={{ minWidth: 900 }}>
                <thead><tr>
                  <Th k="data" sort={sort} onSort={toggle}>Data</Th>
                  <Th k="codice" sort={sort} onSort={toggle}>Codice</Th>
                  <Th k="padroncino" sort={sort} onSort={toggle}>Padroncino</Th>
                  <Th k="descrizione" sort={sort} onSort={toggle}>Descrizione</Th>
                  <Th k="tipo" sort={sort} onSort={toggle}>Tipo</Th>
                  <Th k="importo" sort={sort} onSort={toggle} right>Importo</Th>
                  <Th k="mese" sort={sort} onSort={toggle}>Mese · addebitato in</Th>
                  <Th />
                </tr></thead>
                <tbody>
                  {sorted.map((a) => {
                    const desc = a.descrizione ? a.descrizione.replace('[RESTITUZIONE] ', '') : '';
                    const rest = a.tipo === 'RESTITUZIONE';
                    return (
                      <tr key={a.id}>
                        <td style={{ color: '#3F3F46' }}>{fmt(a.data)}</td>
                        <td>
                          <span className="ds-mono" style={{ fontWeight: 600 }}>{a.codice}</span>
                          {a.nomeAutista && a.nomeAutista !== 'N/D' && <span className="acc2-sub">{a.nomeAutista}</span>}
                        </td>
                        <td className="acc2-ell" style={{ color: a.ragioneSociale === 'N/A' ? '#6B6B73' : undefined }}>{a.ragioneSociale}</td>
                        <td className="acc2-ell" style={{ color: desc ? undefined : '#71717A' }} title={desc}>{desc || 'Senza descrizione'}</td>
                        <td><Dot tone={rest ? 'ok' : 'warn'}>{rest ? 'Restituzione' : 'Acconto'}</Dot></td>
                        <td className="r" style={{ fontWeight: 600, color: rest ? '#15803D' : undefined }}>{rest ? '−' : ''}{fmtEur2(a.importo)}</td>
                        <td className="acc2-ell" title={a.addebitatoIn ? `Addebitato a ${a.addebitatoIn.ragioneSociale} nei conteggi di ${formatMeseLabel(a.addebitatoIn.mese)}` : ''}>
                          {a.mese ? formatMeseLabel(a.mese).slice(0, 3) : '—'}
                          <span style={{ color: a.addebitatoIn ? undefined : '#6B6B73' }}> · {a.addebitatoIn ? `conteggio ${formatMeseLabel(a.addebitatoIn.mese).slice(0, 3).toLowerCase()}${a.addebitatoIn.ragioneSociale !== a.ragioneSociale ? ` (${a.addebitatoIn.ragioneSociale})` : ''}` : 'non addebitato'}</span>
                        </td>
                        <td className="r" style={{ whiteSpace: 'nowrap' }}>
                          <IconButton icon="edit" label="Modifica acconto" onClick={() => handleEdit(a)} />
                          <IconButton icon="trash" label="Elimina acconto" danger onClick={() => handleDelete(a.id)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="is-total">
                    <td colSpan={5}>Totale · {righeVista.length} moviment{righeVista.length === 1 ? 'o' : 'i'} · netto</td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmtEur2(righeVista.reduce((s, a) => s + (a.tipo === 'RESTITUZIONE' ? -a.importo : a.importo), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="pl2-foot">Mostrati {sorted.length} di {filtered.length} movimenti{mese ? ` di ${nomeMese.toLowerCase()}` : ''} · il mese è quello di competenza, non la data del movimento</div>
        </Card>

        <div className="acc2-side">
          <Card pad>
            <CardHead title="Per padroncino" sub={`${nomeMese}, da addebitare nei conteggi`} />
            {perPad.length === 0 ? <Empty>Nessun movimento</Empty> : <>
              <div aria-hidden="true" className="acc2-seg">
                {perPad.map((p, i) => <span key={p.nome} style={{ width: `${(Math.abs(p.totale) / totPad) * 100}%`, background: PADCOL[i % PADCOL.length] }} />)}
              </div>
              {perPad.map((p, i) => (
                <div key={p.nome} className="acc2-padrow">
                  <span aria-hidden="true" style={{ background: PADCOL[i % PADCOL.length] }} />
                  <span className="acc2-ell" style={{ flex: '1 1 auto', maxWidth: 'none' }}>{p.nome}</span>
                  <span style={{ fontWeight: 600 }}>{fmtEur2(p.totale)}</span>
                </div>
              ))}
            </>}
          </Card>
          <Card pad style={{ flex: '1 1 auto' }}>
            <CardHead title="Andamento" sub={`Netto acconti per mese, ${anno}`} />
            {andamento.length === 0 ? <Empty>Nessun dato</Empty> : (
              <div role="img" aria-label={`Acconti per mese nel ${anno}`} className="acc2-chart">
                {andamento.map((x) => (
                  <div key={x.m} className="acc2-chart-col" title={`${formatMeseLabel(x.m)}: ${fmtEur2(x.v)}`}>
                    <div style={{ height: `${Math.max(4, (x.v / maxAnd) * 100)}%`, background: x.m === mese ? C.orange : '#F6C7A8' }} />
                    <span>{MESI_BREVI[parseInt(x.m.slice(5), 10) - 1]}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
