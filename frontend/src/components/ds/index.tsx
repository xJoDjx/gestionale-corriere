// Componenti condivisi del restyling. Solo presentazione: nessuna logica di calcolo.
import { ReactNode, useMemo, useState, ButtonHTMLAttributes, CSSProperties } from 'react';
import { Icon, IconName } from './icons';
import './ds.css';

export { Icon, ICONS } from './icons';
export type { IconName } from './icons';

/** Colori dei riquadri categoria. */
export const C = {
  blue: '#3D63F0', green: '#15A06A', orange: '#EA6A2A', purple: '#7C5CF0',
  red: '#DC4446', teal: '#0E9494', yellow: '#D49400', gray: '#52525B', ink: '#0B0B0C',
} as const;

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ─── Layout ────────────────────────────────────
export function Page({ children }: { children: ReactNode }) {
  return <div className="ds-page">{children}</div>;
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ds-pagehead">
      <div className="ds-pagehead-text">
        {eyebrow && <span className="ds-eyebrow">{eyebrow}</span>}
        <h1 className="ds-h1">{title}</h1>
        {sub && <p className="ds-sub">{sub}</p>}
      </div>
      {actions && <div className="ds-actions">{actions}</div>}
    </header>
  );
}

export function Card({ children, pad, className, style, id }: { children: ReactNode; pad?: boolean; className?: string; style?: CSSProperties; id?: string }) {
  return <section id={id} className={cx('ds-card', pad && 'ds-card-pad', className)} style={style}>{children}</section>;
}

