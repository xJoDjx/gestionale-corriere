// src/features/conteggi/generaExcelConteggi.ts
// Export Excel di tutti i conteggi del mese: un foglio RIEPILOGO + un foglio
// per padroncino, con le stesse sezioni della pagina Dettaglio Conteggio
// (Fatturato / Addebiti / Compensazioni / Riepilogo Finale) e la stessa
// formula di calcolo del netto usata in TabRiepilogo.
//
// Usa 'exceljs' (non 'xlsx'/SheetJS) perché serve poter applicare colori,
// grassetto e bordi alle intestazioni di sezione. Ogni sezione principale ha
// una riga di intestazione colorata (stessa palette del PDF conteggio);
// dentro "Addebiti" le sotto-categorie (Palmari, Mezzi, Ricariche, Vari,
// Bollo) hanno una propria mini-intestazione così non restano mescolate.
//
// Ogni cella-formula porta anche un valore "result" calcolato in JS, così il
// foglio mostra subito i totali corretti anche se aperto con un lettore che
// non ricalcola le formule automaticamente.
//
// Le righe "tombstone" (categoria che termina in "_escluso", usate
// internamente da DettaglioConteggio per ricordare un'esclusione manuale di
// un palmare/mezzo — importo sempre 0, note "Rimosso manualmente...") non
// sono dati di fatturazione reali e vengono sempre escluse dall'export.

import * as ExcelJS from 'exceljs';
import type { Padroncino } from '../../lib/api';
import type { ConteggioMensile, ConteggiRiga } from '../../lib/conteggi.api';

export interface RigaPadroncinoExport {
  padroncino: Padroncino;
  conteggio: ConteggioMensile | null;
  checklist: Record<string, boolean>;
}

const SOGLIA_BOLLO = 77.47;
const COSTO_BOLLO = 2.00;

const EUR = '#,##0.00" €"';
const THIN: ExcelJS.Border = { style: 'thin', color: { argb: 'FF999999' } };

// Palette allineata a generaPdfConteggio.ts
const COLOR_FATTURATO = '4A72B0';
const COLOR_ADDEBITI = 'B55555';
const COLOR_COMPENSAZIONI = '7C3AED';
const COLOR_FINALE = '1F2937';
const COLOR_SUBHEADER = 'EEF2F7';

function formatMese(m: string): string {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}

/** Vero per le righe "reali" di fatturazione: esclude i tombstone di esclusione manuale. */
function isRigaReale(r: ConteggiRiga): boolean {
  return !(r.categoria && r.categoria.endsWith('_escluso'));
}

/** Stessa logica di calcolaRighe() in ConteggiPage.tsx — totali coerenti con la tabella Riepilogo Mese. */
function calcolaTotali(righeRaw: ConteggiRiga[]) {
  const righe = righeRaw.filter(isRigaReale);

  const fattLordo = righe
    .filter((r) => r.tipo === 'FATTURATO' || r.tipo === 'TRATTENUTA')
    .reduce((s, r) => s + Number(r.importo), 0);

  const palmare = righe
    .filter((r) => r.tipo === 'PALMARE')
    .reduce((s, r) => s + Number(r.importo) * 1.22, 0);

  const addebitiAltri = righe
    .filter((r) => ['NOLEGGIO', 'RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  const esentiImponibile = righe
    .filter((r) => ['RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => {
      const iva = (r as any).percIva != null ? Number((r as any).percIva) : 22;
      if (iva === 22) return s;
      return s + Number(r.importo) / (1 + iva / 100);
    }, 0);
  const bollo = esentiImponibile >= SOGLIA_BOLLO ? COSTO_BOLLO : 0;

  const compensazioni = righe
    .filter((r) => ['ACCREDITO', 'BONUS', 'ACCONTO', 'FINE_MESE'].includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  return {
    fatturato: Math.round(fattLordo * 1.22 * 100) / 100,
    addebiti: Math.round((palmare + addebitiAltri + bollo) * 100) / 100,
    compensazioni: Math.round(compensazioni * 100) / 100,
    bollo,
  };
}

/** Nome foglio Excel valido (max 31 caratteri, niente : \ / ? * [ ]) e univoco nel workbook. */
function sheetNameSafe(nome: string, used: Set<string>): string {
  let base = nome.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Padroncino';
  let name = base;
  let i = 2;
  while (used.has(name.toUpperCase())) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(name.toUpperCase());
  return name;
}

function boldRow(ws: ExcelJS.Worksheet, rowNum: number, cols: number) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= cols; c++) row.getCell(c).font = { bold: true };
}

function borderBottom(ws: ExcelJS.Worksheet, rowNum: number, cols: number) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= cols; c++) row.getCell(c).border = { bottom: THIN };
}

