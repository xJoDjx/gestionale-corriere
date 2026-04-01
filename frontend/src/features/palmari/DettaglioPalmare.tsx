// src/features/palmari/DettaglioPalmare.tsx
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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, pResp] = await Promise.all([
        palmariApi.detail(id),
        padronciniApi.list({ limit: '200' }),
      ]);
      setPalmare(p);
      setPadroncini(pResp.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Scheda anagrafica ── */}
        <div className="detail-card">
          <h3 className="detail-card-title">📋 Dati Palmare</h3>
          <table className="detail-table">
            <tbody>
              <tr><td>Codice</td><td><strong>{palmare.codice}</strong></td></tr>
              <tr><td>Marca</td><td>{palmare.marca || '—'}</td></tr>
              <tr><td>Modello</td><td>{palmare.modello || '—'}</td></tr>
              <tr><td>IMEI</td><td style={{ fontFamily: 'monospace' }}>{palmare.imei || '—'}</td></tr>
              <tr><td>SIM</td><td style={{ fontFamily: 'monospace' }}>{palmare.simNumero || '—'}</td></tr>
              <tr><td>Tariffa mensile</td><td><strong style={{ color: 'var(--primary)' }}>{fmtEur(palmare.tariffaMensile)}</strong></td></tr>
              <tr><td>Creato il</td><td>{fmt(palmare.createdAt)}</td></tr>
              {palmare.note && <tr><td>Note</td><td style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{palmare.note}</td></tr>}
            </tbody>
          </table>
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
                  {saving ? 'Salvo...' : 'Conferma'}
                </button>
                <button
                  className="btn-sm"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                  onClick={() => setShowAssegna(false)}
                >Annulla</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Storico assegnazioni ── */}
      {storiche.length > 0 && (
        <div className="detail-card" style={{ marginTop: 16 }}>
          <h3 className="detail-card-title">📜 Storico Assegnazioni</h3>
          <table className="detail-table" style={{ width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>PADRONCINO</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>INIZIO</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>FINE</th>
              </tr>
            </thead>
            <tbody>
              {storiche.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.ragioneSociale}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{fmt(a.dataInizio)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{fmt(a.dataFine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .detail-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .detail-card-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: .05em;
          margin: 0 0 14px 0;
        }
        .detail-table { width: 100%; border-collapse: collapse; }
        .detail-table td {
          padding: 7px 0;
          font-size: 13px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border);
        }
        .detail-table td:first-child {
          color: var(--text-muted);
          font-weight: 500;
          width: 45%;
          padding-right: 12px;
        }
        .palm-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .04em;
        }
        .badge-blue   { background: rgba(59,130,246,.12); color: #2563eb; }
        .badge-green  { background: rgba(34,197,94,.12);  color: #16a34a; }
        .badge-red    { background: rgba(239,68,68,.12);  color: #dc2626; }
        .badge-gray   { background: rgba(100,116,139,.12); color: #64748b; }
        .btn-primary { padding: 8px 18px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-sm { padding: 5px 12px; font-size: 12px; }
      `}</style>
    </div>
  );
}