export function CardHead({ title, sub, actions, tile, bar }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; tile?: { color: string; icon: IconName }; bar?: boolean }) {
  return (
    <div className={cx('ds-cardhead', bar && 'ds-cardhead-bar')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        {tile && <Tile color={tile.color} icon={tile.icon} size="md" />}
        <div className="ds-cardhead-text">
          <h2 className="ds-h2">{title}</h2>
          {sub && <span className="ds-cardsub">{sub}</span>}
        </div>
      </div>
      {actions && <div className="ds-actions">{actions}</div>}
    </div>
  );
}

export function Tile({ color, icon, size = 'sm' }: { color: string; icon: IconName; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 17 : size === 'md' ? 12 : 11;
  return (
    <span aria-hidden="true" className={cx('ds-tile', size === 'md' && 'ds-tile-md', size === 'lg' && 'ds-tile-lg')} style={{ background: color }}>
      <Icon name={icon} size={px} stroke={2.6} />
    </span>
  );
}

// ─── Pulsanti ──────────────────────────────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName; variant?: 'default' | 'primary' | 'blue' | 'danger'; size?: 'md' | 'sm';
};
export function Button({ icon, variant = 'default', size = 'md', className, children, type, ...rest }: BtnProps) {
  return (
    <button
      type={type || 'button'}
      className={cx('ds-btn', variant !== 'default' && `ds-btn-${variant}`, size === 'sm' && 'ds-btn-sm', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 14} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, danger, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('ds-iconbtn', danger && 'ds-iconbtn-danger', className)} {...rest}>
      <Icon name={icon} size={14} />
    </button>
  );
}

// ─── Campi ─────────────────────────────────────
export function SearchBox({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number }) {
  return (
    <label className="ds-search" style={width ? { minWidth: width } : undefined}>
      <Icon name="search" size={13} />
      <span className="sr-only">{placeholder}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function Select({ label, value, onChange, options, size = 'md' }: { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; size?: 'md' | 'sm' }) {
  return (
    <label className={cx('ds-select', size === 'sm' && 'ds-select-sm')}>
      {label && <span>{label}</span>}
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ─── KPI ───────────────────────────────────────
export interface KpiItem {
  label: string; value: ReactNode; sub?: ReactNode; color: string; icon: IconName;
  delta?: { text: string; good?: boolean }; subColor?: string;
  seg?: { w: number; color: string }[];
  spark?: number[];
}
export function Kpis({ items, className = 'ds-g4' }: { items: KpiItem[]; className?: string }) {
  return (
    <section aria-label="Indicatori" className={className}>
      {items.map(k => (
        <div key={k.label} className="ds-kpi">
          <div className="ds-kpi-top">
            <Tile color={k.color} icon={k.icon} />
            <span className="ds-kpi-label">{k.label}</span>
            {k.delta && <span className="ds-kpi-delta" style={{ color: k.delta.good === false ? '#B91C1C' : '#15803D' }}>{k.delta.text}</span>}
          </div>
          {k.spark ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span className="ds-kpi-value">{k.value}</span>
                {k.sub && <span className="ds-kpi-sub" style={k.subColor ? { color: k.subColor } : undefined}>{k.sub}</span>}
              </div>
              <Spark values={k.spark} color={k.color} />
            </div>
          ) : <span className="ds-kpi-value">{k.value}</span>}
          {k.seg && (
            <div className="ds-seg" aria-hidden="true">
              {k.seg.map((s, i) => <span key={i} style={{ width: `${s.w}%`, background: s.color }} />)}
            </div>
          )}
          {k.sub && !k.spark && <span className="ds-kpi-sub" style={k.subColor ? { color: k.subColor } : undefined}>{k.sub}</span>}
        </div>
      ))}
    </section>
  );
}

// ─── Schede ────────────────────────────────────
export interface TabItem<T extends string> { value: T; label: ReactNode; count?: ReactNode; color?: string; icon?: IconName }

/** Schede sottolineate (sezioni di una pagina). */
export function Tabs<T extends string>({ items, value, onChange, label = 'Sezioni' }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="ds-tabs">
      {items.map(t => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className="ds-tab" onClick={() => onChange(t.value)}>
          {t.color && t.icon && (
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: t.color }}>
              <Icon name={t.icon} size={10} stroke={2.8} />
            </span>
          )}
          {t.label}
          {t.count !== undefined && t.count !== '' && <span className="ds-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Filtri a pulsanti (anche dentro una "pillola" grigia con pill). */
export function SegTabs<T extends string>({ items, value, onChange, pill, label = 'Filtra' }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; pill?: boolean; label?: string }) {
  return (
    <div role="group" aria-label={label} className={pill ? 'ds-pill' : 'ds-segtabs'}>
      {items.map(t => (
        <button key={t.value} type="button" aria-pressed={t.value === value} className="ds-segtab" onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && t.count !== '' && <small>{t.count}</small>}
        </button>
      ))}
    </div>
  );
}

// ─── Stato ─────────────────────────────────────
export type Tone = 'ok' | 'ko' | 'warn' | 'na' | 'info';
export function Dot({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return <span className={`ds-dot ds-dot-${tone}`} title={title}>{children}</span>;
}

export function Alert({ tone = 'warn', title, children, actions, icon }: { tone?: 'warn' | 'ko' | 'info' | 'ok'; title?: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: IconName }) {
  const bg = { warn: C.orange, ko: C.red, info: C.blue, ok: C.green }[tone];
  return (
    <div role={tone === 'ok' || tone === 'info' ? 'status' : 'alert'} className={`ds-alert ds-alert-${tone}`}>
      <Tile color={bg} icon={icon || (tone === 'ok' ? 'tick' : tone === 'info' ? 'info' : 'alert')} size="md" />
      <div className="ds-alert-body">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {actions && <div className="ds-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="ds-empty">{children}</div>;
}

// ─── Ordinamento tabelle ───────────────────────
export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> { key: K; dir: SortDir }

/** Ordina le righe con la stessa regola del mockup: vuoti in fondo, numeri e testo (it). */
export function useSort<T, K extends string>(rows: T[], get: (row: T, key: K) => unknown, initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => {
    const out = rows.slice();
    out.sort((a, b) => {
      const x = get(a, sort.key), y = get(b, sort.key);
      const ex = x === null || x === undefined || x === '', ey = y === null || y === undefined || y === '';
      if (ex && ey) return 0;
      if (ex) return 1;
      if (ey) return -1;
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: K) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  return { sorted, sort, toggle, setSort };
}

/** Intestazione di colonna ordinabile con frecce ▲▼ e aria-sort. */
export function Th<K extends string>({ k, sort, onSort, children, right, center, style, className }: {
  k?: K; sort?: SortState<K>; onSort?: (k: K) => void; children?: ReactNode; right?: boolean; center?: boolean; style?: CSSProperties; className?: string;
}) {
  const on = !!k && sort?.key === k;
  const aria = on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : k ? 'none' : undefined;
  const cls = cx(right && 'r', center && 'c', className);
  if (!k || !onSort) return <th className={cls} style={style}>{children}</th>;
  const up = on && sort!.dir === 'asc' ? C.ink : '#C4C4CA';
  const dn = on && sort!.dir === 'desc' ? C.ink : '#C4C4CA';
  return (
    <th className={cls} style={style} aria-sort={aria}>
      <button type="button" className="ds-sortbtn" onClick={() => onSort(k)}>
        {children}
        <svg aria-hidden="true" width="9" height="12" viewBox="0 0 9 12"><path d="M4.5 1L8 5H1z" fill={up} /><path d="M4.5 11L1 7h7z" fill={dn} /></svg>
      </button>
    </th>
  );
}

// ─── Grafico mensile a barre ───────────────────
export interface BarDatum { label: string; total: number; part: number; valueLabel: string; tip?: string }
export const BAR_PAL = {
  blue: { o1: '#E8EDFD', o2: '#C9D5FB', i1: '#AFC0FA', i2: '#3D63F0' },
  green: { o1: '#E3F4EC', o2: '#BFE8D5', i1: '#9FDCC2', i2: '#15A06A' },
  orange: { o1: '#FCEBDF', o2: '#F8D2B8', i1: '#F3B48C', i2: '#EA6A2A' },
} as const;

/** Barra per mese: totale chiaro e, dentro, la parte scura. Clic su una barra = selezione del mese. */
export function BarStrip({ data, palette, legend, selected, onSelect, ariaLabel }: {
  data: BarDatum[]; palette: keyof typeof BAR_PAL; legend: [string, string]; selected?: number; onSelect?: (i: number) => void; ariaLabel: string;
}) {
  const p = BAR_PAL[palette];
  const max = Math.max(1, ...data.map(d => d.total));
  const sel = selected === undefined ? data.length - 1 : selected;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ds-bars-legend">
        <span><i style={{ background: p.o2 }} />{legend[0]}</span>
        <span><i style={{ background: p.i2 }} />{legend[1]}</span>
      </div>
      <div role="img" aria-label={ariaLabel} className="ds-bars">
        {data.map((d, i) => {
          const on = i === sel;
          return (
            <button key={d.label + i} type="button" className="ds-bar" aria-pressed={on} title={d.tip} onClick={() => onSelect?.(i)}>
              <span className="ds-bar-v">{d.valueLabel}</span>
              <span className="ds-bar-track">
                <span className="ds-bar-outer" style={{ height: `${Math.max(4, Math.round((d.total / max) * 100))}%`, background: on ? p.o2 : p.o1 }}>
                  <span className="ds-bar-inner" style={{ height: `${d.total ? Math.round((d.part / d.total) * 100) : 0}%`, background: on ? p.i2 : p.i1 }} />
                </span>
              </span>
              <span className="ds-bar-l">{d.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Barra orizzontale a segmenti (ripartizioni). */
export function SegBar({ parts, height = 8 }: { parts: { value: number; color: string }[]; height?: number }) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 2, height }}>
      {parts.filter(p => p.value > 0).map((p, i) => (
        <span key={i} style={{ display: 'block', height: '100%', borderRadius: 3, width: `${(p.value / tot) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

/** Mini grafico a puntini (una colonna per mese, l'ultima piena). */
export function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
      {values.map((v, i) => {
        const n = Math.max(1, Math.round((v / max) * 7));
        const last = i === values.length - 1;
        return [0, 1].map(r => (
          <div key={`${i}-${r}`} style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
            {Array.from({ length: 7 }).map((_, j) => (
              <span key={j} style={{ display: 'block', width: 3, height: 3, borderRadius: 1, background: j < n ? (last ? color : color + '80') : '#EEEEF0' }} />
            ))}
          </div>
        ));
      })}
    </div>
  );
}

// ─── Formattazione (solo visualizzazione) ──────
/** Numero all'italiana con separatore delle migliaia anche sotto 10.000 (1.234,56). */
export const fmtNum = (n: number | null | undefined, dec = 0) => {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  const v = Number(n);
  const [i, d] = Math.abs(v).toFixed(dec).split('.');
  return (v < 0 && Number(Math.abs(v).toFixed(dec)) !== 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
};
export const fmtEur = (n: number | null | undefined, dec = 2) =>
  n === null || n === undefined || isNaN(Number(n)) ? '—' : (Number(n) < 0 && Math.abs(Number(n)) >= 0.005 ? '−' : '') + '€ ' + fmtNum(Math.abs(Number(n)), dec);
export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
};
