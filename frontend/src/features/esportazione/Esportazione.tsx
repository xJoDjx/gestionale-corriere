// src/features/esportazione/Esportazione.tsx
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { Page, PageHeader, Alert, Icon, Select, C, type IconName } from '../../components/ds';
import './Esportazione2.css';

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

function mesePrecedente() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── component ────────────────────────────────────────────────────────

const lista = (d: any): any[] => (Array.isArray(d) ? d : d?.items ?? d?.data ?? []);
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const meseLabel = (m: string) => { const [y, mo] = m.split('-'); return `${MESI[+mo - 1]} ${y}`; };

interface ExportCard {
  id: string; title: string; description: string; icon: IconName; color: string; cols: string[];
  hasMese?: boolean; fn: (mese?: string) => Promise<void>;
}

const CARDS: ExportCard[] = [
  { id: 'padroncini', title: 'Padroncini', description: 'Anagrafica con scadenze DURC e DVR', icon: 'pad', color: C.purple,
    cols: ['Ragione sociale', 'P.IVA', 'CF', 'Email', 'Telefono', 'Stato', 'DURC', 'DVR', 'Creato il'], fn: () => esportaPadroncini() },
  { id: 'flotta', title: 'Flotta mezzi', description: 'Veicoli con assegnazione, scadenze e canone', icon: 'mezzi', color: C.green,
    cols: ['Targa', 'Marca', 'Modello', 'Anno', 'Stato', 'Tipo', 'Padroncino', 'Assegnato dal', 'Revisione', 'Assicurazione', 'Bollo', 'Tassa possesso', 'Canone', 'Note'], fn: () => esportaFlotta() },
  { id: 'conteggi', title: 'Conteggi mensili', description: 'Conteggi del mese con stato e netto da bonificare', icon: 'cont', color: C.blue,
    cols: ['Padroncino', 'Mese', 'Stato', 'Netto da bonificare', 'Note', 'Creato il', 'Confermato il'], hasMese: true, fn: (mese) => esportaConteggi(mese!) },
  { id: 'palmari', title: 'Palmari', description: 'Dispositivi con stato e padroncino assegnato', icon: 'palm', color: C.teal,
    cols: ['Codice', 'Numero seriale', 'Stato', 'Padroncino', 'Assegnato dal', 'Note'], fn: () => esportaPalmari() },
  { id: 'codici', title: 'Codici autista', description: 'Codici con assegnazione corrente', icon: 'cod', color: C.orange,
    cols: ['Codice', 'Autista', 'Padroncino', 'Assegnato dal', 'Note'], fn: () => esportaCodiciAutista() },
];

export default function Esportazione() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mesi, setMesi] = useState<Record<string, string>>({ conteggi: mesePrecedente() });
  const [conta, setConta] = useState<Record<string, { n: number; f: string }>>({});

  // Numero di righe che verranno esportate (stessi endpoint dell'esportazione)
  useEffect(() => {
    api.get('/padroncini?limit=9999').then((d) => { const l = lista(d); const att = l.filter((p) => p.attivo).length; setConta((c) => ({ ...c, padroncini: { n: l.length, f: `${att} attivi, ${l.length - att} dismessi` } })); }).catch(() => {});
    api.get('/mezzi?limit=9999').then((d) => setConta((c) => ({ ...c, flotta: { n: lista(d).length, f: 'Esclusi i mezzi eliminati' } }))).catch(() => {});
    api.get('/palmari?limit=9999').then((d) => setConta((c) => ({ ...c, palmari: { n: lista(d).length, f: '' } }))).catch(() => {});
    api.get('/codici-autista?limit=9999').then((d) => setConta((c) => ({ ...c, codici: { n: lista(d).length, f: '' } }))).catch(() => {});
  }, []);
  useEffect(() => {
    const m = mesi.conteggi;
    if (!m) return;
    api.get(`/conteggi?mese=${m}&limit=9999`).then((d) => setConta((c) => ({ ...c, conteggi: { n: lista(d).length, f: '' } }))).catch(() => {});
  }, [mesi.conteggi]);

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

  const mesiOpts = Array.from({ length: 24 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })
    .map((m) => ({ value: m, label: meseLabel(m) }));

  return (
    <Page>
      <PageHeader eyebrow="Sistema" title="Esportazioni" sub="Scarica i dati in Excel, un foglio per archivio, con le stesse colonne di oggi" />

      {error && <Alert tone="ko" title="Errore">{error}</Alert>}
      {success && <Alert tone="ok" title="Fatto">{success}</Alert>}

      <section aria-label="Esportazioni disponibili" className="ds-g3">
        {CARDS.map((card) => (
          <article key={card.id} className="ds-card esp2-card">
            <div className="esp2-top">
              <span className="esp2-ic" style={{ background: card.color }}><Icon name={card.icon} size={17} /></span>
              <div className="esp2-tt"><h2>{card.title}</h2><span>{card.description}</span></div>
              <span className="esp2-n">{conta[card.id]?.n ?? '…'}</span>
            </div>
            <div className="esp2-cols">{card.cols.map((c) => <span key={c}>{c}</span>)}</div>
            <div className="esp2-foot">
              {card.hasMese
                ? <Select size="sm" label="Mese" value={mesi[card.id] ?? meseCorrente()} onChange={(v) => setMesi((prev) => ({ ...prev, [card.id]: v }))} options={mesiOpts} />
                : <span className="esp2-f">{conta[card.id]?.f ?? ''}</span>}
              <button type="button" className="esp2-btn" disabled={loading === card.id} onClick={() => handleExport(card)}>
                <Icon name="download" size={13} />{loading === card.id ? 'Esportazione…' : 'Esporta .xlsx'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </Page>
  );
}
