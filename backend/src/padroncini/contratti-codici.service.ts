import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { GeneraContrattoCodiciDto } from './padroncini.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ─── COMMITTENTE (noi) ───────────────────────────────────────────────────────
const COMMITTENTE = 'MEDITRANSPORT';

// ─── PATH AL TEMPLATE .docx (il file originale viene usato come base) ───────
// Il template deve essere presente in: <root>/templates/contratto_codici_template.docx
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'contratto_codici_template.docx');

// ─── HELPERS XML ─────────────────────────────────────────────────────────────

/** Escapa caratteri speciali XML */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FONT = 'Bookman Old Style';

/** Genera un <w:r> (run) con il testo dato, font Bookman Old Style come nel template originale. */
function run(text: string, opts?: { bold?: boolean }): string {
  const bold  = opts?.bold ? '<w:b/><w:bCs/>' : '';
  const space = text.startsWith(' ') || text.endsWith(' ') ? ' xml:space="preserve"' : '';
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/>${bold}</w:rPr><w:t${space}>${esc(text)}</w:t></w:r>`;
}

/** Paragrafo standard del contratto: spacing after=0 line=360 auto, indentazione 57/57. */
function para(runs: string, opts?: { align?: 'left' | 'center' | 'right' | 'both'; bold?: boolean }): string {
  const jc  = opts?.align ? `<w:jc w:val="${opts.align}"/>` : '';
  const rPr = opts?.bold ? `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:b/><w:bCs/>` : `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/>`;
  return `<w:p>
    <w:pPr>
      <w:spacing w:after="0" w:line="360" w:lineRule="auto"/>
      <w:ind w:left="57" w:right="57"/>
      ${jc}
      <w:rPr>${rPr}</w:rPr>
    </w:pPr>
    ${runs}
  </w:p>`;
}

function emptyLine(): string {
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:left="57" w:right="57"/></w:pPr></w:p>`;
}

