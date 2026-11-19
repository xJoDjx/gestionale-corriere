// Pezzi condivisi delle schede di dettaglio di Palmari e Codici autista (stile ds).
import { useEffect, useState, type ReactNode } from 'react';
import { Card, CardHead, Button, IconButton, Empty, Alert, Dot, Icon } from '../ds';
import type { Nota } from '../../lib/api';
import './RisorsaDettaglio.css';

export interface AssegnazioneRiga { id: string; ragioneSociale: string; dataInizio: string; dataFine?: string | null }

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT') : '—');
const iso = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const oggi = () => new Date().toISOString().slice(0, 10);

/** Campo etichetta + controllo, per le griglie dei dati */
export function Campo({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`rd-field${full ? ' is-full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Avviso se l'assegnazione attiva parte da una data futura (spesso un anno digitato male) */
export function AvvisoDataFutura({ attiva, onCorreggi }: { attiva?: AssegnazioneRiga | null; onCorreggi: () => void }) {
  if (!attiva || iso(attiva.dataInizio) <= oggi()) return null;
  return (
    <Alert tone="warn" title={`Assegnata a ${attiva.ragioneSociale} dal ${fmt(attiva.dataInizio)}: data nel futuro`}
      actions={<Button size="sm" icon="edit" onClick={onCorreggi}>Correggi la data</Button>}>
      Se è un errore di digitazione, correggila senza chiudere l'assegnazione.
    </Alert>
  );
}

/** Storico assegnazioni: nuova, chiudi, correggi date */
export function AssegnazioniCard({
  assegnazioni, padroncini, oggetto, mostraNuova, setMostraNuova, onAssegna, onChiudi, onCorreggi, correggiId, setCorreggiId,
}: {
  assegnazioni: AssegnazioneRiga[];
  padroncini: { id: string; ragioneSociale: string; attivo?: boolean }[];
  oggetto: string;
  mostraNuova: boolean;
  setMostraNuova: (v: boolean) => void;
  onAssegna: (padroncinoId: string, dataInizio: string) => Promise<void>;
  onChiudi: (a: AssegnazioneRiga) => void;
  onCorreggi: (a: AssegnazioneRiga, dataInizio: string, dataFine: string | null) => Promise<void>;
  correggiId: string | null;
  setCorreggiId: (id: string | null) => void;
}) {
  const attiva = assegnazioni.find((a) => !a.dataFine);
  const [nuova, setNuova] = useState({ padroncinoId: '', dataInizio: oggi() });
  const [bozza, setBozza] = useState<{ dataInizio: string; dataFine: string }>({ dataInizio: '', dataFine: '' });
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Se la correzione viene aperta da fuori (es. dall'avviso "data nel futuro"), precompila le date
  useEffect(() => {
    if (!correggiId) return;
    const a = assegnazioni.find((x) => x.id === correggiId);
    if (a) setBozza({ dataInizio: iso(a.dataInizio), dataFine: iso(a.dataFine) });
  }, [correggiId]); // eslint-disable-line react-hooks/exhaustive-deps

  const apriCorreggi = (a: AssegnazioneRiga) => {
    setErrore(null);
    setBozza({ dataInizio: iso(a.dataInizio), dataFine: iso(a.dataFine) });
    setCorreggiId(a.id);
  };
  const salvaCorrezione = async (a: AssegnazioneRiga) => {
    setBusy(true); setErrore(null);
    try {
      await onCorreggi(a, bozza.dataInizio, a.dataFine ? (bozza.dataFine || null) : null);
      setCorreggiId(null);
    } catch (e: any) { setErrore(e.message ?? 'Errore'); }
    finally { setBusy(false); }
  };
  const conferma = async () => {
    if (!nuova.padroncinoId || !nuova.dataInizio) return;
    setBusy(true); setErrore(null);
    try { await onAssegna(nuova.padroncinoId, nuova.dataInizio); setNuova({ padroncinoId: '', dataInizio: oggi() }); }
    catch (e: any) { setErrore(e.message ?? 'Errore'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="rd-head">
        <CardHead title="Storico assegnazioni" sub={`${assegnazioni.length} ${assegnazioni.length === 1 ? 'assegnazione' : 'assegnazioni'} di ${oggetto}`} />
        {!attiva && !mostraNuova && <Button size="sm" variant="primary" icon="plus" onClick={() => setMostraNuova(true)}>Nuova assegnazione</Button>}
      </div>

      {errore && <div className="rd-pad"><Alert tone="ko" title="Non salvato">{errore}</Alert></div>}

      {mostraNuova && !attiva && (
        <div className="rd-form">
          <Campo label="Padroncino">
            <select className="ds-input" value={nuova.padroncinoId} onChange={(e) => setNuova((f) => ({ ...f, padroncinoId: e.target.value }))}>
              <option value="">Scegli…</option>
              {padroncini.filter((p) => p.attivo !== false).map((p) => <option key={p.id} value={p.id}>{p.ragioneSociale}</option>)}
            </select>
          </Campo>
          <Campo label="Dal">
            <input type="date" className="ds-input" value={nuova.dataInizio} onChange={(e) => setNuova((f) => ({ ...f, dataInizio: e.target.value }))} />
          </Campo>
          <div className="rd-form-actions">
            <Button size="sm" onClick={() => setMostraNuova(false)}>Annulla</Button>
            <Button size="sm" variant="primary" icon="check" disabled={busy || !nuova.padroncinoId || !nuova.dataInizio} onClick={conferma}>Assegna</Button>
          </div>
        </div>
      )}

      {assegnazioni.length === 0 ? <Empty>Nessuna assegnazione registrata</Empty> : (
        <div className="rd-list">
          {assegnazioni.map((a) => {
            const inCorso = !a.dataFine;
            const futura = inCorso && iso(a.dataInizio) > oggi();
            const editing = correggiId === a.id;
            return (
              <div key={a.id} className={`rd-row${inCorso ? ' is-on' : ''}`}>
                <div className="rd-row-main">
                  <span className="rd-row-name">{a.ragioneSociale}</span>
                  {editing ? (
                    <span className="rd-dates">
                      <input type="date" className="ds-input" aria-label="Data di inizio" value={bozza.dataInizio} onChange={(e) => setBozza((b) => ({ ...b, dataInizio: e.target.value }))} />
                      <Icon name="chevRight" size={12} />
                      {inCorso
                        ? <span className="rd-muted">in corso</span>
                        : <input type="date" className="ds-input" aria-label="Data di fine" value={bozza.dataFine} onChange={(e) => setBozza((b) => ({ ...b, dataFine: e.target.value }))} />}
                    </span>
                  ) : (
                    <span className="rd-muted">
                      {fmt(a.dataInizio)} → {a.dataFine ? fmt(a.dataFine) : 'in corso'}
                      {futura && <span className="rd-warn"> · data nel futuro</span>}
                    </span>
                  )}
                </div>
                <div className="rd-row-actions">
                  {inCorso && !editing && <Dot tone="ok">In corso</Dot>}
                  {editing ? (
                    <>
                      <Button size="sm" onClick={() => setCorreggiId(null)}>Annulla</Button>
                      <Button size="sm" variant="primary" icon="check" disabled={busy || !bozza.dataInizio} onClick={() => salvaCorrezione(a)}>Salva date</Button>
                    </>
                  ) : (
                    <>
                      <IconButton icon="edit" label="Correggi le date" onClick={() => apriCorreggi(a)} />
                      {inCorso && <Button size="sm" icon="lock" onClick={() => onChiudi(a)}>Chiudi</Button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="rd-foot">Correggere le date non ricalcola i conteggi già salvati: valgono per quelli creati o ricalcolati dopo.</div>
    </Card>
  );
}

/** Note libere con autore e data */
export function NoteCard({ note, testo, setTesto, salvando, onAggiungi, onElimina, placeholder }: {
  note: Nota[]; testo: string; setTesto: (v: string) => void; salvando: boolean;
  onAggiungi: () => void; onElimina: (id: string) => void; placeholder: string;
}) {
  return (
    <Card>
      <div className="rd-head"><CardHead title="Note" sub={`${note.length} ${note.length === 1 ? 'nota' : 'note'}`} /></div>
      <div className="rd-noteadd">
        <textarea className="ds-input" rows={3} placeholder={placeholder} value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAggiungi(); }} />
        <div className="rd-form-actions">
          <span className="rd-muted">Ctrl+Invio per salvare</span>
          <Button size="sm" variant="primary" icon="plus" disabled={salvando || !testo.trim()} onClick={onAggiungi}>{salvando ? 'Salvo…' : 'Aggiungi nota'}</Button>
        </div>
      </div>
      {note.length === 0 ? <Empty>Nessuna nota registrata</Empty> : (
        <div className="rd-list">
          {note.map((n) => (
            <div key={n.id} className="rd-note">
              <span className="rd-avatar">{n.user ? `${n.user.nome?.[0] ?? ''}${n.user.cognome?.[0] ?? ''}` : '?'}</span>
              <div className="rd-note-main">
                <span className="rd-muted"><b>{n.user ? `${n.user.nome} ${n.user.cognome}` : 'Sistema'}</b> · {new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <p>{n.contenuto}</p>
              </div>
              <IconButton icon="trash" danger label="Elimina nota" onClick={() => onElimina(n.id)} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
