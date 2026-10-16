// src/features/esportazione/Esportazione.tsx
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import './Esportazione.css';

// ─── helpers ────────────────────────────────────────────────────────
function fmt(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('it-IT');
}

function downloadXlsx(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
}

// ─── export functions ────────────────────────────────────────────────

async function esportaPadroncini() {
  const data: any[] = await api.get('/padroncini?limit=9999');
  const rows = (Array.isArray(data) ? data : (data as any).items ?? []).map((p: any) => ({
    'Ragione Sociale': p.ragioneSociale,
    'P.IVA': p.partitaIva ?? '',
    'CF': p.codiceFiscale ?? '',
    'Email': p.email ?? '',
    'Telefono': p.telefono ?? '',
    'Stato': p.attivo ? 'Attivo' : 'Disattivo',
    'DURC scadenza': fmt(p.durcScadenza),
    'DVR scadenza': fmt(p.dvrScadenza),
    'Creato il': fmt(p.createdAt),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Padroncini');
  downloadXlsx(wb, `padroncini_${today()}.xlsx`);
}

async function esportaFlotta() {
  const data: any = await api.get('/mezzi?limit=9999');
  const items = Array.isArray(data) ? data : data.items ?? [];
  const rows = items.map((m: any) => ({
    'Targa': m.targa,
    'Modello': m.modello ?? '',
    'Marca': m.marca ?? '',
    'Anno': m.anno ?? '',
    'Stato': m.stato,
    'Tipo': m.tipo ?? '',
    'Padroncino': m.assegnazioneAttiva?.padroncino?.ragioneSociale ?? '',
    'Data assegnazione': fmt(m.assegnazioneAttiva?.dataInizio),
    'Revisione scadenza': fmt(m.revisioneScadenza),
    'Assicurazione scadenza': fmt(m.assicurazioneScadenza),
    'Bollo scadenza': fmt(m.bolloScadenza),
    'Tassa di possesso scadenza': fmt(m.tassaPossessoScadenza),
    'Canone mensile': m.canone ?? '',
    'Note': m.note ?? '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Flotta');
  downloadXlsx(wb, `flotta_${today()}.xlsx`);
}

async function esportaConteggi(mese: string) {
  if (!mese) throw new Error('Seleziona un mese');
  const data: any[] = await api.get(`/conteggi?mese=${mese}&limit=9999`);
  const items = Array.isArray(data) ? data : (data as any).items ?? [];
  const rows = items.map((c: any) => ({
    'Padroncino': c.padroncino?.ragioneSociale ?? '',
    'Mese': c.mese,
    'Stato': c.stato,
    'Netto da bonificare (€)': c.nettoSalvato != null ? Number(c.nettoSalvato).toFixed(2) : '',
    'Note': c.note ?? '',
    'Creato il': fmt(c.createdAt),
    'Confermato il': fmt(c.updatedAt),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Conteggi ${mese}`);
  downloadXlsx(wb, `conteggi_${mese}.xlsx`);
}

async function esportaPalmari() {
  const data: any = await api.get('/palmari?limit=9999');
  const items = Array.isArray(data) ? data : data.items ?? [];
  const rows = items.map((p: any) => ({
    'Codice': p.codice,
    'Numero seriale': p.numeroSeriale ?? '',
    'Stato': p.stato,
    'Padroncino assegnato': p.assegnazioneAttiva?.padroncino?.ragioneSociale ?? '',
    'Data assegnazione': fmt(p.assegnazioneAttiva?.dataInizio),
    'Note': p.note ?? '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Palmari');
  downloadXlsx(wb, `palmari_${today()}.xlsx`);
}

async function esportaCodiciAutista() {
  const data: any = await api.get('/codici-autista?limit=9999');
  const items = Array.isArray(data) ? data : data.items ?? [];
  const rows = items.map((c: any) => ({
    'Codice': c.codice,
    'Nome autista': c.nomeAutista ?? '',
    'Padroncino assegnato': c.assegnazioneAttiva?.padroncino?.ragioneSociale ?? '',
    'Data assegnazione': fmt(c.assegnazioneAttiva?.dataInizio),
    'Note': c.note ?? '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Codici Autista');
  downloadXlsx(wb, `codici_autista_${today()}.xlsx`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function meseCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── component ────────────────────────────────────────────────────────

interface ExportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  hasMese?: boolean;
  fn: (mese?: string) => Promise<void>;
}

const CARDS: ExportCard[] = [
  {
    id: 'padroncini',
    title: 'Padroncini',
    description: 'Anagrafica completa padroncini con scadenze DURC/DVR.',
    icon: '👤',
    fn: () => esportaPadroncini(),
  },
  {
    id: 'flotta',
    title: 'Flotta Mezzi',
    description: 'Elenco veicoli con assegnazione, scadenze e canone.',
    icon: '🚛',
    fn: () => esportaFlotta(),
  },
  {
    id: 'conteggi',
    title: 'Conteggi Mensili',
    description: 'Conteggi di un mese con stato e netto da bonificare.',
    icon: '📋',
    hasMese: true,
    fn: (mese) => esportaConteggi(mese!),
  },
  {
    id: 'palmari',
    title: 'Palmari',
    description: 'Dispositivi palmari con stato e padroncino assegnato.',
    icon: '📱',
    fn: () => esportaPalmari(),
  },
  {
    id: 'codici',
    title: 'Codici Autista',
    description: 'Codici autista con assegnazione corrente.',
    icon: '🏷️',
    fn: () => esportaCodiciAutista(),
  },
];

export default function Esportazione() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mesi, setMesi] = useState<Record<string, string>>({ conteggi: meseCorrente() });

  async function handleExport(card: ExportCard) {
    setError(null);
    setSuccess(null);
    setLoading(card.id);
    try {
      await card.fn(card.hasMese ? mesi[card.id] : undefined);
      setSuccess(`${card.title} esportato con successo.`);
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'esportazione.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="esp-page">
      <div className="esp-header">
        <h1 className="esp-title">Esportazione Dati</h1>
        <p className="esp-subtitle">
          Scarica i dati del gestionale in formato Excel (.xlsx).
        </p>
      </div>

      {error && <div className="esp-alert esp-alert-error">⚠️ {error}</div>}
      {success && <div className="esp-alert esp-alert-success">✅ {success}</div>}

      <div className="esp-grid">
        {CARDS.map((card) => (
          <div key={card.id} className="esp-card">
            <div className="esp-card-icon">{card.icon}</div>
            <div className="esp-card-body">
              <h3 className="esp-card-title">{card.title}</h3>
              <p className="esp-card-desc">{card.description}</p>

              {card.hasMese && (
                <div className="esp-mese-row">
                  <label className="esp-mese-label">Mese:</label>
                  <input
                    type="month"
                    className="esp-mese-input"
                    value={mesi[card.id] ?? meseCorrente()}
                    onChange={e => setMesi(prev => ({ ...prev, [card.id]: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <button
              className="btn-primary esp-btn"
              disabled={loading === card.id}
              onClick={() => handleExport(card)}
            >
              {loading === card.id ? 'Esportazione...' : '⬇ Scarica Excel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
