import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchApi, SearchEntityType, SearchResponse } from '../../lib/search.api';
import { Page, PageHeader, Card, CardHead, IconButton, SegTabs, Empty, Alert, Icon, C, type IconName } from '../../components/ds';
import './Ricerca2.css';

const TIPO_ICONA: Record<string, IconName> = {
  padroncino: 'pad', mezzo: 'mezzi', palmare: 'palm', codiceAutista: 'cod', conteggio: 'cont', rigaConteggio: 'doc',
  acconto: 'acconti', ricarica: 'ric', documento: 'doc', nota: 'note',
};
const TIPO_COLORE: Record<string, string> = {
  padroncino: C.purple, mezzo: C.green, palmare: C.teal, codiceAutista: C.orange, conteggio: C.blue, rigaConteggio: C.blue,
  acconto: C.yellow, ricarica: C.green, documento: C.gray, nota: C.yellow,
};

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
      <mark className="rc2-mark">{text.slice(i, i + q.length)}</mark>
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
    <Page>
      <PageHeader eyebrow="Ricerca" title="Ricerca globale" sub="Padroncini, mezzi, palmari, codici, conteggi e relative righe, note, acconti, ricariche e documenti" />

      <Card pad>
        <div className="rc2-bar">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            placeholder="Cerca una parola, una targa, un nome, un IBAN, una nota… (almeno 2 caratteri)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Cerca"
          />
          {q && <IconButton icon="close" label="Pulisci" onClick={() => setQ('')} />}
        </div>
        {data && data.total > 0 && (
          <div className="rc2-filters">
            <SegTabs pill label="Categoria" value={filter} onChange={setFilter} items={[
              { value: 'TUTTI' as const, label: 'Tutti', count: data.total },
              ...ALL_TYPES.filter((t) => data.groups[t]).map((t) => ({ value: t, label: data.groups[t].label, count: data.groups[t].hits.length })),
            ]} />
          </div>
        )}
      </Card>

      {q.trim().length > 0 && q.trim().length < 2 && <Empty>Inserisci almeno 2 caratteri…</Empty>}
      {loading && <Empty>Ricerca in corso…</Empty>}
      {error && <Alert tone="ko" title="Errore">{error}</Alert>}
      {data && data.total === 0 && !loading && <Card pad><Empty>Nessun risultato per “{data.query}”.</Empty></Card>}

      {data && data.total > 0 && (<>
        <span className="ds-cardsub">{totalShown} risultati per “{data.query}”</span>
        {visibleGroups.map(([type, group]) => (
          <Card key={type}>
            <div className="rc2-gh">
              <span className="rc2-gi" style={{ background: TIPO_COLORE[type] ?? C.gray }}><Icon name={TIPO_ICONA[type] ?? 'doc'} size={13} /></span>
              <h3>{group.label}</h3>
              <span className="rc2-gc">{group.hits.length}</span>
            </div>
            <div className="rc2-hits">
              {group.hits.map((h) => (
                <Link key={`${h.entityType}-${h.entityId}`} to={h.href} className="rc2-hit">
                  <div className="rc2-main">
                    <div className="rc2-title">{highlight(h.title, data.query)}</div>
                    <div className="rc2-snip"><span>{h.field}:</span> {highlight(h.snippet, data.query)}</div>
                  </div>
                  {h.meta && (
                    <div className="rc2-meta">
                      {Object.entries(h.meta).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean').slice(0, 3)
                        .map(([k, v]) => <span key={k}>{String(v)}</span>)}
                    </div>
                  )}
                  <Icon name="chevRight" size={14} />
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </>)}

      {!q && !data && (
        <Card pad>
          <CardHead title="Cosa si può cercare" />
          <ul className="rc2-tips">
            <li><b>Targa</b> di un mezzo, ad esempio <code>GR507EZ</code></li>
            <li><b>Codice palmare</b> o <b>IMEI</b></li>
            <li><b>Partita IVA</b>, <b>IBAN</b>, <b>email</b> di un padroncino</li>
            <li>Testo libero nelle <b>note</b> dei conteggi, dei mezzi e dei padroncini</li>
            <li><b>Descrizioni delle righe</b> dentro i conteggi mensili</li>
          </ul>
        </Card>
      )}
    </Page>
  );
}
