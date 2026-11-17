import { useEffect, useMemo, useState } from 'react';
import {
  vociConteggioApi,
  type VoceConteggio,
  type CategoriaVoceConteggio,
  type CreateVoceConteggioInput,
} from '../../lib/voci-conteggio.api';
import { useAuthStore } from '../../stores/auth.store';
import GestioneDb from './GestioneDb';
import './Impostazioni.css';
import './Impostazioni2.css';
import { Page, PageHeader, Card, Tabs, SegTabs, SearchBox, Button, IconButton, Empty, Th, useSort, C, fmtEur } from '../../components/ds';

type TabKey = 'voci-conteggio' | 'gestione-db';

const CATEGORIE: { value: CategoriaVoceConteggio; label: string }[] = [
  { value: 'ADDEBITO', label: 'Addebiti' },
  { value: 'FATTURATO', label: 'Fatture FM' },
  { value: 'COMPENSAZIONE', label: 'Compensazioni' },
];
const CAT_COLOR: Record<CategoriaVoceConteggio, string> = { ADDEBITO: C.red, FATTURATO: C.green, COMPENSAZIONE: C.blue };

const emptyForm: CreateVoceConteggioInput = {
  descrizione: '',
  contoVoce: '',
  percIva: 22,
  valoreDefault: null,
  categoria: 'ADDEBITO',
  attivo: true,
};

