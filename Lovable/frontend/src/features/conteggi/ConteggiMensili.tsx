import { useState, useMemo, useCallback } from 'react';
import type { ConteggioMensile, ConteggiRiga } from '../../lib/conteggi.api';
import './ConteggiMensili.css';

// ─── MOCK DATA ────────────────────────────────────
const MOCK_CONTEGGI: ConteggioMensile[] = [
  {
    id: 'c1', padroncinoId: 'p1', mese: '2026-03', stato: 'BOZZA', note: null,
    padroncino: { id: 'p1', ragioneSociale: 'MEN LOGISTIC' },
    righe: [
      { id: 'r1', tipo: 'FATTURATO', descrizione: 'Fatturato GLS Marzo 2026', importo: 12500, segno: 'POSITIVO', categoria: 'fatturato', riferimentoTipo: null, riferimentoId: null, ordine: 0, modificaManuale: false, note: null },
      { id: 'r2', tipo: 'NOLEGGIO', descrizione: 'Noleggio GM098FB - Ford E-TRANSIT', importo: 850, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm4', ordine: 1, modificaManuale: false, note: null },
      { id: 'r3', tipo: 'NOLEGGIO', descrizione: 'Noleggio GM100FB - Ford E-TRANSIT', importo: 930, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm6', ordine: 2, modificaManuale: false, note: null },
      { id: 'r4', tipo: 'NOLEGGIO', descrizione: 'Noleggio GM709PN - Ford E-TRANSIT', importo: 850, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm7', ordine: 3, modificaManuale: false, note: null },
      { id: 'r5', tipo: 'NOLEGGIO', descrizione: 'Noleggio GR498EZ - Ford TRANSIT', importo: 750, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm10', ordine: 4, modificaManuale: false, note: null },
      { id: 'r6', tipo: 'NOLEGGIO', descrizione: 'Noleggio GR500EZ - Ford TRANSIT', importo: 750, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm11', ordine: 5, modificaManuale: false, note: null },
      { id: 'r7', tipo: 'NOLEGGIO', descrizione: 'Noleggio GR507EZ - Ford TRANSIT', importo: 750, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm12', ordine: 6, modificaManuale: false, note: null },
      { id: 'r8', tipo: 'NOLEGGIO', descrizione: 'Noleggio GR628XD - Ford E-TRANSIT', importo: 850, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm13', ordine: 7, modificaManuale: false, note: null },
      { id: 'r9', tipo: 'NOLEGGIO', descrizione: 'Noleggio GS691VF - Man ETGE', importo: 1032, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm17', ordine: 8, modificaManuale: false, note: null },
      { id: 'r10', tipo: 'PALMARE', descrizione: 'Palmare PAL-001', importo: 35, segno: 'NEGATIVO', categoria: 'palmari', riferimentoTipo: 'palmare', riferimentoId: 'pal1', ordine: 9, modificaManuale: false, note: null },
      { id: 'r11', tipo: 'RICARICA', descrizione: 'Ricariche elettriche marzo', importo: 420, segno: 'NEGATIVO', categoria: 'ricariche', riferimentoTipo: null, riferimentoId: null, ordine: 10, modificaManuale: true, note: null },
      { id: 'r12', tipo: 'ACCONTO', descrizione: 'Acconto Marco Rossi - 15/03', importo: 200, segno: 'NEGATIVO', categoria: 'acconti', riferimentoTipo: 'acconto', riferimentoId: 'acc1', ordine: 11, modificaManuale: false, note: null },
      { id: 'r13', tipo: 'BONUS', descrizione: 'Bonus produttività marzo', importo: 300, segno: 'POSITIVO', categoria: 'bonus', riferimentoTipo: null, riferimentoId: null, ordine: 12, modificaManuale: true, note: null },
    ],
  },
  {
    id: 'c2', padroncinoId: 'p2', mese: '2026-03', stato: 'BOZZA', note: null,
    padroncino: { id: 'p2', ragioneSociale: 'DI NARDO' },
    righe: [
      { id: 'r20', tipo: 'FATTURATO', descrizione: 'Fatturato GLS Marzo 2026', importo: 4200, segno: 'POSITIVO', categoria: 'fatturato', riferimentoTipo: null, riferimentoId: null, ordine: 0, modificaManuale: false, note: null },
      { id: 'r21', tipo: 'NOLEGGIO', descrizione: 'Noleggio GM099FB - Ford E-TRANSIT', importo: 850, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm5', ordine: 1, modificaManuale: false, note: null },
      { id: 'r22', tipo: 'ACCONTO', descrizione: 'Acconto Giuseppe Bianchi - 15/03', importo: 250, segno: 'NEGATIVO', categoria: 'acconti', riferimentoTipo: 'acconto', riferimentoId: 'acc2', ordine: 2, modificaManuale: false, note: null },
    ],
  },
  {
    id: 'c3', padroncinoId: 'p3', mese: '2026-03', stato: 'CHIUSO', note: null,
    padroncino: { id: 'p3', ragioneSociale: 'EL SPEDIZIONI' },
    righe: [
      { id: 'r30', tipo: 'FATTURATO', descrizione: 'Fatturato GLS Marzo 2026', importo: 3800, segno: 'POSITIVO', categoria: 'fatturato', riferimentoTipo: null, riferimentoId: null, ordine: 0, modificaManuale: false, note: null },
      { id: 'r31', tipo: 'NOLEGGIO', descrizione: 'Noleggio GR496EZ - Ford TRANSIT', importo: 150, segno: 'NEGATIVO', categoria: 'noleggio', riferimentoTipo: 'mezzo', riferimentoId: 'm9', ordine: 1, modificaManuale: false, note: null },
    ],
  },
];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMese(mese: string) {
  const [y, m] = mese.split('-');
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${mesi[parseInt(m) - 1]} ${y}`;
}

function eur(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ConteggiMensili() {
  const [mese, setMese] = useState(getCurrentMonth());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingRiga, setEditingRiga] = useState<string | null>(null);
  const [conteggi, setConteggi] = useState(MOCK_CONTEGGI);

  const selected = useMemo(
    () => conteggi.find((c) => c.id === selectedId) || null,
    [conteggi, selectedId],
  );

  const calcTotals = useCallback((righe: ConteggiRiga[]) => {
    const pos = righe.filter((r) => r.segno === 'POSITIVO').reduce((s, r) => s + r.importo, 0);
    const neg = righe.filter((r) => r.segno === 'NEGATIVO').reduce((s, r) => s + r.importo, 0);
    return { pos, neg, netto: pos - neg };
  }, []);

  const overallStats = useMemo(() => {
    let totPos = 0, totNeg = 0, bozze = 0, chiusi = 0, confermati = 0;
    for (const c of conteggi) {
      const t = calcTotals(c.righe);
      totPos += t.pos;
      totNeg += t.neg;
      if (c.stato === 'BOZZA') bozze++;
      else if (c.stato === 'CHIUSO') chiusi++;
      else confermati++;
    }
    return { totPos, totNeg, netto: totPos - totNeg, bozze, chiusi, confermati, totale: conteggi.length };
  }, [conteggi, calcTotals]);

  const handleImportoChange = (rigaId: string, value: string) => {
    const num = parseFloat(value.replace(',', '.'));
    if (isNaN(num)) return;
    setConteggi((prev) =>
      prev.map((c) => ({
        ...c,
        righe: c.righe.map((r) =>
          r.id === rigaId ? { ...r, importo: num, modificaManuale: true } : r,
        ),
      })),
    );
  };

  const handleDeleteRiga = (conteggioId: string, rigaId: string) => {
    setConteggi((prev) =>
      prev.map((c) =>
        c.id === conteggioId
          ? { ...c, righe: c.righe.filter((r) => r.id !== rigaId) }
          : c,
      ),
    );
  };

  const handleAddRiga = (conteggioId: string) => {
    const newRiga: ConteggiRiga = {
      id: `new-${Date.now()}`,
      tipo: 'ALTRO',
      descrizione: 'Nuova voce',
      importo: 0,
      segno: 'NEGATIVO',
      categoria: null,
      riferimentoTipo: null,
      riferimentoId: null,
      ordine: 99,
      modificaManuale: true,
      note: null,
    };
    setConteggi((prev) =>
      prev.map((c) =>
        c.id === conteggioId ? { ...c, righe: [...c.righe, newRiga] } : c,
      ),
    );
    setEditingRiga(newRiga.id);
  };

  return (
    <div className="conteggi-page">
      {/* Header */}
      <div className="c-header">
        <div>
          <h1>Conteggi Mensili</h1>
          <span className="c-mese-label">{formatMese(mese)}</span>
        </div>
        <div className="c-header-actions">
          <input
            type="month"
            value={mese}
            onChange={(e) => setMese(e.target.value)}
            className="c-month-input"
          />
          <button className="btn-primary">⚡ Genera tutti</button>
        </div>
      </div>

      {/* Stats */}
      <div className="c-stats">
        <div className="c-stat">
          <span className="c-stat-label">CONTEGGI</span>
          <span className="c-stat-value">{overallStats.totale}</span>
          <span className="c-stat-sub">{overallStats.bozze} bozze · {overallStats.chiusi} chiusi · {overallStats.confermati} confermati</span>
        </div>
        <div className="c-stat">
          <span className="c-stat-label">ENTRATE TOTALI</span>
          <span className="c-stat-value c-pos">+{eur(overallStats.totPos)} €</span>
        </div>
        <div className="c-stat">
          <span className="c-stat-label">USCITE TOTALI</span>
          <span className="c-stat-value c-neg">-{eur(overallStats.totNeg)} €</span>
        </div>
        <div className="c-stat">
          <span className="c-stat-label">DA BONIFICARE</span>
          <span className={`c-stat-value ${overallStats.netto >= 0 ? 'c-pos' : 'c-neg'}`}>
            {eur(overallStats.netto)} €
          </span>
        </div>
      </div>

      <div className="c-layout">
        {/* Lista padroncini */}
        <div className="c-list">
          <div className="c-list-header">
            <span>Padroncino</span>
            <span>Netto</span>
            <span>Stato</span>
          </div>
          {conteggi.map((c) => {
            const t = calcTotals(c.righe);
            return (
              <div
                key={c.id}
                className={`c-list-item ${selectedId === c.id ? 'c-list-active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="c-list-name">
                  <span className="c-list-title">{c.padroncino.ragioneSociale}</span>
                  <span className="c-list-righe">{c.righe.length} righe</span>
                </div>
                <span className={`c-list-netto ${t.netto >= 0 ? 'c-pos' : 'c-neg'}`}>
                  {eur(t.netto)} €
                </span>
                <StatoBadge stato={c.stato} />
              </div>
            );
          })}
        </div>

        {/* Dettaglio conteggio */}
        <div className="c-detail">
          {selected ? (
            <ConteggioDetail
              conteggio={selected}
              totals={calcTotals(selected.righe)}
              editingRiga={editingRiga}
              onEditRiga={setEditingRiga}
              onImportoChange={handleImportoChange}
              onDeleteRiga={handleDeleteRiga}
              onAddRiga={handleAddRiga}
            />
          ) : (
            <div className="c-empty">
              <span className="c-empty-icon">📊</span>
              <p>Seleziona un padroncino per vedere il dettaglio del conteggio</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DETTAGLIO CONTEGGIO ──────────────────────────
function ConteggioDetail({
  conteggio, totals, editingRiga, onEditRiga, onImportoChange, onDeleteRiga, onAddRiga,
}: {
  conteggio: ConteggioMensile;
  totals: { pos: number; neg: number; netto: number };
  editingRiga: string | null;
  onEditRiga: (id: string | null) => void;
  onImportoChange: (id: string, val: string) => void;
  onDeleteRiga: (cId: string, rId: string) => void;
  onAddRiga: (cId: string) => void;
}) {
  const isEditable = conteggio.stato !== 'CONFERMATO';

  // Raggruppa per categoria
  const grouped = useMemo(() => {
    const groups: Record<string, ConteggiRiga[]> = {};
    for (const r of conteggio.righe) {
      const cat = r.categoria || 'altro';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    }
    return groups;
  }, [conteggio.righe]);

  const categoryLabels: Record<string, string> = {
    fatturato: '📈 Fatturato',
    noleggio: '🚛 Noleggio mezzi',
    palmari: '📱 Palmari',
    ricariche: '⚡ Ricariche elettriche',
    acconti: '💰 Acconti',
    bonus: '🎁 Bonus',
    altro: '📝 Altro',
  };

  return (
    <div className="cd">
      {/* Header */}
      <div className="cd-header">
        <div>
          <h2>{conteggio.padroncino.ragioneSociale}</h2>
          <span className="cd-mese">{formatMese(conteggio.mese)}</span>
        </div>
        <div className="cd-actions">
          <StatoBadge stato={conteggio.stato} />
          {isEditable && (
            <>
              <button className="btn-outline btn-sm">🔄 Rigenera auto</button>
              <button className="btn-outline btn-sm">📋 Chiudi</button>
            </>
          )}
          {conteggio.stato === 'CHIUSO' && (
            <button className="btn-primary btn-sm">✅ Conferma</button>
          )}
        </div>
      </div>

      {/* Tabella righe stile Excel */}
      <div className="cd-table-wrap">
        <table className="cd-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th style={{ width: 100 }}>TIPO</th>
              <th>DESCRIZIONE</th>
              <th style={{ width: 60 }}>SEGNO</th>
              <th style={{ width: 120, textAlign: 'right' }}>IMPORTO</th>
              {isEditable && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([cat, righe]) => (
              <CategoryGroup
                key={cat}
                category={cat}
                label={categoryLabels[cat] || cat}
                righe={righe}
                isEditable={isEditable}
                editingRiga={editingRiga}
                conteggioId={conteggio.id}
                onEditRiga={onEditRiga}
                onImportoChange={onImportoChange}
                onDeleteRiga={onDeleteRiga}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add riga */}
      {isEditable && (
        <button className="cd-add-btn" onClick={() => onAddRiga(conteggio.id)}>
          + Aggiungi riga
        </button>
      )}

      {/* Totali */}
      <div className="cd-totals">
        <div className="cd-total-row">
          <span>Totale entrate</span>
          <span className="c-pos">+{eur(totals.pos)} €</span>
        </div>
        <div className="cd-total-row">
          <span>Totale uscite</span>
          <span className="c-neg">-{eur(totals.neg)} €</span>
        </div>
        <div className="cd-total-row cd-total-netto">
          <span>NETTO DA BONIFICARE</span>
          <span className={totals.netto >= 0 ? 'c-pos' : 'c-neg'}>
            {eur(totals.netto)} €
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryGroup({
  category, label, righe, isEditable, editingRiga, conteggioId,
  onEditRiga, onImportoChange, onDeleteRiga,
}: {
  category: string;
  label: string;
  righe: ConteggiRiga[];
  isEditable: boolean;
  editingRiga: string | null;
  conteggioId: string;
  onEditRiga: (id: string | null) => void;
  onImportoChange: (id: string, val: string) => void;
  onDeleteRiga: (cId: string, rId: string) => void;
}) {
  const subtotal = righe.reduce((s, r) => s + (r.segno === 'POSITIVO' ? r.importo : -r.importo), 0);

  return (
    <>
      <tr className="cd-cat-header">
        <td colSpan={isEditable ? 6 : 5}>
          <span className="cd-cat-label">{label}</span>
          <span className={`cd-cat-total ${subtotal >= 0 ? 'c-pos' : 'c-neg'}`}>
            {eur(subtotal)} €
          </span>
        </td>
      </tr>
      {righe.map((r, i) => (
        <tr
          key={r.id}
          className={`cd-row ${editingRiga === r.id ? 'cd-row-editing' : ''} ${r.modificaManuale ? 'cd-row-manual' : ''}`}
        >
          <td className="cd-ordine">{r.ordine + 1}</td>
          <td>
            <span className={`cd-tipo cd-tipo-${r.tipo.toLowerCase()}`}>{r.tipo}</span>
          </td>
          <td className="cd-desc">
            {r.descrizione}
            {r.modificaManuale && <span className="cd-manual-badge">manuale</span>}
          </td>
          <td>
            <span className={`cd-segno ${r.segno === 'POSITIVO' ? 'cd-segno-pos' : 'cd-segno-neg'}`}>
              {r.segno === 'POSITIVO' ? '+' : '−'}
            </span>
          </td>
          <td className="cd-importo">
            {editingRiga === r.id && isEditable ? (
              <input
                type="text"
                className="cd-importo-input"
                defaultValue={eur(r.importo)}
                autoFocus
                onBlur={(e) => {
                  onImportoChange(r.id, e.target.value);
                  onEditRiga(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onImportoChange(r.id, (e.target as HTMLInputElement).value);
                    onEditRiga(null);
                  }
                  if (e.key === 'Escape') onEditRiga(null);
                }}
              />
            ) : (
              <span
                className="cd-importo-val"
                onClick={() => isEditable && onEditRiga(r.id)}
                title={isEditable ? 'Click per modificare' : undefined}
              >
                {eur(r.importo)} €
              </span>
            )}
          </td>
          {isEditable && (
            <td className="cd-actions-cell">
              <button
                className="cd-del-btn"
                onClick={() => onDeleteRiga(conteggioId, r.id)}
                title="Elimina riga"
              >
                ×
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function StatoBadge({ stato }: { stato: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    BOZZA: { label: 'Bozza', cls: 'stato-bozza' },
    CHIUSO: { label: 'Chiuso', cls: 'stato-chiuso' },
    CONFERMATO: { label: 'Confermato', cls: 'stato-confermato' },
  };
  const c = config[stato] || { label: stato, cls: '' };
  return <span className={`cd-stato ${c.cls}`}>{c.label}</span>;
}

