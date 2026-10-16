// src/features/palmari/DettaglioPalmare.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { palmariApi, padronciniApi, noteApi } from '../../lib/api';
import type { Palmare, Padroncino, Nota } from '../../lib/api';
import LogEntita from '../log/LogEntita';
import ChiudiAssegnazioneModal from '../../components/ui/ChiudiAssegnazioneModal';
import type { ChiudiAssegnazioneTarget } from '../../components/ui/ChiudiAssegnazioneModal';
import '../mezzi/FlottaMezzi.css';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_META: Record<string, { label: string; cls: string }> = {
  DISPONIBILE: { label: 'Disponibile', cls: 'fm-badge-green' },
  ASSEGNATO:   { label: 'Assegnato',   cls: 'fm-badge-blue' },
  GUASTO:      { label: 'Guasto',      cls: 'fm-badge-red' },
  DISMESSO:    { label: 'Dismesso',    cls: 'fm-badge-gray' },
};

type TabKey = 'info' | 'assegnazioni' | 'note' | 'log';

export default function DettaglioPalmare() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [palmare, setPalmare] = useState<Palmare | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [assegnaForm, setAssegnaForm] = useState({ padroncinoId: '', dataInizio: '' });
  const [showAssegna, setShowAssegna] = useState(false);
  const [chiudiTarget, setChiudiTarget] = useState<ChiudiAssegnazioneTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setFormState] = useState<Partial<Palmare>>({});
  const [dirty, setDirty] = useState(false);
  const [noteList, setNoteList]     = useState<Nota[]>([]);
  const [notaTesto, setNotaTesto]   = useState('');
  const [notaSaving, setNotaSaving] = useState(false);

  const set = (k: keyof Palmare, v: any) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, pResp, noteResp] = await Promise.all([
        palmariApi.detail(id),
        padronciniApi.list({ limit: '200' }),
        noteApi.list('palmare', id, 100),
      ]);
      setPalmare(p);
      setFormState(p);
      setDirty(false);
      setPadroncini(pResp.data);
      setNoteList(noteResp);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddNota = async () => {
    if (!id || !notaTesto.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'palmare', entityId: id, contenuto: notaTesto.trim() });
      setNotaTesto('');
      setNoteList(await noteApi.list('palmare', id, 100));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const handleDeleteNota = async (notaId: string) => {
    if (!confirm('Eliminare questa nota?')) return;
    try {
      await noteApi.remove(notaId);
      setNoteList(prev => prev.filter(n => n.id !== notaId));
    } catch (e: any) { alert('Errore: ' + e.message); }
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await palmariApi.update(id, {
        codice: form.codice,
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

  const handleAssegna = async () => {
    if (!id || !assegnaForm.padroncinoId || !assegnaForm.dataInizio) return;
    setSaving(true);
    try {
      await palmariApi.assegna(id, assegnaForm);
      setShowAssegna(false);
      setAssegnaForm({ padroncinoId: '', dataInizio: '' });
      await load();
    } catch (e: any) {
      alert('Errore assegnazione: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChiudiAssegnazione = (assegnazioneId: string, nome: string, dataInizio: string) => {
    setChiudiTarget({ id: assegnazioneId, nome, dataInizio });
  };

  const confermaChiusura = async (t: ChiudiAssegnazioneTarget, dataFine: string) => {
    await palmariApi.chiudiAssegnazione(t.id, dataFine);
    setChiudiTarget(null);
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

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'info', label: 'Dati Palmare' },
    { key: 'assegnazioni', label: `Assegnazioni (${palmare.assegnazioni?.length ?? 0})` },
    { key: 'note', label: `📝 Note (${noteList.length})` },
    { key: 'log', label: 'Log' },
  ];

  return (
    <div className="fm-page">
      <ChiudiAssegnazioneModal
        target={chiudiTarget}
        oggetto={`Palmare ${palmare.codice}`}
        onClose={() => setChiudiTarget(null)}
        onConfirm={confermaChiusura}
      />
      {/* ── TOPBAR ── */}
      <div className="dm-topbar">
        <button className="btn-ghost-sm" onClick={() => navigate('/palmari')}>← Palmari</button>
        <div className="dm-topbar-title">
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800 }}>
            📱 {palmare.codice}
          </h1>
          {palmare.marca && palmare.modello && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {palmare.marca} {palmare.modello}
            </span>
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
            onClick={() => setActiveTab(t.key)}
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
              <div className="dm-section-title"><span>📱</span> Identificazione</div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Codice</label>
                  <input
                    className="dm-input"
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                    value={form.codice ?? ''}
                    onChange={(e) => set('codice', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="dm-field">
                  <label>Stato</label>
                  <select
                    className="dm-select"
                    value={form.stato ?? ''}
                    onChange={(e) => set('stato', e.target.value)}
                  >
                    <option value="DISPONIBILE">Disponibile</option>
                    <option value="ASSEGNATO">Assegnato</option>
                    <option value="GUASTO">Guasto</option>
                    <option value="DISMESSO">Dismesso</option>
                  </select>
                </div>
              </div>
              <div className="dm-section-row">
                <div className="dm-field">
                  <label>Marca</label>
                  <input
                    className="dm-input"
                    value={form.marca ?? ''}
                    onChange={(e) => set('marca', e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div className="dm-field">
                  <label>Modello</label>
                  <input
                    className="dm-input"
                    value={form.modello ?? ''}
                    onChange={(e) => set('modello', e.target.value)}
                    placeholder="—"
                  />
                </div>
              </div>
              <div className="dm-field dm-field-full">
                <label>IMEI / Seriale</label>
                <input
                  className="dm-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  value={form.imei ?? ''}
                  onChange={(e) => set('imei', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="dm-field dm-field-full">
                <label>SIM / Numero</label>
                <input
                  className="dm-input"
                  style={{ fontFamily: 'monospace' }}
                  value={form.simNumero ?? ''}
                  onChange={(e) => set('simNumero', e.target.value)}
                  placeholder="—"
                />
              </div>

            </div>
          </div>

          <div className="dm-col-right">
            {/* Tariffa */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>💶</span> Tariffa</div>
              <div className="dm-field dm-field-full">
                <label>Tariffa Mensile (€)</label>
                <input
                  className="dm-input"
                  type="number"
                  step="0.01"
                  style={{ color: 'var(--primary)', fontWeight: 700 }}
                  value={form.tariffaMensile ?? ''}
                  onChange={(e) => set('tariffaMensile', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              {form.tariffaMensile != null && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Annuale stimato: {fmtEur(Number(form.tariffaMensile) * 12)}
                </div>
              )}
            </div>

            {/* Assegnazione corrente */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>👤</span> Assegnazione Corrente</div>
              {attiva ? (
                <div className="dm-assegn-row dm-assegn-attiva">
                  <div>
                    <span className="dm-assegn-nome">{attiva.ragioneSociale}</span>
                    <span className="dm-badge-attiva" style={{ marginLeft: 8 }}>ATTIVA</span>
                  </div>
                  <div className="dm-assegn-date">dal {fmt(attiva.dataInizio)}</div>
                  <button
                    className="btn-outline btn-sm"
                    style={{ color: '#dc2626', borderColor: '#dc2626', marginTop: 8 }}
                    onClick={() => handleChiudiAssegnazione(attiva.id, attiva.ragioneSociale, attiva.dataInizio)}
                  >
                    🔓 Chiudi assegnazione
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nessun padroncino assegnato</span>
                  <button className="btn-primary btn-sm" onClick={() => { setShowAssegna(true); setActiveTab('assegnazioni'); }}>
                    🔗 Assegna Padroncino
                  </button>
                </div>
              )}
            </div>

            {/* Info creazione */}
            <div className="dm-section-card">
              <div className="dm-section-title"><span>📋</span> Info Record</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 0', color: 'var(--text-secondary)' }}>Creato il</td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>{fmt(palmare.createdAt)}</td>
                  </tr>
                  {palmare.imei && (
                    <tr>
                      <td style={{ padding: '4px 0', color: 'var(--text-secondary)' }}>IMEI</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{palmare.imei}</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
            {!attiva && (
              <button className="btn-primary btn-sm" onClick={() => setShowAssegna((v) => !v)}>
                🔗 Nuova Assegnazione
              </button>
            )}
          </div>

          {/* Form nuova assegnazione */}
          {showAssegna && !attiva && (
            <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Padroncino</label>
                  <select
                    className="dm-select"
                    value={assegnaForm.padroncinoId}
                    onChange={(e) => setAssegnaForm((f) => ({ ...f, padroncinoId: e.target.value }))}
                  >
                    <option value="">Seleziona padroncino...</option>
                    {padroncini.filter((p) => p.attivo).map((p) => (
                      <option key={p.id} value={p.id}>{p.ragioneSociale}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Data inizio</label>
                  <input
                    type="date"
                    className="dm-input"
                    value={assegnaForm.dataInizio}
                    onChange={(e) => setAssegnaForm((f) => ({ ...f, dataInizio: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={handleAssegna} disabled={saving}>
                  {saving ? '⏳...' : '🔗 Conferma'}
                </button>
                <button className="btn-outline btn-sm" onClick={() => setShowAssegna(false)}>Annulla</button>
              </div>
            </div>
          )}

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
                      {!a.dataFine && <span className="dm-badge-attiva" style={{ marginLeft: 8 }}>ATTIVA</span>}
                    </div>
                    {!a.dataFine && (
                      <button
                        className="btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#dc2626' }}
                        onClick={() => handleChiudiAssegnazione(a.id, a.ragioneSociale, a.dataInizio)}
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


      {/* ── TAB NOTE ── */}
      {activeTab === 'note' && (
        <div className="dm-tab-body">
          <div className="dm-note-add-form">
            <textarea
              className="dm-note-textarea"
              rows={3}
              placeholder="Aggiungi una nota su questo palmare…"
              value={notaTesto}
              onChange={e => setNotaTesto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNota(); }}
            />
            <div className="dm-note-form-footer">
              <span className="dm-note-hint">Ctrl+Invio per salvare</span>
              <button className="dm-note-submit" onClick={handleAddNota} disabled={notaSaving || !notaTesto.trim()}>
                {notaSaving ? 'Salvo…' : '+ Aggiungi nota'}
              </button>
            </div>
          </div>
          {noteList.length === 0
            ? <div className="dm-note-empty">Nessuna nota registrata.</div>
            : noteList.map(n => (
              <div key={n.id} className={`dm-note-card${n.contenuto.startsWith('[Nota originale]') ? ' dm-note-card-legacy' : ''}`}>
                <div className="dm-note-card-header">
                  <span className="dm-note-avatar">{n.user ? (n.user.nome?.[0] ?? '') + (n.user.cognome?.[0] ?? '') : '?'}</span>
                  <div className="dm-note-card-meta">
                    <span className="dm-note-author">{n.user ? `${n.user.nome} ${n.user.cognome}` : 'Sistema'}</span>
                    <span className="dm-note-ts">{new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <button className="dm-note-del" onClick={() => handleDeleteNota(n.id)} title="Elimina nota">✕</button>
                </div>
                <p className="dm-note-body">{n.contenuto}</p>
              </div>
            ))}
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
    </div>
  );
}
