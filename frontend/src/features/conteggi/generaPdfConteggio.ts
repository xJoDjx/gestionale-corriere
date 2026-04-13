// src/features/conteggi/generaPdfConteggio.ts
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const eur = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function formatMese(m: string): string {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}

// ─── COLORI ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
  blue:        [37, 99, 235]    as RGB,
  lightBlue:   [219, 234, 254]  as RGB,
  green:       [22, 163, 74]    as RGB,
  lightGreen:  [220, 252, 231]  as RGB,
  red:         [220, 38, 38]    as RGB,
  lightRed:    [254, 226, 226]  as RGB,
  orange:      [234, 88, 12]    as RGB,
  lightOrange: [254, 243, 199]  as RGB,
  purple:      [124, 58, 237]   as RGB,
  teal:        [16, 185, 129]   as RGB,
  gray:        [107, 114, 128]  as RGB,
  lightGray:   [243, 244, 246]  as RGB,
  dark:        [17, 24, 39]     as RGB,
  white:       [255, 255, 255]  as RGB,
};

// ─── TIPI ─────────────────────────────────────────────────────────────────────
export interface PdfConteggio {
  padroncino: {
    ragioneSociale: string;
    partitaIva?: string | null;
    indirizzo?:   string | null;
    iban?:        string | null;
  };
  mese: string;
  statoConteggio: string;
  giorniMese: number;
  numeroPalmari: number;
  tariffaPalmareGiornaliera: number;
  righeF: Array<{ descrizione: string; valore: number | null; nota: string }>;
  righeM: Array<{ targa: string; valoreRataNoIva: number | null; percIva: number; alimentazione: string; note: string }>;
  righeR: Array<{ targa: string; costoRicarica: number | null; percIva: number; note: string }>;
  righeV: Array<{ descrizione: string; valoreNoIva: number | null; percIva: number; note: string }>;
  accrediti: Array<{ descrizione: string; valore: number | null; nota: string }>;
  fineMese:  Array<{ descrizione: string; valore: number | null; nota: string }>;
  cassaAcconti: Array<{ codice: string; descrizione: string; data: string; valore: number | null; nota: string }>;
}

