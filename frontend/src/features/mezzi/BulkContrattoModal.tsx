// BulkContrattoModal.tsx — Genera contratti PDA per più mezzi selezionati
import { useState, useEffect, useCallback } from 'react';
import { mezziApi, padronciniApi } from '../../lib/api';
import type { Mezzo, Padroncino } from '../../lib/api';
import '../../components/ui/BulkAssignModal.css';

// ─── TIPI ──────────────────────────────────────────────
export interface BulkContrattoModalProps {
  open: boolean;
  onClose: () => void;
  /** Mezzi selezionati */
  mezzi: Mezzo[];
}

type Phase = 'form' | 'generating' | 'result';

interface ContrattoResult {
  targa: string;
  status: 'ok' | 'error';
  error?: string;
}

// ─── COMPONENTE ────────────────────────────────────────
export default function BulkContrattoModal({ open, onClose, mezzi }: BulkContrattoModalProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [results, setResults] = useState<ContrattoResult[]>([]);

  // Padroncini
  const [padronciniList, setPadronciniList] = useState<Padroncino[]>([]);
  const [loadingPadroncini, setLoadingPadroncini] = useState(false);
  const [padroncinoId, setPadroncinoId] = useState('');
  const [search, setSearch] = useState('');

  // Dati rappresentante
  const [nomeRapp, setNomeRapp] = useState('');
  const [cognomeRapp, setCognomeRapp] = useState('');
  const [cfRapp, setCfRapp] = useState('');
  const [qualificaRapp, setQualificaRapp] = useState('Amministratore Unico');

  const [errMsg, setErrMsg] = useState('');

  // Carica padroncini
  useEffect(() => {
    if (!open) return;
    setLoadingPadroncini(true);
    padronciniApi.list({ limit: '500' })
      .then((r) => setPadronciniList(r.data))
      .catch(() => {})
      .finally(() => setLoadingPadroncini(false));
  }, [open]);

  // Reset all'apertura
  useEffect(() => {
    if (open) {
      setPhase('form');
      setResults([]);
      setErrMsg('');

      // Pre-seleziona padroncino se tutti i mezzi selezionati hanno la stessa assegnazione attiva
      const padIds = mezzi
        .map((m) => m.assegnazioni?.find((a) => !a.dataFine)?.padroncino.id)
        .filter(Boolean);
      const allSame = padIds.length === mezzi.length && new Set(padIds).size === 1;
      if (allSame && padIds[0]) {
        setPadroncinoId(padIds[0]!);
      } else {
        setPadroncinoId('');
        setSearch('');
      }
    }
  }, [open, mezzi]);

  // Auto-fill dati rappresentante — dipende anche da padronciniList
  // così si riesegue quando la lista viene caricata dopo la pre-selezione
  const padroncinoSel = padronciniList.find((p) => p.id === padroncinoId) ?? null;
  useEffect(() => {
    if (!padroncinoSel) return;
    if (padroncinoSel.rappresentanteNome)      setNomeRapp(padroncinoSel.rappresentanteNome);
    if (padroncinoSel.rappresentanteCognome)   setCognomeRapp(padroncinoSel.rappresentanteCognome);
    if (padroncinoSel.cfRappresentante)        setCfRapp(padroncinoSel.cfRappresentante);
    if (padroncinoSel.qualificaRappresentante) setQualificaRapp(padroncinoSel.qualificaRappresentante);
    setSearch(padroncinoSel.ragioneSociale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padroncinoId, padronciniList]);

  const filteredPadroncini = padronciniList.filter((p) =>
    p.ragioneSociale.toLowerCase().includes(search.toLowerCase()) ||
    p.partitaIva.includes(search),
  );

  const handleGenera = useCallback(async () => {
    if (!padroncinoId) { setErrMsg('Seleziona un padroncino'); return; }
    setErrMsg('');
    setPhase('generating');

    const res: ContrattoResult[] = [];

    // Genera i contratti in sequenza (evita download paralleli che confondono il browser)
    for (const mezzo of mezzi) {
      const assAttiva = mezzo.assegnazioni?.find((a) => !a.dataFine);
      // Usa dataInizio assegnazione corrente come data firma, oppure oggi
      const dataFirma = assAttiva?.dataInizio
        ? assAttiva.dataInizio.split('T')[0]
        : new Date().toISOString().split('T')[0];

      try {
        await mezziApi.generaContrattoPda(mezzo.id, {
          padroncinoId,
          nomeRapp: nomeRapp || undefined,
          cognomeRapp: cognomeRapp || undefined,
          cfRapp: cfRapp || undefined,
          qualificaRapp: qualificaRapp || undefined,
          dataFirma,
          rataNoleggio: mezzo.rataNoleggio ?? undefined,
          _targa: mezzo.targa,
          _ragioneSociale: padroncinoSel?.ragioneSociale,
        });
        res.push({ targa: mezzo.targa, status: 'ok' });
      } catch (e: any) {
        res.push({ targa: mezzo.targa, status: 'error', error: e.message });
      }
    }

    setResults(res);
    setPhase('result');
  }, [padroncinoId, nomeRapp, cognomeRapp, cfRapp, qualificaRapp, mezzi, padroncinoSel]);

  if (!open) return null;

  const okCount = results.filter((r) => r.status === 'ok').length;
  const errCount = results.filter((r) => r.status === 'error').length;

  return (
    <div className="bulk-overlay">
      <div
        className="bulk-modal"
        style={{ width: 640, maxWidth: 'calc(100vw - 32px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bulk-header">
          <div className="bulk-title">
            <span className="bulk-title-icon">📄</span>
            <div>
              <h3>Genera contratti PDA</h3>
              <p className="bulk-subtitle">
                {mezzi.length} mezzo/i selezionati — un file PDF per ciascuno
              </p>
            </div>
          </div>
          <button className="bulk-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="bulk-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          {/* FASE FORM */}
          {phase === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Lista mezzi selezionati */}
              <div style={{
                background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-secondary))',
                border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))',
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
                  Mezzi selezionati
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {mezzi.map((m) => {
                    const ass = m.assegnazioni?.find((a) => !a.dataFine);
                    return (
                      <div key={m.id} style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 10px', fontSize: 12,
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{m.targa}</span>
                        {ass && (
                          <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                            · {ass.padroncino.ragioneSociale}
                          </span>
                        )}
                        {ass?.dataInizio && (
                          <span style={{ color: 'var(--primary)', marginLeft: 6, fontSize: 11 }}>
                            dal {new Date(ass.dataInizio).toLocaleDateString('it-IT')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cerca padroncino */}
              <div>
                <label className="bulk-label" style={{ display: 'block', marginBottom: 6 }}>
                  PDA (Padroncino) *
                </label>
                <input
                  className="bulk-input"
                  placeholder={loadingPadroncini ? 'Caricamento...' : 'Cerca padroncino...'}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPadroncinoId(''); }}
                  disabled={loadingPadroncini}
                />
                {search && !padroncinoId && filteredPadroncini.length > 0 && (
                  <div style={{
                    border: '1px solid var(--border)', borderRadius: 8, marginTop: 4,
                    maxHeight: 180, overflowY: 'auto', background: 'var(--bg-card)',
                    boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                  }}>
                    {filteredPadroncini.slice(0, 20).map((p) => (
                      <div
                        key={p.id}
                        onMouseDown={() => { setPadroncinoId(p.id); setSearch(p.ragioneSociale); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        className="bulk-dropdown-item"
                      >
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.ragioneSociale}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{p.partitaIva}</span>
                      </div>
                    ))}
                  </div>
                )}
                {padroncinoSel && (
                  <div style={{ fontSize: 12, color: 'var(--success, #22c55e)', marginTop: 4, fontWeight: 500 }}>
                    ✅ {padroncinoSel.ragioneSociale} · P.IVA {padroncinoSel.partitaIva}
                  </div>
                )}
              </div>

              {/* Rappresentante legale */}
              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Rappresentante Legale Noleggiante
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="bulk-label" style={{ display: 'block', marginBottom: 4 }}>Nome</label>
                    <input className="bulk-input" value={nomeRapp} onChange={(e) => setNomeRapp(e.target.value)} />
                  </div>
                  <div>
                    <label className="bulk-label" style={{ display: 'block', marginBottom: 4 }}>Cognome</label>
                    <input className="bulk-input" value={cognomeRapp} onChange={(e) => setCognomeRapp(e.target.value)} />
                  </div>
                  <div>
                    <label className="bulk-label" style={{ display: 'block', marginBottom: 4 }}>Codice Fiscale</label>
                    <input className="bulk-input" style={{ fontFamily: 'monospace', fontSize: 12 }}
                      value={cfRapp} onChange={(e) => setCfRapp(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className="bulk-label" style={{ display: 'block', marginBottom: 4 }}>Qualifica</label>
                    <select className="bulk-input" value={qualificaRapp} onChange={(e) => setQualificaRapp(e.target.value)}>
                      <option>Amministratore Unico</option>
                      <option>Legale Rappresentante</option>
                      <option>Socio</option>
                      <option>Titolare</option>
                      <option>Procuratore</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 0' }}>
                ℹ️ La rata noleggio e i km vengono presi da ciascun mezzo. La data firma = data inizio assegnazione corrente.
              </div>

              {errMsg && (
                <div style={{ fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,.06)', borderRadius: 6, padding: '8px 12px' }}>
                  ⚠️ {errMsg}
                </div>
              )}
            </div>
          )}

          {/* FASE GENERATING */}
          {phase === 'generating' && (
            <div className="bulk-loading">
              <div className="bulk-spinner" />
              <p>Generazione contratti in corso… ({mezzi.length} PDF)</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                I file vengono scaricati uno alla volta
              </p>
            </div>
          )}

          {/* FASE RESULT */}
          {phase === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36 }}>{errCount === 0 ? '✅' : '⚠️'}</div>
                <p style={{ fontWeight: 700, fontSize: 16, margin: '8px 0 4px', color: 'var(--text-primary)' }}>
                  {errCount === 0 ? 'Tutti i contratti generati!' : 'Completato con avvisi'}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                  <div className="bulk-result-stat bulk-result-stat-ok">
                    <span className="bulk-result-val">{okCount}</span>
                    <span className="bulk-result-lbl">PDF scaricati</span>
                  </div>
                  {errCount > 0 && (
                    <div className="bulk-result-stat bulk-result-stat-err">
                      <span className="bulk-result-val">{errCount}</span>
                      <span className="bulk-result-lbl">Errori</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {results.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px', borderBottom: '1px solid var(--border)',
                    background: r.status === 'error' ? 'rgba(239,68,68,.04)' : 'transparent',
                  }}>
                    <span>{r.status === 'ok' ? '✅' : '❌'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{r.targa}</span>
                    {r.error && <span style={{ fontSize: 12, color: '#ef4444' }}>{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bulk-footer">
          {phase === 'form' && (
            <>
              <button className="btn-outline" onClick={onClose}>Annulla</button>
              <button
                className="btn-primary"
                onClick={handleGenera}
                disabled={!padroncinoId || mezzi.length === 0}
              >
                📄 Genera {mezzi.length} contratto/i
              </button>
            </>
          )}
          {phase === 'generating' && (
            <button className="btn-outline" disabled>⏳ Generazione...</button>
          )}
          {phase === 'result' && (
            <button className="btn-primary" onClick={onClose}>Chiudi</button>
          )}
        </div>
      </div>
    </div>
  );
}