/** Interruzione di riga (<w:br/>) dentro lo stesso paragrafo, stesso font del contratto. */
function runBreak(): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr><w:br/></w:r>`;
}

/** Formatta un importo "a corpo" (corrispettivo fisso giornaliero): intero se cifra tonda, altrimenti 2 decimali. */
function fmtFisso(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Formatta un importo "per consegna": sempre 2 decimali con il punto (stile del contratto originale). */
function fmtPerConsegna(n: number): string {
  return n.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIZIO
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ContrattiCodiciService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async generaContrattoCodici(
    padroncinoId: string,
    dto: GeneraContrattoCodiciDto,
    userId: string = 'system',
  ): Promise<{ buffer: Buffer; filename: string }> {

    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id: padroncinoId, deletedAt: null },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const assegnazioniWhere: any = {
      padroncinoId,
      deletedAt: null,
      dataFine: null,
      ...(dto.codiceAutistaIds?.length ? { codiceAutistaId: { in: dto.codiceAutistaIds } } : {}),
    };

    const assegnazioni = await this.prisma.assegnazioneCodiceAutista.findMany({
      where: assegnazioniWhere,
      include: { codiceAutista: true },
      orderBy: { dataInizio: 'asc' },
    });

    if (assegnazioni.length === 0) {
      throw new BadRequestException('Il padroncino non ha codici autista assegnati attivi');
    }

    const codici = assegnazioni.map((a) => a.codiceAutista);

    const buffer = await this.buildDoc({ padroncino, codici, dto });

    const ragSocFile = (padroncino.ragioneSociale as string)
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();

    const oggi = dto.dataContratto ? new Date(dto.dataContratto) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const dataFile = `${dd}-${mm}-${yyyy}`;

    const filename = `CONTRATTO APPALTO CODICI - ${ragSocFile} - DEL ${dataFile}.docx`;

    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId:   padroncinoId,
      azione:     'GENERA_CONTRATTO_CODICI',
      dataDopo: {
        filename,
        padroncino:    padroncino.ragioneSociale,
        dataContratto: dataFile,
        codici:        codici.map((c) => ({ id: c.id, codice: c.codice, zone: c.zone, target: c.target, bonus: c.bonus, malus: c.malus })),
      },
    });

    return { buffer, filename };
  }

  // ─────────────────────────────────────────────────────────────────────
  private async buildDoc({
    padroncino, codici, dto,
  }: {
    padroncino: any; codici: any[]; dto: GeneraContrattoCodiciDto;
  }): Promise<Buffer> {

    const oggi  = dto.dataContratto ? new Date(dto.dataContratto) : new Date();
    const dd    = String(oggi.getDate()).padStart(2, '0');
    const mm    = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy  = oggi.getFullYear();
    const dataB = `${dd}/${mm}/${yyyy}`;

    const ragSoc = (padroncino.ragioneSociale as string).toUpperCase();

    const paragraphs: string[] = [];

    // ── Titolo ─────────────────────────────────────────────────────────
    paragraphs.push(para(run('ALLEGATO NUMERO 2', { bold: true }), { align: 'center' }));
    paragraphs.push(emptyLine());
    paragraphs.push(para(
      run('CONTRATTO DI APPALTO DI SERVIZI DI TRASPORTO DI MERCI SU STRADA ', { bold: true }) +
      run(`DEL ${dataB} `, { bold: true }) +
      run('COMMITTENTE') +
      run(` ${COMMITTENTE} - `, { bold: true }) +
      run('APPALTATORE') +
      run(` ${ragSoc}`, { bold: true }),
      { align: 'center' },
    ));
    paragraphs.push(emptyLine());

    // ── Intestazione sezione ─────────────────────────────────────────
    paragraphs.push(para(run('CODICI E CORRISPETTIVO ', { bold: true }), { align: 'center' }));
    paragraphs.push(emptyLine());
    paragraphs.push(para(run(
      'Il corrispettivo viene determinato con tariffa giornaliera per i seguenti codici di uscita automezzo:'
    )));
    paragraphs.push(emptyLine());

    // ── Blocchi Codice / Zone / Tariffa ───────────────────────────────
    for (const c of codici) {
      paragraphs.push(para(run(`Codice ${c.codice}:`, { bold: true })));

      const zona = (c.zone && String(c.zone).trim()) || '—';
      paragraphs.push(para(run('Zone: ', { bold: true }) + run(zona)));

      const tariffaFissa  = c.tariffaFissa  != null ? Number(c.tariffaFissa)  : null;
      const tariffaRitiro = c.tariffaRitiro != null ? Number(c.tariffaRitiro) : null;
      const target        = c.target        != null ? Number(c.target)        : null;
      const bonus         = c.bonus         != null ? Number(c.bonus)         : null;
      const malus         = c.malus         != null ? Number(c.malus)         : null;

      const GLS_SHOP = '0.50 euro per ogni consegna effettuata presso GLS Shop / punto ritiro Prontopacco.';

      if (tariffaFissa != null) {
        // Sotto i 5€ è una tariffa "a consegna" (con maggiorazione fissa GLS Shop/Prontopacco,
        // ed eventuale tariffa ritiro a parte). Da 5€ in su è un corrispettivo fisso giornaliero,
        // eventualmente con target e bonus/malus.
        let testoTariffa: string;

        if (tariffaFissa < 5) {
          testoTariffa = `${fmtPerConsegna(tariffaFissa)} euro per ogni consegna Assegnata sul Borderò del Codice per Giornata lavorativa consegnata al destinatario, ${GLS_SHOP}`;
          if (tariffaRitiro != null) {
            testoTariffa += ` ${fmtPerConsegna(tariffaRitiro)} euro per ogni ritiro effettuato.`;
          }
        } else {
          const hasBonus = target != null && bonus != null;
          const hasMalus = target != null && malus != null;

          if (hasBonus && hasMalus) {
            testoTariffa =
              `Target ${target} consegne assegnate, corrispettivo fisso di ${fmtFisso(tariffaFissa)} euro imponibile giornaliero. ` +
              `Bonus ${fmtFisso(Math.abs(bonus!))} euro, oltre ${target} assegnazioni, ` +
              `Malus -${fmtFisso(Math.abs(malus!))} euro sotto le ${target} assegnazioni, ${GLS_SHOP}`;
          } else if (hasBonus) {
            testoTariffa =
              `Target ${target} consegne assegnate corrispettivo di ${fmtFisso(tariffaFissa)} euro imponibile, ` +
              `Bonus ${fmtFisso(Math.abs(bonus!))} euro oltre ${target} assegnazioni, ${GLS_SHOP}`;
          } else if (hasMalus) {
            testoTariffa =
              `Target ${target} consegne assegnate corrispettivo di ${fmtFisso(tariffaFissa)} euro imponibile, ` +
              `Malus -${fmtFisso(Math.abs(malus!))} euro sotto le ${target} assegnazioni, ${GLS_SHOP}`;
          } else if (target != null) {
            testoTariffa = `Target ${target} consegne assegnate, corrispettivo fisso di ${fmtFisso(tariffaFissa)} euro imponibile giornaliero.`;
          } else if (bonus != null) {
            // Fisso + bonus senza target: il bonus è un extra per ogni consegna assegnata.
            testoTariffa = `Corrispettivo fisso di ${fmtFisso(tariffaFissa)} euro imponibile giornaliero + ${fmtPerConsegna(Math.abs(bonus))}€ per consegna assegnata.`;
          } else {
            testoTariffa = `Corrispettivo fisso di ${fmtFisso(tariffaFissa)} euro imponibile giornaliero.`;
          }
        }

        paragraphs.push(para(
          run('Tariffa: ', { bold: true }) +
          run(testoTariffa) +
          runBreak() +
          run('Nella tariffa sono comprese la consegna di pedane sbancalabili.')
        ));
      }

      paragraphs.push(emptyLine());
    }

    // ── Firma ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('Il Committente                                                                        L’ ', { bold: true }) +
      run('Appaltatore', { bold: true })
    ));

    return this.buildFromTemplate(paragraphs.join('\n'));
  }

  /**
   * Legge il file template .docx, sostituisce il contenuto del body
   * mantenendo styles, ecc. Usa solo moduli nativi Node.js — nessuna dipendenza esterna.
   */
  private async buildFromTemplate(bodyContent: string): Promise<Buffer> {
    const templateBuffer = fs.readFileSync(TEMPLATE_PATH);

    const entries = this.parseZip(templateBuffer);

    const docEntry = entries.find(e => e.name === 'word/document.xml');
    if (!docEntry) throw new Error('Template non valido: manca word/document.xml');
    const originalDocXml = docEntry.data.toString('utf8');

    const sectPrMatch = originalDocXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    const sectPr = sectPrMatch ? sectPrMatch[0] : '';

    const nsMatch = originalDocXml.match(/<w:document[^>]*>/);
    const nsDecl  = nsMatch ? nsMatch[0] : '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';

    const newDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
${nsDecl}
  <w:body>
${bodyContent}
    ${sectPr}
  </w:body>
</w:document>`;

    const newDocBuf = Buffer.from(newDocXml, 'utf8');
    const updatedEntries = entries.map(e =>
      e.name === 'word/document.xml'
        ? { ...e, data: newDocBuf }
        : e
    );

    return this.buildZip(updatedEntries);
  }

  // ─────────────────────────────────────────────────────────────────────
  // ZIP UTILITIES (senza dipendenze esterne) — identiche a mezzi/contratti.service.ts
  // ─────────────────────────────────────────────────────────────────────

  private parseZip(buf: Buffer): Array<{ name: string; data: Buffer; compression: number; extra: Buffer }> {
    const entries: Array<{ name: string; data: Buffer; compression: number; extra: Buffer }> = [];

    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset < 0) throw new Error('ZIP EOCD non trovato nel template');

    const cdOffset   = buf.readUInt32LE(eocdOffset + 16);
    const numEntries = buf.readUInt16LE(eocdOffset + 8);

    let cdPos = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (buf.readUInt32LE(cdPos) !== 0x02014b50) break;
      const compression = buf.readUInt16LE(cdPos + 10);
      const compSize    = buf.readUInt32LE(cdPos + 20);
      const nameLen     = buf.readUInt16LE(cdPos + 28);
      const extraLen    = buf.readUInt16LE(cdPos + 30);
      const commentLen  = buf.readUInt16LE(cdPos + 32);
      const localOff    = buf.readUInt32LE(cdPos + 42);
      const name        = buf.slice(cdPos + 46, cdPos + 46 + nameLen).toString('utf8');

      const lnameLen  = buf.readUInt16LE(localOff + 26);
      const lextraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lnameLen + lextraLen;
      const compData  = buf.slice(dataStart, dataStart + compSize);

      let data: Buffer;
      if (compression === 0) {
        data = compData;
      } else if (compression === 8) {
        data = zlib.inflateRawSync(compData);
      } else {
        data = compData;
      }

      entries.push({ name, data, compression, extra: Buffer.alloc(0) });
      cdPos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  private buildZip(entries: Array<{ name: string; data: Buffer; compression: number; extra: Buffer }>): Buffer {
    const parts: Buffer[] = [];
    const centralDir: Buffer[] = [];
    let localOffset = 0;

    for (const entry of entries) {
      const nameBuf  = Buffer.from(entry.name, 'utf8');
      const extraBuf = Buffer.alloc(0);

      let compData: Buffer;
      let compression: number;
      if (entry.name.endsWith('.xml') || entry.name.endsWith('.rels')) {
        compData    = zlib.deflateRawSync(entry.data, { level: 6 });
        compression = 8;
      } else {
        compData    = entry.data;
        compression = 0;
      }

      const crc32    = this.crc32(entry.data);
      const now      = new Date();
      const dosTime  = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const dosDate  = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

      const localHeader = Buffer.alloc(30 + nameBuf.length + extraBuf.length);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(compression, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(crc32, 14);
      localHeader.writeUInt32LE(compData.length, 18);
      localHeader.writeUInt32LE(entry.data.length, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(extraBuf.length, 28);
      nameBuf.copy(localHeader, 30);

      parts.push(localHeader, compData);

      const cdEntry = Buffer.alloc(46 + nameBuf.length);
      cdEntry.writeUInt32LE(0x02014b50, 0);
      cdEntry.writeUInt16LE(20, 4);
      cdEntry.writeUInt16LE(20, 6);
      cdEntry.writeUInt16LE(0, 8);
      cdEntry.writeUInt16LE(compression, 10);
      cdEntry.writeUInt16LE(dosTime, 12);
      cdEntry.writeUInt16LE(dosDate, 14);
      cdEntry.writeUInt32LE(crc32, 16);
      cdEntry.writeUInt32LE(compData.length, 20);
      cdEntry.writeUInt32LE(entry.data.length, 24);
      cdEntry.writeUInt16LE(nameBuf.length, 28);
      cdEntry.writeUInt16LE(0, 30);
      cdEntry.writeUInt16LE(0, 32);
      cdEntry.writeUInt16LE(0, 34);
      cdEntry.writeUInt16LE(0, 36);
      cdEntry.writeUInt32LE(0, 38);
      cdEntry.writeUInt32LE(localOffset, 42);
      nameBuf.copy(cdEntry, 46);

      centralDir.push(cdEntry);
      localOffset += localHeader.length + compData.length;
    }

    const cdBuf = Buffer.concat(centralDir);
    const eocd  = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(localOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...parts, cdBuf, eocd]);
  }

  private crc32(buf: Buffer): number {
    const table = this.getCrc32Table();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  private _crc32Table: Uint32Array | null = null;
  private getCrc32Table(): Uint32Array {
    if (this._crc32Table) return this._crc32Table;
    this._crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      this._crc32Table[i] = c;
    }
    return this._crc32Table;
  }
}
