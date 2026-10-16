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

type TabKey = 'voci-conteggio' | 'gestione-db';

const CATEGORIE: { value: CategoriaVoceConteggio; label: string; icon: string }[] = [
  { value: 'ADDEBITO', label: 'Addebiti', icon: '📝' },
  { value: 'FATTURATO', label: 'Fatture FM', icon: '💶' },
  { value: 'COMPENSAZIONE', label: 'Compensazioni', icon: '🔄' },
];

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

  return (
    <div className="imp-page">
      <div className="imp-header">
        <h1>⚙️ Impostazioni</h1>
      </div>

      <div className="imp-tabs">
        <button
          className={`imp-tab ${tab === 'voci-conteggio' ? 'imp-tab-active' : ''}`}
          onClick={() => setTab('voci-conteggio')}
        >
          📋 Voci Conteggio
        </button>
        {isAdmin && (
          <button
            className={`imp-tab ${tab === 'gestione-db' ? 'imp-tab-active' : ''}`}
            onClick={() => setTab('gestione-db')}
          >
            🗄️ Gestione DB
          </button>
        )}
      </div>

      {tab === 'gestione-db' && isAdmin && (
        <div className="imp-section">
          <GestioneDb />
        </div>
      )}

      {tab === 'voci-conteggio' && (
        <div className="imp-section">
          <div className="imp-toolbar">
            <div className="imp-search-wrap">
              <span>🔍</span>
              <input
                className="imp-search"
                placeholder="Cerca descrizione o conto voce..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="imp-filters">
              <button
                className={`imp-filter-btn ${filtroCat === 'TUTTE' ? 'imp-filter-active' : ''}`}
                onClick={() => setFiltroCat('TUTTE')}
              >
                Tutte
              </button>
              {CATEGORIE.map((c) => (
                <button
                  key={c.value}
                  className={`imp-filter-btn ${filtroCat === c.value ? 'imp-filter-active' : ''}`}
                  onClick={() => setFiltroCat(c.value)}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={openNew}>+ Nuova Voce</button>
          </div>

          <div className="imp-table-wrap">
            {loading ? (
              <div className="imp-loading">Caricamento...</div>
            ) : (
              <table className="imp-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Descrizione</th>
                    <th>Conto Voce</th>
                    <th>IVA</th>
                    <th>Valore default</th>
                    <th>Stato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="imp-empty-row">Nessuna voce trovata</td></tr>
                  ) : filtered.map((v) => {
                    const cat = CATEGORIE.find((c) => c.value === v.categoria);
                    return (
                      <tr key={v.id} className="imp-row">
                        <td>
                          <span className={`imp-cat-badge imp-cat-${v.categoria.toLowerCase()}`}>
                            {cat?.icon} {cat?.label}
                          </span>
                        </td>
                        <td className="imp-desc">{v.descrizione}</td>
                        <td className="imp-conto">{v.contoVoce ?? '—'}</td>
                        <td>{Number(v.percIva)}%</td>
                        <td>{v.valoreDefault != null ? `€ ${Number(v.valoreDefault).toFixed(2)}` : '—'}</td>
                        <td>
                          <span className={`imp-stato ${v.attivo ? 'imp-stato-attivo' : 'imp-stato-disattivo'}`}>
                            {v.attivo ? 'Attiva' : 'Disattiva'}
                          </span>
                        </td>
                        <td>
                          <div className="imp-row-actions">
                            <button className="imp-edit-btn" onClick={() => openEdit(v)}>✏️</button>
                            <button className="imp-del-btn" onClick={() => handleDelete(v)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
                {CATEGORIE.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
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
    </div>
  );
}
