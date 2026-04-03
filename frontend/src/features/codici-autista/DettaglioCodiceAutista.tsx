// src/features/codici-autista/DettaglioCodiceAutista.tsx
// BUG 2 FIX: aggiunto form state + handleSave per consentire la modifica dei dati
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { codiciAutistaApi, padronciniApi } from '../../lib/api';
import type { CodiceAutista, Padroncino } from '../../lib/api';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

export default function DettaglioCodiceAutista() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [autista, setAutista] = useState<CodiceAutista | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssegna, setShowAssegna] = useState(false);
  const [assegnaForm, setAssegnaForm] = useState({ padroncinoId: '', dataInizio: '' });
  const [saving, setSaving] = useState(false);

  // ── FIX BUG 2: stato form per modifica ──────────────────
  const [form, setFormState] = useState<Partial<CodiceAutista>>({});
  const [dirty, setDirty] = useState(false);

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
      setFormState(a); // ← popola il form con i dati correnti
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
      await codiciAutistaApi.update(id, {
        nome: form.nome ?? undefined,
        cognome: form.cognome ?? undefined,
        note: form.note ?? undefined,
        tariffaFissa: form.tariffaFissa ?? undefined,
        tariffaRitiro: form.tariffaRitiro ?? undefined,
        target: form.target ?? undefined,
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
      await codiciAutistaApi.assegna(id, assegnaForm);
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
      await codiciAutistaApi.chiudiAssegnazione(assegnazioneId);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
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

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Caricamento autista...
    </div>
  );
  if (error) return (
    <div style={{ padding: 32 }}>
      <div style={{ color: '#dc2626', marginBottom: 16 }}>⚠️ {error}</div>
      <button className="btn-primary" onClick={() => navigate('/codici-autista')}>← Torna ai Cod. Autisti</button>
    </div>
  );
  if (!autista) return null;

  const attiva = autista.assegnazioni?.find((a) => !a.dataFine);
  const storiche = autista.assegnazioni?.filter((a) => a.dataFine) ?? [];
  const nomeCompleto = [autista.nome, autista.cognome].filter(Boolean).join(' ') || '—';

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/codici-autista')}
          style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        >← Cod. Autisti</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🏷️ {autista.codice}</h1>
        {nomeCompleto !== '—' && (
          <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>{nomeCompleto}</span>
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

        {/* ── FIX BUG 2: pulsante Salva ── */}
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

        {/* ── FIX BUG 2: Dati anagrafici EDITABILI ── */}
        <div className="detail-card">
          <h3 className="detail-card-title">📋 Dati Autista</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Codice</label>
              <input
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box', cursor: 'not-allowed' }}
                value={autista.codice}
                readOnly
                title="Il codice non può essere modificato"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Nome</label>
                <input
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  value={form.nome ?? ''}
                  onChange={(e) => set('nome', e.target.value || null)}
                  placeholder="—"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Cognome</label>
                <input
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  value={form.cognome ?? ''}
                  onChange={(e) => set('cognome', e.target.value || null)}
                  placeholder="—"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Tariffa fissa (€)</label>
                <input
                  type="number" step="0.01"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--primary)', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                  value={form.tariffaFissa ?? ''}
                  onChange={(e) => set('tariffaFissa', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Tariffa ritiro (€)</label>
                <input
                  type="number" step="0.01"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--primary)', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                  value={form.tariffaRitiro ?? ''}
                  onChange={(e) => set('tariffaRitiro', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Target</label>
              <input
                type="number" step="1"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                value={form.target ?? ''}
                onChange={(e) => set('target', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="—"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Note</label>
              <textarea
                rows={2}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                value={form.note ?? ''}
                onChange={(e) => set('note', e.target.value || null)}
                placeholder="Note aggiuntive…"
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Creato il {fmt(autista.createdAt)}
            </div>
          </div>
        </div>

        {/* ── Assegnazione attiva ── */}
        <div className="detail-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="detail-card-title" style={{ margin: 0 }}>👤 Padroncino Assegnato</h3>
            {!attiva && (
              <button className="btn-primary btn-sm" onClick={() => setShowAssegna((v) => !v)}>+ Assegna</button>
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
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Nessun padroncino assegnato</div>
          )}

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
