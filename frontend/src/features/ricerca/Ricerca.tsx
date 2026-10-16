import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchApi, SearchEntityType, SearchResponse } from '../../lib/search.api';
import './Ricerca.css';

const ALL_TYPES: SearchEntityType[] = [
  'padroncino',
  'mezzo',
  'palmare',
  'codiceAutista',
  'conteggio',
  'rigaConteggio',
  'acconto',
  'ricarica',
  'documento',
  'nota',
];

function highlight(text: string, q: string) {
  if (!q || q.length < 2) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="ricerca-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function Ricerca() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SearchEntityType | 'TUTTI'>('TUTTI');
  const inputRef = useRef<HTMLInputElement>(null);

  // autofocus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // debounce 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // sincronizza url
  useEffect(() => {
    if (debounced) setParams({ q: debounced }, { replace: true });
    else setParams({}, { replace: true });
  }, [debounced, setParams]);

  // fetch
  useEffect(() => {
    if (debounced.trim().length < 2) {
      setData(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    searchApi
      .search(debounced.trim())
      .then((res) => { if (alive) setData(res); })
      .catch((e) => { if (alive) setError(e.message || 'Errore ricerca'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [debounced]);

  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const entries = Object.entries(data.groups);
    if (filter === 'TUTTI') return entries;
    return entries.filter(([k]) => k === filter);
  }, [data, filter]);

  const totalShown = useMemo(
    () => visibleGroups.reduce((s, [, g]) => s + g.hits.length, 0),
    [visibleGroups],
  );

  return (
    <div className="ricerca-page">
      <div className="ricerca-header">
        <h1>🔍 Ricerca Globale</h1>
        <span className="ricerca-sub">
          Cerca su padroncini, mezzi, palmari, codici, conteggi, righe, note, acconti, ricariche, documenti.
        </span>
      </div>

      <div className="ricerca-searchbar">
        <span className="ricerca-icon">🔍</span>
        <input
          ref={inputRef}
          className="ricerca-input"
          placeholder="Cerca una parola, una targa, un nome, un IBAN, una nota…  (min. 2 caratteri)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button className="ricerca-clear" onClick={() => setQ('')} title="Pulisci">✕</button>
        )}
      </div>

      {/* Stato */}
      {q.trim().length > 0 && q.trim().length < 2 && (
        <div className="ricerca-empty">Inserisci almeno 2 caratteri…</div>
      )}
      {loading && <div className="ricerca-empty">Ricerca in corso…</div>}
      {error && <div className="ricerca-error">⚠ {error}</div>}

      {data && data.total === 0 && !loading && (
        <div className="ricerca-empty">
          Nessun risultato per <strong>"{data.query}"</strong>.
        </div>
      )}

      {/* Filtri categoria */}
      {data && data.total > 0 && (
        <>
          <div className="ricerca-filters">
            <button
              className={`ricerca-chip ${filter === 'TUTTI' ? 'is-active' : ''}`}
              onClick={() => setFilter('TUTTI')}
            >
              Tutti <span className="ricerca-chip-count">{data.total}</span>
            </button>
            {ALL_TYPES.map((t) => {
              const g = data.groups[t];
              if (!g) return null;
              return (
                <button
                  key={t}
                  className={`ricerca-chip ${filter === t ? 'is-active' : ''}`}
                  onClick={() => setFilter(t)}
                >
                  <span className="ricerca-chip-icon">{g.icon}</span>
                  {g.label}
                  <span className="ricerca-chip-count">{g.hits.length}</span>
                </button>
              );
            })}
          </div>

          <div className="ricerca-meta">
            {totalShown} risultati visualizzati per <strong>"{data.query}"</strong>
          </div>

          {/* Risultati raggruppati */}
          <div className="ricerca-groups">
            {visibleGroups.map(([type, group]) => (
              <div key={type} className="ricerca-group">
                <div className="ricerca-group-header">
                  <span className="ricerca-group-icon">{group.icon}</span>
                  <h3>{group.label}</h3>
                  <span className="ricerca-group-count">{group.hits.length}</span>
                </div>
                <div className="ricerca-hits">
                  {group.hits.map((h) => (
                    <Link
                      key={`${h.entityType}-${h.entityId}`}
                      to={h.href}
                      className="ricerca-hit"
                    >
                      <div className="ricerca-hit-main">
                        <div className="ricerca-hit-title">
                          {highlight(h.title, data.query)}
                        </div>
                        <div className="ricerca-hit-snippet">
                          <span className="ricerca-hit-field">{h.field}:</span>{' '}
                          {highlight(h.snippet, data.query)}
                        </div>
                      </div>
                      {h.meta && (
                        <div className="ricerca-hit-meta">
                          {Object.entries(h.meta)
                            .filter(([, v]) => v !== null && v !== undefined && v !== '')
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <span key={k} className="ricerca-hit-tag">
                                {String(v)}
                              </span>
                            ))}
                        </div>
                      )}
                      <span className="ricerca-hit-arrow">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!q && !data && (
        <div className="ricerca-hint">
          <p>💡 Suggerimenti:</p>
          <ul>
            <li>Cerca per <strong>targa</strong> (es. <code>GR507EZ</code>)</li>
            <li>Cerca per <strong>codice palmare</strong> o <strong>IMEI</strong></li>
            <li>Cerca per <strong>partita IVA</strong>, <strong>IBAN</strong>, <strong>email</strong></li>
            <li>Cerca testo libero nelle <strong>note dei conteggi</strong>, dei mezzi, dei padroncini</li>
            <li>Cerca <strong>descrizioni di righe</strong> dentro i conteggi mensili</li>
          </ul>
        </div>
      )}
    </div>
  );
}
