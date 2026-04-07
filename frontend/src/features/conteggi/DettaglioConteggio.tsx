// src/features/conteggi/DettaglioConteggio.tsx
// Dettaglio conteggio padroncino — dati reali + tab Compensazioni
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import { conteggiApi } from '../../lib/conteggi.api';
import './DettaglioConteggio.css';

// ─── TIPI ──────────────────────────────────────────────────────────────────────
interface RigaFatturato {
  id: string; descrizione: string; valore: number | null; nota: string;
}
interface RigaNoleggioMezzo {
  id: string; mezzoId: string | null; targa: string;
  valoreRataNoIva: number | null; percIva: number; alimentazione: string; note: string; isManuale: boolean;
}
interface RigaRicarica {
  id: string; mezzoId: string | null; targa: string;
  costoRicarica: number | null; percIva: number; note: string; isManuale: boolean;
}
interface RigaAddebito {
  id: string; descrizione: string; valoreNoIva: number | null; percIva: number; note: string;
}
interface RigaCompensazione {
  id: string; descrizione: string; valore: number | null; nota: string;
}
interface RigaFineMese {
  id: string; descrizione: string; valore: number | null; nota: string;
}
interface RigaCassaAcconto {
  id: string; accontoId: string | null; codice: string;
  descrizione: string; data: string; valore: number | null; nota: string; readonly: boolean;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function formatMese(m: string) {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}
function getDaysInMonth(mese: string): number {
  const [y, m] = mese.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtData = (d: string) => {
  try { return new Date(d).toLocaleDateString('it-IT'); } catch { return d; }
};

const SOGLIA_BOLLO = 77.47;
const COSTO_BOLLO = 2.00;
const CHECKLIST_KEY = (padId: string, mese: string) => `checklist_${padId}_${mese}`;
function loadChecklist(padId: string, mese: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY(padId, mese));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false };
}
function saveChecklist(padId: string, mese: string, data: Record<string, boolean>) {
  localStorage.setItem(CHECKLIST_KEY(padId, mese), JSON.stringify(data));
}

let _id = 0;
const newId = () => `new-${++_id}`;

// ─── CHECKLIST CONFIG ──────────────────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { key: 'distribuzioneInviata', label: 'Distribuzione Inviata', icon: '📤' },
  { key: 'pdfAddebitiCreato', label: 'PDF Addebiti Creato', icon: '📄' },
  { key: 'fatturaCreata', label: 'Fattura Tu Creata', icon: '🧾' },
  { key: 'fatturaRicevuta', label: 'Fattura Ricevuta', icon: '✅' },
];

