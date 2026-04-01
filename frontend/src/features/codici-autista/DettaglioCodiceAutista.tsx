// src/features/codici-autista/DettaglioCodiceAutista.tsx
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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [a, pResp] = await Promise.all([
        codiciAutistaApi.detail(id),
        padronciniApi.list({ limit: '200' }),
      ]);
      setAutista(a);
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
            marginLeft: 'auto',
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: autista.attivo ? '#fee2e2' : 'rgba(34,197,94,.12)',
            color: autista.attivo ? '#dc2626' : '#16a34a',
            border: autista.attivo ? '1px solid #fca5a5' : '1px solid #86efac',
            borderRadius: 8, cursor: 'pointer',
          }}
        >
          {autista.attivo ? 'Disattiva' : 'Attiva'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Dati anagrafici ── */}
        <div className="detail-card">
          <h3 className="detail-card-title">📋 Dati Autista</h3>
          <table className="detail-table">
            <tbody>
              <tr><td>Codice</td><td><strong style={{ fontFamily: 'monospace' }}>{autista.codice}</strong></td></tr>
              <tr><td>Nome</td><td>{autista.nome || '—'}</td></tr>
              <tr><td>Cognome</td><td>{autista.cognome || '—'}</td></tr>
              <tr><td>Tariffa fissa</td><td><strong style={{ color: 'var(--primary)' }}>{fmtEur(autista.tariffaFissa)}</strong></td></tr>
              <tr><td>Tariffa ritiro</td><td><strong style={{ color: 'var(--primary)' }}>{fmtEur(autista.tariffaRitiro)}</strong></td></tr>
              <tr><td>Target</td><td>{autista.target != null ? autista.target : '—'}</td></tr>
              <tr><td>Creato il</td><td>{fmt(autista.createdAt)}</td></tr>
              {autista.note && (
                <tr><td>Note</td><td style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{autista.note}</td></tr>
              )}
            </tbody>
          </table>
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
        .detail-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .detail-card-title { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin: 0 0 14px 0; }
        .detail-table { width: 100%; border-collapse: collapse; }
        .detail-table td { padding: 7px 0; font-size: 13px; color: var(--text-primary); border-bottom: 1px solid var(--border); }
        .detail-table td:first-child { color: var(--text-muted); font-weight: 500; width: 45%; padding-right: 12px; }
        .btn-primary { padding: 8px 18px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .btn-sm { padding: 5px 12px; font-size: 12px; }
      `}</style>
    </div>
  );
}
