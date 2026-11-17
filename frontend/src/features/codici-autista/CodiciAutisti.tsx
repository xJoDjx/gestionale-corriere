// src/features/codici-autista/CodiciAutisti.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { codiciAutistaApi, noteApi, auditApi, taskApi } from '../../lib/api';
import type { CodiceAutista, CodiciAutistaStats, Nota, AuditLogEntry, TaskItem } from '../../lib/api';
import NuovoCodiceAutistaModal, { NuovoCodiceAutista } from './NuovoCodiceAutistaModal';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import { getHumanReadableDescription } from '../../lib/auditFormat';
import './CodiciAutisti.css';
import '../mezzi/Flotta.css';
import '../palmari/Palmari2.css';
import TaskList from '../../components/ds/TaskList';
import { Page, PageHeader, Card, Kpis, Button, IconButton, SegTabs, Tabs, SearchBox, Th, Dot, Empty, Alert, Icon, C, fmtEur as fmtEur2, fmtNum as fmtNum2 } from '../../components/ds';
import type { Tone } from '../../components/ds';

function describeAudit(log: AuditLogEntry): string {
  return getHumanReadableDescription(
    { ...log, entityType: log.entityType ?? 'codiceAutista' } as any,
    { hideIdentifier: true },
  );
}


const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