// ─── COMPONENTI TABELLA EXCEL ──────────────────────────────────────────────────
function ExcelTable({ children, headers }: { children: React.ReactNode; headers: React.ReactNode[] }) {
  return (
    <div className="dc-excel-wrap">
      <table className="dc-excel-table">
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SectionBlock({
  title, icon, onAdd, children, totaleLabel, totale,
}: {
  title: string; icon: string; onAdd: () => void; children: React.ReactNode;
  totaleLabel?: string; totale?: number;
}) {
  return (
    <div className="dc-addebiti-section">
      <div className="dc-section-subheader">
        <div className="dc-section-subheader-title"><span>{icon}</span><span>{title}</span></div>
        <button className="dc-btn-add-small" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      {children}
      {totaleLabel != null && totale != null && (
        <div className="dc-section-tot">
          <span>{totaleLabel}</span>
          <span className="dc-tot-val">{eur(totale)}</span>
        </div>
      )}
    </div>
  );
}

// ─── TAB RIEPILOGO ─────────────────────────────────────────────────────────────
function TabRiepilogo({ padroncino, mese, totFatturato, totAddebitiConIva, totCompen, checklist, onChecklistChange }: {
  padroncino: Padroncino; mese: string;
  totFatturato: number; totAddebitiConIva: number; totCompen: number;
  checklist: Record<string, boolean>; onChecklistChange: (key: string, val: boolean) => void;
}) {
  const netto = totFatturato - totAddebitiConIva - totCompen;
  return (
    <div className="dc-riepilogo">
      <div className="dc-riepilogo-grid">
        <div className="dc-riepilogo-numeri">
          {/* Info padroncino */}
          <div className="dc-riepilogo-section">
            <h3>📊 Dati Padroncino</h3>
            <div className="dc-riepilogo-table">
              {[
                ['Ragione Sociale', padroncino.ragioneSociale],
                ['Partita IVA', padroncino.partitaIva],
                ['Mese', formatMese(mese)],
                ['Mezzi assegnati', padroncino.mezziAssegnati?.length ?? 0],
                ['Palmari assegnati', padroncino.palmariAssegnati?.length ?? 0],
              ].map(([label, val]) => (
                <div key={String(label)} className="dc-riepilogo-row">
                  <span className="dc-riepilogo-label">{label}</span>
                  <span className="dc-riepilogo-val">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fatturato */}
          <div className="dc-riepilogo-section">
            <h3>💶 Fatturato Distribuzione</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row">
                <span className="dc-riepilogo-label">Totale imponibile</span>
                <span className="dc-riepilogo-val dc-val-pos">{eur(totFatturato)}</span>
              </div>
              <div className="dc-riepilogo-row">
                <span className="dc-riepilogo-label">IVA (22%)</span>
                <span className="dc-riepilogo-val">{eur(totFatturato * 0.22)}</span>
              </div>
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale Fattura</span>
                <span className="dc-riepilogo-val dc-val-pos">{eur(totFatturato * 1.22)}</span>
              </div>
            </div>
          </div>

          {/* Addebiti */}
          <div className="dc-riepilogo-section">
            <h3>📋 Addebiti Totali (con IVA)</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale addebiti</span>
                <span className="dc-riepilogo-val dc-val-neg">- {eur(totAddebitiConIva)}</span>
              </div>
            </div>
          </div>

          {/* Compensazioni */}
          <div className="dc-riepilogo-section">
            <h3>⚖️ Compensazioni</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold">
                <span className="dc-riepilogo-label">Totale compensazioni</span>
                <span className="dc-riepilogo-val dc-val-neg">- {eur(totCompen)}</span>
              </div>
            </div>
          </div>

          {/* Saldo finale */}
          <div className="dc-riepilogo-section dc-riepilogo-section-finale">
            <h3>🏁 Saldo Netto da Bonificare</h3>
            <div className="dc-riepilogo-table">
              <div className="dc-riepilogo-row dc-riepilogo-row-bold dc-riepilogo-row-netto">
                <span className="dc-riepilogo-label">Netto da bonificare</span>
                <span className={`dc-riepilogo-val dc-val-big ${netto >= 0 ? 'dc-val-pos' : 'dc-val-neg'}`}>
                  {eur(netto)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="dc-riepilogo-checklist">
          <h3>✅ Stato Avanzamento</h3>
          <div className="dc-checklist-items">
            {CHECKLIST_ITEMS.map((item, i) => {
              const done = checklist[item.key] ?? false;
              return (
                <div key={item.key} className={`dc-checklist-item ${done ? 'dc-check-done' : ''}`}
                  onClick={() => onChecklistChange(item.key, !done)}>
                  <div className="dc-check-step">{i + 1}</div>
                  <div className="dc-check-icon">{item.icon}</div>
                  <div className="dc-check-content">
                    <span className="dc-check-label">{item.label}</span>
                    <span className="dc-check-status">{done ? 'Completato' : 'Da fare'}</span>
                  </div>
                  <div className={`dc-check-toggle ${done ? 'dc-toggle-on' : ''}`}>{done ? '✓' : '○'}</div>
                </div>
              );
            })}
          </div>
          <div className="dc-checklist-progress">
            <div className="dc-checklist-prog-bar">
              <div className="dc-checklist-prog-fill"
                style={{ width: `${(Object.values(checklist).filter(Boolean).length / 4) * 100}%` }} />
            </div>
            <span>{Object.values(checklist).filter(Boolean).length}/4 completati</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB FATTURATO ──────────────────────────────────────────────────────────────
function TabFatturato({ righe, onChange, onAdd, onDelete }: {
  righe: RigaFatturato[];
  onChange: (id: string, f: keyof RigaFatturato, v: any) => void;
  onAdd: () => void; onDelete: (id: string) => void;
}) {
  const totImponibile = righe.reduce((s, r) => s + (r.valore ?? 0), 0);
  return (
    <div className="dc-tab-content">
      <div className="dc-section-header">
        <h3>💶 Fatturato Distribuzione</h3>
        <button className="dc-btn-add-row" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      <ExcelTable headers={['#','Descrizione','Valore (€)','Nota','']}>
        {righe.length === 0 ? (
          <tr><td colSpan={5} className="dc-excel-empty">Nessuna voce. Aggiungi una riga.</td></tr>
        ) : righe.map((r, i) => (
          <tr key={r.id} className="dc-excel-row">
            <td className="dc-excel-idx">{i + 1}</td>
            <td><input className="dc-excel-input" value={r.descrizione}
              onChange={(e) => onChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." /></td>
            <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
              onChange={(e) => onChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
              placeholder="0,00" /></td>
            <td><input className="dc-excel-input" value={r.nota}
              onChange={(e) => onChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
            <td><button className="dc-del-btn" onClick={() => onDelete(r.id)}>×</button></td>
          </tr>
        ))}
      </ExcelTable>
      <div className="dc-fatturato-totali">
        {[
          ['Totale Imponibile', totImponibile, ''],
          ['IVA (22%)', totImponibile * 0.22, ''],
          ['Totale Fattura da Ricevere', totImponibile * 1.22, 'dc-val-pos'],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className={`dc-tot-row ${label === 'Totale Fattura da Ricevere' ? 'dc-tot-finale' : ''}`}>
            <span>{label}</span>
            <span className={`dc-tot-val ${cls}`}>{eur(val as number)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TAB ADDEBITI ──────────────────────────────────────────────────────────────
function TabAddebiti({
  giorniMese, numeroPalmari, tariffaPalmareGiornaliera,
  mezzi, onMezziChange, onMezziAdd, onMezziDelete,
  ricariche, onRicaricheChange, onRicaricheAdd, onRicaricheDelete,
  addebitiVari, onAddebitiVariChange, onAddebitiVariAdd, onAddebitiVariDelete,
}: {
  giorniMese: number;
  numeroPalmari: number;
  tariffaPalmareGiornaliera: number;
  mezzi: RigaNoleggioMezzo[];
  onMezziChange: (id: string, f: keyof RigaNoleggioMezzo, v: any) => void;
  onMezziAdd: () => void; onMezziDelete: (id: string) => void;
  ricariche: RigaRicarica[];
  onRicaricheChange: (id: string, f: keyof RigaRicarica, v: any) => void;
  onRicaricheAdd: () => void; onRicaricheDelete: (id: string) => void;
  addebitiVari: RigaAddebito[];
  onAddebitiVariChange: (id: string, f: keyof RigaAddebito, v: any) => void;
  onAddebitiVariAdd: () => void; onAddebitiVariDelete: (id: string) => void;
}) {
  // Palmari: n palmari × tariffa giornaliera × giorni mese
  const costoPalmariNoIva = numeroPalmari * tariffaPalmareGiornaliera * giorniMese;
  const costoPalmariConIva = costoPalmariNoIva * 1.22;

  const totMezziNoIva = mezzi.reduce((s, r) => s + (r.valoreRataNoIva ?? 0), 0);
  const totMezziConIva = mezzi.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);

  const totRicaricheNoIva = ricariche.reduce((s, r) => s + (r.costoRicarica ?? 0), 0);
  const totRicaricheConIva = ricariche.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);

  const totVariNoIva = addebitiVari.reduce((s, r) => s + (r.valoreNoIva ?? 0), 0);
  const totVariConIva = addebitiVari.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);

  // Bollo: scatta se ci sono addebiti IVA ≠ 22% con imponibile ≥ 77.47€
  const bolloAttivo =
    ricariche.some((r) => r.percIva !== 22 && (r.costoRicarica ?? 0) >= SOGLIA_BOLLO) ||
    addebitiVari.some((r) => r.percIva !== 22 && (r.valoreNoIva ?? 0) >= SOGLIA_BOLLO);

  const totaleAddebiti = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + (bolloAttivo ? COSTO_BOLLO : 0);

  return (
    <div className="dc-tab-content">

      {/* ── PALMARI: singola riga calcolata ── */}
      <div className="dc-addebiti-section">
        <div className="dc-section-subheader">
          <div className="dc-section-subheader-title"><span>📱</span><span>Addebiti Noleggio Palmari</span></div>
        </div>
        <div className="dc-palmari-box">
          <div className="dc-palmari-info">
            <div className="dc-palmari-kv">
              <span>Palmari assegnati</span><strong>{numeroPalmari}</strong>
            </div>
            <div className="dc-palmari-kv">
              <span>Tariffa giornaliera</span><strong>{eur(tariffaPalmareGiornaliera)}</strong>
            </div>
            <div className="dc-palmari-kv">
              <span>IVA</span><strong>22%</strong>
            </div>
          </div>
          <div className="dc-palmari-result">
            <div className="dc-palmari-calc">{numeroPalmari} × {eur(tariffaPalmareGiornaliera)} × {giorniMese}gg</div>
            <div className="dc-palmari-noiva">No IVA: <strong>{eur(costoPalmariNoIva)}</strong></div>
            <div className="dc-palmari-ivata">Con IVA (22%): <strong className="dc-val-primary">{eur(costoPalmariConIva)}</strong></div>
          </div>
        </div>
      </div>

      {/* ── MEZZI ── */}
      <SectionBlock title="Addebiti Noleggi Mezzi" icon="🚛" onAdd={onMezziAdd}
        totaleLabel="Totale Mezzi (con IVA)" totale={totMezziConIva}>
        <ExcelTable headers={['Targa','Rata No IVA (€)','IVA %','Rata Ivata (€)','Alimentazione','Note','']}>
          {mezzi.length === 0 ? (
            <tr><td colSpan={7} className="dc-excel-empty">Nessun mezzo assegnato.</td></tr>
          ) : mezzi.map((r) => {
            const rataIvata = (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100);
            return (
              <tr key={r.id} className="dc-excel-row">
                <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                  onChange={(e) => onMezziChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreRataNoIva ?? ''}
                  onChange={(e) => onMezziChange(r.id, 'valoreRataNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" value={r.percIva}
                  onChange={(e) => onMezziChange(r.id, 'percIva', parseFloat(e.target.value) || 22)} /></td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(rataIvata || null)}</td>
                <td>
                  <select className="dc-excel-select" value={r.alimentazione}
                    onChange={(e) => onMezziChange(r.id, 'alimentazione', e.target.value)}>
                    <option value="DIESEL">🛢 Diesel</option>
                    <option value="ELETTRICO">⚡ Elettrico</option>
                    <option value="BENZINA">⛽ Benzina</option>
                    <option value="IBRIDO">🔋 Ibrido</option>
                  </select>
                </td>
                <td><input className="dc-excel-input" value={r.note}
                  onChange={(e) => onMezziChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
                <td>{r.isManuale && <button className="dc-del-btn" onClick={() => onMezziDelete(r.id)}>×</button>}</td>
              </tr>
            );
          })}
        </ExcelTable>
      </SectionBlock>

      {/* ── RICARICHE ELETTRICHE ── */}
      <SectionBlock title="Addebiti Ricariche Elettriche" icon="⚡" onAdd={onRicaricheAdd}
        totaleLabel="Totale Ricariche (con IVA)" totale={totRicaricheConIva}>
        <ExcelTable headers={['Targa','Costo Ricarica (€)','IVA %','Costo con IVA','Note','']}>
          {ricariche.length === 0 ? (
            <tr><td colSpan={6} className="dc-excel-empty">Nessun mezzo elettrico assegnato.</td></tr>
          ) : ricariche.map((r) => (
            <tr key={r.id} className="dc-excel-row">
              <td><input className="dc-excel-input dc-targa" value={r.targa} maxLength={8}
                onChange={(e) => onRicaricheChange(r.id, 'targa', e.target.value.toUpperCase())} /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.costoRicarica != null ? Number(r.costoRicarica).toFixed(2) : ''}
                onChange={(e) => onRicaricheChange(r.id, 'costoRicarica', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" value={r.percIva}
                onChange={(e) => onRicaricheChange(r.id, 'percIva', parseFloat(e.target.value) || 5)} /></td>
              <td className="dc-excel-computed dc-computed-highlight">
                {eur((r.costoRicarica ?? 0) * (1 + r.percIva / 100) || null)}
              </td>
              <td><input className="dc-excel-input" value={r.note}
                onChange={(e) => onRicaricheChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
              <td>{r.isManuale && <button className="dc-del-btn" onClick={() => onRicaricheDelete(r.id)}>×</button>}</td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── ADDEBITI VARI ── */}
      <SectionBlock title="Addebiti Vari" icon="📝" onAdd={onAddebitiVariAdd}
        totaleLabel="Totale Vari (con IVA)" totale={totVariConIva}>
        <ExcelTable headers={['Descrizione','Valore No IVA (€)','IVA %','Valore IVA (€)','Note','']}>
          {addebitiVari.length === 0 ? (
            <tr><td colSpan={6} className="dc-excel-empty">Nessun addebito vario.</td></tr>
          ) : addebitiVari.map((r) => {
            const ivaCalc = (r.valoreNoIva ?? 0) * (r.percIva / 100);
            return (
              <tr key={r.id} className="dc-excel-row">
                <td><input className="dc-excel-input" value={r.descrizione}
                  onChange={(e) => onAddebitiVariChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valoreNoIva ?? ''}
                  onChange={(e) => onAddebitiVariChange(r.id, 'valoreNoIva', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0,00" /></td>
                <td><input className="dc-excel-input dc-excel-num" type="number" value={r.percIva}
                  onChange={(e) => onAddebitiVariChange(r.id, 'percIva', parseFloat(e.target.value) || 22)} /></td>
                <td className="dc-excel-computed dc-computed-highlight">{eur(ivaCalc || null)}</td>
                <td><input className="dc-excel-input" value={r.note}
                  onChange={(e) => onAddebitiVariChange(r.id, 'note', e.target.value)} placeholder="Note..." /></td>
                <td><button className="dc-del-btn" onClick={() => onAddebitiVariDelete(r.id)}>×</button></td>
              </tr>
            );
          })}
        </ExcelTable>
      </SectionBlock>

      {/* Bollo */}
      {bolloAttivo && (
        <div className="dc-bollo-alert">
          <span className="dc-bollo-icon">📮</span>
          <div>
            <strong>Addebito Bollo €2,00 — attivato automaticamente</strong>
            <p>Presenti addebiti con IVA ≠ 22% di importo ≥ {SOGLIA_BOLLO.toFixed(2)} €</p>
          </div>
          <span className="dc-bollo-val">{eur(COSTO_BOLLO)}</span>
        </div>
      )}

      {/* Totale finale */}
      <div className="dc-addebiti-finale">
        {[
          ['Noleggio Palmari (con IVA)', costoPalmariConIva],
          ['Noleggi Mezzi (con IVA)', totMezziConIva],
          ['Ricariche Elettriche (con IVA)', totRicaricheConIva],
          ['Addebiti Vari (con IVA)', totVariConIva],
          ...(bolloAttivo ? [['Bollo virtuale', COSTO_BOLLO]] : []),
        ].map(([label, val]) => (
          <div key={String(label)} className="dc-addebiti-finale-row">
            <span>{label}</span>
            <span>{eur(val as number)}</span>
          </div>
        ))}
        <div className="dc-addebiti-finale-row dc-addebiti-finale-total">
          <span>TOTALE ADDEBITI DA INSERIRE IN FATTURA</span>
          <span className="dc-val-neg">{eur(totaleAddebiti)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── TAB COMPENSAZIONI ─────────────────────────────────────────────────────────
function TabCompensazioni({
  accrediti, onAccreditiChange, onAccreditiAdd, onAccreditiDelete,
  fineMese, onFineMeseChange, onFineMeseAdd, onFineMeseDelete,
  cassa, onCassaChange, onCassaAdd, onCassaDelete,
  totAddebitiConIva,
}: {
  accrediti: RigaCompensazione[];
  onAccreditiChange: (id: string, f: keyof RigaCompensazione, v: any) => void;
  onAccreditiAdd: () => void; onAccreditiDelete: (id: string) => void;
  fineMese: RigaFineMese[];
  onFineMeseChange: (id: string, f: keyof RigaFineMese, v: any) => void;
  onFineMeseAdd: () => void; onFineMeseDelete: (id: string) => void;
  cassa: RigaCassaAcconto[];
  onCassaChange: (id: string, f: keyof RigaCassaAcconto, v: any) => void;
  onCassaAdd: () => void; onCassaDelete: (id: string) => void;
  totAddebitiConIva: number;
}) {
  const totAccrediti = accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese = fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCassa = cassa.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totaleCompensazioni = totAccrediti + totFineMese + totCassa;
  const saldoFinale = totAddebitiConIva - totaleCompensazioni;

  return (
    <div className="dc-tab-content">

      {/* ── ACCREDITI E STORNI ── */}
      <SectionBlock title="Accrediti e Storni" icon="↩️" onAdd={onAccreditiAdd}
        totaleLabel="Totale Accrediti/Storni" totale={totAccrediti}>
        <ExcelTable headers={['#', 'Descrizione', 'Valore (€)', 'Nota', '']}>
          {accrediti.length === 0 ? (
            <tr><td colSpan={5} className="dc-excel-empty">Nessun accredito o storno inserito.</td></tr>
          ) : accrediti.map((r, i) => (
            <tr key={r.id} className="dc-excel-row">
              <td className="dc-excel-idx">{i + 1}</td>
              <td><input className="dc-excel-input" value={r.descrizione}
                onChange={(e) => onAccreditiChange(r.id, 'descrizione', e.target.value)}
                placeholder="es. Storno fattura n.123..." /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onAccreditiChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onAccreditiChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td><button className="dc-del-btn" onClick={() => onAccreditiDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── FATTURA FINE MESE ── */}
      <SectionBlock title="Fattura Fine Mese" icon="🧾" onAdd={onFineMeseAdd}
        totaleLabel="Totale Fattura Fine Mese" totale={totFineMese}>
        <ExcelTable headers={['#', 'Descrizione', 'Valore (€)', 'Nota', '']}>
          {fineMese.length === 0 ? (
            <tr><td colSpan={5} className="dc-excel-empty">Nessuna voce di fine mese inserita.</td></tr>
          ) : fineMese.map((r, i) => (
            <tr key={r.id} className="dc-excel-row">
              <td className="dc-excel-idx">{i + 1}</td>
              <td><input className="dc-excel-input" value={r.descrizione}
                onChange={(e) => onFineMeseChange(r.id, 'descrizione', e.target.value)}
                placeholder="es. Fattura fine mese..." /></td>
              <td><input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                onChange={(e) => onFineMeseChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00" /></td>
              <td><input className="dc-excel-input" value={r.nota}
                onChange={(e) => onFineMeseChange(r.id, 'nota', e.target.value)} placeholder="Note..." /></td>
              <td><button className="dc-del-btn" onClick={() => onFineMeseDelete(r.id)}>×</button></td>
            </tr>
          ))}
        </ExcelTable>
      </SectionBlock>

      {/* ── CASSA PRIMA NOTA (acconti automatici) ── */}
      <SectionBlock title="Cassa Prima Nota — Acconti" icon="💰" onAdd={onCassaAdd}
        totaleLabel="Totale Acconti" totale={totCassa}>
        <ExcelTable headers={['Codice', 'Descrizione / Data', 'Valore (€)', 'Nota', '']}>
          {cassa.length === 0 ? (
            <tr><td colSpan={5} className="dc-excel-empty">Nessun acconto associato a questo padroncino nel mese.</td></tr>
          ) : cassa.map((r) => (
            <tr key={r.id} className={`dc-excel-row ${r.readonly ? 'dc-row-readonly' : ''}`}>
              <td>
                <span className="dc-codice-badge">{r.codice}</span>
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-readonly-text">{r.descrizione} {r.data ? `— ${fmtData(r.data)}` : ''}</span>
                ) : (
                  <input className="dc-excel-input" value={r.descrizione}
                    onChange={(e) => onCassaChange(r.id, 'descrizione', e.target.value)} placeholder="Descrizione..." />
                )}
              </td>
              <td>
                {r.readonly ? (
                  <span className="dc-excel-computed dc-computed-highlight">{eur(r.valore)}</span>
                ) : (
                  <input className="dc-excel-input dc-excel-num" type="number" step="0.01" value={r.valore ?? ''}
                    onChange={(e) => onCassaChange(r.id, 'valore', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="0,00" />
                )}
              </td>
              <td>
                <input className="dc-excel-input" value={r.nota}
                  onChange={(e) => onCassaChange(r.id, 'nota', e.target.value)} placeholder="Note..." />
              </td>
              <td>
                {!r.readonly && (
                  <button className="dc-del-btn" onClick={() => onCassaDelete(r.id)}>×</button>
                )}
              </td>
            </tr>
          ))}
        </ExcelTable>
        <div className="dc-cassa-note">
          <span className="dc-cassa-badge">ℹ️ Auto</span>
          Le righe automatiche provengono dagli acconti registrati nella pagina Acconti per i codici autista associati a questo padroncino nel mese.
        </div>
      </SectionBlock>

      {/* ── RIEPILOGO FINALE COMPENSAZIONI ── */}
      <div className="dc-compensazioni-finale">
        <h3>📊 Riepilogo Finale Compensazioni</h3>
        <div className="dc-compen-rows">
          <div className="dc-compen-row">
            <span>Totale Addebiti da Fattura (con IVA)</span>
            <span className="dc-val-neg">{eur(totAddebitiConIva)}</span>
          </div>
          <div className="dc-compen-separator" />
          <div className="dc-compen-row">
            <span>Accrediti e Storni</span>
            <span>{eur(totAccrediti)}</span>
          </div>
          <div className="dc-compen-row">
            <span>Fattura Fine Mese</span>
            <span>{eur(totFineMese)}</span>
          </div>
          <div className="dc-compen-row">
            <span>Acconti (Cassa Prima Nota)</span>
            <span>{eur(totCassa)}</span>
          </div>
          <div className="dc-compen-row dc-compen-subtot">
            <span>Totale Compensazioni</span>
            <span>{eur(totaleCompensazioni)}</span>
          </div>
          <div className="dc-compen-separator" />
          <div className="dc-compen-row dc-compen-saldo">
            <span>SALDO NETTO ADDEBITATO IN FATTURA</span>
            <span className={saldoFinale >= 0 ? 'dc-val-neg' : 'dc-val-pos'}>{eur(saldoFinale)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPALE ─────────────────────────────────────────────────────
type TabKey = 'riepilogo' | 'fatturato' | 'addebiti' | 'compensazioni';

export default function DettaglioConteggio() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mese = searchParams.get('mese') ?? getCurrentMonth();
  const giorniMese = getDaysInMonth(mese);

  const [activeTab, setActiveTab] = useState<TabKey>('riepilogo');
  const [padroncino, setPadroncino] = useState<Padroncino | null>(null);
  const [conteggioId, setConteggioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingConteggio, setDeletingConteggio] = useState(false);
  const [aggiornaRicariche, setAggiornaRicariche] = useState(false);

  // Checklist
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    distribuzioneInviata: false, pdfAddebitiCreato: false, fatturaCreata: false, fatturaRicevuta: false,
  });

  // Fatturato
  const [righeF, setRigheF] = useState<RigaFatturato[]>([]);

  // Addebiti mezzi (auto da assegnazioni)
  const [righeM, setRigheM] = useState<RigaNoleggioMezzo[]>([]);

  // Ricariche (auto da mezzi elettrici)
  const [righeR, setRigheR] = useState<RigaRicarica[]>([]);

  // Addebiti vari
  const [righeV, setRigheV] = useState<RigaAddebito[]>([]);

  // Compensazioni
  const [accrediti, setAccrediti] = useState<RigaCompensazione[]>([]);
  const [fineMese, setFineMese] = useState<RigaFineMese[]>([]);
  const [cassaAcconti, setCassaAcconti] = useState<RigaCassaAcconto[]>([]);

  // Caricamento dati reali
  // ─── STATO CONTEGGIO (per blocco su CHIUSO/CONFERMATO) ────────────────────
  const [statoConteggio, setStatoConteggio] = useState<'BOZZA' | 'CHIUSO' | 'CONFERMATO'>('BOZZA');
  const [saving, setSaving] = useState(false);

  const isReadonly = statoConteggio === 'CONFERMATO';

  // ─── Caricamento dati ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [pad, accontiRaw, conteggiList] = await Promise.all([
        padronciniApi.detail(id),
        api.get<any[]>(`/acconti/padroncino/${id}?mese=${mese}`),
        conteggiApi.list(mese, id),
      ]);
      setPadroncino(pad);
 
      const conteggio = conteggiList[0] ?? null;
      const cId = conteggio?.id ?? null;
      setConteggioId(cId);
      setStatoConteggio(conteggio?.stato ?? 'BOZZA');
      setChecklist(loadChecklist(id, mese));
 
      // ─── Se esiste già un conteggio salvato, RICARICA LE RIGHE DAL DB ───
      if (conteggio && conteggio.righe?.length > 0) {
        const righe = conteggio.righe;
 
        // Fatturato — sempre dal DB
        setRigheF(
          righe
            .filter((r: any) => r.tipo === 'FATTURATO')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              _dbId: r.id,
            }))
        );
 
        // Addebiti vari — sempre dal DB
        setRigheV(
          righe
            .filter((r: any) => r.tipo === 'ADDEBITO')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valoreNoIva: Number(r.importo) / (1 + (r.categoria === 'bollo' ? 0 : 0.22)),
              percIva: 22,
              note: r.note ?? '',
              _dbId: r.id,
            }))
        );
 
        // Accrediti — sempre dal DB
        setAccrediti(
          righe
            .filter((r: any) => r.tipo === 'ACCREDITO' || r.tipo === 'BONUS')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              _dbId: r.id,
            }))
        );
 
        // Fine mese — sempre dal DB
        setFineMese(
          righe
            .filter((r: any) => r.tipo === 'FINE_MESE')
            .map((r: any) => ({
              id: r.id,
              descrizione: r.descrizione,
              valore: Number(r.importo),
              nota: r.note ?? '',
              _dbId: r.id,
            }))
        );
 
        // ── Noleggi e Ricariche: comportamento diverso per BOZZA vs CHIUSO/CONFERMATO ──
        if (conteggio.stato === 'BOZZA') {
          // BOZZA → ricalcola dai mezzi assegnati live (così i nuovi mezzi compaiono)
          // Le righe con modificaManuale: true vengono preservate dal DB
          const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
 
          let ricaricheDB: Record<string, number> = {};
          try {
            const riepRic = await api.get<any[]>(`/ricariche/riepilogo-padroncini?mese=${mese}`);
            const entryPad = riepRic.find((r: any) => r.padroncinoId === id);
            if (entryPad?.mezzi) {
              for (const d of entryPad.mezzi) {
                ricaricheDB[normTarga(d.targa)] = Number(d.costo ?? 0);
              }
            }
          } catch { /* ignora */ }
 
          setRigheM(
            (pad.mezziAssegnati ?? []).map((m: any) => {
              const mezzoId = m.id ?? m.mezzoId;
              // Cerca se esiste già una riga manuale per questo mezzo nel DB
              const esistenteManuale = righe.find(
                (r: any) => r.tipo === 'NOLEGGIO' && r.riferimentoId === mezzoId && r.modificaManuale
              );
              if (esistenteManuale) {
                return {
                  id: esistenteManuale.id,
                  mezzoId,
                  targa: m.targa,
                  valoreRataNoIva: Number(esistenteManuale.importo) / 1.22,
                  percIva: 22,
                  alimentazione: m.alimentazione ?? 'DIESEL',
                  note: esistenteManuale.note ?? '',
                  isManuale: true,
                  _dbId: esistenteManuale.id,
                };
              }
              // Riga automatica: usa la tariffa attuale del mezzo
              return {
                id: `mez-${mezzoId}`,
                mezzoId,
                targa: m.targa,
                valoreRataNoIva: m.tariffa ?? null,
                percIva: 22,
                alimentazione: m.alimentazione ?? 'DIESEL',
                note: '',
                isManuale: false,
              };
            })
          );
 
          setRigheR(
            (pad.mezziAssegnati ?? [])
              .filter((m: any) => m.alimentazione === 'ELETTRICO')
              .map((m: any) => {
                const mezzoId = m.id ?? m.mezzoId;
                const esistenteManuale = righe.find(
                  (r: any) => r.tipo === 'RICARICA' && r.riferimentoId === mezzoId && r.modificaManuale
                );
                if (esistenteManuale) {
                  return {
                    id: esistenteManuale.id,
                    mezzoId,
                    targa: m.targa,
                    costoRicarica: Number(esistenteManuale.importo) / 1.05,
                    percIva: 5,
                    note: esistenteManuale.note ?? '',
                    isManuale: true,
                    _dbId: esistenteManuale.id,
                  };
                }
                return {
                  id: `ric-${mezzoId}`,
                  mezzoId,
                  targa: m.targa,
                  costoRicarica: ricaricheDB[normTarga(m.targa)] ?? null,
                  percIva: 5,
                  note: '',
                  isManuale: false,
                };
              })
          );
 
        } else {
          // CHIUSO o CONFERMATO → righe fisse dal DB, non si ricalcolano
          setRigheM(
            righe
              .filter((r: any) => r.tipo === 'NOLEGGIO')
              .map((r: any) => {
                const m = (pad.mezziAssegnati ?? []).find(
                  (x: any) => (x.id ?? x.mezzoId) === r.riferimentoId
                );
                return {
                  id: r.id,
                  mezzoId: r.riferimentoId,
                  targa: m?.targa ?? r.descrizione.replace('Noleggio ', '').split(' ')[0],
                  valoreRataNoIva: Number(r.importo) / 1.22,
                  percIva: 22,
                  alimentazione: m?.alimentazione ?? 'DIESEL',
                  note: r.note ?? '',
                  isManuale: r.modificaManuale,
                  _dbId: r.id,
                };
              })
          );
 
          setRigheR(
            righe
              .filter((r: any) => r.tipo === 'RICARICA')
              .map((r: any) => {
                const m = (pad.mezziAssegnati ?? []).find(
                  (x: any) => (x.id ?? x.mezzoId) === r.riferimentoId
                );
                return {
                  id: r.id,
                  mezzoId: r.riferimentoId,
                  targa: m?.targa ?? '',
                  costoRicarica: Number(r.importo) / 1.05,
                  percIva: 5,
                  note: r.note ?? '',
                  isManuale: r.modificaManuale,
                  _dbId: r.id,
                };
              })
          );
        }
 
      } else {
        // ─── Nessun conteggio in DB: inizializza da padroncino ────────────
        setRigheF([]);
 
        const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
        let ricaricheDB: Record<string, number> = {};
        try {
          const riepRic = await api.get<any[]>(`/ricariche/riepilogo-padroncini?mese=${mese}`);
          const entryPad = riepRic.find((r: any) => r.padroncinoId === id);
          if (entryPad?.mezzi) {
            for (const d of entryPad.mezzi) {
              ricaricheDB[normTarga(d.targa)] = Number(d.costo ?? 0);
            }
          }
        } catch { /* ignora */ }
 
        setRigheM(
          (pad.mezziAssegnati ?? []).map((m: any) => ({
            id: `mez-${m.id ?? m.mezzoId}`,
            mezzoId: m.id ?? m.mezzoId,
            targa: m.targa,
            valoreRataNoIva: m.tariffa ?? null,
            percIva: 22,
            alimentazione: m.alimentazione ?? 'DIESEL',
            note: '',
            isManuale: false,
          }))
        );
 
        setRigheR(
          (pad.mezziAssegnati ?? [])
            .filter((m: any) => m.alimentazione === 'ELETTRICO')
            .map((m: any) => ({
              id: `ric-${m.id ?? m.mezzoId}`,
              mezzoId: m.id ?? m.mezzoId,
              targa: m.targa,
              costoRicarica: ricaricheDB[normTarga(m.targa)] ?? null,
              percIva: 5,
              note: '',
              isManuale: false,
            }))
        );
 
        setRigheV([]);
        setAccrediti([]);
        setFineMese([]);
      }
 
      // Acconti — sempre freschi dal DB (readonly)
      const cassaRighe: RigaCassaAcconto[] = (accontiRaw ?? []).map((a: any) => ({
        id: `acc-${a.id}`,
        accontoId: a.id,
        codice: a.codice ?? a.codiceAutista?.codice ?? '—',
        descrizione: a.descrizione ?? `Acconto ${a.nomeAutista ?? ''}`.trim(),
        data: a.data ? a.data.split('T')[0] : '',
        valore: Number(a.importo),
        nota: a.note ?? '',
        readonly: true,
      }));
      setCassaAcconti(cassaRighe);
 
    } catch (e: any) {
      setError(e.message ?? 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [id, mese]);
 
  useEffect(() => { loadData(); }, [loadData]);

  // ─── Elimina conteggio ────────────────────────────────────────────────────
  const handleEliminaConteggio = async () => {
    if (!conteggioId) return;
    if (!confirm(
      `Eliminare il conteggio di ${formatMese(mese)} per ${padroncino?.ragioneSociale}?\n` +
      `Tutte le righe verranno cancellate. Operazione irreversibile.`
    )) return;
    setDeletingConteggio(true);
    try {
      await conteggiApi.remove(conteggioId);
      setConteggioId(null);
      setStatoConteggio('BOZZA');
      setRigheF([]);
      setRigheM([]);  // oppure navigate('/conteggi') se preferisci uscire
      setRigheR([]);
      setRigheV([]);
      setAccrediti([]);
      setFineMese([]);
      alert('✅ Conteggio eliminato. Ora puoi crearne uno nuovo salvando.');
    } catch (e: any) {
      alert('❌ Errore eliminazione: ' + e.message);
    } finally {
      setDeletingConteggio(false);
    }
  };

// ─── CHIUDI MESE──────────────────────────────────────────────────────
  const handleChiudiMese = async () => {
    if (!conteggioId) {
      alert('Salva prima il conteggio prima di chiuderlo.');
      return;
    }
    if (!confirm(
      `Chiudere il conteggio di ${formatMese(mese)} per ${padroncino?.ragioneSociale}?\n\n` +
      `⚠️ Un conteggio CHIUSO non aggiornerà più automaticamente i mezzi assegnati.\n` +
      `Potrai comunque modificarlo manualmente finché non lo CONFERMI.`
    )) return;
    try {
      await conteggiApi.updateStato(conteggioId, 'CHIUSO');
      setStatoConteggio('CHIUSO');
      alert('✅ Mese chiuso correttamente.');
    } catch (e: any) {
      alert('❌ Errore chiusura: ' + e.message);
    }
  };

  // ─── SALVA TUTTO NEL DB ──────────────────────────────────────────────────
  const handleSalva = async () => {
    if (!id || isReadonly) return;
    setSaving(true);
    try {
      // ✅ NUOVO — crea solo se non esiste, altrimenti usa l'id già in stato
      let cId = conteggioId;
      if (!cId) {
        // Doppio controllo: potrebbe esistere in DB ma non in stato locale
        const esistenti = await conteggiApi.list(mese, id);
        if (esistenti.length > 0) {
          cId = esistenti[0].id;
          setConteggioId(cId);
        } else {
          const nuovoConteggio = await conteggiApi.create(id, mese);
          cId = nuovoConteggio.id;
          setConteggioId(cId);
        }
      }

      // 2. Cancella tutte le righe esistenti NON manuali e riscrivi
      //    (strategia "replace all" per semplicità e correttezza)
      // Prima: ottieni le righe attuali dal DB
      const conteggioAttuale = await conteggiApi.detail(cId);
      for (const r of conteggioAttuale.righe) {
        await conteggiApi.deleteRiga(r.id);
      }

      // 3. Ricrea tutte le righe dallo stato locale
      let ordine = 0;

      for (const r of righeF) {
        if (!r.valore && r.valore !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'FATTURATO',
          descrizione: r.descrizione || 'Fatturato',
          importo: r.valore,
          segno: 'POSITIVO',
          categoria: 'fatturato',
          ordine: ordine++,
          modificaManuale: true,
          note: r.nota || null,
        });
      }

      // Palmari (calcolato automaticamente)
      if (numeroPalmari > 0 && tariffaPalmareGiornaliera > 0) {
        await conteggiApi.addRiga(cId, {
          tipo: 'PALMARE',
          descrizione: `Palmari ×${numeroPalmari} × ${giorniMese}gg @ ${tariffaPalmareGiornaliera}€/g`,
          importo: +(numeroPalmari * tariffaPalmareGiornaliera * giorniMese).toFixed(2),
          segno: 'NEGATIVO',
          categoria: 'palmari',
          ordine: ordine++,
          modificaManuale: false,
          note: null,
        });
      }

      for (const r of righeM) {
        if (!r.valoreRataNoIva && r.valoreRataNoIva !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'NOLEGGIO',
          descrizione: `Noleggio ${r.targa}`,
          importo: +(r.valoreRataNoIva * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO',
          categoria: 'noleggio',
          riferimentoTipo: 'mezzo',
          riferimentoId: r.mezzoId ?? undefined,
          ordine: ordine++,
          modificaManuale: r.isManuale ?? false,
          note: r.note || null,
        });
      }

      for (const r of righeR) {
        if (!r.costoRicarica && r.costoRicarica !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'RICARICA',
          descrizione: `Ricarica elettrica ${r.targa}`,
          importo: +(r.costoRicarica * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO',
          categoria: 'ricariche',
          riferimentoTipo: 'mezzo',
          riferimentoId: r.mezzoId ?? undefined,
          ordine: ordine++,
          modificaManuale: r.isManuale ?? false,
          note: r.note || null,
        });
      }

      for (const r of righeV) {
        if (!r.valoreNoIva && r.valoreNoIva !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'ADDEBITO',
          descrizione: r.descrizione || 'Addebito',
          importo: +(r.valoreNoIva * (1 + r.percIva / 100)).toFixed(2),
          segno: 'NEGATIVO',
          categoria: 'addebiti',
          ordine: ordine++,
          modificaManuale: true,
          note: r.note || null,
        });
      }

      for (const r of accrediti) {
        if (!r.valore && r.valore !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'ACCREDITO',
          descrizione: r.descrizione || 'Accredito',
          importo: r.valore,
          segno: 'POSITIVO',
          categoria: 'accrediti',
          ordine: ordine++,
          modificaManuale: true,
          note: r.nota || null,
        });
      }

      for (const r of fineMese) {
        if (!r.valore && r.valore !== 0) continue;
        await conteggiApi.addRiga(cId, {
          tipo: 'FINE_MESE',
          descrizione: r.descrizione || 'Fine mese',
          importo: r.valore,
          segno: 'POSITIVO',
          categoria: 'fine_mese',
          ordine: ordine++,
          modificaManuale: true,
          note: r.nota || null,
        });
      }

      alert('✅ Conteggio salvato correttamente!');
      await loadData(); // Ricarica dal DB per sincronizzare gli id reali

    } catch (e: any) {
      alert('❌ Errore salvataggio: ' + (e.message ?? 'Errore sconosciuto'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Aggiorna ricariche dal modulo ricariche ──────────────────────────────
  const handleAggiornaRicariche = async () => {
    if (!id) return;
    setAggiornaRicariche(true);
    const normTarga = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
      const riepRic = await api.get<any[]>(`/ricariche/riepilogo-padroncini?mese=${mese}`);
      const entryPad = riepRic.find((r: any) => r.padroncinoId === id);
      if (!entryPad?.mezzi?.length) {          // ← mezzi (non dettaglio)
        alert('Nessuna ricarica trovata per questo padroncino nel mese selezionato.');
        return;
      }
      const nuoviCosti: Record<string, number> = {};
      for (const d of entryPad.mezzi) {        // ← mezzi
        nuoviCosti[normTarga(d.targa)] = Number(Number(d.costo ?? 0).toFixed(2)); // ← costo
      }
      setRigheR((prev) => prev.map((r) => ({
        ...r,
        costoRicarica: nuoviCosti[normTarga(r.targa)] ?? r.costoRicarica,  // ← norm
      })));
      const targheEsistenti = new Set(righeR.map((r) => normTarga(r.targa)));
      const nuove: RigaRicarica[] = entryPad.mezzi              // ← mezzi
        .filter((d: any) => !targheEsistenti.has(normTarga(d.targa)))
        .map((d: any) => ({
          id: newId(),
          mezzoId: null,
          targa: d.targa,
          costoRicarica: Number(Number(d.costo ?? 0).toFixed(2)), // ← costo
          percIva: 5,
          note: 'Aggiunto da ricariche',
          isManuale: true,
        }));
      if (nuove.length) setRigheR((prev) => [...prev, ...nuove]);
    } catch (e: any) {
      alert('Errore aggiornamento ricariche: ' + e.message);
    } finally {
      setAggiornaRicariche(false);
    }
  };
  // ─── Helper setter generici ───────────────────────────────────────────────
  function makeSetter<T extends { id: string }>(setFn: React.Dispatch<React.SetStateAction<T[]>>) {
    return (id: string, field: keyof T, val: any) =>
      setFn((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  // ─── Totali globali ───────────────────────────────────────────────────────
  const totFatturato = righeF.reduce((s, r) => s + (r.valore ?? 0), 0);

  const numeroPalmari = padroncino?.palmariAssegnati?.length ?? 0;
  // tariffa giornaliera = primo palmare (uguale per tutti) / giorni mese
  const tariffaPalmareGiornaliera = useMemo(() => {
    if (!padroncino?.palmariAssegnati?.length) return 0;
    // Il campo tariffaMensile nel DB ora contiene la tariffa GIORNALIERA (es. 1.99 €/giorno)
    return padroncino.palmariAssegnati[0].tariffa ?? 0;
  }, [padroncino]);

  const costoPalmariConIva = numeroPalmari * tariffaPalmareGiornaliera * giorniMese * 1.22;
  const totMezziConIva = righeM.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const totRicaricheConIva = righeR.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);
  const totVariConIva = righeV.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const bolloAttivo =
    righeR.some((r) => r.percIva !== 22 && (r.costoRicarica ?? 0) >= SOGLIA_BOLLO) ||
    righeV.some((r) => r.percIva !== 22 && (r.valoreNoIva ?? 0) >= SOGLIA_BOLLO);
  const totAddebitiConIva = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + (bolloAttivo ? COSTO_BOLLO : 0);

  const totAccrediti = accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese = fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCassa = cassaAcconti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCompensazioni = totAccrediti + totFineMese + totCassa;

  const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'riepilogo', label: 'Riepilogo', icon: '📊' },
    { key: 'fatturato', label: 'Fatturato Distribuzione', icon: '💶' },
    { key: 'addebiti', label: 'Addebiti da Inserire', icon: '📋' },
    { key: 'compensazioni', label: 'Compensazioni', icon: '⚖️' },
  ];

  if (loading) return <div className="dc-page dc-page-loading">⏳ Caricamento dati padroncino...</div>;
  if (error || !padroncino) return (
    <div className="dc-page dc-page-loading">
      ❌ {error ?? 'Padroncino non trovato'}
      <button onClick={() => navigate('/conteggi')} style={{ marginLeft: 12 }}>← Torna</button>
    </div>
  );

  return (
    <div className="dc-page">
      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-left">
          <button className="dc-back-btn" onClick={() => navigate('/conteggi')}>← Conteggi</button>
          <div>
            <h1>{padroncino.ragioneSociale}</h1>
            <span className="dc-header-mese">📅 {formatMese(mese)}</span>
          </div>
        </div>
        <div className="dc-header-right">
          <div className="dc-mini-checklist">
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.key}
                className={`dc-mini-check ${checklist[item.key] ? 'dc-mini-done' : ''}`}
                title={item.label}
                onClick={() => {
                  const updated = { ...checklist, [item.key]: !checklist[item.key] };
                  setChecklist(updated);
                  saveChecklist(id!, mese, updated);
                }}>
                {item.icon}
              </div>
            ))}
          </div>
          <button
            className="btn-outline btn-sm"
            onClick={handleAggiornaRicariche}
            disabled={aggiornaRicariche}
            title="Ricarica i costi delle ricariche elettriche dal modulo ricariche"
          >
            {aggiornaRicariche ? '⏳' : '⚡'} Aggiorna Ricariche
          </button>

          {conteggioId && statoConteggio === 'BOZZA' && (
            <button className="btn-outline btn-sm" onClick={handleChiudiMese}>
              🔒 Chiudi Mese
            </button>
          )}

          <button
            className="btn-primary btn-sm"
            onClick={handleSalva}
            disabled={saving || isReadonly}
            title={isReadonly ? 'Conteggio chiuso — non modificabile' : ''}
          >
            {saving ? '⏳ Salvando...' : '💾 Salva'}
          </button>
          <button className="btn-primary btn-sm">📄 Genera PDF</button>

          {/* Mostra il tasto elimina SOLO se abbiamo un ID (ovvero se il record esiste nel DB) */}
          {conteggioId && (
            <button
              className="btn-danger btn-sm"
              onClick={handleEliminaConteggio}
              disabled={deletingConteggio}
            >
              {deletingConteggio ? '⏳' : '🗑️'} Elimina conteggio
            </button>
          )}
        </div>
      </div>

      {statoConteggio === 'CHIUSO' && (
        <div className="dc-readonly-banner dc-banner-chiuso">
          🔒 Mese CHIUSO — le righe non si aggiornano più automaticamente.
          Puoi ancora modificare manualmente e salvare.
        </div>
      )}
      {statoConteggio === 'CONFERMATO' && (
        <div className="dc-readonly-banner dc-banner-confermato">
          ✅ Conteggio CONFERMATO — sola lettura assoluta.
        </div>
      )}

      {/* Tabs */}
      <div className="dc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`dc-tab-btn ${activeTab === t.key ? 'dc-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="dc-content">
        {activeTab === 'riepilogo' && (
          <TabRiepilogo
            padroncino={padroncino} mese={mese}
            totFatturato={totFatturato} totAddebitiConIva={totAddebitiConIva} totCompen={totCompensazioni}
            checklist={checklist}
            onChecklistChange={(key, val) => {
              const updated = { ...checklist, [key]: val };
              setChecklist(updated);
              saveChecklist(id!, mese, updated);
            }}
          />
        )}
        {activeTab === 'fatturato' && (
          <TabFatturato
            righe={righeF}
            onChange={makeSetter(setRigheF)}
            onAdd={() => setRigheF((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '' }])}
            onDelete={(id) => setRigheF((p) => p.filter((r) => r.id !== id))}
          />
        )}
        {activeTab === 'addebiti' && (
          <TabAddebiti
            giorniMese={giorniMese}
            numeroPalmari={numeroPalmari}
            tariffaPalmareGiornaliera={tariffaPalmareGiornaliera}
            mezzi={righeM}
            onMezziChange={makeSetter(setRigheM)}
            onMezziAdd={() => setRigheM((p) => [...p, { id: newId(), mezzoId: null, targa: '', valoreRataNoIva: null, percIva: 22, alimentazione: 'DIESEL', note: '', isManuale: true }])}
            onMezziDelete={(id) => setRigheM((p) => p.filter((r) => r.id !== id))}
            ricariche={righeR}
            onRicaricheChange={makeSetter(setRigheR)}
            onRicaricheAdd={() => setRigheR((p) => [...p, { id: newId(), mezzoId: null, targa: '', costoRicarica: null, percIva: 5, note: '', isManuale: true }])}
            onRicaricheDelete={(id) => setRigheR((p) => p.filter((r) => r.id !== id))}
            addebitiVari={righeV}
            onAddebitiVariChange={makeSetter(setRigheV)}
            onAddebitiVariAdd={() => setRigheV((p) => [...p, { id: newId(), descrizione: '', valoreNoIva: null, percIva: 22, note: '' }])}
            onAddebitiVariDelete={(id) => setRigheV((p) => p.filter((r) => r.id !== id))}
          />
        )}
        {activeTab === 'compensazioni' && (
          <TabCompensazioni
            accrediti={accrediti}
            onAccreditiChange={makeSetter(setAccrediti)}
            onAccreditiAdd={() => setAccrediti((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '' }])}
            onAccreditiDelete={(id) => setAccrediti((p) => p.filter((r) => r.id !== id))}
            fineMese={fineMese}
            onFineMeseChange={makeSetter(setFineMese)}
            onFineMeseAdd={() => setFineMese((p) => [...p, { id: newId(), descrizione: '', valore: null, nota: '' }])}
            onFineMeseDelete={(id) => setFineMese((p) => p.filter((r) => r.id !== id))}
            cassa={cassaAcconti}
            onCassaChange={makeSetter(setCassaAcconti)}
            onCassaAdd={() => setCassaAcconti((p) => [...p, { id: newId(), accontoId: null, codice: '—', descrizione: '', data: '', valore: null, nota: '', readonly: false }])}
            onCassaDelete={(id) => setCassaAcconti((p) => p.filter((r) => r.id !== id))}
            totAddebitiConIva={totAddebitiConIva}
          />
        )}
      </div>
    </div>
  );
}
