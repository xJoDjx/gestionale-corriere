// src/features/palmari/Palmari.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { palmariApi, noteApi, auditApi, taskApi } from '../../lib/api';
import type { Palmare, PalmariStats, Nota, AuditLogEntry, TaskItem } from '../../lib/api';
import NuovoPalmareModal, { NuovoPalmare } from './NuovoPalmareModal';
import TaskModal from '../../components/ui/TaskModal';
import type { TaskModalSubmitData } from '../../components/ui/TaskModal';
import './Palmari.css';
import '../mezzi/Flotta.css';
import './Palmari2.css';
import TaskList from '../../components/ds/TaskList';
import { Page, PageHeader, Card, Kpis, Button, IconButton, SegTabs, Tabs, SearchBox, Th, Dot, Empty, Alert, Icon, C, fmtEur as fmtEur2 } from '../../components/ds';
import type { Tone } from '../../components/ds';

const AUDIT_BADGE: Record<string, { label: string; cls: string }> = {
  CREATE:              { label: 'Creato',       cls: 'pm-audit-create'  },
  UPDATE:              { label: 'Modifica',     cls: 'pm-audit-update'  },
  DELETE:              { label: 'Eliminato',    cls: 'pm-audit-delete'  },
  ASSEGNA:             { label: 'Assegnato',    cls: 'pm-audit-assegna' },
  CHIUDI_ASSEGNAZIONE: { label: 'Disassegnato', cls: 'pm-audit-chiudi'  },
};

const PM_FIELD_LABELS: Record<string, string> = {
  stato: 'Stato', tariffaMensile: 'Tariffa', marca: 'Marca',
  modello: 'Modello', imei: 'IMEI', simNumero: 'SIM', note: 'Note',
};

function describeAudit(log: AuditLogEntry): string {
  const { azione, dataPrima, dataDopo } = log;
  if (azione === 'CREATE') return 'Creato';
  if (azione === 'DELETE') return 'Eliminato';
  if (azione === 'ASSEGNA') {
    const pad = dataDopo?.ragioneSociale ?? dataDopo?.padroncino?.ragioneSociale;
    return pad ? `Assegnato a ${pad}` : 'Assegnato';
  }
  if (azione === 'CHIUDI_ASSEGNAZIONE') {
    // Il backend scrive sempre il padroncino in dataDopo (anche per la chiusura), non in dataPrima
    const pad = dataDopo?.ragioneSociale ?? dataDopo?.padroncino?.ragioneSociale
      ?? dataPrima?.ragioneSociale ?? dataPrima?.padroncino?.ragioneSociale;
    return pad ? `Disassegnato da ${pad}` : 'Disassegnato';
  }
  if (azione === 'UPDATE' && dataPrima && dataDopo) {
    const changes: string[] = [];
    for (const [key, label] of Object.entries(PM_FIELD_LABELS)) {
      if (dataPrima[key] !== undefined && dataDopo[key] !== undefined && dataPrima[key] !== dataDopo[key]) {
        changes.push(`${label}: ${String(dataDopo[key] ?? '—')}`);
      }
    }
    return changes.length > 0 ? changes.slice(0, 2).join(' · ') : 'Modificato';
  }
  return AUDIT_BADGE[azione]?.label ?? azione;
}


const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_BADGE: Record<string, string> = {
  ASSEGNATO:   'pm-badge-assigned',
  DISPONIBILE: 'pm-badge-available',
  GUASTO:      'pm-badge-guasto',
  DISMESSO:    'pm-badge-dismesso',
};
const STATO_LABEL: Record<string, string> = {
  ASSEGNATO:   'Assegnato',
  DISPONIBILE: 'Disponibile',
  GUASTO:      'Guasto',
  DISMESSO:    'Dismesso',
};

