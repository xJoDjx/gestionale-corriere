// Registro verbali, franchigie e rifatturazioni per mezzo.
// Le voci nascono da sole dagli addebiti dei conteggi che contengono una targa;
// l'importo resta quello del conteggio (bloccato), il resto si può correggere a mano.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import {
  Page, PageHeader, Card, CardHead, Kpis, Button, IconButton, SearchBox, Select, Th, Dot, Empty, Icon, useSort, C, fmtEur,
  type Tone,
} from '../../components/ds';
import { registroMezziApi, padronciniApi } from '../../lib/api';
import type { VoceRegistro, VoceRegistroInput, TipoRegistro, StatoRegistro } from '../../lib/api';
import './RegistroMezzi.css';

const TIPI: { value: TipoRegistro; label: string; color: string }[] = [
  { value: 'VERBALE', label: 'Verbale', color: C.red },
  { value: 'FRANCHIGIA', label: 'Franchigia', color: C.orange },
  { value: 'RIFATTURAZIONE', label: 'Rifatturazione', color: C.blue },
  { value: 'ALTRO', label: 'Altro', color: '#71717A' },
];
const STATI: { value: StatoRegistro; label: string; tone: Tone }[] = [
  { value: 'APERTO', label: 'Aperto', tone: 'warn' },
  { value: 'PAGATO', label: 'Pagato', tone: 'ok' },
  { value: 'CONTESTATO', label: 'Contestato', tone: 'info' },
  { value: 'ANNULLATO', label: 'Annullato', tone: 'na' },
];
const tipoInfo = (t: string) => TIPI.find((x) => x.value === t) ?? TIPI[3];
const statoInfo = (s: string) => STATI.find((x) => x.value === s) ?? STATI[0];

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const fmtMese = (m?: string | null) => {
  if (!m) return '—';
  const [y, mm] = m.split('-');
  return `${MESI[Number(mm) - 1] ?? mm} ${y}`;
};
const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT', { timeZone: 'UTC' }) : '');
const isoData = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function TipoBadge({ tipo }: { tipo: string }) {
  const t = tipoInfo(tipo);
  return <span className="rg-tipo"><i style={{ background: t.color }} />{t.label}</span>;
}

