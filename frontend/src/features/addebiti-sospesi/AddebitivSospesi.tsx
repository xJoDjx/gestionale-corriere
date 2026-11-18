// src/features/addebiti-sospesi/AddebitivSospesi.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import type { AddebitoSospeso, CreateAddebitoSospesoDto, TipoAddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import './AddebitivSospesi.css';
import '../padroncini/Padroncini2.css';
import { Page, PageHeader, Card, Kpis, Button, IconButton, SegTabs, Select, Th, Dot, Empty, C, useSort, fmtEur as fmtEur2 } from '../../components/ds';

const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMese(m: string) {
  const [y, mo] = m.split('-');
  return `${MESI_IT[parseInt(mo, 10) - 1]} ${y}`;
}

function eur(n: number | null | undefined) {
  if (n == null) return null;
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ─── FORM VUOTO ────────────────────────────────────────────────────────────────
function emptyForm(tipo: TipoAddebitoSospeso = 'ADDEBITO') {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  const meseTarget = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  return {
    tipo,
    padroncinoId: '',
    descrizione:  '',
    importoStr:   '',
    importo:      undefined as number | undefined,
    meseOrigine:  getCurrentMonth(),
    meseTarget,
    note:         '',
  };
}

// ─── MODALE ────────────────────────────────────────────────────────────────────
interface ModalProps {
  padroncini: Padroncino[];
  initial?: AddebitoSospeso | null;
  defaultTipo?: TipoAddebitoSospeso;
  onSave: (dto: CreateAddebitoSospesoDto) => Promise<void>;
  onClose: () => void;
}

function Modal({ padroncini, initial, defaultTipo = 'ADDEBITO', onSave, onClose }: ModalProps) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        tipo:         initial.tipo ?? 'ADDEBITO',
        padroncinoId: initial.padroncinoId,
        descrizione:  initial.descrizione,
        importoStr:   initial.importo != null ? String(initial.importo) : '',
        importo:      initial.importo ?? undefined,
        meseOrigine:  initial.meseOrigine ?? getCurrentMonth(),
        meseTarget:   initial.meseTarget,
        note:         initial.note ?? '',
      };
    }
    return emptyForm(defaultTipo);
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isMemo = form.tipo === 'MEMO';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.padroncinoId) { setErr('Seleziona un padroncino'); return; }
    if (!form.descrizione.trim()) { setErr('Inserisci una descrizione'); return; }
    if (!form.meseTarget) { setErr('Seleziona il mese target'); return; }
    setSaving(true);
    setErr('');
    try {
      const importo = !isMemo && form.importoStr
        ? parseFloat(form.importoStr.replace(',', '.'))
        : undefined;
      await onSave({
        tipo:         form.tipo as TipoAddebitoSospeso,
        padroncinoId: form.padroncinoId,
        descrizione:  form.descrizione.trim(),
        importo:      importo && !isNaN(importo) ? importo : undefined,
        meseOrigine:  form.meseOrigine || undefined,
        meseTarget:   form.meseTarget,
        note:         form.note?.trim() || undefined,
      });
    } catch (e: any) {
      setErr(e.message || 'Errore');
    } finally {
      setSaving(false);
    }
  }

  const isEditing = !!initial;

  return (
    <div className="as-overlay">
      <div className="as-modal" onClick={e => e.stopPropagation()}>
        <div className="as-modal-header">
          <h2>{isEditing ? `Modifica ${isMemo ? 'memo' : 'addebito'}` : `Nuovo ${isMemo ? 'memo' : 'addebito'}`}</h2>
          <button className="as-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="as-form">

          {/* Tipo toggle — non modificabile in edit */}
          {!isEditing && (
            <div className="as-tipo-toggle">
              <button
                type="button"
                className={`as-tipo-btn ${form.tipo === 'ADDEBITO' ? 'as-tipo-active' : ''}`}
                onClick={() => setForm(f => ({ ...f, tipo: 'ADDEBITO' }))}
              >
                Addebito
              </button>
              <button
                type="button"
                className={`as-tipo-btn ${form.tipo === 'MEMO' ? 'as-tipo-active' : ''}`}
                onClick={() => setForm(f => ({ ...f, tipo: 'MEMO' }))}
              >
                Memo / promemoria
              </button>
            </div>
          )}

          {isMemo && (
            <div className="as-memo-hint">
              Un <strong>memo</strong> non ha importo: serve come promemoria visibile nel conteggio del mese target.
            </div>
          )}

          <label>
            Padroncino <span className="as-req">*</span>
            <select value={form.padroncinoId} onChange={e => set('padroncinoId', e.target.value)} required>
              <option value="">— Seleziona —</option>
              {padroncini.map(p => (
                <option key={p.id} value={p.id}>{p.ragioneSociale}</option>
              ))}
            </select>
          </label>

          <label>
            {isMemo ? 'Promemoria' : 'Descrizione'} <span className="as-req">*</span>
            <input
              type="text"
              value={form.descrizione}
              onChange={e => set('descrizione', e.target.value)}
              placeholder={isMemo
                ? 'Es. Da maggio: aggiungere bonus consegne +0,10 €/collo'
                : 'Es. Rivalsa danni furgone marzo'}
              required
            />
          </label>

          {!isMemo && (
            <div className="as-form-row">
              <label>
                Importo (€)
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.importoStr}
                  onChange={e => set('importoStr', e.target.value)}
                  placeholder="Es. 250,00"
                />
              </label>
              <label>
                Mese origine
                <input type="month" value={form.meseOrigine} onChange={e => set('meseOrigine', e.target.value)} />
              </label>
            </div>
          )}

          {isMemo && (
            <label>
              Mese origine
              <input type="month" value={form.meseOrigine} onChange={e => set('meseOrigine', e.target.value)} />
            </label>
          )}

          <label>
            Mese target (da ricordare / addebitare) <span className="as-req">*</span>
            <input type="month" value={form.meseTarget} onChange={e => set('meseTarget', e.target.value)} required />
          </label>

          <label>
            Note
            <textarea
              value={form.note}
              onChange={e => set('note', e.target.value)}
              rows={3}
              placeholder="Dettagli aggiuntivi..."
            />
          </label>

          {err && <p className="as-form-error">{err}</p>}

          <div className="as-form-actions">
            <button type="button" className="as-btn as-btn-ghost" onClick={onClose}>Annulla</button>
            <button type="submit" className="as-btn as-btn-primary" disabled={saving}>
              {saving ? 'Salvataggio…' : (isEditing ? 'Aggiorna' : (isMemo ? 'Crea memo' : 'Crea addebito'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── PAGINA PRINCIPALE ─────────────────────────────────────────────────────────
export default function AddebitivSospesiPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AddebitoSospeso[]>([]);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroMese, setFiltroMese] = useState('');
  const [filtroPda, setFiltroPda] = useState('');
  const [filtroStato, setFiltroStato] = useState<'TUTTI' | 'PENDENTE' | 'EVASO'>('PENDENTE');
  const [filtroTipo, setFiltroTipo] = useState<'TUTTI' | 'ADDEBITO' | 'MEMO'>('TUTTI');
  const [showModal, setShowModal] = useState(false);
  const [defaultTipo, setDefaultTipo] = useState<TipoAddebitoSospeso>('ADDEBITO');
  const [editing, setEditing] = useState<AddebitoSospeso | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, padsResp] = await Promise.all([
        addebitivSospesoApi.list(),
        padronciniApi.list(),
      ]);
      setItems(data);
      setPadroncini((padsResp.data ?? []).filter((p: Padroncino) => p.attivo !== false));
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filtroMese  && it.meseTarget !== filtroMese) return false;
      if (filtroPda   && it.padroncinoId !== filtroPda) return false;
      if (filtroStato !== 'TUTTI' && it.stato !== filtroStato) return false;
      if (filtroTipo  !== 'TUTTI' && it.tipo  !== filtroTipo) return false;
      return true;
    });
  }, [items, filtroMese, filtroPda, filtroStato, filtroTipo]);

  const pendenti  = items.filter(i => i.stato === 'PENDENTE').length;
  const evasi     = items.filter(i => i.stato === 'EVASO').length;
  const nMemo     = items.filter(i => i.tipo === 'MEMO' && i.stato === 'PENDENTE').length;
  const nAddebiti = items.filter(i => i.tipo === 'ADDEBITO' && i.stato === 'PENDENTE').length;

  async function handleSave(dto: CreateAddebitoSospesoDto) {
    if (editing) {
      await addebitivSospesoApi.update(editing.id, dto);
      toast('Aggiornato');
    } else {
      await addebitivSospesoApi.create(dto);
      toast(dto.tipo === 'MEMO' ? 'Memo creato' : 'Addebito creato');
    }
    setShowModal(false);
    setEditing(null);
    load();
  }

  async function handleEvadi(id: string) {
    await addebitivSospesoApi.evadi(id);
    toast('Segnato come evaso');
    load();
  }

  async function handleRiapri(id: string) {
    await addebitivSospesoApi.riapri(id);
    toast('Riaperto come pendente');
    load();
  }

  async function handleDelete(id: string, descrizione: string) {
    if (!confirm(`Eliminare "${descrizione}"?`)) return;
    await addebitivSospesoApi.delete(id);
    toast('Eliminato');
    load();
  }

  function openNew(tipo: TipoAddebitoSospeso) {
    setEditing(null);
    setDefaultTipo(tipo);
    setShowModal(true);
  }

  function goToConteggio(item: AddebitoSospeso) {
    navigate(`/conteggi?mese=${item.meseTarget}&padroncinoId=${item.padroncinoId}`);
  }

  // ── Solo visualizzazione ──
  type Vista = 'PENDENTI' | 'EVASI' | 'TUTTI' | 'ADDEBITI' | 'MEMO';
  const vista: Vista = filtroTipo === 'ADDEBITO' ? 'ADDEBITI' : filtroTipo === 'MEMO' ? 'MEMO' : filtroStato === 'PENDENTE' ? 'PENDENTI' : filtroStato === 'EVASO' ? 'EVASI' : 'TUTTI';
  const setVista = (v: Vista) => {
    setFiltroStato(v === 'PENDENTI' ? 'PENDENTE' : v === 'EVASI' ? 'EVASO' : 'TUTTI');
    setFiltroTipo(v === 'ADDEBITI' ? 'ADDEBITO' : v === 'MEMO' ? 'MEMO' : 'TUTTI');
  };
  type SK = 'padroncino' | 'tipo' | 'descrizione' | 'importo' | 'da' | 'target' | 'stato';
  const { sorted, sort, toggle } = useSort<AddebitoSospeso, SK>(filtered, (it, k) => {
    switch (k) {
      case 'padroncino': return it.padroncino?.ragioneSociale ?? '';
      case 'tipo': return it.tipo;
      case 'descrizione': return it.descrizione;
      case 'importo': return it.tipo === 'MEMO' ? null : (it.importo ?? null);
      case 'da': return it.meseOrigine ?? '';
      case 'target': return it.meseTarget;
      case 'stato': return it.stato === 'PENDENTE' ? 0 : 1;
    }
  }, { key: 'target', dir: 'desc' });
  const pend = items.filter((i) => i.stato === 'PENDENTE');
  const addPend = pend.filter((i) => i.tipo === 'ADDEBITO');
  const memoPend = pend.filter((i) => i.tipo === 'MEMO');
  const totAddPend = addPend.reduce((s, i) => s + (Number(i.importo) || 0), 0);
  const nomi = (xs: AddebitoSospeso[]) => {
    const n = Array.from(new Set(xs.map((x) => (x.padroncino?.ragioneSociale ?? '').replace(/\s+(S\.?R\.?L\.?S?\.?|SRLS|SRL|SAS)$/i, '').trim()).filter(Boolean)));
    return n.length <= 2 ? n.join(' e ') : `${n.slice(0, 2).join(', ')} e altri ${n.length - 2}`;
  };
  const mesiTarget = Array.from(new Set(pend.map((i) => i.meseTarget)));
  const evasiAdd = items.filter((i) => i.stato === 'EVASO' && i.tipo === 'ADDEBITO').length;
  const mesiOpz = Array.from(new Set(items.map((i) => i.meseTarget))).sort().reverse();
  const AVC = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
  const padIdx = new Map(padroncini.map((p, i) => [p.id, i]));
  const iniz = (n: string) => n.replace(/[^A-Za-zÀ-ú0-9& ]/g, ' ').split(/\s+/).filter((w) => w && w !== '&').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const breve = (m?: string | null) => m ? formatMese(m).slice(0, 3) + ' ' + m.slice(0, 4) : '—';

  return (
    <Page>
      <PageHeader
        eyebrow="Operativo"
        title="Sospesi e memo"
        sub="Addebiti da inserire e promemoria legati al conteggio di un mese"
        actions={<>
          <Button icon="edit" onClick={() => openNew('MEMO')}>Nuovo memo</Button>
          <Button icon="plus" variant="primary" onClick={() => openNew('ADDEBITO')}>Nuovo addebito</Button>
        </>}
      />

      <Kpis items={[
        { label: 'Pendenti', value: pendenti, color: C.orange, icon: 'clock', subColor: pendenti ? '#C2410C' : undefined,
          sub: pendenti === 0 ? 'Niente in sospeso' : mesiTarget.length === 1 ? `Tutti per il conteggio di ${formatMese(mesiTarget[0]).split(' ')[0].toLowerCase()}` : `Su ${mesiTarget.length} mesi diversi` },
        { label: 'Addebiti pendenti', value: fmtEur2(totAddPend), sub: addPend.length ? `${nAddebiti} addebit${nAddebiti === 1 ? 'o' : 'i'} · ${nomi(addPend)}` : 'Nessun addebito in sospeso', color: C.red, icon: 'cont' },
        { label: 'Memo pendenti', value: nMemo, sub: memoPend.length ? nomi(memoPend) : 'Nessun memo aperto', color: C.blue, icon: 'note' },
        { label: 'Evasi', value: evasi, sub: `${evasiAdd} addebiti e ${evasi - evasiAdd} memo · ${items.length} totali`, color: C.green, icon: 'ok' },
      ]} />

      <Card>
        <div className="pl2-toolbar">
          <SegTabs<Vista> value={vista} onChange={setVista} label="Vista"
            items={[
              { value: 'PENDENTI', label: 'Pendenti', count: pendenti },
              { value: 'EVASI', label: 'Evasi', count: evasi },
              { value: 'TUTTI', label: 'Tutti', count: items.length },
              { value: 'ADDEBITI', label: 'Solo addebiti', count: items.filter((i) => i.tipo === 'ADDEBITO').length },
              { value: 'MEMO', label: 'Solo memo', count: items.filter((i) => i.tipo === 'MEMO').length },
            ]} />
          <div className="ds-actions">
            <Select size="sm" label="Padroncino" value={filtroPda} onChange={setFiltroPda}
              options={[{ value: '', label: 'Tutti i PDA' }, ...padroncini.map((p) => ({ value: p.id, label: p.ragioneSociale }))]} />
            <Select size="sm" label="Mese target" value={filtroMese} onChange={setFiltroMese}
              options={[{ value: '', label: 'Tutti' }, ...mesiOpz.map((m) => ({ value: m, label: formatMese(m) }))]} />
          </div>
        </div>
        {loading ? <Empty>Caricamento…</Empty> : sorted.length === 0 ? (
          <Empty>{items.length === 0 ? 'Nessun elemento. Usa i pulsanti in alto per creare un addebito o un memo.' : 'Nessun risultato con i filtri selezionati.'}</Empty>
        ) : (
          <div className="ds-tablewrap">
            <table className="ds-table as2-table" style={{ minWidth: 960 }}>
              <thead><tr>
                <Th k="padroncino" sort={sort} onSort={toggle}>Padroncino</Th>
                <Th k="tipo" sort={sort} onSort={toggle}>Tipo</Th>
                <Th k="descrizione" sort={sort} onSort={toggle}>Descrizione</Th>
                <Th k="importo" sort={sort} onSort={toggle} right>Importo</Th>
                <Th k="da" sort={sort} onSort={toggle}>Da (mese)</Th>
                <Th k="target" sort={sort} onSort={toggle}>Target</Th>
                <Th k="stato" sort={sort} onSort={toggle}>Stato</Th>
                <Th />
              </tr></thead>
              <tbody>
                {sorted.map((item) => {
                  const isMemo = item.tipo === 'MEMO';
                  const pendente = item.stato === 'PENDENTE';
                  const nome = item.padroncino?.ragioneSociale ?? '—';
                  return (
                    <tr key={item.id} style={{ color: pendente ? undefined : '#52525B' }}>
                      <td>
                        <div className="pl2-who">
                          <span aria-hidden="true" className="pl2-av" style={{ flexBasis: 24, height: 24, fontSize: 10, background: AVC[(padIdx.get(item.padroncinoId) ?? 0) % AVC.length] }}>{iniz(nome)}</span>
                          <span className="pl2-name" style={{ fontWeight: 400, fontSize: 12.5 }}>{nome}</span>
                        </div>
                      </td>
                      <td><Dot tone={isMemo ? 'info' : 'ko'}>{isMemo ? 'Memo' : 'Addebito'}</Dot></td>
                      <td style={{ maxWidth: 360 }}>
                        <span className="as2-desc" title={item.descrizione}>{item.descrizione}</span>
                        {item.note && <span className="as2-note" title={item.note}>{item.note}</span>}
                      </td>
                      <td className="r" style={{ fontWeight: 600, color: isMemo || item.importo == null ? '#6B6B73' : undefined }}>{isMemo || item.importo == null ? '—' : fmtEur2(item.importo)}</td>
                      <td style={{ color: '#3F3F46' }}>{breve(item.meseOrigine)}</td>
                      <td style={{ fontWeight: 500 }}>{breve(item.meseTarget)}</td>
                      <td><Dot tone={pendente ? 'warn' : 'ok'}>{pendente ? 'Pendente' : 'Evaso'}</Dot></td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {pendente ? (<>
                          <IconButton icon="link" label="Vai al conteggio del mese target" onClick={() => goToConteggio(item)} />
                          <IconButton icon="tick" label="Segna come evaso" onClick={() => handleEvadi(item.id)} />
                          <IconButton icon="edit" label="Modifica" onClick={() => { setEditing(item); setShowModal(true); }} />
                        </>) : (
                          <IconButton icon="restore" label="Riapri come pendente" onClick={() => handleRiapri(item.id)} />
                        )}
                        <IconButton icon="trash" label="Elimina" danger onClick={() => handleDelete(item.id, item.descrizione)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pl2-foot">Mostrati {sorted.length} di {items.length} · alla chiusura del conteggio il sospeso passa a "Evaso"</div>
      </Card>

      {/* Modale */}
      {showModal && (
        <Modal
          padroncini={padroncini}
          initial={editing}
          defaultTipo={defaultTipo}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {/* Toast */}
      {toastMsg && <div className="as-toast">{toastMsg}</div>}
    </Page>
  );
}
