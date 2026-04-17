// src/features/palmari/DettaglioPalmare.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { palmariApi, padronciniApi } from '../../lib/api';
import type { Palmare, Padroncino } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import LogEntita from '../log/LogEntita';
import '../mezzi/FlottaMezzi.css';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const STATO_META: Record<string, { label: string; cls: string }> = {
  DISPONIBILE: { label: 'Disponibile', cls: 'fm-badge-green' },
  ASSEGNATO:   { label: 'Assegnato',   cls: 'fm-badge-blue' },
  GUASTO:      { label: 'Guasto',      cls: 'fm-badge-red' },
  DISMESSO:    { label: 'Dismesso',    cls: 'fm-badge-gray' },
};

// ─── MODALE NUOVA ASSEGNAZIONE ─────────────────────────
function NuovaAssegnazioneModal({
  open, onClose, padroncini, onSave,
}: {
  open: boolean;
  onClose: () => void;
  padroncini: Padroncino[];
  onSave: (padroncinoId: string, dataInizio: string) => Promise<void>;
}) {
  const [padroncinoId, setPadroncinoId] = useState('');
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = padroncini.filter((p) =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!padroncinoId || !dataInizio) return;
    setSaving(true);
    try {
      await onSave(padroncinoId, dataInizio);
      setPadroncinoId('');
      setSearch('');
      onClose();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuova Assegnazione Palmare" width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-field">
          <label className="form-label">Cerca padroncino</label>
          <input
            className="form-input"
            placeholder="Filtra per nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setPadroncinoId(p.id)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: padroncinoId === p.id ? 'rgba(99,102,241,.1)' : 'transparent',
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: padroncinoId === p.id ? 'var(--primary)' : 'var(--text-primary)',
              }}>
                {p.ragioneSociale}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nessun padroncino trovato
            </div>
          )}
        </div>
        <div className="form-field">
          <label className="form-label">Data Inizio <span className="req">*</span></label>
          <input
            className="form-input"
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn-outline" onClick={onClose}>Annulla</button>
          <button
            className="btn-primary"
            disabled={!padroncinoId || !dataInizio || saving}
            onClick={handleSave}
          >
            {saving ? 'Salvataggio...' : '🔗 Assegna'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PAGINA PRINCIPALE ─────────────────────────────────
export default function DettaglioPalmare() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [palmare, setPalmare] = useState<Palmare | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setFormState] = useState<Partial<Palmare>>({});
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'assegnazioni' | 'log'>('info');
  const [showAssegnaModal, setShowAssegnaModal] = useState(false);

  const set = (k: keyof Palmare, v: any) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, pResp] = await Promise.all([
        palmariApi.detail(id),
        padronciniApi.list({ limit: '200' }),
      ]);
      setPalmare(p);
      setFormState(p);
      setDirty(false);
      setPadroncini(pResp.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await palmariApi.update(id, {
        codice: form.codice,
        codiceAssociato: (form as any).codiceAssociato ?? undefined,
        marca: form.marca ?? undefined,
        modello: form.modello ?? undefined,
        imei: form.imei ?? undefined,
        simNumero: form.simNumero ?? undefined,
        tariffaMensile: form.tariffaMensile ?? undefined,
        stato: form.stato,
        note: form.note ?? undefined,
      });
      setDirty(false);
      await load();
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNuovaAssegnazione = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await palmariApi.assegna(id, { padroncinoId, dataInizio });
    await load();
  };

  const handleChiudiAssegnazione = async (assegnazioneId: string) => {
    if (!window.confirm('Chiudi questa assegnazione?')) return;
    await palmariApi.chiudiAssegnazione(assegnazioneId);
    await load();
  };

  if (loading) return (
    <div className="fm-page">
      <div className="fm-loading"><div className="fm-spinner" /><span>Caricamento palmare...</span></div>
    </div>
  );
  if (error || !palmare) return (
    <div className="fm-page">
      <div className="fm-error">
        <span>⚠️ {error || 'Palmare non trovato'}</span>
        <button className="btn-outline" onClick={() => navigate('/palmari')}>← Torna ai Palmari</button>
      </div>
    </div>
  );

  const attiva = palmare.assegnazioni?.find((a) => !a.dataFine);
  const meta = STATO_META[palmare.stato] || { label: palmare.stato, cls: 'fm-badge-gray' };

  const TABS = [
    { key: 'info', label: 'Info palmare' },
    { key: 'assegnazioni', label: `Assegnazioni (${palmare.assegnazioni?.length ?? 0})` },
    { key: 'log', label: 'Log' },
  ];

  return (
    <div className="fm-page">
      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="btn-ghost-sm" onClick={() => navigate('/palmari')}>← Palmari</button>
        <div className="dm-topbar-title">
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, letterSpacing: '.05em' }}>
            📱 {palmare.codice}
          </h1>
          {palmare.marca && palmare.modello && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{palmare.marca} {palmare.modello}</span>
          )}
          <span className={`fm-badge ${meta.cls}`}>{meta.label.toUpperCase()}</span>
          {attiva && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              → {attiva.ragioneSociale}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && (
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
            </button>
          )}
          {!dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>✓ Salvato</span>}
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="dm-tabs-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dm-tab ${activeTab === t.key ? 'dm-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB INFO ── */}
      {activeTab === 'info' && (
        <div className="dm-layout">
          <div className="dm-col-left">
            <div className="dm-section-card">
              <div className="dm-section-title"><span>📱</span> Dati Palmare</div>

              <div className="dm-field">
                <label>Codice</label>
                <input
                  className="dm-input"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  value={form.codice ?? ''}
                  onChange={(e) => set('codice', e.target.value.toUpperCase())}
                />
              </div>

              <div className="dm-section-row" style={{ marginTop: 8 }}>
                <div className="dm-field">
                  <label>Marca</label>
                  <input className="dm-input" value={form.marca ?? ''} onChange={(e) => set('marca', e.target.value)} placeholder="—" />
                </div>
                <div className="dm-field">
                  <label>Modello</label>
                  <input className="dm-input" value={form.modello ?? ''} onChange={(e) => set('modello', e.target.value)} placeholder="—" />
                </div>
              </div>

              <div className="dm-section-row" style={{ marginTop: 8 }}>
                <div className="dm-field">
                  <label>IMEI / Seriale</label>
                  <input
                    className="dm-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    value={form.imei ?? ''}
                    onChange={(e) => set('imei', e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div className="dm-field">
                  <label>Codice Associato</label>
                  <input
                    className="dm-input"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={(form as any).codiceAssociato ?? ''}
                    onChange={(e) => set('codiceAssociato' as any, e.target.value || null)}
                    placeholder="—"
                  />
                </div>
              </div>

              <div className="dm-field" style={{ marginTop: 8 }}>
                <label>SIM / Numero</label>
                <input
                  className="dm-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={form.simNumero ?? ''}
                  onChange={(e) => set('simNumero', e.target.value)}
                  placeholder="—"
                />
              </div>

              <div className="dm-field dm-field-full" style={{ marginTop: 8 }}>
                <label>Note</label>
                <textarea
                  className="dm-textarea"
                  rows={2}
                  value={form.note ?? ''}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="Note aggiuntive…"
                />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Creato il {fmt(palmare.createdAt)}
              </div>
            </div>
          </div>

          <div className="dm-col-right">
            <div className="dm-section-card">
              <div className="dm-section-title"><span>⚙️</span> Stato e Tariffa</div>

              <div className="dm-field">
                <label>Stato</label>
                <select className="dm-select" value={form.stato ?? ''} onChange={(e) => set('stato', e.target.value)}>
                  <option value="DISPONIBILE">Disponibile</option>
                  <option value="ASSEGNATO">Assegnato</option>
                  <option value="GUASTO">Guasto</option>
                  <option value="DISMESSO">Dismesso</option>
                </select>
              </div>

              <div className="dm-field" style={{ marginTop: 8 }}>
                <label>Tariffa giornaliera (€)</label>
                <input
                  className="dm-input"
                  type="number"
                  step="0.01"
                  value={form.tariffaMensile ?? ''}
                  onChange={(e) => set('tariffaMensile', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
            </div>

            <div className="dm-section-card">
              <div className="dm-section-title"><span>👤</span> Assegnazione Corrente</div>
              {attiva ? (
                <div className="dm-assegn-row dm-assegn-attiva">
                  <div>
                    <span className="dm-assegn-nome">{attiva.ragioneSociale}</span>
                    <span className="dm-badge-attiva">ATTIVA</span>
                  </div>
                  <div className="dm-assegn-date">dal {fmt(attiva.dataInizio)}</div>
                  <button
                    className="btn-outline btn-sm"
                    style={{ color: '#dc2626', borderColor: '#dc2626', marginTop: 8 }}
                    onClick={() => handleChiudiAssegnazione(attiva.id)}
                  >
                    🔓 Chiudi assegnazione
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nessun padroncino assegnato</span>
                  <button className="btn-primary btn-sm" onClick={() => setShowAssegnaModal(true)}>
                    🔗 Assegna Padroncino
                  </button>
                </div>
              )}
            </div>

            <div className="dm-actions-card">
              <button className="btn-outline" onClick={() => navigate('/palmari')}>← Annulla</button>
              <button className="btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB ASSEGNAZIONI ── */}
      {activeTab === 'assegnazioni' && (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Storico Assegnazioni
            </h3>
            <button className="btn-primary btn-sm" onClick={() => setShowAssegnaModal(true)}>
              🔗 Nuova Assegnazione
            </button>
          </div>
          {!palmare.assegnazioni || palmare.assegnazioni.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              Nessuna assegnazione registrata
            </div>
          ) : (
            <div className="dm-assegnazioni-list">
              {palmare.assegnazioni.map((a) => (
                <div key={a.id} className={`dm-assegn-row ${!a.dataFine ? 'dm-assegn-attiva' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <div>
                      <span className="dm-assegn-nome">{a.ragioneSociale}</span>
                      {!a.dataFine && <span className="dm-badge-attiva">ATTIVA</span>}
                    </div>
                    {!a.dataFine && (
                      <button
                        className="btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#dc2626' }}
                        onClick={() => handleChiudiAssegnazione(a.id)}
                      >
                        🔓 Chiudi
                      </button>
                    )}
                  </div>
                  <div className="dm-assegn-date">
                    {fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : 'in corso'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB LOG ── */}
      {activeTab === 'log' && id && (
        <div style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Log modifiche palmare
          </h3>
          <LogEntita entityType="palmare" entityId={id} />
        </div>
      )}

      {/* ── MODALE ASSEGNAZIONE ── */}
      <NuovaAssegnazioneModal
        open={showAssegnaModal}
        onClose={() => setShowAssegnaModal(false)}
        padroncini={padroncini}
        onSave={handleNuovaAssegnazione}
      />
    </div>
  );
}