export default function Impostazioni() {
  const [tab, setTab] = useState<TabKey>('voci-conteggio');
  const user = useAuthStore((s) => s.user);
  const ruolo = (user?.ruolo ?? '').toString().toUpperCase();
  const isAdmin = !user || ruolo === 'ADMIN';
  const [voci, setVoci] = useState<VoceConteggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCat, setFiltroCat] = useState<'TUTTE' | CategoriaVoceConteggio>('TUTTE');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VoceConteggio | null>(null);
  const [form, setForm] = useState<CreateVoceConteggioInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await vociConteggioApi.list();
      setVoci(list);
    } catch (e: any) {
      alert('Errore caricamento: ' + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return voci.filter((v) =>
      (filtroCat === 'TUTTE' || v.categoria === filtroCat) &&
      (s === '' ||
        v.descrizione.toLowerCase().includes(s) ||
        (v.contoVoce ?? '').toLowerCase().includes(s))
    );
  }, [voci, filtroCat, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, categoria: filtroCat === 'TUTTE' ? 'ADDEBITO' : filtroCat });
    setModalOpen(true);
  };

  const openEdit = (v: VoceConteggio) => {
    setEditing(v);
    setForm({
      descrizione: v.descrizione,
      contoVoce: v.contoVoce ?? '',
      percIva: Number(v.percIva),
      valoreDefault: v.valoreDefault != null ? Number(v.valoreDefault) : null,
      categoria: v.categoria,
      attivo: v.attivo,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descrizione.trim()) {
      alert('Descrizione obbligatoria');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateVoceConteggioInput = {
        ...form,
        descrizione: form.descrizione.trim(),
        contoVoce: form.contoVoce?.trim() || null,
      };
      if (editing) await vociConteggioApi.update(editing.id, payload);
      else await vociConteggioApi.create(payload);
      setModalOpen(false);
      await load();
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: VoceConteggio) => {
    if (!confirm(`Eliminare la voce "${v.descrizione}"?`)) return;
    try {
      await vociConteggioApi.remove(v.id);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const toggleAttivo = async (v: VoceConteggio) => {
    try { await vociConteggioApi.update(v.id, { attivo: !v.attivo }); await load(); }
    catch (e: any) { alert('Errore: ' + e.message); }
  };
  type SK = 'c' | 'd' | 'k' | 'i' | 'v' | 's';
  const catLabel = (c: CategoriaVoceConteggio) => CATEGORIE.find((x) => x.value === c)?.label ?? c;
  const { sorted, sort, toggle } = useSort<VoceConteggio, SK>(filtered, (v, k) =>
    k === 'c' ? catLabel(v.categoria) : k === 'd' ? v.descrizione : k === 'k' ? (v.contoVoce ?? '') : k === 'i' ? Number(v.percIva)
      : k === 'v' ? (v.valoreDefault != null ? Number(v.valoreDefault) : null) : (v.attivo ? 0 : 1), { key: 'c', dir: 'asc' });

  return (
    <Page>
      <PageHeader eyebrow="Sistema" title="Impostazioni" sub="Voci dei conteggi e manutenzione del database" />

      <Tabs label="Sezioni" value={tab} onChange={setTab} items={[
        { value: 'voci-conteggio' as TabKey, label: 'Voci conteggio', count: voci.length, icon: 'cont', color: C.blue },
        ...(isAdmin ? [{ value: 'gestione-db' as TabKey, label: 'Database', icon: 'db' as const, color: C.teal }] : []),
      ]} />

      {tab === 'gestione-db' && isAdmin && <GestioneDb />}

      {tab === 'voci-conteggio' && (
        <Card>
          <div className="imp2-tools">
            <SegTabs label="Categoria" value={filtroCat} onChange={setFiltroCat} items={[
              { value: 'TUTTE' as const, label: 'Tutte', count: voci.length },
              ...CATEGORIE.map((c) => ({ value: c.value, label: c.label, count: voci.filter((v) => v.categoria === c.value).length })),
            ]} />
            <div className="imp2-right">
              <SearchBox value={search} onChange={setSearch} placeholder="Cerca voce o conto…" width={240} />
              <Button variant="primary" size="sm" icon="plus" onClick={openNew}>Nuova voce</Button>
            </div>
          </div>
          {loading ? <Empty>Caricamento…</Empty> : (
            <div className="ds-tablewrap">
              <table className="ds-table imp2-table">
                <colgroup><col style={{ width: 150 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 70 }} /><col style={{ width: 150 }} /><col style={{ width: 110 }} /><col style={{ width: 84 }} /></colgroup>
                <thead><tr>
                  <Th k="c" sort={sort} onSort={toggle}>Categoria</Th>
                  <Th k="d" sort={sort} onSort={toggle}>Descrizione</Th>
                  <Th k="k" sort={sort} onSort={toggle}>Conto voce</Th>
                  <Th k="i" sort={sort} onSort={toggle} right>IVA</Th>
                  <Th k="v" sort={sort} onSort={toggle} right>Valore predefinito</Th>
                  <Th k="s" sort={sort} onSort={toggle}>Stato</Th>
                  <th />
                </tr></thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={7}><Empty>Nessuna voce trovata</Empty></td></tr>
                  ) : sorted.map((v) => (
                    <tr key={v.id}>
                      <td><span className="imp2-cat"><i style={{ background: CAT_COLOR[v.categoria] }} />{catLabel(v.categoria)}</span></td>
                      <td>{v.descrizione}</td>
                      <td className="imp2-mono" style={{ color: v.contoVoce ? undefined : '#A1A1AA' }}>{v.contoVoce ?? '—'}</td>
                      <td className="r">{Number(v.percIva)}%</td>
                      <td className="r" style={{ color: v.valoreDefault != null ? undefined : '#A1A1AA' }}>{v.valoreDefault != null ? fmtEur(Number(v.valoreDefault)) : '—'}</td>
                      <td>
                        <button type="button" role="switch" aria-checked={v.attivo} className={`imp2-tog${v.attivo ? ' is-on' : ''}`} onClick={() => toggleAttivo(v)}>
                          <i />{v.attivo ? 'Attiva' : 'Disattiva'}
                        </button>
                      </td>
                      <td className="r">
                        <span className="imp2-acts">
                          <IconButton icon="edit" label="Modifica voce" onClick={() => openEdit(v)} />
                          <IconButton icon="trash" danger label="Elimina voce" onClick={() => handleDelete(v)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="imp2-foot">La descrizione è il prefisso proposto quando si aggiunge una riga al conteggio: i campi XXXX si completano a mano. Le voci non cambiano il calcolo del netto.</div>
        </Card>
      )}

      {modalOpen && (
        <div className="imp-modal-backdrop" onClick={() => !saving && setModalOpen(false)}>
          <div className="imp-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Modifica Voce' : 'Nuova Voce'}</h2>

            <div className="imp-field">
              <label>Categoria *</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaVoceConteggio })}
              >
                {CATEGORIE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="imp-field">
              <label>Descrizione (prefisso) *</label>
              <input
                value={form.descrizione}
                onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                placeholder="es. RISME CARTA, PROT SANZ..."
              />
            </div>

            <div className="imp-field-row">
              <div className="imp-field">
                <label>Conto Voce</label>
                <input
                  value={form.contoVoce ?? ''}
                  onChange={(e) => setForm({ ...form, contoVoce: e.target.value })}
                  placeholder="es. 4.08.043"
                />
              </div>
              <div className="imp-field">
                <label>IVA %</label>
                <select
                  value={form.percIva ?? 22}
                  onChange={(e) => setForm({ ...form, percIva: parseFloat(e.target.value) })}
                >
                  <option value={0}>0%</option>
                  <option value={22}>22%</option>
                </select>
              </div>
              <div className="imp-field">
                <label>Valore default (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.valoreDefault ?? ''}
                  onChange={(e) => setForm({ ...form, valoreDefault: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  placeholder="opzionale"
                />
              </div>
            </div>

            <div className="imp-field">
              <label className="imp-checkbox">
                <input
                  type="checkbox"
                  checked={form.attivo ?? true}
                  onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
                />
                Voce attiva
              </label>
            </div>

            <div className="imp-modal-actions">
              <button className="btn-outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Annulla
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
