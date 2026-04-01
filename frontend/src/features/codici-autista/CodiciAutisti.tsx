// src/features/codici-autista/CodiciAutisti.tsx — API reali, senza mock
import { useState, useEffect, useMemo, useCallback } from 'react';
import { codiciAutistaApi } from '../../lib/api';
import type { CodiceAutista, CodiciAutistaStats } from '../../lib/api';
import NuovoCodiceAutistaModal, { NuovoCodiceAutista } from './NuovoCodiceAutistaModal';
import './CodiciAutisti.css';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

export default function CodiciAutisti() {
  const [autisti, setAutisti] = useState<CodiceAutista[]>([]);
  const [stats, setStats] = useState<CodiciAutistaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'TUTTI' | 'DISPONIBILE' | 'ASSEGNATO' | 'DISMESSO'>('TUTTI');
  const [nuovoOpen, setNuovoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([
        codiciAutistaApi.list({ limit: '200' }),
        codiciAutistaApi.stats(),
      ]);
      setAutisti(listResp.data);
      setStats(statsResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return autisti.filter((c) => {
      const attiva = c.assegnazioni?.find((a) => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        c.codice.toLowerCase().includes(s) ||
        (c.nome ?? '').toLowerCase().includes(s) ||
        (c.cognome ?? '').toLowerCase().includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s);

      if (filtro === 'DISPONIBILE') return matchSearch && !attiva && c.attivo;
      if (filtro === 'ASSEGNATO') return matchSearch && !!attiva && c.attivo;
      if (filtro === 'DISMESSO') return matchSearch && !c.attivo;
      return matchSearch;
    });
  }, [autisti, search, filtro]);

  const handleCreate = async (form: NuovoCodiceAutista) => {
    try {
      await codiciAutistaApi.create({
        codice: form.codice,
        nome: form.nome || undefined,
        cognome: form.cognome || undefined,
        note: form.note || undefined,
        tariffaFissa: form.tariffaFissa ? parseFloat(form.tariffaFissa) : undefined,
        tariffaRitiro: form.tariffaRitiro ? parseFloat(form.tariffaRitiro) : undefined,
        target: form.target ? parseInt(form.target) : undefined,
      });
      await load();
    } catch (e: any) {
      alert('Errore creazione codice autista: ' + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo codice autista?')) return;
    try {
      await codiciAutistaApi.delete(id);
      await load();
    } catch (e: any) {
      alert('Errore: ' + e.message);
    }
  };

  if (loading) return (
    <div className="ca-page">
      <div className="ca-loading"><div className="ca-spinner" /><span>Caricamento...</span></div>
    </div>
  );
  if (error) return (
    <div className="ca-page">
      <div className="ca-error">⚠️ {error} <button className="btn-primary btn-sm" onClick={load}>Riprova</button></div>
    </div>
  );

  return (
    <div className="ca-page">
      {/* ── HEADER ── */}
      <div className="ca-header">
        <h1>Cod. Autisti</h1>
        <button className="btn-primary" onClick={() => setNuovoOpen(true)}>+ Nuovo</button>
      </div>

      {/* ── STATS ── */}
      <div className="ca-stats-row">
        <div className="ca-stat-card">
          <div className="ca-stat-icon">👤</div>
          <div>
            <div className="ca-stat-val">{stats?.totali ?? autisti.length}</div>
            <div className="ca-stat-label">TOTALI</div>
            <div className="ca-stat-sub">{stats?.assegnati ?? 0} assegnati</div>
          </div>
        </div>
        <div className="ca-stat-card">
          <div className="ca-stat-icon">👤</div>
          <div>
            <div className="ca-stat-val">{stats?.disponibili ?? 0}</div>
            <div className="ca-stat-label">DISPONIBILI</div>
            <div className="ca-stat-sub">pronti</div>
          </div>
          <div className="ca-stat-expand">⊞</div>
        </div>
        <div className="ca-stat-card">
          <div>
            <div className="ca-stat-val">{fmtEur(stats?.tariffaFissaMedia)}</div>
            <div className="ca-stat-label">TARIFFA FISSA MEDIA</div>
            <div className="ca-stat-sub">media</div>
          </div>
          <div className="ca-stat-expand">⊞</div>
        </div>
        <div className="ca-stat-card">
          <div>
            <div className="ca-stat-val">{fmtEur(stats?.tariffaRitiroMedia)}</div>
            <div className="ca-stat-label">TARIFFA RITIRO MEDIA</div>
            <div className="ca-stat-sub">per ritiro</div>
          </div>
          <div className="ca-stat-expand">⊞</div>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="ca-toolbar">
        <div className="ca-search-wrap">
          <span>🔍</span>
          <input
            className="ca-search"
            placeholder="Cerca codice autista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ca-filters">
          {(['TUTTI', 'DISPONIBILE', 'ASSEGNATO', 'DISMESSO'] as const).map((s) => (
            <button
              key={s}
              className={`ca-filter-btn ${filtro === s ? 'ca-filter-active' : ''}`}
              onClick={() => setFiltro(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABELLA ── */}
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead>
            <tr>
              <th>CODICE ↕</th>
              <th>STATO</th>
              <th>PADRONCINO ↕</th>
              <th>TARIFFA FISSA ↕</th>
              <th>TARIFFA RITIRO</th>
              <th>TARGET ↕</th>
              <th>NOTE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="ca-empty-row">Nessun codice autista trovato</td>
              </tr>
            )}
            {filtered.map((c) => {
              const attiva = c.assegnazioni?.find((a) => !a.dataFine);
              const stato = !c.attivo ? 'DISMESSO' : attiva ? 'ASSEGNATO' : 'DISPONIBILE';
              const statoCls =
                stato === 'ASSEGNATO' ? 'ca-badge-assigned' :
                stato === 'DISPONIBILE' ? 'ca-badge-available' : 'ca-badge-dismesso';
              return (
                <tr key={c.id} className="ca-row">
                  <td>
                    <div className="ca-codice-cell">
                      <span className="ca-codice">{c.codice}</span>
                      {(c.nome || c.cognome) && (
                        <span className="ca-nome-sub">
                          {[c.nome, c.cognome].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`ca-badge ${statoCls}`}>{stato}</span>
                  </td>
                  <td>
                    {attiva ? (
                      <span className="ca-padroncino">{attiva.ragioneSociale}</span>
                    ) : (
                      <span className="ca-empty">—</span>
                    )}
                  </td>
                  <td>
                    {c.tariffaFissa != null ? (
                      <span className="ca-tariffa">{fmtEur(c.tariffaFissa)}</span>
                    ) : (
                      <span className="ca-empty">—</span>
                    )}
                  </td>
                  <td>
                    {c.tariffaRitiro != null ? (
                      <span className="ca-tariffa">{fmtEur(c.tariffaRitiro)}</span>
                    ) : (
                      <span className="ca-empty">—</span>
                    )}
                  </td>
                  <td>
                    {c.target != null ? (
                      <span className="ca-target">{c.target}</span>
                    ) : (
                      <span className="ca-empty">—</span>
                    )}
                  </td>
                  <td>
                    {c.note ? (
                      <span className="ca-note-cell">{c.note}</span>
                    ) : (
                      <span className="ca-empty">—</span>
                    )}
                  </td>
                  <td>
                    <div className="ca-row-actions">
                      <button className="btn-primary btn-sm">Dettagli</button>
                      <button className="ca-doc-btn">📄</button>
                      <button
                        className="ca-del-btn"
                        onClick={() => handleDelete(c.id)}
                        title="Elimina"
                      >✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NuovoCodiceAutistaModal
        open={nuovoOpen}
        onClose={() => setNuovoOpen(false)}
        onSave={handleCreate}
      />
    </div>
  );
}
