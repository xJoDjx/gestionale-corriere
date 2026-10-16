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

// ─── COLORI (palette tenui) ────────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
  blue:        [74,  114, 176] as RGB,   // #4A72B0
  lightBlue:   [232, 238, 247] as RGB,   // #E8EEF7
  green:       [74,  140, 106] as RGB,   // #4A8C6A
  lightGreen:  [228, 242, 235] as RGB,   // #E4F2EB
  red:         [181, 85,  85]  as RGB,   // #B55555
  lightRed:    [247, 232, 232] as RGB,   // #F7E8E8
  purple:      [124, 58,  237] as RGB,   // #7C3AED
  slate:       [122, 143, 168] as RGB,   // #7A8FA8
  lightSlate:  [238, 242, 247] as RGB,   // #EEF2F7
  gray:        [107, 114, 128] as RGB,   // #6B7280
  lightGray:   [243, 244, 246] as RGB,   // #F3F4F6
  dark:        [31,  41,  55]  as RGB,   // #1F2937
  white:       [255, 255, 255] as RGB,
};

// ─── TIPI ─────────────────────────────────────────────────────────────────────
export interface PdfConteggio {
  padroncino: {
    ragioneSociale: string;
    partitaIva?: string | null;
    iban?:        string | null;
    indirizzo?:   string | null;
  };
  mese: string;
  statoConteggio: string;
  /** Righe palmari editabili (sostituisce numeroPalmari/tariffaPalmareGiornaliera/giorniMese) */
  righePalmari: Array<{
    numeroPalmari: number;
    tariffa: number;
    giorni: number;
    percIva: number;
    note: string;
  }>;
  durcScadenza?: string | null;
  durcValido?: boolean | null;
  dvrScadenza?: string | null;
  dvrValido?: boolean | null;
  dvrEsente?: boolean | null;
  righeF: Array<{ descrizione: string; valore: number | null; nota: string }>;
  righeM: Array<{ targa: string; valoreRataNoIva: number | null; percIva: number; alimentazione: string; note: string }>;
  righeR: Array<{ targa: string; costoRicarica: number | null; percIva: number; note: string }>;
  righeV: Array<{ descrizione: string; valoreNoIva: number | null; percIva: number; note: string }>;
  accrediti:    Array<{ descrizione: string; valore: number | null; nota: string }>;
  fineMese:     Array<{ descrizione: string; valore: number | null; nota: string }>;
  cassaAcconti: Array<{ codice: string; descrizione: string; data: string; valore: number | null; nota: string }>;
  compensazioniImponibile?: Array<{ descrizione: string; valore: number | null; nota: string }>;
}