function borderTopBottom(ws: ExcelJS.Worksheet, rowNum: number, cols: number) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= cols; c++) row.getCell(c).border = { top: THIN, bottom: THIN };
}

/** Riga di intestazione di sezione: sfondo colorato pieno, testo bianco in grassetto. */
function sectionHeader(ws: ExcelJS.Worksheet, rowNum: number, cols: number, hex: string) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }
}

/** Mini-intestazione di sottocategoria (dentro Addebiti): sfondo grigio chiaro, testo scuro. */
function subHeader(ws: ExcelJS.Worksheet, rowNum: number, cols: number) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR_SUBHEADER}` } };
    cell.font = { bold: true, size: 10, color: { argb: `FF${COLOR_FINALE}` } };
  }
}

/** Costruisce il foglio di dettaglio di un singolo padroncino e restituisce i riferimenti
 *  ai totali (per le formule cross-sheet del foglio RIEPILOGO). */
function buildPadroncinoSheet(wb: ExcelJS.Workbook, p: Padroncino, c: ConteggioMensile, sheetName: string) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 42 }, { width: 16 }, { width: 16 }, { width: 30 }];
  const righe = (c.righe ?? []).filter(isRigaReale);

  let r = 0;
  const nextRow = () => { r += 1; return ws.getRow(r); };

  const titleRow = nextRow();
  titleRow.getCell(1).value = `${p.ragioneSociale} — ${formatMese(c.mese)}`;
  titleRow.getCell(1).font = { bold: true, size: 13 };

  const infoRow = nextRow();
  infoRow.getCell(1).value = `Stato: ${c.stato}    DURC: ${p.scadenzaDurc ?? '—'}    DVR: ${p.dvrEsente ? 'esente' : (p.scadenzaDvr ?? '—')}    IBAN: ${p.iban ?? '—'}`;
  infoRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
  nextRow(); // riga vuota

  // ── FATTURATO ──
  const rFattHeader = nextRow().number; ws.getCell(rFattHeader, 1).value = 'FATTURATO SPEDIZIONI + RITIRI';
  sectionHeader(ws, rFattHeader, 3, COLOR_FATTURATO);
  const rFattCols = nextRow().number;
  ws.getRow(rFattCols).values = ['Descrizione', 'Imponibile (€)', 'Nota'];
  boldRow(ws, rFattCols, 3); borderBottom(ws, rFattCols, 3);

  const fattRighe = righe.filter((x) => x.tipo === 'FATTURATO' || x.tipo === 'TRATTENUTA');
  const fattStartRow = r + 1;
  if (fattRighe.length === 0) {
    const row = nextRow(); row.values = ['Nessuna voce di fatturato', 0, ''];
  } else {
    fattRighe.forEach((x) => {
      const row = nextRow();
      row.values = [x.descrizione, Number(x.importo), x.note ?? ''];
      row.getCell(2).numFmt = EUR;
    });
  }
  const fattEndRow = r;

  const imponibile = fattRighe.reduce((s, x) => s + Number(x.importo), 0);
  const rImponibile = nextRow().number;
  ws.getRow(rImponibile).getCell(1).value = 'Totale Imponibile';
  ws.getRow(rImponibile).getCell(2).value = { formula: `SUM(B${fattStartRow}:B${fattEndRow})`, result: imponibile } as any;
  ws.getRow(rImponibile).getCell(2).numFmt = EUR;
  boldRow(ws, rImponibile, 2);

  const iva = imponibile * 0.22;
  const rIva = nextRow().number;
  ws.getRow(rIva).getCell(1).value = 'IVA 22%';
  ws.getRow(rIva).getCell(2).value = { formula: `B${rImponibile}*0.22`, result: iva } as any;
  ws.getRow(rIva).getCell(2).numFmt = EUR;

  const totFattura = imponibile + iva;
  const rTotFattura = nextRow().number;
  ws.getRow(rTotFattura).getCell(1).value = 'Totale Fattura da Ricevere (c/IVA)';
  ws.getRow(rTotFattura).getCell(2).value = { formula: `B${rImponibile}+B${rIva}`, result: totFattura } as any;
  ws.getRow(rTotFattura).getCell(2).numFmt = EUR;
  boldRow(ws, rTotFattura, 2); borderTopBottom(ws, rTotFattura, 2);
  nextRow(); // riga vuota

  // ── ADDEBITI ──
  const rAddHeader = nextRow().number; ws.getCell(rAddHeader, 1).value = 'ADDEBITI DA INSERIRE IN FATTURA';
  sectionHeader(ws, rAddHeader, 4, COLOR_ADDEBITI);
  const rAddCols = nextRow().number;
  ws.getRow(rAddCols).values = ['Descrizione', 'Importo (€)', 'Totale (€)', 'Nota'];
  boldRow(ws, rAddCols, 4); borderBottom(ws, rAddCols, 4);

  const addebitiRowsIdx: number[] = [];
  let addebitiTotJs = 0;

  const addSubsection = (label: string, rows: ConteggiRiga[], iva1_22: boolean) => {
    if (rows.length === 0) return;
    const subR = nextRow().number;
    ws.getCell(subR, 1).value = label;
    subHeader(ws, subR, 4);
    rows.forEach((x) => {
      const row = nextRow();
      const importo = Number(x.importo);
      const totale = iva1_22 ? importo * 1.22 : importo;
      const formula = iva1_22 ? `B${row.number}*1.22` : `B${row.number}`;
      row.values = [x.descrizione || label, importo, { formula, result: totale } as any, x.note ?? ''];
      row.getCell(2).numFmt = EUR; row.getCell(3).numFmt = EUR;
      addebitiRowsIdx.push(row.number);
      addebitiTotJs += totale;
    });
  };

  addSubsection('Noleggio Palmari', righe.filter((x) => x.tipo === 'PALMARE'), true);
  addSubsection('Noleggio Mezzi', righe.filter((x) => x.tipo === 'NOLEGGIO'), false);
  addSubsection('Ricariche Elettriche', righe.filter((x) => x.tipo === 'RICARICA'), false);
  addSubsection('Addebiti Vari', righe.filter((x) => x.tipo === 'ADDEBITO'), false);

  const fin = calcolaTotali(c.righe ?? []);
  const rBolloSub = nextRow().number;
  ws.getCell(rBolloSub, 1).value = 'Bollo';
  subHeader(ws, rBolloSub, 4);
  const rBollo = nextRow().number;
  ws.getRow(rBollo).values = [
    `Automatico se imponibile esenti IVA ≥ ${SOGLIA_BOLLO.toFixed(2)} €`, '', fin.bollo, '',
  ];
  ws.getRow(rBollo).getCell(3).numFmt = EUR;
  ws.getRow(rBollo).getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
  addebitiTotJs += fin.bollo;

  if (addebitiRowsIdx.length === 0 && fin.bollo === 0) {
    const row = nextRow(); row.values = ['Nessun addebito', 0, 0, ''];
  }

  const rTotAddebiti = nextRow().number;
  const addebitiFormula = addebitiRowsIdx.length > 0
    ? addebitiRowsIdx.map((rr) => `C${rr}`).join('+') + `+C${rBollo}`
    : `C${rBollo}`;
  ws.getRow(rTotAddebiti).getCell(1).value = 'TOTALE ADDEBITI';
  ws.getRow(rTotAddebiti).getCell(3).value = { formula: addebitiFormula, result: addebitiTotJs } as any;
  ws.getRow(rTotAddebiti).getCell(3).numFmt = EUR;
  boldRow(ws, rTotAddebiti, 4); borderTopBottom(ws, rTotAddebiti, 4);
  nextRow(); // riga vuota

  // ── COMPENSAZIONI ──
  const rCompHeader = nextRow().number; ws.getCell(rCompHeader, 1).value = 'COMPENSAZIONI SU DISTRIBUZIONE (Cassa Prima Nota)';
  sectionHeader(ws, rCompHeader, 3, COLOR_COMPENSAZIONI);
  const rCompCols = nextRow().number;
  ws.getRow(rCompCols).values = ['Descrizione', 'Valore (€)', 'Nota'];
  boldRow(ws, rCompCols, 3); borderBottom(ws, rCompCols, 3);

  const compenRighe = righe.filter((x) => ['ACCREDITO', 'BONUS', 'ACCONTO', 'FINE_MESE'].includes(x.tipo));
  const compenStartRow = r + 1;
  if (compenRighe.length === 0) {
    const row = nextRow(); row.values = ['Nessuna compensazione', 0, ''];
  } else {
    compenRighe.forEach((x) => {
      const row = nextRow();
      row.values = [x.descrizione, Number(x.importo), x.note ?? ''];
      row.getCell(2).numFmt = EUR;
    });
  }
  const compenEndRow = r;
  const compenTotJs = compenRighe.reduce((s, x) => s + Number(x.importo), 0);
  const rTotCompen = nextRow().number;
  ws.getRow(rTotCompen).getCell(1).value = 'TOTALE COMPENSAZIONI';
  ws.getRow(rTotCompen).getCell(2).value = { formula: `SUM(B${compenStartRow}:B${compenEndRow})`, result: compenTotJs } as any;
  ws.getRow(rTotCompen).getCell(2).numFmt = EUR;
  boldRow(ws, rTotCompen, 3); borderTopBottom(ws, rTotCompen, 3);
  nextRow(); // riga vuota

  // ── RIEPILOGO FINALE ──
  const rFinHeader = nextRow().number; ws.getCell(rFinHeader, 1).value = 'RIEPILOGO FINALE';
  sectionHeader(ws, rFinHeader, 2, COLOR_FINALE);

  const rRecapFattura = nextRow().number;
  ws.getRow(rRecapFattura).getCell(1).value = 'Totale Fattura (c/IVA)';
  ws.getRow(rRecapFattura).getCell(2).value = { formula: `B${rTotFattura}`, result: totFattura } as any;
  ws.getRow(rRecapFattura).getCell(2).numFmt = EUR;

  const rRecapAddebiti = nextRow().number;
  ws.getRow(rRecapAddebiti).getCell(1).value = 'Totale Addebiti';
  ws.getRow(rRecapAddebiti).getCell(2).value = { formula: `-C${rTotAddebiti}`, result: -addebitiTotJs } as any;
  ws.getRow(rRecapAddebiti).getCell(2).numFmt = EUR;

  const rRecapCompen = nextRow().number;
  ws.getRow(rRecapCompen).getCell(1).value = 'Totale Compensazioni';
  ws.getRow(rRecapCompen).getCell(2).value = { formula: `-B${rTotCompen}`, result: -compenTotJs } as any;
  ws.getRow(rRecapCompen).getCell(2).numFmt = EUR;

  const netto = totFattura - addebitiTotJs - compenTotJs;
  const rNetto = nextRow().number;
  ws.getRow(rNetto).getCell(1).value = 'NETTO DA BONIFICARE';
  ws.getRow(rNetto).getCell(2).value = {
    formula: `B${rRecapFattura}+B${rRecapAddebiti}+B${rRecapCompen}`, result: netto,
  } as any;
  ws.getRow(rNetto).getCell(2).numFmt = EUR;
  boldRow(ws, rNetto, 2); ws.getRow(rNetto).getCell(1).font = { bold: true, size: 12 };
  ws.getRow(rNetto).getCell(2).font = { bold: true, size: 12 };
  borderTopBottom(ws, rNetto, 2);

  return {
    ws,
    netto,
    refs: {
      fatturato: `'${sheetName}'!B${rTotFattura}`,
      addebiti: `'${sheetName}'!C${rTotAddebiti}`,
      compensazioni: `'${sheetName}'!B${rTotCompen}`,
      netto: `'${sheetName}'!B${rNetto}`,
    },
    totals: { fatturato: totFattura, addebiti: addebitiTotJs, compensazioni: compenTotJs, netto },
  };
}

export async function generaExcelConteggi(righe: RigaPadroncinoExport[], mese: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestionale Corriere';
  wb.created = new Date();

  const wsR = wb.addWorksheet('RIEPILOGO');
  wsR.columns = [
    { width: 30 }, { width: 13 }, { width: 8 }, { width: 8 }, { width: 15 }, { width: 13 },
    { width: 14 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 13 }, { width: 13 },
  ];

  let rr = 0;
  const nextR = () => { rr += 1; return wsR.getRow(rr); };

  const titleRow = nextR();
  titleRow.getCell(1).value = `RIEPILOGO CONTEGGI — ${formatMese(mese)}`;
  titleRow.getCell(1).font = { bold: true, size: 13 };
  nextR(); // riga vuota

  const headerRowNum = nextR().number;
  wsR.getRow(headerRowNum).values = [
    'Padroncino', 'Stato', 'Mezzi', 'Palmari', 'Fatturato c/IVA', 'Addebiti',
    'Compensazioni', 'Netto Bonificato', 'Distribuzione Inviata', 'PDF Addebiti',
    'Fattura Creata', 'Fattura Ricevuta',
  ];
  sectionHeader(wsR, headerRowNum, 12, COLOR_FINALE);

  const firstDataRow = rr + 1;
  const usedNames = new Set<string>();
  let totFatturato = 0, totAddebiti = 0, totCompensazioni = 0, totNetto = 0;

  righe.forEach((rp) => {
    const { padroncino: p, conteggio: c, checklist } = rp;
    const sì = (k: string) => (checklist?.[k] ? 'Sì' : 'No');
    const row = nextR();

    if (c && c.righe?.length) {
      const sheetName = sheetNameSafe(p.ragioneSociale, usedNames);
      const { refs, totals } = buildPadroncinoSheet(wb, p, c, sheetName);
      row.values = [
        p.ragioneSociale, c.stato, p.mezziAssegnati?.length ?? 0, p.palmariAssegnati?.length ?? 0,
        { formula: refs.fatturato, result: totals.fatturato } as any,
        { formula: refs.addebiti, result: totals.addebiti } as any,
        { formula: refs.compensazioni, result: totals.compensazioni } as any,
        { formula: refs.netto, result: totals.netto } as any,
        sì('distribuzioneInviata'), sì('pdfAddebitiCreato'), sì('fatturaCreata'), sì('fatturaRicevuta'),
      ];
      totFatturato += totals.fatturato; totAddebiti += totals.addebiti;
      totCompensazioni += totals.compensazioni; totNetto += totals.netto;
    } else {
      row.values = [
        p.ragioneSociale, c?.stato ?? '—', p.mezziAssegnati?.length ?? 0, p.palmariAssegnati?.length ?? 0,
        0, 0, 0, 0,
        sì('distribuzioneInviata'), sì('pdfAddebitiCreato'), sì('fatturaCreata'), sì('fatturaRicevuta'),
      ];
    }
    (['E', 'F', 'G', 'H'] as const).forEach((col) => { row.getCell(col).numFmt = EUR; });
  });

  const lastDataRow = rr;
  const totalRow = nextR();
  totalRow.getCell(1).value = 'TOTALE';
  totalRow.getCell(3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})`, result: righe.reduce((s, rp) => s + (rp.padroncino.mezziAssegnati?.length ?? 0), 0) } as any;
  totalRow.getCell(4).value = { formula: `SUM(D${firstDataRow}:D${lastDataRow})`, result: righe.reduce((s, rp) => s + (rp.padroncino.palmariAssegnati?.length ?? 0), 0) } as any;
  totalRow.getCell(5).value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})`, result: totFatturato } as any;
  totalRow.getCell(6).value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})`, result: totAddebiti } as any;
  totalRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: totCompensazioni } as any;
  totalRow.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})`, result: totNetto } as any;
  (['E', 'F', 'G', 'H'] as const).forEach((col) => { totalRow.getCell(col).numFmt = EUR; });
  boldRow(wsR, totalRow.number, 12); borderTopBottom(wsR, totalRow.number, 12);

  // Il foglio RIEPILOGO è già il primo: è stato aggiunto al workbook prima
  // dei fogli padroncino (buildPadroncinoSheet chiama wb.addWorksheet, che
  // accoda in fondo), quindi l'ordine di inserimento coincide già con
  // l'ordine desiderato senza bisogno di riordinare nulla.

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Conteggi_${mese}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