// ─── Tabella riutilizzabile (scheda mezzo e pagina d'insieme) ────────────────
export function RegistroVoci({ mezzoId, targa, conTarga = true, onCaricate }: {
  mezzoId?: string; targa?: string; conTarga?: boolean; onCaricate?: (voci: VoceRegistro[]) => void;
}) {
  const navigate = useNavigate();
  const [voci, setVoci] = useState<VoceRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState('');
  const [cerca, setCerca] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fStato, setFStato] = useState('');
  const [modifica, setModifica] = useState<VoceRegistro | 'nuova' | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore('');
    try {
      const v = await registroMezziApi.list({ mezzoId, targa });
      setVoci(v);
      onCaricate?.(v);
    } catch (e: any) {
      setErrore(e?.message ?? 'Impossibile caricare il registro');
    } finally {
      setLoading(false);
    }
  }, [mezzoId, targa, onCaricate]);
  useEffect(() => { carica(); }, [carica]);

  const q = cerca.trim().toLowerCase();
  const filtrate = useMemo(() => voci.filter((v) =>
    (!fTipo || v.tipo === fTipo) && (!fStato || v.stato === fStato) &&
    (!q || [v.targa, v.numero, v.descrizione, v.padroncino?.ragioneSociale, fmtMese(v.mese), fmtData(v.dataEvento), v.note, tipoInfo(v.tipo).label]
      .filter(Boolean).join(' ').toLowerCase().includes(q)),
  ), [voci, fTipo, fStato, q]);

  type K = 'data' | 'tipo' | 'numero' | 'targa' | 'pad' | 'mese' | 'imp' | 'stato';
  const { sorted, sort, toggle } = useSort<VoceRegistro, K>(filtrate, (v, k) => {
    switch (k) {
      case 'data': return v.dataEvento ?? '';
      case 'tipo': return tipoInfo(v.tipo).label;
      case 'numero': return v.numero ?? '';
      case 'targa': return v.targa;
      case 'pad': return v.padroncino?.ragioneSociale ?? '';
      case 'mese': return v.mese ?? '';
      case 'imp': return Number(v.importo);
      case 'stato': return statoInfo(v.stato).label;
    }
  }, { key: 'mese', dir: 'desc' });

  const totale = filtrate.reduce((s, v) => s + Number(v.importo || 0), 0);

  const elimina = async (v: VoceRegistro) => {
    const msg = v.manuale
      ? `Eliminare la voce "${v.descrizione}"?`
      : `Togliere "${v.descrizione}" dal registro?\n\nIl conteggio non cambia: la riga resta nel conteggio e non verrà più ripresa nel registro.`;
    if (!window.confirm(msg)) return;
    await registroMezziApi.remove(v.id);
    carica();
  };

  return (
    <div className="rg-wrap">
      <div className="rg-tools">
        <SearchBox value={cerca} onChange={setCerca} placeholder="Cerca targa, numero, padroncino…" width={300} />
        <Select size="sm" label="Tipo" value={fTipo} onChange={setFTipo} options={[{ value: '', label: 'Tutti' }, ...TIPI.map((t) => ({ value: t.value, label: t.label }))]} />
        <Select size="sm" label="Stato" value={fStato} onChange={setFStato} options={[{ value: '', label: 'Tutti' }, ...STATI.map((t) => ({ value: t.value, label: t.label }))]} />
        <span className="ds-cardsub">{filtrate.length} {filtrate.length === 1 ? 'voce' : 'voci'} · {fmtEur(totale)}</span>
        <span style={{ flex: 1 }} />
        <Button icon="plus" onClick={() => setModifica('nuova')}>Aggiungi voce</Button>
      </div>

      {loading ? <Empty>Caricamento…</Empty>
        : errore ? <Empty>{errore}</Empty>
        : voci.length === 0 ? <Empty>Nessun verbale o addebito registrato. Le voci compaiono da sole quando nei conteggi inserisci un addebito con la targa.</Empty>
        : (
          <div className="ds-tablewrap">
            <table className="ds-table rg-table" style={{ minWidth: conTarga ? 1060 : 960 }}>
              <thead><tr>
                <Th k="data" sort={sort} onSort={toggle} style={{ width: 100 }}>Data</Th>
                <Th k="tipo" sort={sort} onSort={toggle} style={{ width: 125 }}>Tipo</Th>
                <Th k="numero" sort={sort} onSort={toggle}>Numero e descrizione</Th>
                {conTarga && <Th k="targa" sort={sort} onSort={toggle} style={{ width: 105 }}>Targa</Th>}
                <Th k="pad" sort={sort} onSort={toggle} style={{ width: 175 }}>Addebitato a</Th>
                <Th k="mese" sort={sort} onSort={toggle} style={{ width: 100 }}>Conteggio</Th>
                <Th k="imp" sort={sort} onSort={toggle} right style={{ width: 105 }}>Importo</Th>
                <Th k="stato" sort={sort} onSort={toggle} style={{ width: 110 }}>Stato</Th>
                <Th style={{ width: 76 }} />
              </tr></thead>
              <tbody>
                {sorted.length === 0 && <tr><td colSpan={conTarga ? 9 : 8} className="ds-cardsub" style={{ textAlign: 'center', padding: 18 }}>Nessuna voce corrisponde ai filtri</td></tr>}
                {sorted.map((v) => (
                  <tr key={v.id} className="is-clickable" onClick={() => setModifica(v)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtData(v.dataEvento) || <span className="rg-muted">—</span>}</td>
                    <td><TipoBadge tipo={v.tipo} /></td>
                    <td className="rg-ell" title={v.descrizione}>
                      <div className="rg-num">
                        <span className="rg-mono">{v.numero || <span className="rg-muted">senza numero</span>}</span>
                        {v.rigaEliminata && <span className="rg-flag is-warn" title="La riga è stata tolta dal conteggio: la voce resta qui perché l'avevi completata">riga tolta dal conteggio</span>}
                        {v.manuale && <span className="rg-flag">inserita a mano</span>}
                        {v.note && <span className="rg-note" title={v.note}><Icon name="note" size={12} /></span>}
                      </div>
                      <div className="rg-desc">{v.descrizione}</div>
                    </td>
                    {conTarga && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {v.mezzoId
                          ? <Link to={`/flotta/${v.mezzoId}`} className="rg-targa">{v.targa}</Link>
                          : <span className="rg-targa is-fuori" title="Targa non presente in Flotta mezzi">{v.targa}</span>}
                      </td>
                    )}
                    <td className="rg-ell" title={v.padroncino?.ragioneSociale ?? ''}>{v.padroncino?.ragioneSociale ?? <span className="rg-muted">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      {v.mese && v.padroncinoId && !v.manuale
                        ? <button type="button" className="rg-link" onClick={() => navigate(`/conteggi/${v.padroncinoId}?mese=${v.mese}`)} title="Apri il conteggio">{fmtMese(v.mese)}</button>
                        : fmtMese(v.mese)}
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmtEur(Number(v.importo))}</td>
                    <td><Dot tone={statoInfo(v.stato).tone}>{statoInfo(v.stato).label}</Dot></td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <span className="rg-acts">
                        <IconButton icon="edit" label="Modifica" onClick={() => setModifica(v)} />
                        <IconButton icon="trash" label="Togli dal registro" danger onClick={() => elimina(v)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modifica && (
        <ModaleVoce
          voce={modifica === 'nuova' ? null : modifica}
          targaPredefinita={targa}
          onClose={() => setModifica(null)}
          onSaved={() => { setModifica(null); carica(); }}
        />
      )}
    </div>
  );
}

// ─── Modale modifica / nuova voce ────────────────────────────────────────────
function ModaleVoce({ voce, targaPredefinita, onClose, onSaved }: {
  voce: VoceRegistro | null; targaPredefinita?: string; onClose: () => void; onSaved: () => void;
}) {
  const nuova = !voce;
  const daConteggio = !!voce && !voce.manuale;
  const [f, setF] = useState(() => ({
    targa: voce?.targa ?? targaPredefinita ?? '',
    tipo: (voce?.tipo ?? 'VERBALE') as TipoRegistro,
    numero: voce?.numero ?? '',
    dataEvento: isoData(voce?.dataEvento),
    stato: (voce?.stato ?? 'APERTO') as StatoRegistro,
    note: voce?.note ?? '',
    descrizione: voce?.descrizione ?? '',
    importo: voce ? String(Number(voce.importo)).replace('.', ',') : '',
    mese: voce?.mese ?? new Date().toISOString().slice(0, 7),
    padroncinoId: voce?.padroncinoId ?? '',
  }));
  const [padroncini, setPadroncini] = useState<{ id: string; ragioneSociale: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (daConteggio) return;
    padronciniApi.list({ limit: '500' }).then((r) => setPadroncini((r.data ?? []).map((p) => ({ id: p.id, ragioneSociale: p.ragioneSociale }))
      .sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)))).catch(() => setPadroncini([]));
  }, [daConteggio]);

  const salva = async (extra?: VoceRegistroInput) => {
    setErrore('');
    if (!f.targa.trim()) { setErrore('La targa è obbligatoria'); return; }
    const body: VoceRegistroInput = {
      targa: f.targa.trim(), tipo: f.tipo, numero: f.numero.trim() || null, dataEvento: f.dataEvento || null,
      stato: f.stato, note: f.note.trim() || null, ...extra,
    };
    if (!daConteggio) {
      const imp = Number(f.importo.replace(/\./g, '').replace(',', '.'));
      if (!f.descrizione.trim()) { setErrore('Scrivi una descrizione'); return; }
      if (!Number.isFinite(imp)) { setErrore("Scrivi l'importo, per esempio 38,90"); return; }
      Object.assign(body, { descrizione: f.descrizione.trim(), importo: imp, mese: f.mese || null, padroncinoId: f.padroncinoId || null });
    }
    setSaving(true);
    try {
      if (nuova) await registroMezziApi.create(body);
      else await registroMezziApi.update(voce!.id, body);
      onSaved();
    } catch (e: any) {
      setErrore(e?.message ?? 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={620}
      title={nuova ? 'Nuova voce del registro' : `${tipoInfo(voce!.tipo).label} · ${voce!.targa}`}
      subtitle={daConteggio ? `Dal conteggio di ${fmtMese(voce!.mese)} · ${voce!.padroncino?.ragioneSociale ?? ''}` : 'Voce inserita a mano'}>
      <div className="rg-form">
        {daConteggio && (
          <div className="rg-locked">
            <Icon name="lock" size={14} />
            <div>
              <div className="rg-locked-desc">{voce!.descrizione}</div>
              <div className="rg-locked-sub">
                Importo <strong>{fmtEur(Number(voce!.importo))}</strong>{voce!.percIva != null ? ` (IVA ${Number(voce!.percIva)}%)` : ''} · addebitato a {voce!.padroncino?.ragioneSociale ?? '—'}.
                {' '}Importo e descrizione arrivano dal conteggio: si cambiano solo lì.
              </div>
            </div>
          </div>
        )}
        {daConteggio && voce!.rigaEliminata && (
          <div className="rg-avviso">Questa riga è stata tolta dal conteggio. La voce resta nel registro perché l'avevi completata.</div>
        )}

        <div className="rg-grid">
          <label className="ds-field"><span>Targa</span>
            <input className="ds-input rg-mono" value={f.targa} onChange={(e) => setF((p) => ({ ...p, targa: e.target.value.toUpperCase() }))} placeholder="GM098FB" />
          </label>
          <label className="ds-field"><span>Tipo</span>
            <select className="ds-input" value={f.tipo} onChange={set('tipo')}>{TIPI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </label>
          <label className="ds-field"><span>Numero (verbale, fattura…)</span>
            <input className="ds-input" value={f.numero} onChange={set('numero')} placeholder="T326134" />
          </label>
          <label className="ds-field"><span>Data del verbale o del sinistro</span>
            <input className="ds-input" type="date" value={f.dataEvento} onChange={set('dataEvento')} />
          </label>
          <label className="ds-field"><span>Stato</span>
            <select className="ds-input" value={f.stato} onChange={set('stato')}>{STATI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </label>

          {!daConteggio && <>
            <label className="ds-field"><span>Importo (€, IVA inclusa)</span>
              <input className="ds-input" inputMode="decimal" value={f.importo} onChange={set('importo')} placeholder="38,90" />
            </label>
            <label className="ds-field is-full"><span>Descrizione</span>
              <input className="ds-input" value={f.descrizione} onChange={set('descrizione')} placeholder="VERBALE N. T326134 DEL 30/10/2026" />
            </label>
            <label className="ds-field"><span>Addebitato a</span>
              <select className="ds-input" value={f.padroncinoId} onChange={set('padroncinoId')}>
                <option value="">Nessuno</option>
                {padroncini.map((p) => <option key={p.id} value={p.id}>{p.ragioneSociale}</option>)}
              </select>
            </label>
            <label className="ds-field"><span>Mese</span>
              <input className="ds-input" type="month" value={f.mese} onChange={set('mese')} />
            </label>
          </>}

          <label className="ds-field is-full"><span>Note</span>
            <textarea className="ds-input" value={f.note} onChange={set('note')} placeholder="Es. pagato il 12/11, contestato al comune…" />
          </label>
        </div>

        {errore && <div className="rg-errore">{errore}</div>}

        <div className="rg-foot">
          {daConteggio && voce!.modificatoAMano
            ? <button type="button" className="rg-link" disabled={saving} onClick={() => salva({ ripristinaRiconoscimento: true })}
                title="Torna a leggere targa, tipo, numero e data dalla descrizione del conteggio">Ripristina i dati letti dal conteggio</button>
            : <span className="ds-cardsub">{daConteggio ? 'Targa, tipo, numero e data sono letti dalla descrizione: se li correggi, restano come li hai scritti.' : ''}</span>}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={() => salva()} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Pagina d'insieme ────────────────────────────────────────────────────────
export default function RegistroMezziPage() {
  const [voci, setVoci] = useState<VoceRegistro[]>([]);
  const [sync, setSync] = useState(false);
  const [chiave, setChiave] = useState(0);

  const per = (t: string) => voci.filter((v) => v.tipo === t);
  const somma = (l: VoceRegistro[]) => l.reduce((s, v) => s + Number(v.importo || 0), 0);
  const aperti = voci.filter((v) => v.stato === 'APERTO');
  const fuori = voci.filter((v) => !v.mezzoId).length;

  const sincronizza = async () => {
    setSync(true);
    try {
      const r = await registroMezziApi.sincronizza();
      window.alert(`Registro aggiornato: ${r.voci} voci lette da ${r.conteggi} conteggi.`);
      setChiave((k) => k + 1);
    } catch (e: any) {
      window.alert('Aggiornamento non riuscito: ' + (e?.message ?? e));
    } finally {
      setSync(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Flotta mezzi"
        title="Verbali e addebiti"
        sub="Verbali, franchigie e rifatturazioni per mezzo, presi dagli addebiti dei conteggi che contengono la targa"
        actions={<Button icon="refresh" onClick={sincronizza} disabled={sync}>{sync ? 'Aggiorno…' : 'Rileggi i conteggi'}</Button>}
      />
      <Kpis items={[
        { label: 'Verbali', value: per('VERBALE').length, sub: fmtEur(somma(per('VERBALE'))), color: C.red, icon: 'doc' },
        { label: 'Franchigie', value: per('FRANCHIGIA').length, sub: fmtEur(somma(per('FRANCHIGIA'))), color: C.orange, icon: 'scudo' },
        { label: 'Rifatturazioni', value: per('RIFATTURAZIONE').length, sub: fmtEur(somma(per('RIFATTURAZIONE'))), color: C.blue, icon: 'euro' },
        { label: 'Ancora aperti', value: aperti.length, sub: fuori ? `${fuori} con targa non in flotta` : 'da segnare pagati o contestati', color: C.purple, icon: 'clock' },
      ]} />
      <Card pad>
        <CardHead title="Registro" sub="Clic su una riga per completarla o correggerla · l'importo resta quello del conteggio" />
        <RegistroVoci key={chiave} onCaricate={setVoci} />
      </Card>
    </Page>
  );
}