// ─── FUNZIONE PRINCIPALE ──────────────────────────────────────────────────────
export function generaPdfConteggio(data: PdfConteggio): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Utility ──
  const checkBreak = (h: number) => {
    if (y + h > pageH - 16) { doc.addPage(); y = margin; }
  };

  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  const sectionHeader = (title: string, color: RGB) => {
    checkBreak(12);
    doc.setFillColor(...color);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 4, y + 5.5);
    doc.setTextColor(...C.dark);
    y += 11;
  };

  const kvRow = (label: string, val: string, x1: number, x2: number, yPos: number) => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(label, x1, yPos);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text(val, x2, yPos + 5);
  };

  // ── CALCOLI ──
  const totFatturato       = data.righeF.reduce((s, r) => s + (r.valore ?? 0), 0);
  const costoPalmariNoIva  = data.numeroPalmari * data.tariffaPalmareGiornaliera * data.giorniMese;
  const costoPalmariConIva = costoPalmariNoIva * 1.22;
  const totMezziConIva     = data.righeM.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const totRicaricheConIva = data.righeR.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);
  const totVariConIva      = data.righeV.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const bolloAttivo =
    data.righeR.some((r) => r.percIva !== 22 && (r.costoRicarica ?? 0) >= 77.47) ||
    data.righeV.some((r) => r.percIva !== 22 && (r.valoreNoIva ?? 0) >= 77.47);
  const totAddebitiConIva  = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + (bolloAttivo ? 2 : 0);
  const totAccrediti  = data.accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese   = data.fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCassa      = data.cassaAcconti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCompen     = totAccrediti + totFineMese + totCassa;
  const netto         = totFatturato - totAddebitiConIva - totCompen;
  const nettoPos      = netto >= 0;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. HEADER PAGINA
  // ════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...C.blue);
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(...C.white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTEGGIO MENSILE', margin, 13);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.padroncino.ragioneSociale}  ·  ${formatMese(data.mese)}`, margin, 22);

  // badge stato
  const statoCol: RGB =
    data.statoConteggio === 'CONFERMATO' ? C.teal :
    data.statoConteggio === 'CHIUSO'     ? C.orange :
    C.gray;
  doc.setFillColor(...statoCol);
  doc.roundedRect(pageW - margin - 30, 10, 28, 9, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(data.statoConteggio, pageW - margin - 16, 15.8, { align: 'center' });

  doc.setTextColor(...C.dark);
  y = 38;

  // ════════════════════════════════════════════════════════════════════════════
  // 2. DATI PADRONCINO
  // ════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...C.lightGray);
  doc.rect(margin, y, contentW, 24, 'F');
  const col1 = margin + 4, col2 = margin + contentW / 2 + 2;
  kvRow('RAGIONE SOCIALE',    data.padroncino.ragioneSociale, col1, col1, y + 5);
  kvRow('PARTITA IVA',        data.padroncino.partitaIva ?? '—', col2, col2, y + 5);
  kvRow('IBAN',               data.padroncino.iban ?? '—', col1, col1, y + 14);
  kvRow('DATA GENERAZIONE',   new Date().toLocaleDateString('it-IT'), col2, col2, y + 14);
  y += 30;

  // ════════════════════════════════════════════════════════════════════════════
  // 3. RIEPILOGO
  // ════════════════════════════════════════════════════════════════════════════
  sectionHeader('Riepilogo', C.blue);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    styles: { fontSize: 9, cellPadding: 3 },
    body: [
      ['Fatturato Distribuzione (imponibile)',  eur(totFatturato)],
      ['IVA 22%',                               eur(totFatturato * 0.22)],
      ['Totale Fattura da Ricevere',            eur(totFatturato * 1.22)],
      ['Totale Addebiti (con IVA)',              eur(totAddebitiConIva)],
      ['Totale Compensazioni',                  eur(totCompen)],
      ['NETTO DA BONIFICARE',                   eur(netto)],
    ],
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (h) => {
      if (h.row.index === 2) { h.cell.styles.fillColor = C.lightBlue; h.cell.styles.fontStyle = 'bold'; }
      if (h.row.index === 3) { h.cell.styles.fillColor = C.lightRed; }
      if (h.row.index === 5) {
        h.cell.styles.fillColor = nettoPos ? C.lightGreen : C.lightRed;
        h.cell.styles.textColor = nettoPos ? C.green : C.red;
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.fontSize = 11;
      }
    },
  });
  y = lastY() + 12;

  // ════════════════════════════════════════════════════════════════════════════
  // 4. FATTURATO DISTRIBUZIONE
  // ════════════════════════════════════════════════════════════════════════════
  if (data.righeF.length > 0) {
    sectionHeader('Fatturato Distribuzione', C.teal);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      head: [['#', 'Descrizione', 'Importo (€)', 'Note']],
      headStyles: { fillColor: C.teal, textColor: C.white },
      body: [
        ...data.righeF.map((r, i) => [i + 1, r.descrizione, eur(r.valore), r.nota || '']),
        ['', 'Totale imponibile', eur(totFatturato), ''],
        ['', 'IVA 22%',           eur(totFatturato * 0.22), ''],
        ['', 'TOTALE FATTURA',    eur(totFatturato * 1.22), ''],
      ],
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: contentW * 0.52 },
        2: { cellWidth: contentW * 0.25, halign: 'right' },
        3: { cellWidth: contentW * 0.21 },
      },
      didParseCell: (h) => {
        const base = data.righeF.length;
        if (h.row.index >= base) { h.cell.styles.fontStyle = 'bold'; }
        if (h.row.index === base + 2) {
          h.cell.styles.fillColor = C.lightGreen;
          h.cell.styles.textColor = C.green;
        }
      },
    });
    y = lastY() + 12;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. ADDEBITI
  // ════════════════════════════════════════════════════════════════════════════
  sectionHeader('Addebiti', C.red);

  // 5a. Palmari
  checkBreak(26);
  doc.setFillColor(...C.lightBlue);
  doc.rect(margin, y, contentW, 22, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.blue);
  doc.text('Addebiti Noleggio Palmari', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.dark);
  doc.setFontSize(8);
  doc.text(
    `${data.numeroPalmari} palmari  ×  ${eur(data.tariffaPalmareGiornaliera)}/giorno  ×  ${data.giorniMese} giorni`,
    margin + 4, y + 13,
  );
  doc.setFont('helvetica', 'bold');
  doc.text(
    `No IVA: ${eur(costoPalmariNoIva)}   →   Con IVA 22%: ${eur(costoPalmariConIva)}`,
    margin + 4, y + 19,
  );
  doc.setTextColor(...C.dark);
  y += 26;

  // 5b. Noleggi Mezzi
  if (data.righeM.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Addebiti Noleggi Mezzi', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8, cellPadding: 2.5 },
      head: [['Targa', 'No IVA', 'IVA %', 'Con IVA', 'Alimentazione', 'Note']],
      headStyles: { fillColor: C.gray, textColor: C.white },
      body: [
        ...data.righeM.map((r) => [
          r.targa,
          eur(r.valoreRataNoIva),
          `${r.percIva}%`,
          eur((r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100)),
          r.alimentazione,
          r.note || '',
        ]),
        ['', '', 'TOTALE', eur(totMezziConIva), '', ''],
      ],
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 26 },
        5: { cellWidth: contentW - 124 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.righeM.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 5c. Ricariche Elettriche
  if (data.righeR.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Addebiti Ricariche Elettriche', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8, cellPadding: 2.5 },
      head: [['Targa', 'Costo Ricarica', 'IVA %', 'Con IVA', 'Note']],
      headStyles: { fillColor: C.orange, textColor: C.white },
      body: [
        ...data.righeR.map((r) => [
          r.targa,
          eur(r.costoRicarica),
          `${r.percIva}%`,
          eur((r.costoRicarica ?? 0) * (1 + r.percIva / 100)),
          r.note || '',
        ]),
        ['', 'TOTALE RICARICHE', '', eur(totRicaricheConIva), ''],
      ],
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 35, halign: 'right' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: contentW - 108 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.righeR.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 5d. Addebiti Vari
  if (data.righeV.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Addebiti Vari', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8, cellPadding: 2.5 },
      head: [['Descrizione', 'No IVA', 'IVA %', 'Con IVA', 'Note']],
      headStyles: { fillColor: C.gray, textColor: C.white },
      body: [
        ...data.righeV.map((r) => [
          r.descrizione,
          eur(r.valoreNoIva),
          `${r.percIva}%`,
          eur((r.valoreNoIva ?? 0) * (1 + r.percIva / 100)),
          r.note || '',
        ]),
        ['TOTALE VARI', '', '', eur(totVariConIva), ''],
      ],
      columnStyles: {
        0: { cellWidth: contentW * 0.35 },
        1: { cellWidth: contentW * 0.18, halign: 'right' },
        2: { cellWidth: contentW * 0.10, halign: 'center' },
        3: { cellWidth: contentW * 0.18, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: contentW * 0.19 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.righeV.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 5e. Bollo
  if (bolloAttivo) {
    checkBreak(12);
    doc.setFillColor(...C.lightOrange);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.orange);
    doc.text(
      'Bollo virtuale — attivato automaticamente (addebiti IVA ≠ 22% con importo ≥ 77,47 €)',
      margin + 4, y + 6.5,
    );
    doc.text('2,00 €', pageW - margin - 4, y + 6.5, { align: 'right' });
    doc.setTextColor(...C.dark);
    y += 14;
  }

  // 5f. Totale addebiti
  checkBreak(11);
  doc.setFillColor(...C.lightRed);
  doc.rect(margin, y, contentW, 10, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.red);
  doc.text('TOTALE ADDEBITI DA INSERIRE IN FATTURA', margin + 4, y + 7);
  doc.text(eur(totAddebitiConIva), pageW - margin - 4, y + 7, { align: 'right' });
  doc.setTextColor(...C.dark);
  y += 15;

  // ════════════════════════════════════════════════════════════════════════════
  // 6. COMPENSAZIONI
  // ════════════════════════════════════════════════════════════════════════════
  sectionHeader('Compensazioni', C.purple);

  // 6a. Accrediti
  if (data.accrediti.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Accrediti e Storni', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      head: [['Descrizione', 'Importo (€)', 'Note']],
      headStyles: { fillColor: C.purple, textColor: C.white },
      body: [
        ...data.accrediti.map((r) => [r.descrizione, eur(r.valore), r.nota || '']),
        ['TOTALE ACCREDITI', eur(totAccrediti), ''],
      ],
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.25, halign: 'right' },
        2: { cellWidth: contentW * 0.20 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.accrediti.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 6b. Fine Mese
  if (data.fineMese.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Fattura Fine Mese', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      head: [['Descrizione', 'Importo (€)', 'Note']],
      headStyles: { fillColor: C.purple, textColor: C.white },
      body: [
        ...data.fineMese.map((r) => [r.descrizione, eur(r.valore), r.nota || '']),
        ['TOTALE FINE MESE', eur(totFineMese), ''],
      ],
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.25, halign: 'right' },
        2: { cellWidth: contentW * 0.20 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.fineMese.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 6c. Cassa acconti
  if (data.cassaAcconti.length > 0) {
    checkBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Cassa Prima Nota — Acconti', margin, y + 5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      head: [['Codice', 'Descrizione', 'Data', 'Importo (€)', 'Note']],
      headStyles: { fillColor: C.purple, textColor: C.white },
      body: [
        ...data.cassaAcconti.map((r) => [
          r.codice,
          r.descrizione,
          r.data ? new Date(r.data).toLocaleDateString('it-IT') : '—',
          eur(r.valore),
          r.nota || '',
        ]),
        ['', 'TOTALE ACCONTI', '', eur(totCassa), ''],
      ],
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: contentW * 0.40 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: contentW - 76 - 22 },
      },
      didParseCell: (h) => {
        if (h.row.index === data.cassaAcconti.length) {
          h.cell.styles.fillColor = C.lightGray;
          h.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY() + 6;
  }

  // 6d. Riepilogo compensazioni
  checkBreak(52);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    styles: { fontSize: 9, cellPadding: 3 },
    body: [
      ['Totale Addebiti (con IVA)',        eur(totAddebitiConIva)],
      ['Accrediti e Storni',               eur(totAccrediti)],
      ['Fattura Fine Mese',                eur(totFineMese)],
      ['Acconti (Cassa Prima Nota)',        eur(totCassa)],
      ['Totale Compensazioni',             eur(totCompen)],
      ['SALDO NETTO ADDEBITATO IN FATTURA', eur(totAddebitiConIva - totCompen)],
    ],
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (h) => {
      if (h.row.index === 4) { h.cell.styles.fillColor = C.lightGray; h.cell.styles.fontStyle = 'bold'; }
      if (h.row.index === 5) {
        h.cell.styles.fillColor = C.lightRed;
        h.cell.styles.textColor = C.red;
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.fontSize = 10;
      }
    },
  });
  y = lastY() + 12;

  // ════════════════════════════════════════════════════════════════════════════
  // 7. NETTO FINALE
  // ════════════════════════════════════════════════════════════════════════════
  checkBreak(18);
  doc.setFillColor(...(nettoPos ? C.green : C.red));
  doc.rect(margin, y, contentW, 14, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('NETTO DA BONIFICARE', margin + 5, y + 10);
  doc.text(eur(netto), pageW - margin - 5, y + 10, { align: 'right' });

  // ════════════════════════════════════════════════════════════════════════════
  // 8. FOOTER SU OGNI PAGINA
  // ════════════════════════════════════════════════════════════════════════════
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    const timestamp = new Date().toLocaleString('it-IT');
    doc.text(
      `Conteggio ${formatMese(data.mese)} — ${data.padroncino.ragioneSociale}  |  Pagina ${i} di ${pages}  |  ${timestamp}`,
      pageW / 2, pageH - 6,
      { align: 'center' },
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 9. SALVA FILE
  // ════════════════════════════════════════════════════════════════════════════
  const meseLabel = formatMese(data.mese).replace(/\s+/g, '_');
  const ragSoc = data.padroncino.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  doc.save(`Conteggio_${ragSoc}_${meseLabel}.pdf`);
}