// ─── FUNZIONE PRINCIPALE ──────────────────────────────────────────────────────
export function generaPdfConteggio(data: PdfConteggio): void {
  const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW    = doc.internal.pageSize.getWidth();
  const pageH    = doc.internal.pageSize.getHeight();
  const margin   = 10;          // margini laterali ridotti per guadagnare larghezza
  const contentW = pageW - margin * 2;
  let y          = margin;

  // Spaziatura standard tra una sezione e la successiva
  const GAP = 2.5;

  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  const checkBreak = (h: number) => {
    if (y + h > pageH - 10) { doc.addPage(); y = margin; }
  };

  // ── Header colorato di sezione (riga compatta) ──
  const sectionHeader = (title: string, color: RGB = C.dark) => {
    checkBreak(6);
    doc.setFillColor(...color);
    doc.rect(margin, y, contentW, 4.6, 'F');
    doc.setTextColor(...C.white);
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 1, y + 3.2);
    doc.setTextColor(...C.dark);
    y += 5.2;
  };

  // ── Riga totale colorata (più sottile) ──
  const totalRow = (label: string, val: number, bgColor: RGB, textColor: RGB = C.white) => {
    checkBreak(5);
    doc.setFillColor(...bgColor);
    doc.rect(margin, y, contentW, 4.6, 'F');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textColor);
    doc.text(label, margin + 1, y + 3.2);
    doc.text(eur(val), pageW - margin - 3, y + 3.2, { align: 'right' });
    doc.setTextColor(...C.dark);
    y += 5.2;
  };

  // ── CALCOLI ──
  const totFatturato       = data.righeF.reduce((s, r) => s + (r.valore ?? 0), 0);
  const costoPalmariConIva = (data.righePalmari ?? []).reduce(
    (s, rp) => s + rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100), 0
  );
  const totMezziConIva     = data.righeM.reduce((s, r) => s + (r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100), 0);
  const totRicaricheConIva = data.righeR.reduce((s, r) => s + (r.costoRicarica ?? 0) * (1 + r.percIva / 100), 0);
  const totVariConIva      = data.righeV.reduce((s, r) => s + (r.valoreNoIva ?? 0) * (1 + r.percIva / 100), 0);

  const sommaEsente =
    data.righeR.filter(r => r.percIva !== 22).reduce((s, r) => s + (r.costoRicarica ?? 0), 0) +
    data.righeV.filter(r => r.percIva !== 22).reduce((s, r) => s + (r.valoreNoIva ?? 0), 0);
  const bolloAttivo  = sommaEsente >= 77.47;
  const bolloImporto = bolloAttivo ? 2 : 0;

  const totAddebitiConIva = costoPalmariConIva + totMezziConIva + totRicaricheConIva + totVariConIva + bolloImporto;
  const totCassa          = data.cassaAcconti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totAccrediti      = data.accrediti.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totFineMese       = data.fineMese.reduce((s, r) => s + (r.valore ?? 0), 0);
  const totCompensazioni  = totCassa + totAccrediti + totFineMese;
  const nettoBonificare   = totFatturato * 1.22 - totAddebitiConIva - totCompensazioni;
  const nettoPos          = nettoBonificare >= 0;

  // ════════════════════════════════════════════════════════════════
  // 1. HEADER
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...C.blue);
  doc.rect(0, 0, pageW, 8.5, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${data.padroncino.ragioneSociale.toUpperCase()}  —  ${formatMese(data.mese).toUpperCase()}`,
    margin, 5.8,
  );
  const statoCol: RGB =
    data.statoConteggio === 'CONFERMATO' ? C.green :
    data.statoConteggio === 'CHIUSO'     ? C.slate : C.gray;
  doc.setFillColor(...statoCol);
  doc.roundedRect(pageW - margin - 23, 1.6, 21, 5.2, 1, 1, 'F');
  doc.setFontSize(6.2);
  doc.text(data.statoConteggio, pageW - margin - 12.5, 5.4, { align: 'center' });
  doc.setTextColor(...C.dark);
  y = 10.5;

  // ════════════════════════════════════════════════════════════════
  // 2. DURC + DVR
  // ════════════════════════════════════════════════════════════════
  const halfW = contentW / 2 - 1;
  doc.setFontSize(6.8);

  doc.setFillColor(...C.lightGray);
  doc.rect(margin, y, halfW, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  const durcLabel = data.durcScadenza ? `DURC SCADENZA: ${data.durcScadenza}` : 'DURC SCADENZA: —';
  doc.text(durcLabel, margin + 2, y + 2.8);
  if (data.durcValido != null) {
    doc.setTextColor(...(data.durcValido ? C.green : C.red));
    doc.text(data.durcValido ? 'VALIDO' : 'NON VALIDO', margin + halfW - 18, y + 2.8);
  }

  const dvrX = margin + halfW + 2;
  doc.setFillColor(...C.lightGray);
  doc.rect(dvrX, y, halfW, 4, 'F');
  doc.setTextColor(...C.dark);
  const dvrLabel = data.dvrEsente
    ? 'DVR SCADENZA: ESENTE'
    : (data.dvrScadenza ? `DVR SCADENZA: ${data.dvrScadenza}` : 'DVR SCADENZA: —');
  doc.text(dvrLabel, dvrX + 2, y + 2.8);
  if (data.dvrEsente) {
    doc.setTextColor(...C.purple);
    doc.text('ESENTE', dvrX + halfW - 14, y + 2.8);
  } else if (data.dvrValido != null) {
    doc.setTextColor(...(data.dvrValido ? C.green : C.red));
    doc.text(data.dvrValido ? 'VALIDO' : 'NON VALIDO', dvrX + halfW - 18, y + 2.8);
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.dark);
  y += 5.5;  // gap dopo DURC/DVR prima della prima sezione

  // ════════════════════════════════════════════════════════════════
  // 3. FATTURATO SPEDIZIONI + RITIRI
  // ════════════════════════════════════════════════════════════════
  sectionHeader('Fatturato Spedizioni + Ritiri', C.green);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    styles: { fontSize: 6.8, cellPadding: 1.0 },
    body: [
      ...data.righeF.map((r) => [r.descrizione.toUpperCase(), (r.nota || '').toUpperCase(), eur(r.valore)]),
      [{ content: 'TOTALE IMPONIBILE', colSpan: 2, styles: { fontStyle: 'bold' as const } }, eur(totFatturato)],
      [{ content: 'IVA 22%',           colSpan: 2, styles: { fontStyle: 'bold' as const } }, eur(totFatturato * 0.22)],
      [{
        content: 'TOTALE FATTURA DA RICEVERE', colSpan: 2,
        styles: { fontStyle: 'bold' as const, fillColor: C.lightGreen as RGB, textColor: C.green as RGB },
      }, {
        content: eur(totFatturato * 1.22),
        styles: { fontStyle: 'bold' as const, fillColor: C.lightGreen as RGB, textColor: C.green as RGB, halign: 'right' as const },
      }],
    ],
    columnStyles: {
      0: { cellWidth: contentW * 0.52 },
      1: { cellWidth: contentW * 0.22, fontSize: 6.2, textColor: C.gray as RGB },
      2: { cellWidth: contentW * 0.26, halign: 'right', fontStyle: 'bold' },
    },
  });
  y = lastY() + GAP;

  // ════════════════════════════════════════════════════════════════
  // 4. ADDEBITI NOLEGGIO PALMARI
  // ════════════════════════════════════════════════════════════════
  const righePalmari = data.righePalmari ?? [];
  if (righePalmari.length > 0) {
    const totPalmari = righePalmari.reduce(
      (s, rp) => s + rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100), 0
    );
    checkBreak(13);
    sectionHeader(`Addebiti Noleggio Palmari — N.${righePalmari.reduce((s, rp) => s + rp.numeroPalmari, 0)}`, C.slate);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['N° PALMARI', 'TARIFFA/GG', 'GIORNI', 'IVA %', 'CON IVA', 'NOTE']],
      headStyles: { fillColor: C.slate, textColor: C.white, fontSize: 6.5 },
      body: righePalmari.map((rp) => [
        String(rp.numeroPalmari),
        `${rp.tariffa.toFixed(2)} €/g`,
        String(rp.giorni),
        `${rp.percIva}%`,
        eur(rp.numeroPalmari * rp.tariffa * rp.giorni * (1 + rp.percIva / 100)),
        (rp.note || '').toUpperCase(),
      ]),
      columnStyles: {
        0: { cellWidth: 22, halign: 'left' },
        1: { cellWidth: 28, halign: 'left' },
        2: { cellWidth: 18, halign: 'left' },
        3: { cellWidth: 14, halign: 'left' },
        4: { cellWidth: 30, halign: 'left', fontStyle: 'bold' },
        5: { cellWidth: contentW - 112 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE NOLEGGIO PALMARI', totPalmari, C.lightSlate, C.slate);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 5. ADDEBITI NOLEGGIO MEZZI
  // ════════════════════════════════════════════════════════════════
  if (data.righeM.length > 0) {
    checkBreak(14);
    sectionHeader(`Addebiti Noleggio Mezzi — N.${data.righeM.length}`, C.red);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['TARGA', 'ALIMENTAZIONE', 'NO IVA', 'IVA %', 'CON IVA', 'NOTE']],
      headStyles: { fillColor: C.gray, textColor: C.white, fontSize: 6.5 },
      body: data.righeM.map((r) => [
        r.targa.toUpperCase(),
        r.alimentazione.toUpperCase(),
        eur(r.valoreRataNoIva),
        `${r.percIva}%`,
        eur((r.valoreRataNoIva ?? 0) * (1 + r.percIva / 100)),
        (r.note || '').toUpperCase(),
      ]),
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28, halign: 'left' },
        3: { cellWidth: 13, halign: 'left' },
        4: { cellWidth: 28, halign: 'left', fontStyle: 'bold' },
        5: { cellWidth: contentW - 115 },
      },
    });
    y = lastY() + 0.5;
    totalRow(`TOTALE NOLEGGIO MEZZI (${data.righeM.length} VEICOLI)`, totMezziConIva, C.lightRed, C.red);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 6. ADDEBITI RICARICHE ELETTRICHE
  // ════════════════════════════════════════════════════════════════
  if (data.righeR.length > 0) {
    checkBreak(14);
    sectionHeader('Addebiti Ricariche Elettriche', C.slate);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['TARGA', 'COSTO RICARICA', 'IVA %', 'CON IVA', 'NOTE']],
      headStyles: { fillColor: C.slate, textColor: C.white, fontSize: 6.5 },
      body: data.righeR.map((r) => [
        r.targa.toUpperCase(),
        eur(r.costoRicarica),
        `${r.percIva}%`,
        eur((r.costoRicarica ?? 0) * (1 + r.percIva / 100)),
        (r.note || '').toUpperCase(),
      ]),
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30, halign: 'left' },
        2: { cellWidth: 13, halign: 'left' },
        3: { cellWidth: 30, halign: 'left', fontStyle: 'bold' },
        4: { cellWidth: contentW - 93 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE RICARICHE ELETTRICHE', totRicaricheConIva, C.lightSlate, C.slate);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 7. ADDEBITI VARI
  // ════════════════════════════════════════════════════════════════
  if (data.righeV.length > 0) {
    checkBreak(14);
    sectionHeader('Addebiti Vari', C.gray);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['DESCRIZIONE', 'NO IVA', 'IVA %', 'CON IVA', 'NOTE']],
      headStyles: { fillColor: C.gray, textColor: C.white, fontSize: 6.5 },
      body: data.righeV.map((r) => [
        r.descrizione.toUpperCase(),
        eur(r.valoreNoIva),
        `${r.percIva}%`,
        eur((r.valoreNoIva ?? 0) * (1 + r.percIva / 100)),
        (r.note || '').toUpperCase(),
      ]),
      columnStyles: {
        0: { cellWidth: contentW * 0.38 },
        1: { cellWidth: contentW * 0.14, halign: 'left' },
        2: { cellWidth: contentW * 0.07, halign: 'left' },
        3: { cellWidth: contentW * 0.13, halign: 'left', fontStyle: 'bold' },
        4: { cellWidth: contentW * 0.28 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE ADDEBITI VARI', totVariConIva, C.lightGray, C.dark);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 8. BOLLO VIRTUALE
  // ════════════════════════════════════════════════════════════════
  if (bolloAttivo) {
    checkBreak(7);
    const bolloH = 5.2;
    doc.setFillColor(...C.lightBlue);
    doc.rect(margin, y, contentW, bolloH, 'F');
    doc.setFillColor(...C.blue);
    doc.rect(margin, y, 1.2, bolloH, 'F');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('ADDEBITO BOLLO €2,00', margin + 1, y + 3.5);
    doc.text(eur(2), pageW - margin - 3, y + 3.5, { align: 'right' });
    // y += bolloH + GAP;
  }


  // ════════════════════════════════════════════════════════════════
  // 9. CASSA PRIMA NOTA
  // ════════════════════════════════════════════════════════════════
  if (data.cassaAcconti.length > 0) {
    checkBreak(14);
    sectionHeader('Cassa Prima Nota', C.blue);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['CODICE', 'DESCRIZIONE', 'DATA', 'IMPORTO', 'NOTE']],
      headStyles: { fillColor: C.blue, textColor: C.white, fontSize: 6.5 },
      body: data.cassaAcconti.map((r) => [
        r.codice.toUpperCase(),
        r.descrizione.toUpperCase(),
        r.data ? new Date(r.data).toLocaleDateString('it-IT') : '—',
        eur(r.valore),
        (r.nota || '').toUpperCase(),
      ]),
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: contentW * 0.44 },
        2: { cellWidth: 20, halign: 'left' },
        3: { cellWidth: 26, halign: 'left', fontStyle: 'bold' },
        4: { cellWidth: contentW - 16 - contentW * 0.44 - 20 - 26 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE CASSA PRIMA NOTA', totCassa, C.lightGray, C.dark);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 10. ACCREDITI / COMPENSAZIONI
  // ════════════════════════════════════════════════════════════════
  if (data.accrediti.length > 0) {
    checkBreak(14);
    sectionHeader('Accrediti / Compensazioni', C.green);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['DESCRIZIONE', 'IMPORTO', 'NOTE']],
      headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.5 },
      body: data.accrediti.map((r) => [r.descrizione.toUpperCase(), eur(r.valore), (r.nota || '').toUpperCase()]),
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.20, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: contentW * 0.25 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE ACCREDITI / COMPENSAZIONI', totAccrediti, C.lightGreen, C.green);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 11. FATTURE FINE MESE
  // ════════════════════════════════════════════════════════════════
  if (data.fineMese.length > 0) {
    checkBreak(14);
    sectionHeader('Fatture Fine Mese', C.purple);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['DESCRIZIONE', 'IMPORTO', 'NOTE']],
      headStyles: { fillColor: C.purple, textColor: C.white, fontSize: 6.5 },
      body: data.fineMese.map((r) => [r.descrizione.toUpperCase(), eur(r.valore), (r.nota || '').toUpperCase()]),
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.20, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: contentW * 0.25 },
      },
    });
    y = lastY() + 0.5;
    totalRow('TOTALE FATTURE FINE MESE', totFineMese, [237, 233, 255] as RGB, C.purple);
    y += GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 12. COMPENSAZIONI SU IMPONIBILE (legacy)
  // ════════════════════════════════════════════════════════════════
  if (data.compensazioniImponibile && data.compensazioniImponibile.length > 0) {
    checkBreak(14);
    sectionHeader('Compensazioni su Imponibile', C.green);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: { fontSize: 6.8, cellPadding: 1.0 },
      head: [['DESCRIZIONE', 'IMPORTO', 'NOTE']],
      headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.5 },
      body: data.compensazioniImponibile.map((r) => [r.descrizione.toUpperCase(), eur(r.valore), (r.nota || '').toUpperCase()]),
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.20, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: contentW * 0.25 },
      },
    });
    y = lastY() + GAP;
  }

  // ════════════════════════════════════════════════════════════════
  // 13. RIEPILOGO TOTALE
  // ════════════════════════════════════════════════════════════════
  // Spazio extra + linea separatrice prima del riepilogo
  y += 10;

  checkBreak(40);
  sectionHeader('Riepilogo Totale', C.blue);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    styles: { fontSize: 9, cellPadding: 2.2, fontStyle: 'bold' },
    body: [
      ['TOTALE FATTURA DA RICEVERE',            eur(totFatturato * 1.22)],
      ['TOTALE ADDEBITI DA INSERIRE IN FATTURA', eur(totAddebitiConIva)],
      ['TOTALE COMPENSAZIONI',                   eur(totCompensazioni)],
    ],
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right' },
    },
    didParseCell: (h) => {
      if (h.row.index === 0) {
        h.cell.styles.fillColor = C.lightGreen;
        h.cell.styles.textColor = C.green;
      }
      if (h.row.index === 1) {
        h.cell.styles.fillColor = C.lightRed;
        h.cell.styles.textColor = C.red;
      }
      if (h.row.index === 2) {
        h.cell.styles.fillColor = C.lightBlue;
        h.cell.styles.textColor = C.blue;
      }
    },
  });
  y = lastY() + GAP;

  // ── Banda finale TOTALE DA BONIFICARE ──
  checkBreak(14);
  doc.setFillColor(...(nettoPos ? C.green : C.red));
  doc.rect(margin, y, contentW, 12, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTALE DA BONIFICARE', margin + 5, y + 8);
  doc.setFontSize(12);
  doc.text(eur(nettoBonificare), pageW - margin - 5, y + 8, { align: 'right' });
  doc.setTextColor(...C.dark);
  y += 13;

  // ════════════════════════════════════════════════════════════════
  // FOOTER su ogni pagina
  // ════════════════════════════════════════════════════════════════
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.setDrawColor(...C.lightGray);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 7, pageW - margin, pageH - 7);
    doc.text(
      `${formatMese(data.mese)} — ${data.padroncino.ragioneSociale}  |  Pagina ${i} di ${pages}  |  ${new Date().toLocaleString('it-IT')}`,
      pageW / 2, pageH - 3.5,
      { align: 'center' },
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SALVA
  // ════════════════════════════════════════════════════════════════
  const meseFile = formatMese(data.mese).replace(/\s+/g, '_');
  const ragSoc   = data.padroncino.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  doc.save(`Conteggio_${ragSoc}_${meseFile}.pdf`);
}
