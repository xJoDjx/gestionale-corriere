// src/features/conteggi/generaPdfDistribuzione.ts
// PDF semplice della tab "Fatturato Distribuzione": elenco voci + totali finali.
import { jsPDF } from 'jspdf';

const eur = (n: number): string =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';

function formatMese(m: string): string {
  const [y, mo] = m.split('-');
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${mesi[parseInt(mo, 10) - 1]} ${y}`;
}

export interface PdfDistribuzioneInput {
  padroncino: { ragioneSociale: string };
  mese: string;
  righe: Array<{ descrizione: string; valore: number | null; nota?: string }>;
}

export function generaPdfDistribuzione(d: PdfDistribuzioneInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 20;
  const marginR = 20;
  const colValueX = pageW - marginR; // x destro per gli importi (allineamento right)

  // ─── Intestazione minima ────────────────────────────────────
  let y = 22;
  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text(d.padroncino.ragioneSociale.toUpperCase(), marginL, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(formatMese(d.mese), colValueX, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(180);
  doc.line(marginL, y, colValueX, y);
  y += 8;

  // Calcolo totali ─────────────────────────────────────────────
  const righeValide = d.righe.filter((r) => r.valore != null && !isNaN(Number(r.valore)));
  const totImponibile = righeValide.reduce((s, r) => s + Number(r.valore), 0);
  const iva = totImponibile * 0.22;
  const totFattura = totImponibile + iva;

  // Prima riga: la presumiamo essere il "Fatturato Distribuzione".
  // Mostriamo "TOTALE IMPONIBILE" come label della prima riga, poi la nota
  // (es. "di cui consegne Shop 1.321,50€") va su una riga sotto.
  doc.setFont('helvetica', 'normal').setFontSize(11);
  const lineH = 6.2;

  const writeRiga = (label: string, valore: number | null, opts?: { bold?: boolean }) => {
    if (opts?.bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    doc.text(label, marginL, y);
    if (valore != null) doc.text(eur(valore), colValueX, y, { align: 'right' });
    y += lineH;
  };

  if (righeValide.length === 0) {
    doc.setFont('helvetica', 'italic').setFontSize(10);
    doc.text('Nessuna voce.', marginL, y);
    y += lineH;
  } else {
    // Prima riga = Fatturato Distribuzione → mostriamo "TOTALE IMPONIBILE"
    const prima = righeValide[0];
    writeRiga('TOTALE IMPONIBILE', Number(prima.valore));
    if (prima.nota && prima.nota.trim()) {
      // Nota della prima voce → riga sotto, indentata leggermente.
      // Es. nota "Di Cui consegne Shop 1321.50€" → "di cui consegne Shop  1.321,50€"
      // Proviamo a estrarre un importo dalla nota (numero con , o .) per allinearlo a destra.
      const notaRaw = prima.nota.trim();
      const matchImporto = notaRaw.match(/(-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?)\s*€?$/);
      doc.setFont('helvetica', 'normal').setFontSize(11);
      if (matchImporto) {
        const numStr = matchImporto[1].replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
        const num = parseFloat(numStr);
        const labelNota = notaRaw.slice(0, matchImporto.index).trim().replace(/[,–—-]+$/, '').trim();
        const labelFinale = labelNota.length > 0 ? labelNota : 'di cui';
        doc.text(labelFinale.replace(/\bdi cui\b/i, 'di cui'), marginL, y);
        if (!isNaN(num)) doc.text(eur(num), colValueX, y, { align: 'right' });
      } else {
        doc.text(notaRaw, marginL, y);
      }
      y += lineH;
    }

    y += 3; // gap visivo

    // Tutte le altre righe
    for (let i = 1; i < righeValide.length; i++) {
      const r = righeValide[i];
      writeRiga(r.descrizione || '', Number(r.valore));
    }
  }

  // ─── Totali finali ──────────────────────────────────────────
  y += 6;
  doc.setDrawColor(180);
  doc.line(marginL, y, colValueX, y);
  y += 7;

  writeRiga('TOTALE IMPONIBILE', totImponibile);
  writeRiga('IVA', iva);
  y += 2;
  doc.setDrawColor(120);
  doc.line(marginL, y, colValueX, y);
  y += 7;
  doc.setFontSize(12);
  writeRiga('TOTALE FATTURA', totFattura, { bold: true });

  // ─── Salva ──────────────────────────────────────────────────
  const fname = `Distribuzione_${d.padroncino.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_')}_${d.mese}.pdf`;
  doc.save(fname);
}
