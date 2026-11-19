// src/features/codici-autista/DettaglioCodiceAutista.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { codiciAutistaApi, padronciniApi, noteApi } from '../../lib/api';
import type { CodiceAutista, Padroncino, Nota } from '../../lib/api';
import LogEntita from '../log/LogEntita';
import ChiudiAssegnazioneModal from '../../components/ui/ChiudiAssegnazioneModal';
import type { ChiudiAssegnazioneTarget } from '../../components/ui/ChiudiAssegnazioneModal';
import { Page, PageHeader, Card, CardHead, Button, Tabs, Dot, Empty, Alert } from '../../components/ds';
import { AssegnazioniCard, NoteCard, Campo, AvvisoDataFutura } from '../../components/ui/RisorsaDettaglio';

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT') : '—';

const fmtEur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';

type TabKey = 'info' | 'assegnazioni' | 'note' | 'log';

export default function DettaglioCodiceAutista() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [autista, setAutista] = useState<CodiceAutista | null>(null);
  const [padroncini, setPadroncini] = useState<Padroncino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [assegnaForm, setAssegnaForm] = useState({ padroncinoId: '', dataInizio: '' });
  const [showAssegna, setShowAssegna] = useState(false);
  const [chiudiTarget, setChiudiTarget] = useState<ChiudiAssegnazioneTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setFormState] = useState<Partial<CodiceAutista>>({});
  const [dirty, setDirty] = useState(false);
  const [noteList, setNoteList]     = useState<Nota[]>([]);
  const [notaTesto, setNotaTesto]   = useState('');
  const [notaSaving, setNotaSaving] = useState(false);

  const set = (k: keyof CodiceAutista, v: any) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [a, pResp, noteResp] = await Promise.all([
        codiciAutistaApi.detail(id),
        padronciniApi.list({ limit: '200' }),
        noteApi.list('codice_autista', id, 100),
      ]);
      setAutista(a);
      setFormState(a);
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
      await noteApi.create({ entityType: 'codice_autista', entityId: id, contenuto: notaTesto.trim() });
      setNotaTesto('');
      setNoteList(await noteApi.list('codice_autista', id, 100));
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
      await codiciAutistaApi.update(id, {
        nome: form.nome ?? undefined,
        cognome: form.cognome ?? undefined,
        note: form.note ?? undefined,
        tariffaFissa: form.tariffaFissa ?? undefined,
        tariffaRitiro: form.tariffaRitiro ?? undefined,
        target: form.target ?? undefined,
        bonusMalus: form.bonusMalus ?? undefined,
        bonus: form.bonus ?? undefined,
        malus: form.malus ?? undefined,
        zone: form.zone ?? undefined,
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

  const handleChiudiAssegnazione = (assegnazioneId: string, nome: string, dataInizio: string) => {
    setChiudiTarget({ id: assegnazioneId, nome, dataInizio });
  };

  const confermaChiusura = async (t: ChiudiAssegnazioneTarget, dataFine: string) => {
    await codiciAutistaApi.chiudiAssegnazione(t.id, dataFine);
    setChiudiTarget(null);
    await load();
  };

  const [correggiId, setCorreggiId] = useState<string | null>(null);
  const assegnaA = async (padroncinoId: string, dataInizio: string) => {
    if (!id) return;
    await codiciAutistaApi.assegna(id, { padroncinoId, dataInizio });
    setShowAssegna(false);
    await load();
  };
  const correggiDate = async (a: { id: string }, dataInizio: string, dataFine: string | null) => {
    await codiciAutistaApi.correggiDateAssegnazione(a.id, { dataInizio, dataFine });
    await load();
  };

  if (loading) return <Page><Card pad><Empty>Caricamento codice autista…</Empty></Card></Page>;
  if (error || !autista) return (
    <Page>
      <Alert tone="ko" title={error || 'Codice autista non trovato'} actions={<Button size="sm" onClick={() => navigate('/codici-autista')}>Torna ai codici</Button>} />
    </Page>
  );

  const attiva = autista.assegnazioni?.find((a) => !a.dataFine);
  const nomeCompleto = [autista.nome, autista.cognome].filter(Boolean).join(' ');

  return (
    <Page>
      <ChiudiAssegnazioneModal
        target={chiudiTarget}
        oggetto={`Codice ${autista.codice}`}
        onClose={() => setChiudiTarget(null)}
        onConfirm={confermaChiusura}
      />
      <PageHeader
        eyebrow={`Codici autista${nomeCompleto ? ' · ' + nomeCompleto : ''}`}
        title={<span className="rd-title"><span className="rd-mono">{autista.codice}</span><Dot tone={autista.attivo ? 'ok' : 'na'}>{autista.attivo ? 'Attivo' : 'Disattivo'}</Dot></span>}
        sub={attiva ? `Assegnato a ${attiva.ragioneSociale} dal ${fmt(attiva.dataInizio)}` : 'Non assegnato'}
        actions={<>
          {attiva
            ? <Button icon="lock" onClick={() => handleChiudiAssegnazione(attiva.id, attiva.ragioneSociale, attiva.dataInizio)}>Chiudi assegnazione</Button>
            : <Button icon="link" onClick={() => { setShowAssegna(true); setActiveTab('assegnazioni'); }}>Assegna</Button>}
          <Button variant="primary" icon="check" disabled={!dirty || saving} onClick={handleSave}>{saving ? 'Salvataggio…' : dirty ? 'Salva modifiche' : 'Salvato'}</Button>
        </>}
      />

      <AvvisoDataFutura attiva={attiva} onCorreggi={() => { setActiveTab('assegnazioni'); if (attiva) setCorreggiId(attiva.id); }} />

      <Tabs label="Sezioni del codice autista" value={activeTab} onChange={(v) => setActiveTab(v as TabKey)} items={[
        { value: 'info', label: 'Dati' },
        { value: 'assegnazioni', label: 'Assegnazioni', count: autista.assegnazioni?.length ?? 0 },
        { value: 'note', label: 'Note', count: noteList.length },
        { value: 'log', label: 'Modifiche' },
      ]} />

      {activeTab === 'info' && (
        <div className="ds-g3">
          <Card pad className="ds-s2">
            <CardHead title="Dati anagrafici" />
            <div className="rd-grid">
              <Campo label="Codice">
                <input className="ds-input mono" value={autista.codice} readOnly disabled />
              </Campo>
              <Campo label="Zone">
                <input className="ds-input" value={form.zone ?? ''} onChange={(e) => set('zone', e.target.value || null)} placeholder="es. Nord, Centro…" />
              </Campo>
              <Campo label="Nome">
                <input className="ds-input" value={form.nome ?? ''} onChange={(e) => set('nome', e.target.value || null)} placeholder="—" />
              </Campo>
              <Campo label="Cognome">
                <input className="ds-input" value={form.cognome ?? ''} onChange={(e) => set('cognome', e.target.value || null)} placeholder="—" />
              </Campo>
            </div>
          </Card>
          <div className="rd-col">
            <Card pad>
              <CardHead title="Tariffe" />
              <Campo label="Tariffa fissa (€)">
                <input className="ds-input" type="number" step="0.01" value={form.tariffaFissa ?? ''}
                  onChange={(e) => set('tariffaFissa', e.target.value ? parseFloat(e.target.value) : null)} />
              </Campo>
              <Campo label="Tariffa ritiro (€)">
                <input className="ds-input" type="number" step="0.01" value={form.tariffaRitiro ?? ''}
                  onChange={(e) => set('tariffaRitiro', e.target.value ? parseFloat(e.target.value) : null)} />
              </Campo>
              <Campo label="Target">
                <input className="ds-input" type="number" step="1" value={form.target ?? ''}
                  onChange={(e) => set('target', e.target.value ? parseInt(e.target.value) : null)} />
              </Campo>
              <Campo label="Accordo bonus/malus">
                <input className="ds-input" placeholder="es. +1€ -1€ per target" value={form.bonusMalus ?? ''} onChange={(e) => set('bonusMalus', e.target.value || null)} />
              </Campo>
              <Campo label="Bonus (€, oltre target)">
                <input className="ds-input" type="number" step="0.01" value={form.bonus ?? ''}
                  onChange={(e) => set('bonus', e.target.value ? parseFloat(e.target.value) : null)} />
              </Campo>
              <Campo label="Malus (€, sotto target)">
                <input className="ds-input" type="number" step="0.01" value={form.malus ?? ''}
                  onChange={(e) => set('malus', e.target.value ? parseFloat(e.target.value) : null)} />
              </Campo>
            </Card>
            <Card pad>
              <CardHead title="Scheda" />
              <div className="rd-kv"><span>Creato il</span><b>{fmt(autista.createdAt)}</b></div>
              <div className="rd-kv"><span>Assegnazione</span><b>{attiva ? attiva.ragioneSociale : 'nessuna'}</b></div>
              {attiva && <div className="rd-kv"><span>Dal</span><b>{fmt(attiva.dataInizio)}</b></div>}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'assegnazioni' && (
        <AssegnazioniCard
          assegnazioni={autista.assegnazioni ?? []}
          padroncini={padroncini}
          oggetto={`codice ${autista.codice}`}
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
          onAggiungi={handleAddNota} onElimina={handleDeleteNota} placeholder="Aggiungi una nota su questo codice…" />
      )}

      {activeTab === 'log' && id && (
        <Card pad>
          <CardHead title="Modifiche al codice autista" />
          <LogEntita entityType="codice_autista" entityId={id} />
        </Card>
      )}
    </Page>
  );
}
