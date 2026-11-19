// src/features/palmari/DettaglioPalmare.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { palmariApi, padronciniApi, noteApi } from '../../lib/api';
import type { Palmare, Padroncino, Nota } from '../../lib/api';
import LogEntita from '../log/LogEntita';
import ChiudiAssegnazioneModal from '../../components/ui/ChiudiAssegnazioneModal';
import type { ChiudiAssegnazioneTarget } from '../../components/ui/ChiudiAssegnazioneModal';
import { Page, PageHeader, Card, CardHead, Button, Tabs, Dot, Empty, Alert, type Tone } from '../../components/ds';
import { AssegnazioniCard, NoteCard, Campo, AvvisoDataFutura } from '../../components/ui/RisorsaDettaglio';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

const STATO_META: Record<string, { label: string; tone: string }> = {
  DISPONIBILE: { label: 'Disponibile', tone: 'info' },
  ASSEGNATO:   { label: 'Assegnato',   tone: 'ok' },
  GUASTO:      { label: 'Guasto',      tone: 'ko' },
  DISMESSO:    { label: 'Dismesso',    tone: 'na' },
};

type TabKey = 'info' | 'assegnazioni' | 'note' | 'log';

export default function DettaglioPalmare() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [palmare, setPalmare] = useState<Palmare | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [assegnaForm, setAssegnaForm] = useState({ padroncinoId: '', dataInizio: '' });
  const [showAssegna, setShowAssegna] = useState(false);
  const [chiudiTarget, setChiudiTarget] = useState<ChiudiAssegnazioneTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setFormState] = useState<Partial<Palmare>>({});
  const [dirty, setDirty] = useState(false);
  const [noteList, setNoteList]     = useState<Nota[]>([]);
  const [notaTesto, setNotaTesto]   = useState('');
  const [notaSaving, setNotaSaving] = useState(false);

  const set = (k: keyof Palmare, v: any) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, pResp, noteResp] = await Promise.all([
        palmariApi.detail(id),
        padronciniApi.list({ limit: '200' }),
        noteApi.list('palmare', id, 100),
      ]);
      setPalmare(p);
      setFormState(p);
      setDirty(false);
      setPadroncini(pResp.data);
      setNoteList(noteResp);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddNota = async () => {
    if (!id || !notaTesto.trim()) return;
    setNotaSaving(true);
    try {
      await noteApi.create({ entityType: 'palmare', entityId: id, contenuto: notaTesto.trim() });
      setNotaTesto('');
      setNoteList(await noteApi.list('palmare', id, 100));
    } catch (e: any) { alert('Errore: ' + e.message); }
    finally { setNotaSaving(false); }
  };

  const handleDeleteNota = async (notaId: string) => {
    if (!confirm('Eliminare questa nota?')) return;
    try {
      await noteApi.remove(notaId);
      setNoteList(prev => prev.filter(n => n.id !== notaId));
    } catch (e: any) { alert('Errore: ' + e.message); }
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await palmariApi.update(id, {
        codice: form.codice,
        marca: form.marca ?? undefined,
        modello: form.modello ?? undefined,
        imei: form.imei ?? undefined,
        simNumero: form.simNumero ?? undefined,
        tariffaMensile: form.tariffaMensile ?? undefined,
        stato: form.stato,
        note: form.note ?? undefined,
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

  const handleChiudiAssegnazione = (assegnazioneId: string, nome: string, dataInizio: string) => {
    setChiudiTarget({ id: assegnazioneId, nome, dataInizio });
  };

  const confermaChiusura = async (t: ChiudiAssegnazioneTarget, dataFine: string) => {
    await palmariApi.chiudiAssegnazione(t.id, dataFine);
    setChiudiTarget(null);
    await load();
  };

  const [correggiId, setCorreggiId] = useState<string | null>(null);
  const assegnaA = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await palmariApi.assegna(id, { padroncinoId, dataInizio });
    setShowAssegna(false);
    await load();
  };
  const correggiDate = async (a: { id: string }, dataInizio: string, dataFine: string | null) => {
    await palmariApi.correggiDateAssegnazione(a.id, { dataInizio, dataFine });
    await load();
  };

  if (loading) return <Page><Card pad><Empty>Caricamento palmare…</Empty></Card></Page>;
  if (error || !palmare) return (
    <Page>
      <Alert tone="ko" title={error || 'Palmare non trovato'} actions={<Button size="sm" onClick={() => navigate('/palmari')}>Torna ai palmari</Button>} />
    </Page>
  );

  const attiva = palmare.assegnazioni?.find((a) => !a.dataFine);
  const meta = STATO_META[palmare.stato] || { label: palmare.stato, tone: 'na' };
  const tariffa = form.tariffaMensile != null && form.tariffaMensile !== ('' as any) ? Number(form.tariffaMensile) : null;

  return (
    <Page>
      <ChiudiAssegnazioneModal
        target={chiudiTarget}
        oggetto={`Palmare ${palmare.codice}`}
        onClose={() => setChiudiTarget(null)}
        onConfirm={confermaChiusura}
      />
      <PageHeader
        eyebrow={`Palmari${[palmare.marca, palmare.modello].filter(Boolean).length ? ' · ' + [palmare.marca, palmare.modello].filter(Boolean).join(' ') : ''}`}
        title={<span className="rd-title"><span className="rd-mono">{palmare.codice}</span><Dot tone={meta.tone as Tone}>{meta.label}</Dot></span>}
        sub={attiva ? `Assegnato a ${attiva.ragioneSociale} dal ${fmt(attiva.dataInizio)}` : 'Non assegnato'}
        actions={<>
          {attiva
            ? <Button icon="lock" onClick={() => handleChiudiAssegnazione(attiva.id, attiva.ragioneSociale, attiva.dataInizio)}>Chiudi assegnazione</Button>
            : <Button icon="link" onClick={() => { setShowAssegna(true); setActiveTab('assegnazioni'); }}>Assegna</Button>}
          <Button variant="primary" icon="check" disabled={!dirty || saving} onClick={handleSave}>{saving ? 'Salvataggio…' : dirty ? 'Salva modifiche' : 'Salvato'}</Button>
        </>}
      />

      <AvvisoDataFutura attiva={attiva} onCorreggi={() => { setActiveTab('assegnazioni'); if (attiva) setCorreggiId(attiva.id); }} />

      <Tabs label="Sezioni del palmare" value={activeTab} onChange={(v) => setActiveTab(v as TabKey)} items={[
        { value: 'info', label: 'Dati' },
        { value: 'assegnazioni', label: 'Assegnazioni', count: palmare.assegnazioni?.length ?? 0 },
        { value: 'note', label: 'Note', count: noteList.length },
        { value: 'log', label: 'Modifiche' },
      ]} />

      {activeTab === 'info' && (
        <div className="ds-g3">
          <Card pad className="ds-s2">
            <CardHead title="Identificazione" />
            <div className="rd-grid">
              <Campo label="Codice">
                <input className="ds-input mono" value={form.codice ?? ''} onChange={(e) => set('codice', e.target.value.toUpperCase())} />
              </Campo>
              <Campo label="Stato">
                <select className="ds-input" value={form.stato ?? ''} onChange={(e) => set('stato', e.target.value)}>
                  <option value="DISPONIBILE">Disponibile</option>
                  <option value="ASSEGNATO">Assegnato</option>
                  <option value="GUASTO">Guasto</option>
                  <option value="DISMESSO">Dismesso</option>
                </select>
              </Campo>
              <Campo label="Marca">
                <input className="ds-input" value={form.marca ?? ''} onChange={(e) => set('marca', e.target.value)} placeholder="—" />
              </Campo>
              <Campo label="Modello">
                <input className="ds-input" value={form.modello ?? ''} onChange={(e) => set('modello', e.target.value)} placeholder="—" />
              </Campo>
              <Campo label="IMEI / seriale">
                <input className="ds-input mono" value={form.imei ?? ''} onChange={(e) => set('imei', e.target.value)} placeholder="—" />
              </Campo>
              <Campo label="SIM / numero">
                <input className="ds-input mono" value={form.simNumero ?? ''} onChange={(e) => set('simNumero', e.target.value)} placeholder="—" />
              </Campo>
            </div>
          </Card>
          <div className="rd-col">
            <Card pad>
              <CardHead title="Tariffa" />
              <Campo label="Tariffa giornaliera (€/giorno)">
                <input className="ds-input" type="number" step="0.01" value={form.tariffaMensile ?? ''}
                  onChange={(e) => set('tariffaMensile', e.target.value ? parseFloat(e.target.value) : null)} />
              </Campo>
              {tariffa != null && <span className="rd-hint">Mese (30 gg): {fmtEur(tariffa * 30)} · anno: {fmtEur(tariffa * 365)}</span>}
            </Card>
            <Card pad>
              <CardHead title="Scheda" />
              <div className="rd-kv"><span>Creato il</span><b>{fmt(palmare.createdAt)}</b></div>
              <div className="rd-kv"><span>Assegnazione</span><b>{attiva ? attiva.ragioneSociale : 'nessuna'}</b></div>
              {attiva && <div className="rd-kv"><span>Dal</span><b>{fmt(attiva.dataInizio)}</b></div>}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'assegnazioni' && (
        <AssegnazioniCard
          assegnazioni={palmare.assegnazioni ?? []}
          padroncini={padroncini}
          oggetto={`palmare ${palmare.codice}`}
          mostraNuova={showAssegna}
          setMostraNuova={setShowAssegna}
          onAssegna={assegnaA}
          onChiudi={(a) => handleChiudiAssegnazione(a.id, a.ragioneSociale, a.dataInizio)}
          onCorreggi={correggiDate}
          correggiId={correggiId}
          setCorreggiId={setCorreggiId}
        />
      )}

      {activeTab === 'note' && (
        <NoteCard note={noteList} testo={notaTesto} setTesto={setNotaTesto} salvando={notaSaving}
          onAggiungi={handleAddNota} onElimina={handleDeleteNota} placeholder="Aggiungi una nota su questo palmare…" />
      )}

      {activeTab === 'log' && id && (
        <Card pad>
          <CardHead title="Modifiche al palmare" />
          <LogEntita entityType="palmare" entityId={id} />
        </Card>
      )}
    </Page>
  );
}
