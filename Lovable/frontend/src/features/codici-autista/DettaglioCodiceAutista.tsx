// src/features/codici-autista/DettaglioCodiceAutista.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { codiciAutistaApi, padronciniApi } from '../../lib/api';
import type { CodiceAutista, Padroncino } from '../../lib/api';
import Modal from '../../components/ui/Modal';
import LogEntita from '../log/LogEntita';
import '../mezzi/FlottaMezzi.css';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

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
    <Modal open={open} onClose={onClose} title="Nuova Assegnazione Codice Autista" width={500}>
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
export default function DettaglioCodiceAutista() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [autista, setAutista] = useState<CodiceAutista | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setFormState] = useState<Partial<CodiceAutista>>({});
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'assegnazioni' | 'log'>('info');
  const [showAssegnaModal, setShowAssegnaModal] = useState(false);

  const set = (k: keyof CodiceAutista, v: any) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [a, pResp] = await Promise.all([
        codiciAutistaApi.detail(id),
        padronciniApi.list({ limit: '200' }),
      ]);
      setAutista(a);
      setFormState(a);
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
      await codiciAutistaApi.update(id, {
        nome: form.nome ?? undefined,
        cognome: form.cognome ?? undefined,
        note: form.note ?? undefined,
        tariffaFissa: form.tariffaFissa ?? undefined,
        tariffaRitiro: form.tariffaRitiro ?? undefined,
        target: form.target ?? undefined,
        bonusMalus: form.bonusMalus ?? undefined,
        zone: form.zone ?? undefined,
      });
      setDirty(false);
      await load();
    } catch (e: any) {
      alert('Errore salvataggio: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAttivo = async () => {
    if (!id) return;
    try {
      await codiciAutistaApi.toggleAttivo(id);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  const handleNuovaAssegnazione = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await codiciAutistaApi.assegna(id, { padroncinoId, dataInizio });
    await load();
  };

  const handleChiudiAssegnazione = async (assegnazioneId: string) => {
    if (!window.confirm('Chiudi questa assegnazione?')) return;
    await codiciAutistaApi.chiudiAssegnazione(assegnazioneId);
    await load();
  };

  if (loading) return (
    <div className="fm-page">
      <div className="fm-loading"><div className="fm-spinner" /><span>Caricamento autista...</span></div>
    </div>
  );
  if (error || !autista) return (
    <div className="fm-page">
      <div className="fm-error">
        <span>⚠️ {error || 'Codice autista non trovato'}</span>
        <button className="btn-outline" onClick={() => navigate('/codici-autista')}>← Torna ai Cod. Autisti</button>
      </div>
    </div>
  );

  const attiva = autista.assegnazioni?.find((a) => !a.dataFine);
  const nomeCompleto = [autista.nome, autista.cognome].filter(Boolean).join(' ') || null;

  const TABS = [
    { key: 'info', label: 'Info autista' },
    { key: 'assegnazioni', label: `Assegnazioni (${autista.assegnazioni?.length ?? 0})` },
    { key: 'log', label: 'Log' },
  ];

  return (
    <div className="fm-page">
      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="btn-ghost-sm" onClick={() => navigate('/codici-autista')}>← Cod. Autisti</button>
        <div className="dm-topbar-title">
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, letterSpacing: '.05em' }}>
            🏷️ {autista.codice}
          </h1>
          {nomeCompleto && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{nomeCompleto}</span>
          )}
          <span
            style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: autista.attivo ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)',
              color: autista.attivo ? '#16a34a' : '#64748b',
            }}
          >
            {autista.attivo ? 'ATTIVO' : 'DISATTIVO'}
          </span>
          {attiva && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              → {attiva.ragioneSociale}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleToggleAttivo}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              background: autista.attivo ? '#fee2e2' : 'rgba(34,197,94,.12)',
              color: autista.attivo ? '#dc2626' : '#16a34a',
              border: autista.attivo ? '1px solid #fca5a5' : '1px solid #86efac',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            {autista.attivo ? 'Disattiva' : 'Attiva'}
          </button>
          {dirty && (
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
            </button>
          )}
          {!dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>✓ Salvato</span>}
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
              <div className="dm-section-title"><span>🏷️</span> Dati Autista</div>

              <div className="dm-field">
                <label>Codice</label>
                <input
                  className="dm-input"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                  value={autista.codice}
                  readOnly
                  title="Il codice non può essere modificato"
                />
              </div>

              <div className="dm-section-row" style={{ marginTop: 8 }}>
                <div className="dm-field">
                  <label>Nome</label>
                  <input
                    className="dm-input"
                    value={form.nome ?? ''}
                    onChange={(e) => set('nome', e.target.value || null)}
                    placeholder="—"
                  />
                </div>
                <div className="dm-field">
                  <label>Cognome</label>
                  <input
                    className="dm-input"
                    value={form.cognome ?? ''}
                    onChange={(e) => set('cognome', e.target.value || null)}
                    placeholder="—"
                  />
                </div>
              </div>

              <div className="dm-field" style={{ marginTop: 8 }}>
                <label>Zone</label>
                <input
                  className="dm-input"
                  value={form.zone ?? ''}
                  onChange={(e) => set('zone', e.target.value || null)}
                  placeholder="es. MI Nord, Roma Est…"
                />
              </div>

              <div className="dm-field dm-field-full" style={{ marginTop: 8 }}>
                <label>Note</label>
                <textarea
                  className="dm-textarea"
                  rows={2}
                  value={form.note ?? ''}
                  onChange={(e) => set('note', e.target.value || null)}
                  placeholder="Note aggiuntive…"
                />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Creato il {fmt(autista.createdAt)}
              </div>
            </div>
          </div>

          <div className="dm-col-right">
            <div className="dm-section-card">
              <div className="dm-section-title"><span>💶</span> Tariffe</div>

              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Tariffa fissa (€)</label>
                  <input
                    className="dm-input"
                    type="number"
                    step="0.01"
                    value={form.tariffaFissa ?? ''}
                    onChange={(e) => set('tariffaFissa', e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>
                <div className="dm-field">
                  <label>Tariffa ritiro (€)</label>
                  <input
                    className="dm-input"
                    type="number"
                    step="0.01"
                    value={form.tariffaRitiro ?? ''}
                    onChange={(e) => set('tariffaRitiro', e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>
              </div>

              <div className="dm-field" style={{ marginTop: 8 }}>
                <label>Target (consegne/mese)</label>
                <input
                  className="dm-input"
                  type="number"
                  step="1"
                  value={form.target ?? ''}
                  onChange={(e) => set('target', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="—"
                />
              </div>

              <div className="dm-field" style={{ marginTop: 8 }}>
                <label>Bonus / Malus</label>
                <input
                  className="dm-input"
                  value={form.bonusMalus ?? ''}
                  onChange={(e) => set('bonusMalus', e.target.value || null)}
                  placeholder="es. +5%, -10€…"
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
              <button className="btn-outline" onClick={() => navigate('/codici-autista')}>← Annulla</button>
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
          {!autista.assegnazioni || autista.assegnazioni.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              Nessuna assegnazione registrata
            </div>
          ) : (
            <div className="dm-assegnazioni-list">
              {autista.assegnazioni.map((a) => (
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
            Log modifiche codice autista
          </h3>
          <LogEntita entityType="codice_autista" entityId={id} />
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