type SortDir = 'asc' | 'desc';
function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: string; sortKey: string; sortDir: SortDir; onSort: (c: string) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="pm-th-sort" onClick={() => onSort(col)}>
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function Palmari() {
  const navigate = useNavigate();

  const [palmari,    setPalmari]    = useState<Palmare[]>([]);
  const [stats,      setStats]      = useState<PalmariStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filtroStato, setFiltroStato] = useState('TUTTI');
  const [nuovoOpen,  setNuovoOpen]  = useState(false);
  const [tutteLeNote, setTutteLeNote] = useState<Nota[]>([]);
  const [ultimiLog,  setUltimiLog]  = useState<AuditLogEntry[]>([]);
  const [notaForm,   setNotaForm]   = useState({ open: false, entityId: '', testo: '' });
  const [notaSaving, setNotaSaving] = useState(false);
  const [sortKey,    setSortKey]    = useState('codice');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');

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
        palmariApi.list({ limit: '200' }),
        palmariApi.stats(),
        noteApi.list('palmare', undefined, 500),
        auditApi.list({ entityType: 'palmare,assegnazione_palmare', limit: 5 }),
        taskApi.list('palmari', 'palmari'),
      ]);
      setPalmari(listResp.data); setStats(statsResp); setTutteLeNote(noteResp);
      setUltimiLog(logResp.data); setTasks(taskResp);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ultimeNote = useMemo(() => tutteLeNote.slice(0, 5), [tutteLeNote]);

  const codiciOptions = useMemo(() => Array.from(new Set(palmari.map(p => p.codice))).sort(), [palmari]);

  const noteMap = useMemo(() =>
    tutteLeNote.reduce<Record<string, string>>((acc, n) => {
      acc[n.entityId] = (acc[n.entityId] ?? '') + ' ' + n.contenuto.toLowerCase();
      return acc;
    }, {}),
  [tutteLeNote]);

  const ultimaNotaMap = useMemo(() => {
    const map: Record<string, Nota> = {};
    tutteLeNote.forEach(n => { if (!map[n.entityId]) map[n.entityId] = n; });
    return map;
  }, [tutteLeNote]);

  const filtered = useMemo(() => {
    const list = palmari.filter(p => {
      const attiva = p.assegnazioni?.find(a => !a.dataFine);
      const s = search.toLowerCase();
      const matchSearch =
        p.codice.toLowerCase().includes(s) ||
        (p.marca ?? '').toLowerCase().includes(s) ||
        (p.modello ?? '').toLowerCase().includes(s) ||
        (p.imei ?? '').includes(s) ||
        (attiva?.ragioneSociale ?? '').toLowerCase().includes(s) ||
        (p.note ?? '').toLowerCase().includes(s) ||
        (noteMap[p.id] ?? '').includes(s);
      const matchStato = filtroStato === 'TUTTI' || p.stato === filtroStato;
      return matchSearch && matchStato;
    });
    list.sort((a, b) => {
      const attA = a.assegnazioni?.find(x => !x.dataFine);
      const attB = b.assegnazioni?.find(x => !x.dataFine);
      let va: any, vb: any;
      switch (sortKey) {
        case 'codice':     va = a.codice; vb = b.codice; break;
        case 'stato':      va = a.stato;  vb = b.stato;  break;
        case 'padroncino': va = attA?.ragioneSociale ?? ''; vb = attB?.ragioneSociale ?? ''; break;
        case 'tariffa':    va = a.tariffaMensile ?? -1; vb = b.tariffaMensile ?? -1; break;
        case 'dataAss':    va = attA?.dataInizio ?? ''; vb = attB?.dataInizio ?? ''; break;
        default:           va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [palmari, search, filtroStato, sortKey, sortDir]);

  const handleAddNota = async () => {
    if (!notaForm.entityId || !notaForm.testo.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'palmare', entityId: notaForm.entityId, contenuto: notaForm.testo.trim() });
      setNotaForm({ open: false, entityId: '', testo: '' });
      setTutteLeNote(await noteApi.list('palmare', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const loadTasks = async () => {
    try { setTasks(await taskApi.list('palmari', 'palmari')); } catch {}
  };

  const handleOpenNewTask  = () => { setEditingTask(null); setTaskModalOpen(true); };
  const handleOpenEditTask = (t: TaskItem) => { setEditingTask(t); setTaskModalOpen(true); };

  const handleSubmitTask = async (data: TaskModalSubmitData) => {
    setTaskSaving(true);
    try {
      if (editingTask) await taskApi.update(editingTask.id, data);
      else await taskApi.create({ entityType: 'palmari', entityId: 'palmari', ...data });
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

  const handleCreate = async (form: NuovoPalmare) => {
    try {
      await palmariApi.create({
        codice: form.codice,
        modello: form.modello || undefined,
        imei: form.seriale || undefined,
        simNumero: form.sim || undefined,
        tariffaMensile: form.tariffa ? parseFloat(form.tariffa) : undefined,
        note: form.note || undefined,
      });
      await load();
    } catch (e: any) { alert('Errore creazione palmare: ' + e.message); }
  };

  const handleDelete = async (id: string, codice: string) => {
    if (!confirm('Eliminare il palmare "' + codice + '"? L\'operazione è irreversibile.')) return;
    try {
      await palmariApi.delete(id);
      await load();
    } catch (e: any) { alert('Errore eliminazione: ' + e.message); }
  };

  // ── Solo visualizzazione ──
  const oggi = new Date().toISOString().slice(0, 10);
  const conteggi = useMemo(() => ({
    TUTTI: palmari.length,
    ASSEGNATO: palmari.filter((p) => p.stato === 'ASSEGNATO').length,
    DISPONIBILE: palmari.filter((p) => p.stato === 'DISPONIBILE').length,
    GUASTO: palmari.filter((p) => p.stato === 'GUASTO').length,
    DISMESSO: palmari.filter((p) => p.stato === 'DISMESSO').length,
  }), [palmari]);
  // Assegnazioni da verificare: inizio nel futuro, periodi sovrapposti, tariffa a zero
  const verifiche = useMemo(() => {
    const out: { id: string; testo: string }[] = [];
    for (const p of palmari) {
      const att = p.assegnazioni?.find((x) => !x.dataFine);
      const motivi: string[] = [];
      if (att && att.dataInizio.slice(0, 10) > oggi) motivi.push(`risulta assegnato a ${att.ragioneSociale} dal ${fmt(att.dataInizio)} (data nel futuro)`);
      const ass = [...(p.assegnazioni ?? [])].sort((x, y) => x.dataInizio.localeCompare(y.dataInizio));
      for (let i = 1; i < ass.length; i++) {
        const prevFine = ass[i - 1].dataFine ?? '9999';
        if (ass[i].dataInizio.slice(0, 10) < prevFine.slice(0, 10)) { motivi.push(`ha due assegnazioni sovrapposte (${ass[i - 1].ragioneSociale} e ${ass[i].ragioneSociale})`); break; }
      }
      if (p.stato === 'ASSEGNATO' && (p.tariffaMensile == null || Number(p.tariffaMensile) === 0)) motivi.push('ha tariffa € 0');
      if (motivi.length) out.push({ id: p.id, testo: `${p.codice} ${motivi.join(' e ')}` });
    }
    return out;
  }, [palmari, oggi]);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = palmari.find((p) => p.id === selId) ?? filtered[0] ?? null;
  const [pannello, setPannello] = useState<null | 'attivita' | 'note' | 'modifiche'>(null);
  const [notaSel, setNotaSel] = useState('');
  const salvaNotaSel = async () => {
    if (!sel || !notaSel.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'palmare', entityId: sel.id, contenuto: notaSel.trim() });
      setNotaSel('');
      setTutteLeNote(await noteApi.list('palmare', undefined, 500));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };
  const TONE: Record<string, Tone> = { ASSEGNATO: 'ok', DISPONIBILE: 'info', GUASTO: 'ko', DISMESSO: 'na' };
  const TILE: Record<string, string> = { ASSEGNATO: C.green, DISPONIBILE: C.blue, GUASTO: C.red, DISMESSO: '#A1A1AA' };
  const guasti = palmari.filter((p) => p.stato === 'GUASTO');
  const nPad = new Set(palmari.map((p) => p.assegnazioni?.find((a) => !a.dataFine)?.padroncinoId).filter(Boolean)).size;
  const tot = palmari.length || 1;

  if (loading) return <Page><Card pad><Empty>Caricamento palmari…</Empty></Card></Page>;
  if (error) return <Page><Alert tone="ko" title="Errore di caricamento" actions={<Button size="sm" onClick={load}>Riprova</Button>}>{error}</Alert></Page>;

  return (
    <Page>
      <PageHeader
        eyebrow="Risorse"
        title="Palmari"
        sub={`${palmari.length} dispositivi · assegnazioni, tariffe e storico`}
        actions={<>
          <Button icon="check" onClick={() => setPannello('attivita')}>Promemoria</Button>
          <Button icon="plus" variant="primary" onClick={() => setNuovoOpen(true)}>Nuovo palmare</Button>
        </>}
      />

      <Kpis items={[
        { label: 'Assegnati', value: stats?.assegnati ?? conteggi.ASSEGNATO, sub: `A ${nPad} padroncin${nPad === 1 ? 'o' : 'i'}`, color: C.green, icon: 'ok',
          seg: [{ w: (conteggi.ASSEGNATO / tot) * 100, color: C.green }, { w: (conteggi.DISPONIBILE / tot) * 100, color: C.blue }, { w: (conteggi.GUASTO / tot) * 100, color: C.red }] },
        { label: 'Disponibili', value: stats?.disponibili ?? conteggi.DISPONIBILE, sub: 'Pronti da assegnare', color: C.blue, icon: 'palm' },
        { label: 'Guasti', value: stats?.guasti ?? conteggi.GUASTO, sub: guasti.length ? guasti.slice(0, 3).map((g) => g.codice).join(', ') : 'Nessuno da riparare', color: C.red, icon: 'alert' },
        { label: 'Entrate mensili', value: fmtEur2(stats?.entrateMensili ?? 0), sub: 'Tariffe giornaliere × giorni del mese', color: C.purple, icon: 'euro' },
      ]} />

      {verifiche.length > 0 && (
        <div className="pm2-alert">
          <span aria-hidden="true" className="pm2-dot" />
          <span style={{ flex: '1 1 360px' }}>
            <span style={{ fontWeight: 600 }}>{verifiche.length} assegnazion{verifiche.length === 1 ? 'e' : 'i'} da verificare.</span>{' '}
            <span style={{ color: '#3F3F46' }}>{verifiche.slice(0, 3).map((v) => v.testo).join('; ')}{verifiche.length > 3 ? '; …' : ''}.</span>
          </span>
          <Button size="sm" onClick={() => setSelId(verifiche[0].id)}>Mostra il primo</Button>
        </div>
      )}

      <div className="ds-g4">
        <Card className="ds-s3">
          <div className="pl2-toolbar">
            <SegTabs<string>
              value={filtroStato}
              onChange={setFiltroStato}
              label="Stato"
              items={[
                { value: 'TUTTI', label: 'Tutti', count: conteggi.TUTTI },
                { value: 'ASSEGNATO', label: 'Assegnati', count: conteggi.ASSEGNATO },
                { value: 'DISPONIBILE', label: 'Disponibili', count: conteggi.DISPONIBILE },
                { value: 'GUASTO', label: 'Guasti', count: conteggi.GUASTO },
                { value: 'DISMESSO', label: 'Dismessi', count: conteggi.DISMESSO },
              ]}
            />
            <SearchBox value={search} onChange={setSearch} placeholder="Cerca seriale, modello, padroncino…" width={280} />
          </div>
          <div className="ds-tablewrap">
            <table className="ds-table pm2-table">
              <thead><tr>
                <Th k="codice" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Seriale / modello</Th>
                <Th k="padroncino" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Padroncino</Th>
                <Th k="stato" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Stato</Th>
                <Th k="dataAss" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}>Data assegnazione</Th>
                <Th k="tariffa" sort={{ key: sortKey, dir: sortDir }} onSort={handleSort} right>Tariffa</Th>
                <Th>Note</Th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={6}><Empty>Nessun palmare trovato</Empty></td></tr>}
                {filtered.map((p) => {
                  const attiva = p.assegnazioni?.find((a) => !a.dataFine);
                  const futura = !!attiva && attiva.dataInizio.slice(0, 10) > oggi;
                  const nota = ultimaNotaMap[p.id]?.contenuto ?? p.note ?? '';
                  return (
                    <tr key={p.id} className={`is-clickable${sel?.id === p.id ? ' is-open' : ''}`} onClick={() => setSelId(p.id)} onDoubleClick={() => navigate('/palmari/' + p.id)}>
                      <td>
                        <div className="pm2-cod">
                          <span aria-hidden="true" className="pm2-tile" style={{ background: TILE[p.stato] ?? '#A1A1AA' }}><Icon name="palm" size={12} stroke={2.2} /></span>
                          <span className="pm2-cod-t">
                            <span className="ds-mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.codice}</span>
                            <span className="pm2-sub">{[p.marca, p.modello].filter(Boolean).join(' ') || '—'}</span>
                          </span>
                        </div>
                      </td>
                      <td className="pm2-ell" style={{ color: attiva ? undefined : '#6B6B73' }}>{attiva?.ragioneSociale ?? '—'}</td>
                      <td><Dot tone={TONE[p.stato] ?? 'na'}>{STATO_LABEL[p.stato] ?? p.stato}</Dot></td>
                      <td style={{ color: futura ? '#B91C1C' : undefined }}>{attiva ? fmt(attiva.dataInizio) : '—'}</td>
                      <td className="r" style={{ color: p.tariffaMensile != null && Number(p.tariffaMensile) === 0 ? '#B91C1C' : undefined }}>{p.tariffaMensile != null ? fmtEur2(p.tariffaMensile) : '—'}</td>
                      <td className="pm2-ell pm2-sub" title={nota}>{nota}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pl2-foot">Mostrati {filtered.length} di {palmari.length} · clic su un palmare per vederne il dettaglio a destra, doppio clic per aprire la scheda</div>
        </Card>

        <Card className="pm2-side">
          {!sel ? <Empty>Nessun palmare selezionato</Empty> : (() => {
            const attiva = sel.assegnazioni?.find((a) => !a.dataFine);
            const storico = [...(sel.assegnazioni ?? [])].sort((x, y) => y.dataInizio.localeCompare(x.dataInizio));
            const campi: [string, string | null | undefined][] = [
              ['Modello', [sel.marca, sel.modello].filter(Boolean).join(' ')], ['IMEI / seriale', sel.imei],
              ['SIM / numero', sel.simNumero], ['Tariffa al giorno', sel.tariffaMensile != null ? fmtEur2(sel.tariffaMensile) : null],
              ['Padroncino', attiva?.ragioneSociale], ['Dal', attiva ? fmt(attiva.dataInizio) : null],
            ];
            const noteSel = tutteLeNote.filter((n) => n.entityId === sel.id).slice(0, 3);
            return (
              <>
                <div className="pm2-side-head">
                  <span aria-hidden="true" className="pm2-tile pm2-tile-lg" style={{ background: TILE[sel.stato] ?? '#A1A1AA' }}><Icon name="palm" size={17} stroke={2.2} /></span>
                  <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <h2 className="ds-mono" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{sel.codice}</h2>
                    <Dot tone={TONE[sel.stato] ?? 'na'}>{STATO_LABEL[sel.stato] ?? sel.stato}</Dot>
                  </div>
                  <IconButton icon="edit" label="Modifica palmare" onClick={() => navigate('/palmari/' + sel.id)} />
                  <IconButton icon="trash" label="Elimina palmare" danger onClick={() => handleDelete(sel.id, sel.codice)} />
                </div>
                <dl className="pm2-dl">
                  {campi.map(([l, v]) => (
                    <div key={l}><dt>{l}</dt><dd style={{ color: v ? undefined : '#71717A' }}>{v || 'Non inserito'}</dd></div>
                  ))}
                </dl>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 18px 14px' }}>
                  <Button size="sm" style={{ flex: '1 1 110px', justifyContent: 'center' }} onClick={() => navigate('/palmari/' + sel.id)}>Cambia stato</Button>
                  <Button size="sm" variant="primary" style={{ flex: '1 1 150px', justifyContent: 'center' }} onClick={() => navigate('/palmari/' + sel.id)}>{attiva ? 'Chiudi assegnazione' : 'Assegna'}</Button>
                </div>
                <div className="pm2-side-sec">Storico assegnazioni</div>
                {storico.length === 0
                  ? <div className="pm2-hist"><span aria-hidden="true" style={{ background: '#D4D4D8' }} /><div><span style={{ fontWeight: 500 }}>Nessuna assegnazione</span><span className="pm2-sub">Il palmare non è mai stato assegnato</span></div></div>
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
                  <label htmlFor="pm2-nota" style={{ fontSize: 12, fontWeight: 600, color: '#3F3F46' }}>Nota</label>
                  <textarea id="pm2-nota" rows={2} className="ds-input" placeholder="Aggiungi una nota su questo palmare…" value={notaSel}
                    onChange={(e) => setNotaSel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvaNotaSel(); }} />
                  {notaSel.trim() && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" variant="primary" onClick={salvaNotaSel} disabled={notaSaving}>{notaSaving ? 'Salvo…' : 'Salva nota'}</Button></div>}
                  <button type="button" className="pm2-link" onClick={() => navigate('/palmari/' + sel.id)}>Scheda e storico modifiche del palmare ↗</button>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      {/* Pannello laterale: promemoria, note e modifiche (come prima nei riquadri della pagina) */}
      {pannello && (
        <div className="fl-drawer-wrap" onClick={() => setPannello(null)}>
          <aside className="fl-drawer" role="dialog" aria-label="Promemoria, note e modifiche" onClick={(e) => e.stopPropagation()}>
            <div className="fl-drawer-head">
              <h2 className="ds-h2" style={{ fontSize: 16 }}>Palmari: promemoria e note</h2>
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
                    <label className="ds-field"><span>Palmare</span>
                      <select className="ds-input" value={notaForm.entityId} onChange={(e) => setNotaForm((f) => ({ ...f, entityId: e.target.value }))}>
                        <option value="">Scegli un palmare…</option>
                        {palmari.map((p) => <option key={p.id} value={p.id}>{p.codice}{p.marca ? ' – ' + p.marca + ' ' + (p.modello ?? '') : ''}</option>)}
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
                      const p = palmari.find((x) => x.id === n.entityId);
                      return (
                        <button key={n.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate('/palmari/' + n.entityId)}>
                          <span className="fl-line"><span className="ds-mono fl-targa">{p?.codice ?? '—'}</span><span className="fl-meta">{n.user ? `${n.user.nome} ${n.user.cognome[0]}.` : '—'} · {fmt(n.createdAt)}</span></span>
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
                    // Gli eventi di assegnazione hanno entityId = id dell'assegnazione: risolviamo il palmare per codice.
                    const relatedCodice = l.dataDopo?.codicePalmare ?? l.dataPrima?.codicePalmare;
                    const pal = palmari.find((p) => p.id === l.entityId) ?? (relatedCodice ? palmari.find((p) => p.codice === relatedCodice) : undefined);
                    const codice = pal?.codice ?? relatedCodice ?? l.dataDopo?.codice ?? l.dataPrima?.codice ?? '—';
                    const desc = describeAudit(l);
                    return (
                      <button key={l.id} type="button" className="ds-listrow fl-rowbtn fl-stack" onClick={() => navigate('/palmari/' + (pal?.id ?? l.entityId))}>
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
        fieldKey="palmare"
        fieldLabel="Palmare"
        refOptions={codiciOptions}
        editingTask={editingTask}
      />

      <NuovoPalmareModal open={nuovoOpen} onClose={() => setNuovoOpen(false)} onSave={handleCreate} />
    </Page>
  );
}
