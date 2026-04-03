// src/features/palmari/DettaglioPalmare.tsx
// BUG 2 FIX: aggiunto form state + handleSave per consentire la modifica dei dati
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { palmariApi, padronciniApi } from '../../lib/api';
import type { Palmare, Padroncino } from '../../lib/api';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_META: Record<string, { label: string; cls: string }> = {
  DISPONIBILE: { label: 'Disponibile', cls: 'badge-green' },
  ASSEGNATO:   { label: 'Assegnato',   cls: 'badge-blue' },
  GUASTO:      { label: 'Guasto',      cls: 'badge-red' },
  DISMESSO:    { label: 'Dismesso',    cls: 'badge-gray' },
};

export default function DettaglioPalmare() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [palmare, setPalmare] = useState<Palmare | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assegnaForm, setAssegnaForm] = useState({ padroncinoId: '', dataInizio: '' });
  const [showAssegna, setShowAssegna] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── FIX BUG 2: stato form per modifica ──────────────────
  const [form, setFormState] = useState<Partial<Palmare>>({});
  const [dirty, setDirty] = useState(false);

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
      setFormState(p); // ← popola il form con i dati del palmare
      setDirty(false);
      setPadroncini(pResp.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── FIX BUG 2: salvataggio modifiche ──────────────────────
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

  const handleChiudiAssegnazione = async (assegnazioneId: string) => {
    if (!confirm('Chiudere l\'assegnazione corrente?')) return;
    try {
      await palmariApi.chiudiAssegnazione(assegnazioneId);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Caricamento palmare...
    </div>
  );
  if (error) return (
    <div style={{ padding: 32 }}>
      <div style={{ color: '#dc2626', marginBottom: 16 }}>⚠️ {error}</div>
      <button className="btn-primary" onClick={() => navigate('/palmari')}>← Torna ai Palmari</button>
    </div>
  );
  if (!palmare) return null;

  const attiva = palmare.assegnazioni?.find((a) => !a.dataFine);
  const storiche = palmare.assegnazioni?.filter((a) => a.dataFine) ?? [];
  const meta = STATO_META[palmare.stato] || { label: palmare.stato, cls: 'badge-gray' };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/palmari')}
          style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        >← Palmari</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📱 {palmare.codice}</h1>
        <span className={`palm-badge ${meta.cls}`} style={{ fontSize: 12 }}>{meta.label.toUpperCase()}</span>

        {/* ── FIX BUG 2: pulsante Salva in header ── */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && (
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 13 }}
            >
              {saving ? '⏳ Salvataggio...' : '💾 Salva Modifiche'}
            </button>
          )}
          {!dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>✓ Salvato</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── FIX BUG 2: Scheda anagrafica EDITABILE ── */}
        <div className="detail-card">
          <h3 className="detail-card-title">📋 Dati Palmare</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Codice</label>
              <input
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, boxSizing: 'border-box' }}
                value={form.codice ?? ''}
                onChange={(e) => set('codice', e.target.value.toUpperCase())}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Marca</label>
                <input
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  value={form.marca ?? ''}
                  onChange={(e) => set('marca', e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Modello</label>
                <input
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  value={form.modello ?? ''}
                  onChange={(e) => set('modello', e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>IMEI / Seriale</label>
              <input
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
                value={form.imei ?? ''}
                onChange={(e) => set('imei', e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>SIM / Numero</label>
              <input
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                value={form.simNumero ?? ''}
                onChange={(e) => set('simNumero', e.target.value)}
                placeholder="—"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Tariffa mensile (€)</label>
                <input
                  type="number" step="0.01"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--primary)', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                  value={form.tariffaMensile ?? ''}
                  onChange={(e) => set('tariffaMensile', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Stato</label>
                <select
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
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
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Note</label>
              <textarea
                rows={2}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                value={form.note ?? ''}
                onChange={(e) => set('note', e.target.value)}
                placeholder="Note aggiuntive…"
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Creato il {fmt(palmare.createdAt)}
            </div>
          </div>
        </div>

        {/* ── Assegnazione attiva ── */}
        <div className="detail-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="detail-card-title" style={{ margin: 0 }}>👤 Assegnazione Corrente</h3>
            {!attiva && (
              <button
                className="btn-primary btn-sm"
                onClick={() => setShowAssegna((v) => !v)}
              >+ Assegna</button>
            )}
          </div>

          {attiva ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                {attiva.ragioneSociale}
              </div>
              <table className="detail-table">
                <tbody>
                  <tr><td>Data inizio</td><td>{fmt(attiva.dataInizio)}</td></tr>
                  <tr><td>Fine prevista</td><td>{attiva.dataFine ? fmt(attiva.dataFine) : 'In corso'}</td></tr>
                </tbody>
              </table>
              <button
                className="btn-sm"
                style={{ marginTop: 12, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                onClick={() => handleChiudiAssegnazione(attiva.id)}
              >Chiudi assegnazione</button>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Nessuna assegnazione attiva</div>
          )}

          {/* Form assegna */}
          {showAssegna && !attiva && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Padroncino</label>
                <select
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                  value={assegnaForm.padroncinoId}
                  onChange={(e) => setAssegnaForm((f) => ({ ...f, padroncinoId: e.target.value }))}
                >
                  <option value="">Seleziona padroncino...</option>
                  {padroncini.filter(p => p.attivo).map((p) => (
                    <option key={p.id} value={p.id}>{p.ragioneSociale}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Data inizio</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                  value={assegnaForm.dataInizio}
                  onChange={(e) => setAssegnaForm((f) => ({ ...f, dataInizio: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={handleAssegna} disabled={saving}>
                  {saving ? '⏳...' : '🔗 Conferma'}
                </button>
                <button className="btn-outline btn-sm" onClick={() => setShowAssegna(false)}>Annulla</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Storico assegnazioni ── */}
        {storiche.length > 0 && (
          <div className="detail-card" style={{ gridColumn: '1 / -1' }}>
            <h3 className="detail-card-title">📜 Storico Assegnazioni</h3>
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Padroncino</th>
                  <th>Data inizio</th>
                  <th>Data fine</th>
                </tr>
              </thead>
              <tbody>
                {storiche.map((a) => (
                  <tr key={a.id}>
                    <td>{a.ragioneSociale}</td>
                    <td>{fmt(a.dataInizio)}</td>
                    <td>{fmt(a.dataFine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
