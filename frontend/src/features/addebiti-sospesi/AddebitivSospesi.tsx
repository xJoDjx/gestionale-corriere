// src/features/addebiti-sospesi/AddebitivSospesi.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { addebitivSospesoApi } from '../../lib/addebiti-sospesi.api';
import type { AddebitoSospeso, CreateAddebitoSospesoDto, TipoAddebitoSospeso } from '../../lib/addebiti-sospesi.api';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import './AddebitivSospesi.css';

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
                💳 Addebito
              </button>
              <button
                type="button"
                className={`as-tipo-btn ${form.tipo === 'MEMO' ? 'as-tipo-active' : ''}`}
                onClick={() => setForm(f => ({ ...f, tipo: 'MEMO' }))}
              >
                📝 Memo / Promemoria
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
  const [filtroStato, setFiltroStato] = useState<'TUTTI' | 'PENDENTE' | 'EVASO'>('TUTTI');
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

  return (
    <div className="as-page">
      {/* Header */}
      <div className="as-header">
        <div>
          <h1>Sospesi &amp; Memo</h1>
          <span className="as-sub">Addebiti rinviati e promemoria da riportare nei conteggi futuri</span>
        </div>
        <div className="as-header-actions">
          <button className="as-btn as-btn-memo" onClick={() => openNew('MEMO')}>
            📝 Nuovo memo
          </button>
          <button className="as-btn as-btn-primary" onClick={() => openNew('ADDEBITO')}>
            💳 Nuovo addebito
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="as-stats">
        <div className="as-stat as-stat-warn">
          <span className="as-stat-val">{nAddebiti}</span>
          <span className="as-stat-lbl">Addebiti pendenti</span>
        </div>
        <div className="as-stat as-stat-memo">
          <span className="as-stat-val">{nMemo}</span>
          <span className="as-stat-lbl">Memo pendenti</span>
        </div>
        <div className="as-stat as-stat-ok">
          <span className="as-stat-val">{evasi}</span>
          <span className="as-stat-lbl">Evasi</span>
        </div>
        <div className="as-stat">
          <span className="as-stat-val">{items.length}</span>
          <span className="as-stat-lbl">Totali</span>
        </div>
      </div>

      {/* Filtri */}
      <div className="as-filters">
        <input
          type="month"
          value={filtroMese}
          onChange={e => setFiltroMese(e.target.value)}
          title="Filtra per mese target"
        />
        <select value={filtroPda} onChange={e => setFiltroPda(e.target.value)}>
          <option value="">Tutti i PDA</option>
          {padroncini.map(p => (
            <option key={p.id} value={p.id}>{p.ragioneSociale}</option>
          ))}
        </select>
        <div className="as-tab-group">
          {(['TUTTI', 'PENDENTE', 'EVASO'] as const).map(s => (
            <button
              key={s}
              className={`as-tab ${filtroStato === s ? 'as-tab-active' : ''}`}
              onClick={() => setFiltroStato(s)}
            >
              {s === 'TUTTI' ? 'Tutti' : s === 'PENDENTE' ? 'Pendenti' : 'Evasi'}
            </button>
          ))}
        </div>
        <div className="as-tab-group">
          {(['TUTTI', 'ADDEBITO', 'MEMO'] as const).map(t => (
            <button
              key={t}
              className={`as-tab ${filtroTipo === t ? 'as-tab-active' : ''}`}
              onClick={() => setFiltroTipo(t)}
            >
              {t === 'TUTTI' ? 'Tutti i tipi' : t === 'ADDEBITO' ? '💳 Addebiti' : '📝 Memo'}
            </button>
          ))}
        </div>
        {(filtroMese || filtroPda || filtroStato !== 'TUTTI' || filtroTipo !== 'TUTTI') && (
          <button className="as-btn as-btn-ghost as-btn-sm"
            onClick={() => { setFiltroMese(''); setFiltroPda(''); setFiltroStato('TUTTI'); setFiltroTipo('TUTTI'); }}>
            Azzera filtri
          </button>
        )}
      </div>

      {/* Tabella */}
      <div className="as-table-wrap">
        {loading ? (
          <div className="as-empty">Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div className="as-empty">
            {items.length === 0
              ? 'Nessun elemento. Usa i pulsanti in alto per creare un addebito o un memo.'
              : 'Nessun risultato con i filtri selezionati.'}
          </div>
        ) : (
          <table className="as-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Stato</th>
                <th>Padroncino</th>
                <th>Descrizione</th>
                <th>Importo</th>
                <th>Da (mese)</th>
                <th>Target</th>
                <th style={{ textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isMemo = item.tipo === 'MEMO';
                return (
                  <tr key={item.id} style={{ opacity: item.stato === 'EVASO' ? 0.6 : 1 }}>
                    <td>
                      <span className={`as-tipo-badge ${isMemo ? 'as-tipo-memo' : 'as-tipo-addebito'}`}>
                        {isMemo ? '📝 Memo' : '💳 Addebito'}
                      </span>
                    </td>
                    <td>
                      <span className={`as-badge ${item.stato === 'PENDENTE' ? 'as-badge-warn' : 'as-badge-ok'}`}>
                        {item.stato === 'PENDENTE' ? '⏳ Pendente' : '✓ Evaso'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.padroncino?.ragioneSociale ?? '—'}
                    </td>
                    <td>
                      <div className="as-cell-desc">{item.descrizione}</div>
                      {item.note && <div className="as-cell-note">📝 {item.note}</div>}
                    </td>
                    <td className="as-cell-importo">
                      {isMemo ? <span className="as-na">—</span> : (eur(item.importo) ?? '—')}
                    </td>
                    <td>{item.meseOrigine ? formatMese(item.meseOrigine) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatMese(item.meseTarget)}</td>
                    <td>
                      <div className="as-actions">
                        {item.stato === 'PENDENTE' && (
                          <>
                            <button className="as-action as-action-conteggio" title="Vai al conteggio del mese target"
                              onClick={() => goToConteggio(item)}>
                              📋 Conteggio
                            </button>
                            <button className="as-action as-action-evadi" onClick={() => handleEvadi(item.id)}>
                              ✓ Evadi
                            </button>
                            <button className="as-action" title="Modifica"
                              onClick={() => { setEditing(item); setShowModal(true); }}>
                              ✏️
                            </button>
                          </>
                        )}
                        {item.stato === 'EVASO' && (
                          <button className="as-action as-action-riapri" onClick={() => handleRiapri(item.id)}>
                            ↩ Riapri
                          </button>
                        )}
                        <button className="as-action as-action-del" title="Elimina"
                          onClick={() => handleDelete(item.id, item.descrizione)}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
}