type SortDir = 'asc' | 'desc';
function SortTh({ label, col, sortKey, sortDir, onSort, className }: {
  label: string; col: string; sortKey: string; sortDir: SortDir;
  onSort: (c: string) => void; className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={className ?? 'ca-th-sort'}
      onClick={() => onSort(col)}
    >
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function CodiciAutisti() {
  const navigate = useNavigate();

  const [autisti,    setAutisti]    = useState<CodiceAutista[]>([]);
  const [stats,      setStats]      = useState<CodiciAutistaStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filtro,     setFiltro]     = useState<'TUTTI' | 'DISPONIBILE' | 'ASSEGNATO' | 'DISMESSO' | 'BONUS'>('TUTTI');
  const [nuovoOpen,  setNuovoOpen]  = useState(false);
  const [sortKey,    setSortKey]    = useState('codice');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [tutteLeNote, setTutteLeNote] = useState<Nota[]>([]);
  const [ultimiLog,  setUltimiLog]  = useState<AuditLogEntry[]>([]);
  const [notaForm,   setNotaForm]   = useState({ open: false, entityId: '', testo: '' });
  const [notaSaving, setNotaSaving] = useState(false);

  const [tasks,         setTasks]         = useState<TaskItem[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask,   setEditingTask]   = useState<TaskItem | null>(null);
  const [taskSaving,    setTaskSaving]    = useState(false);

  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [listResp, statsResp, noteResp, logResp, taskResp] = await Promise.all([
        codiciAutistaApi.list({ limit: '200' }),
        codiciAutistaApi.stats(),
        noteApi.list('codice_autista', undefined, 500),
        auditApi.list({ entityType: 'codice_autista,assegnazione_codice_autista', limit: 5 }),
        taskApi.list('codici-autista', 'autisti'),
      ]);
      setAutisti(listResp.data); setStats(statsResp); setTutteLeNote(noteResp);
      setUltimiLog(logResp.data); setTasks(taskResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ultimeNote = useMemo(() => tutteLeNote.slice(0, 5), [tutteLeNote]);

  const codiciOptions = useMemo(() => Array.from(new Set(autisti.map(c => c.codice))).sort(), [autisti]);

  // Mappa entityId → testo note concatenate (per ricerca)
  const noteMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      acc[n.entityId] = (acc[n.entityId] ?? '') + ' ' + n.contenuto.toLowerCase();
      return acc;
    }, {}),
  [tutteLeNote]);

  // Mappa entityId → testo dell'ultima nota (tutteLeNote è già ordinata desc per data)
  const ultimaNotaMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      if (!(n.entityId in acc)) acc[n.entityId] = n.contenuto;
      return acc;
    }, {}),
  [tutteLeNote]);

  const filtered = useMemo(() => {
    const list = autisti.filter(c => {
      const attiva = c.assegnazioni?.find(a => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        c.codice.toLowerCase().includes(s) ||
        (c.nome ?? '').toLowerCase().includes(s) ||
        (c.cognome ?? '').toLowerCase().includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s) ||
        (c.zone ?? '').toLowerCase().includes(s) ||
        (c.note ?? '').toLowerCase().includes(s) ||
        (noteMap[c.id] ?? '').includes(s);
      if (filtro === 'DISPONIBILE') return matchSearch && !attiva && c.attivo;
      if (filtro === 'ASSEGNATO')   return matchSearch && !!attiva && c.attivo;
      if (filtro === 'DISMESSO')    return matchSearch && !c.attivo;
      if (filtro === 'BONUS')       return matchSearch && !!(c.bonusMalus || c.bonus != null || c.malus != null);
      return matchSearch;
    });
    list.sort((a, b) => {
      const attA = a.assegnazioni?.find(x => !x.dataFine);
      const attB = b.assegnazioni?.find(x => !x.dataFine);
      const statoA = !a.attivo ? 'DISMESSO' : attA ? 'ASSEGNATO' : 'DISPONIBILE';
      const statoB = !b.attivo ? 'DISMESSO' : attB ? 'ASSEGNATO' : 'DISPONIBILE';
      let va: any, vb: any;
      switch (sortKey) {
        case 'codice':        va = a.codice; vb = b.codice; break;
        case 'stato':         va = statoA; vb = statoB; break;
        case 'padroncino':    va = attA?.ragioneSociale ?? ''; vb = attB?.ragioneSociale ?? ''; break;
        case 'tariffaFissa':  va = a.tariffaFissa ?? -1; vb = b.tariffaFissa ?? -1; break;
        case 'tariffaRitiro': va = a.tariffaRitiro ?? -1; vb = b.tariffaRitiro ?? -1; break;
        case 'target':        va = a.target ?? -1; vb = b.target ?? -1; break;
        case 'zone':          va = a.zone ?? ''; vb = b.zone ?? ''; break;
        case 'note':          va = ultimaNotaMap[a.id] ?? ''; vb = ultimaNotaMap[b.id] ?? ''; break;
        default:              va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [autisti, search, filtro, sortKey, sortDir, tutteLeNote, ultimaNotaMap]);

  const handleAddNota = async () => {
    if (!notaForm.entityId || !notaForm.testo.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'codice_autista', entityId: notaForm.entityId, contenuto: notaForm.testo.trim() });
      setNotaForm({ open: false, entityId: '', testo: '' });
      setTutteLeNote(await noteApi.list('codice_autista', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const loadTasks = async () => {
    try { setTasks(await taskApi.list('codici-autista', 'autisti')); } catch {}
  };

  const handleOpenNewTask  = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'codici-autista', entityId: 'autisti', ...data });
      setTaskModalOpen(false); setEditingTask(null);
      await loadTasks();
    } catch (e: any) { alert('Errore salvataggio attività: ' + e.message); }
    finally { setTaskSaving(false); }
  };

  const handleToggleTask = async (t: TaskItem) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, completata: !x.completata } : x));
    try { await taskApi.toggle(t.id, !t.completata); }
    catch (e: any) { alert('Errore aggiornamento attività: ' + e.message); await loadTasks(); }
  };

  const handleRemoveTask = async (id: string) => {
    setTasks(prev => prev.filter(x => x.id !== id));
    try { await taskApi.remove(id); }
    catch (e: any) { alert('Errore eliminazione attività: ' + e.message); await loadTasks(); }
  };

  const handleCreate = async (form: NuovoCodiceAutista) => {
    try {
      await codiciAutistaApi.create({
        codice: form.codice,
        nome:           form.nome           || undefined,
        cognome:        form.cognome        || undefined,
        note:           form.note           || undefined,
        tariffaFissa:   form.tariffaFissa   ? parseFloat(form.tariffaFissa)   : undefined,
        tariffaRitiro:  form.tariffaRitiro  ? parseFloat(form.tariffaRitiro)  : undefined,
        target:         form.target         ? parseInt(form.target)            : undefined,
        bonus:          form.bonus          ? parseFloat(form.bonus)          : undefined,
        malus:          form.malus          ? parseFloat(form.malus)          : undefined,
        zone:           form.zone           || undefined,
      });
      await load();
    } catch (e: any) { alert('Errore creazione codice autista: ' + e.message); }
  };

  // ── Solo visualizzazione ──
  const stato = (c: CodiceAutista) => !c.attivo ? 'DISMESSO' : c.assegnazioni?.find((a) => !a.dataFine) ? 'ASSEGNATO' : 'DISPONIBILE';
  const conteggi = useMemo(() => ({
    TUTTI: autisti.length,
    ASSEGNATO: autisti.filter((c) => stato(c) === 'ASSEGNATO').length,
    DISPONIBILE: autisti.filter((c) => stato(c) === 'DISPONIBILE').length,
    BONUS: autisti.filter((c) => !!(c.bonusMalus || c.bonus != null || c.malus != null)).length,
    DISMESSO: autisti.filter((c) => !c.attivo).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [autisti]);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = autisti.find((c) => c.id === selId) ?? filtered[0] ?? null;
  const [pannello, setPannello] = useState<null | 'attivita' | 'note' | 'modifiche'>(null);
  const [notaSel, setNotaSel] = useState('');
  const salvaNotaSel = async () => {
    if (!sel || !notaSel.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'codice_autista', entityId: sel.id, contenuto: notaSel.trim() });
      setNotaSel('');
      setTutteLeNote(await noteApi.list('codice_autista', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };
  const AVC = [C.blue, C.green, C.orange, C.purple, '#18181B', C.red, C.teal];
  const padColor = useMemo(() => {
    const ids = Array.from(new Set(autisti.map((c) => c.assegnazioni?.find((a) => !a.dataFine)?.padroncinoId).filter(Boolean))) as string[];
    return new Map(ids.sort().map((id, i) => [id, AVC[i % AVC.length]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autisti]);
  const nPad = padColor.size;
  const perCons = autisti.map((c) => c.tariffaFissa).filter((t): t is number => t != null && Number(t) > 0 && Number(t) < 50).map(Number);
  const perGiorno = autisti.map((c) => c.tariffaFissa).filter((t): t is number => t != null && Number(t) >= 50).map(Number);
  const ritiri = autisti.map((c) => c.tariffaRitiro).filter((t): t is number => t != null && Number(t) > 0).map(Number);
  const moda = (xs: number[]) => { const m = new Map<number, number>(); xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; };
  const range = (xs: number[], dec: number) => xs.length ? (Math.min(...xs) === Math.max(...xs) ? fmtEur2(xs[0], dec) : `${fmtEur2(Math.min(...xs), dec)} – ${fmtNum2(Math.max(...xs), dec)}`) : '—';
  const modaCons = moda(perCons);
  const disp = autisti.filter((c) => stato(c) === 'DISPONIBILE');
  const tot = autisti.length || 1;
  const TONE: Record<string, Tone> = { ASSEGNATO: 'ok', DISPONIBILE: 'info', DISMESSO: 'na' };
  const LBL: Record<string, string> = { ASSEGNATO: 'Assegnato', DISPONIBILE: 'Disponibile', DISMESSO: 'Dismesso' };
  const tf = (c: CodiceAutista) => c.tariffaFissa == null ? '—' : `${fmtEur2(c.tariffaFissa)}${Number(c.tariffaFissa) >= 50 ? ' /gg' : ' /cons.'}`;
  const bm = (c: CodiceAutista) => [c.bonusMalus, c.bonus != null ? `+${fmtEur2(c.bonus)}` : '', c.malus != null ? `−${fmtEur2(c.malus)}` : ''].filter(Boolean).join(' · ');

  if (loading) return <Page><Card pad><Empty>Caricamento codici autista…</Empty></Card></Page>;
  if (error) return <Page><Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></Page>;

  return (
    <Page>
      <PageHeader
        eyebrow="Risorse"
        title="Codici autista"
        sub={`${autisti.length} codici · tariffe, target, bonus/malus e zone`}
        actions={<>
          <Button icon="check" onClick={() => setPannello('attivita')}>Promemoria</Button>
          <Button icon="plus" variant="primary" onClick={() => setNuovoOpen(true)}>Nuovo codice</Button>
        </>}
      />

      <Kpis items={[
        { label: 'Codici totali', value: stats?.totali ?? autisti.length, sub: `${stats?.assegnati ?? conteggi.ASSEGNATO} assegnati a ${nPad} padroncin${nPad === 1 ? 'o' : 'i'}`, color: C.purple, icon: 'cod',
          seg: [{ w: (conteggi.ASSEGNATO / tot) * 100, color: C.green }, { w: (conteggi.DISPONIBILE / tot) * 100, color: C.blue }] },
        { label: 'Disponibili', value: stats?.disponibili ?? conteggi.DISPONIBILE, sub: disp.length ? `${disp.slice(0, 3).map((c) => c.codice).join(', ')}${disp.length > 3 ? '…' : ''}, non assegnati` : 'Tutti assegnati', color: C.blue, icon: 'ok' },
        { label: 'Tariffa a consegna', value: range(perCons, 2), sub: modaCons ? `Più usata: ${fmtEur2(modaCons[0])} (${modaCons[1]} codic${modaCons[1] === 1 ? 'e' : 'i'})` : 'Nessuna tariffa a consegna', color: C.green, icon: 'euro' },
        { label: 'Tariffa giornaliera', value: range(perGiorno, 0), sub: ritiri.length ? `Ritiro: ${range(ritiri, 2)} su ${ritiri.length} codic${ritiri.length === 1 ? 'e' : 'i'}` : 'Nessun ritiro a tariffa', color: C.orange, icon: 'cal' },
      ]} />

      <div className="ds-g4">
        <Card className="ds-s3">
          <div className="pl2-toolbar">
            <SegTabs<typeof filtro>
              value={filtro}
              onChange={setFiltro}
              label="Vista"
              items={[
                { value: 'TUTTI', label: 'Tutti', count: conteggi.TUTTI },
                { value: 'ASSEGNATO', label: 'Assegnati', count: conteggi.ASSEGNATO },
                { value: 'DISPONIBILE', label: 'Disponibili', count: conteggi.DISPONIBILE },
                { value: 'BONUS', label: 'Con bonus/malus', count: conteggi.BONUS },
                ...(conteggi.DISMESSO ? [{ value: 'DISMESSO' as const, label: 'Dismessi', count: conteggi.DISMESSO }] : []),
              ]}
            />
            <SearchBox value={search} onChange={setSearch} placeholder="Cerca codice, nome, padroncino, zone, note…" width={300} />
          </div>
          <div className="ds-tablewrap">
            <table className="ds-table pm2-table" style={{ minWidth: 1000 }}>
              <thead><tr>
                <Th k="codice" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Codice</Th>
                <Th k="padroncino" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Padroncino</Th>
                <Th k="stato" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Stato</Th>
                <Th k="tariffaFissa" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort} right>Tariffa fissa</Th>
                <Th k="tariffaRitiro" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort} right>Ritiro</Th>
                <Th k="target" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort} right>Target</Th>
                <Th>Bonus / malus</Th>
                <Th k="zone" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Zone</Th>
                <Th k="note" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Note</Th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={9}><Empty>Nessun codice autista trovato</Empty></td></tr>}
                {filtered.map((c) => {
                  const attiva = c.assegnazioni?.find((a) => !a.dataFine);
                  const st = stato(c);
                  const b = bm(c);
                  return (
                    <tr key={c.id} className={`is-clickable${sel?.id === c.id ? ' is-open' : ''}`} onClick={() => setSelId(c.id)} onDoubleClick={() => navigate('/codici-autista/' + c.id)}>
                      <td>
                        <div className="pm2-cod">
                          <span aria-hidden="true" className="pm2-tile" style={{ flexBasis: 22, height: 22, background: attiva ? (padColor.get(attiva.padroncinoId) ?? C.purple) : '#A1A1AA' }}><Icon name="cod" size={11} stroke={2.4} /></span>
                          <span className="pm2-cod-t">
                            <span className="ds-mono" style={{ fontWeight: 600 }}>{c.codice}</span>
                            {(c.nome || c.cognome) && <span className="pm2-sub">{[c.nome, c.cognome].filter(Boolean).join(' ')}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="pm2-ell" style={{ color: attiva ? undefined : '#6B6B73' }}>{attiva?.ragioneSociale ?? '—'}</td>
                      <td><Dot tone={TONE[st]}>{LBL[st]}</Dot></td>
                      <td className="r" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{tf(c)}</td>
                      <td className="r">{c.tariffaRitiro != null ? fmtEur2(c.tariffaRitiro) : '—'}</td>
                      <td className="r">{c.target ?? '—'}</td>
                      <td className="pm2-ell" style={{ color: b ? '#15803D' : '#6B6B73', maxWidth: 200 }} title={b}>{b || '—'}</td>
                      <td className="pm2-ell" style={{ maxWidth: 220 }} title={c.zone ?? ''}>{c.zone || '—'}</td>
                      <td className="pm2-ell pm2-sub" style={{ maxWidth: 200 }} title={ultimaNotaMap[c.id] ?? ''}>{ultimaNotaMap[c.id] ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pl2-foot">
            Mostrati {filtered.length} di {autisti.length} · clic su un codice per il dettaglio, doppio clic per la scheda
            {stats ? ` · tariffa fissa media ${fmtEur2(stats.tariffaFissaMedia)} · ritiro medio ${fmtEur2(stats.tariffaRitiroMedia)}` : ''}
          </div>
        </Card>

        <Card className="pm2-side">
          {!sel ? <Empty>Nessun codice selezionato</Empty> : (() => {
            const attiva = sel.assegnazioni?.find((a) => !a.dataFine);
            const storico = [...(sel.assegnazioni ?? [])].sort((x, y) => y.dataInizio.localeCompare(x.dataInizio));
            const campi: [string, string | number | null | undefined][] = [
              ['Tariffa fissa', sel.tariffaFissa != null ? tf(sel) : null], ['Tariffa ritiro', sel.tariffaRitiro != null ? fmtEur2(sel.tariffaRitiro) : null],
              ['Target', sel.target], ['Accordo bonus/malus', bm(sel)],
              ['Zone', sel.zone], ['Padroncino', attiva?.ragioneSociale],
              ['Assegnato dal', attiva ? fmt(attiva.dataInizio) : null], ['Note', sel.note],
            ];
            const noteSel = tutteLeNote.filter((n) => n.entityId === sel.id).slice(0, 3);
            return (
              <>
                <div className="pm2-side-head">
                  <span aria-hidden="true" className="pm2-tile pm2-tile-lg" style={{ background: attiva ? (padColor.get(attiva.padroncinoId) ?? C.purple) : '#A1A1AA' }}><Icon name="cod" size={17} stroke={2.2} /></span>
                  <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <h2 className="ds-mono" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{sel.codice}</h2>
                    <span className="pm2-sub">{[sel.nome, sel.cognome].filter(Boolean).join(' ') || 'Nome non inserito'}</span>
                  </div>
                  <IconButton icon="edit" label="Modifica codice" onClick={() => navigate('/codici-autista/' + sel.id)} />
                </div>
                <dl className="pm2-dl">
                  {campi.map(([l, v]) => {
                    const vuoto = v === null || v === undefined || v === '';
                    return <div key={l} style={l === 'Note' || l === 'Zone' ? { gridColumn: '1 / -1' } : undefined}><dt>{l}</dt><dd style={{ color: vuoto ? '#71717A' : undefined, whiteSpace: 'normal' }}>{vuoto ? 'Non inserito' : v}</dd></div>;
                  })}
                </dl>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 18px 14px' }}>
                  <Button size="sm" style={{ flex: '1 1 110px', justifyContent: 'center' }} onClick={() => navigate('/codici-autista/' + sel.id)}>Modifica tariffe</Button>
                  <Button size="sm" variant="primary" style={{ flex: '1 1 150px', justifyContent: 'center' }} onClick={() => navigate('/codici-autista/' + sel.id)}>{attiva ? 'Chiudi assegnazione' : 'Assegna'}</Button>
                </div>
                <div className="pm2-side-sec">Storico assegnazioni</div>
                {storico.length === 0
                  ? <div className="pm2-hist"><span aria-hidden="true" style={{ background: '#D4D4D8' }} /><div><span style={{ fontWeight: 500 }}>Nessuna assegnazione</span><span className="pm2-sub">Codice libero</span></div></div>
                  : storico.map((a) => (
                    <div key={a.id} className="pm2-hist">
                      <span aria-hidden="true" style={{ background: a.dataFine ? '#D4D4D8' : C.green }} />
                      <div><span style={{ fontWeight: 500 }}>{a.ragioneSociale}</span><span className="pm2-sub">Dal {fmt(a.dataInizio)}{a.dataFine ? ` al ${fmt(a.dataFine)}` : ' · in corso'}</span></div>
                    </div>
                  ))}
                {noteSel.length > 0 && (
                  <>
                    <div className="pm2-side-sec">Ultime note</div>
                    {noteSel.map((n) => (
                      <div key={n.id} className="pm2-hist"><span aria-hidden="true" style={{ background: C.orange }} />
                        <div><span>{n.contenuto}</span><span className="pm2-sub">{n.user ? `${n.user.nome} ${n.user.cognome}` : '—'} · {fmt(n.createdAt)}</span></div>
                      </div>
                    ))}
                  </>
                )}
                <div className="pm2-side-foot">
                  <label htmlFor="ca2-nota" style={{ fontSize: 12, fontWeight: 600, color: '#3F3F46' }}>Nota</label>
                  <textarea id="ca2-nota" rows={2} className="ds-input" placeholder="Aggiungi una nota su questo codice…" value={notaSel}
                    onChange={(e) => setNotaSel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvaNotaSel(); }} />
                  {notaSel.trim() && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" variant="primary" onClick={salvaNotaSel} disabled={notaSaving}>{notaSaving ? 'Salvo…' : 'Salva nota'}</Button></div>}
                  <button type="button" className="pm2-link" onClick={() => navigate('/codici-autista/' + sel.id)}>Scheda e storico modifiche del codice ↗</button>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      {pannello && (
        <div className="fl-drawer-wrap" onClick={() => setPannello(null)}>
          <aside className="fl-drawer" role="dialog" aria-label="Promemoria, note e modifiche" onClick={(e) => e.stopPropagation()}>
            <div className="fl-drawer-head">
              <h2 className="ds-h2" style={{ fontSize: 16 }}>Codici autista: promemoria e note</h2>
              <IconButton icon="close" label="Chiudi" onClick={() => setPannello(null)} />
            </div>
            <div style={{ padding: '0 18px' }}>
              <Tabs
                items={[
                  { value: 'attivita', label: 'Cose da fare', count: tasks.filter((t) => !t.completata).length },
                  { value: 'note', label: 'Ultime note', count: ultimeNote.length },
                  { value: 'modifiche', label: 'Ultime modifiche' },
                ]}
                value={pannello}
                onChange={(v) => setPannello(v as typeof pannello)}
              />
            </div>
            <div className="fl-drawer-body">
              {pannello === 'attivita' && (
                <>
                  <div style={{ padding: '12px 18px' }}><Button size="sm" variant="primary" icon="plus" onClick={handleOpenNewTask}>Nuova attività</Button></div>
                  <TaskList tasks={tasks} onToggle={handleToggleTask} onEdit={handleOpenEditTask} onRemove={handleRemoveTask} />
                </>
              )}
              {pannello === 'note' && (
                <>
                  <div className="fl-form">
                    <label className="ds-field"><span>Codice autista</span>
                      <select className="ds-input" value={notaForm.entityId} onChange={(e) => setNotaForm((f) => ({ ...f, entityId: e.target.value }))}>
                        <option value="">Scegli un codice…</option>
                        {autisti.map((c) => <option key={c.id} value={c.id}>{c.codice}{c.nome || c.cognome ? ' – ' + [c.nome, c.cognome].filter(Boolean).join(' ') : ''}</option>)}
                      </select>
                    </label>
                    <label className="ds-field"><span>Nuova nota</span>
                      <textarea className="ds-input" rows={2} value={notaForm.testo} onChange={(e) => setNotaForm((f) => ({ ...f, testo: e.target.value }))} />
                    </label>
                    <div className="ds-actions" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="blue" onClick={handleAddNota} disabled={notaSaving || !notaForm.entityId || !notaForm.testo.trim()}>{notaSaving ? 'Salvo…' : 'Salva nota'}</Button>
                    </div>
                  </div>
                  <div className="ds-list">
                    {ultimeNote.length === 0 ? <Empty>Nessuna nota registrata</Empty> : ultimeNote.map((n) => {
                      const c = autisti.find((x) => x.id === n.entityId);
                      return (
                        <button key={n.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate('/codici-autista/' + n.entityId)}>
                          <span className="fl-line"><span className="ds-mono fl-targa">{c?.codice ?? '—'}</span><span className="fl-meta">{n.user ? `${n.user.nome} ${n.user.cognome[0]}.` : '—'} · {fmt(n.createdAt)}</span></span>
                          <span className="fl-text" title={n.contenuto}>{n.contenuto}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {pannello === 'modifiche' && (
                <div className="ds-list">
                  {ultimiLog.length === 0 ? <Empty>Nessuna modifica recente</Empty> : ultimiLog.map((l) => {
                    // Gli eventi di assegnazione hanno entityId = id dell'assegnazione: risolviamo il codice per testo.
                    const relatedCodice = l.dataDopo?.codiceAutista ?? l.dataPrima?.codiceAutista;
                    const aut = autisti.find((a) => a.id === l.entityId) ?? (relatedCodice ? autisti.find((a) => a.codice === relatedCodice) : undefined);
                    const codice = aut?.codice ?? relatedCodice ?? l.dataDopo?.codice ?? l.dataPrima?.codice ?? '—';
                    const desc = describeAudit(l);
                    return (
                      <button key={l.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate('/codici-autista/' + (aut?.id ?? l.entityId))}>
                        <span className="fl-line"><span className="ds-mono fl-targa">{codice}</span><span className="fl-meta">{l.user ? `${l.user.nome} ${l.user.cognome?.[0] ?? ''}.` : '—'} · {fmt(l.createdAt)}</span></span>
                        <span className="fl-text" title={desc}>{desc}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        onSubmit={handleSubmitTask}
        saving={taskSaving}
        fieldKey="codiceAutista"
        fieldLabel="Cod. Autista"
        refOptions={codiciOptions}
        editingTask={editingTask}
      />

      <NuovoCodiceAutistaModal
        open={nuovoOpen}
        onClose={() => setNuovoOpen(false)}
        onSave={handleCreate}
      />
    </Page>
  );
}
