import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { GeneraContrattoPalmareDto } from './padroncini.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ─── NOLEGGIATRICE (noi) ────────────────────────────────────────────────────
// Stessi dati societari usati nel contratto di noleggio mezzi (backend/src/mezzi/contratti.service.ts)
const NL = {
  ragioneSociale:      'MEDITRANSPORT SUD SRL',
  sedeLegale:          'Milano (MI)',
  indirizzoSedeLegale: 'via Santa Tecla,3',
  sedeOperativa:       'via Gino Bartali, zona industriale',
  piva:                '03227430786',
  alboNumero:          'MI/888164/E',
  rappNome:            'Semprevivo',
  rappCognome:         'Salvatore',
  natoDove:            'Casoria (NA)',
  natoQuando:          '04/11/1959',
  luogoContratto:      'Rende',
};

// ─── PATH AL TEMPLATE .docx (il file originale viene usato come base) ───────
// Il template deve essere presente in: <root>/templates/contratto_palmare_template.docx
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'contratto_palmare_template.docx');

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

/** Genera un <w:r> (run) con il testo dato e gli stili specificati (font di default del documento). */
function run(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; underline?: boolean; sz?: number },
): string {
  const bold      = opts?.bold      ? '<w:b/><w:bCs/>' : '';
  const italic    = opts?.italic    ? '<w:i/><w:iCs/>' : '';
  const underline = opts?.underline ? '<w:u w:val="single"/>' : '';
  const szTag     = opts?.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : '';
  const space = text.startsWith(' ') || text.endsWith(' ') ? ' xml:space="preserve"' : '';
  const rPr = bold || italic || underline || szTag
    ? `<w:rPr>${bold}${italic}${underline}${szTag}</w:rPr>`
    : '';
  return `<w:r>${rPr}<w:t${space}>${esc(text)}</w:t></w:r>`;
}

/** Paragrafo standard (stile Normal, nessuna spaziatura speciale). */
function para(runs: string, opts?: { align?: 'left' | 'center' | 'right' | 'both'; bold?: boolean }): string {
  const jc = opts?.align ? `<w:jc w:val="${opts.align}"/>` : '';
  const rPr = opts?.bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
  const pPr = jc || rPr ? `<w:pPr>${jc}${rPr}</w:pPr>` : '';
  return `<w:p>${pPr}${runs}</w:p>`;
}

function emptyLine(): string {
  return `<w:p/>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIZIO
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ContrattiPalmareService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async generaContrattoPalmare(
    padroncinoId: string,
    dto: GeneraContrattoPalmareDto,
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
      ...(dto.palmareIds?.length ? { palmareId: { in: dto.palmareIds } } : {}),
    };

    const assegnazioni = await this.prisma.assegnazionePalmare.findMany({
      where: assegnazioniWhere,
      include: { palmare: true },
      orderBy: { dataInizio: 'asc' },
    });

    if (assegnazioni.length === 0) {
      throw new BadRequestException('Il padroncino non ha palmari assegnati attivi');
    }

    const palmari = assegnazioni.map((a) => a.palmare);

    const buffer = await this.buildDoc({ padroncino, palmari, dto });

    // Ragione sociale ripulita (max 30 char, no caratteri speciali)
    const ragSocFile = (padroncino.ragioneSociale as string)
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();

    // Data nel formato DD-MM-YYYY
    const oggi = dto.dataFirma ? new Date(dto.dataFirma) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const dataFile = `${dd}-${mm}-${yyyy}`;

    const filename = `CONTRATTO NOLEGGIO PALMARE - ${ragSocFile} - DEL ${dataFile}.docx`;

    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId:   padroncinoId,
      azione:     'GENERA_CONTRATTO_PALMARE',
      dataDopo: {
        filename,
        padroncino:     padroncino.ragioneSociale,
        dataContratto:  dataFile,
        rappresentante: [dto.nomeRapp, dto.cognomeRapp].filter(Boolean).join(' ') || null,
        palmari:        palmari.map((p) => ({ id: p.id, codice: p.codice, codiceAssociato: p.codiceAssociato })),
      },
    });

    return { buffer, filename };
  }

  // ─────────────────────────────────────────────────────────────────────
  private async buildDoc({
    padroncino, palmari, dto,
  }: {
    padroncino: any; palmari: any[]; dto: GeneraContrattoPalmareDto;
  }): Promise<Buffer> {

    const oggi  = dto.dataFirma ? new Date(dto.dataFirma) : new Date();
    const dataB = oggi.toLocaleDateString('it-IT');

    const ragSoc    = (padroncino.ragioneSociale as string).toUpperCase();
    const indirizzo = (padroncino.indirizzo as string | null) ?? '';
    const piva      = padroncino.partitaIva as string;
    const nomeRapp  = [dto.nomeRapp?.trim(), dto.cognomeRapp?.trim()].filter(Boolean).join(' ');
    const qualifica = dto.qualificaRapp?.trim() || 'Amministratore Unico';

    const paragraphs: string[] = [];

    // ── Titolo ─────────────────────────────────────────────────────────
    paragraphs.push(para(run('CONTRATTO DI NOLEGGIO PALMARE', { bold: true, sz: 28 }), { align: 'center' }));

    // ── Noleggiatrice ────────────────────────────────────────────────
    paragraphs.push(para(
      run('La Società ') +
      run(NL.ragioneSociale, { bold: true }) +
      run(`, con sede legale in ${NL.sedeLegale}, in ${NL.indirizzoSedeLegale} e con sede operativa in ${NL.sedeOperativa}; `) +
      run(`P. Iva.${NL.piva}`, { bold: true }) +
      run(`, iscritta nell’albo dei trasportatori per conto terzi al n° ${NL.alboNumero} rappresentata dall’Amministratore Unico, sig. ${NL.rappNome} ${NL.rappCognome}, nato a ${NL.natoDove} il ${NL.natoQuando}, di seguito denominata “noleggiatrice”`)
    ));

    // ── E ───────────────────────────────────────────────────────────
    paragraphs.push(para(run('E', { bold: true }), { align: 'center' }));

    // ── Noleggiante (padroncino) ──────────────────────────────────────
    let nolegRuns =
      run('La società ') +
      run(ragSoc, { bold: true }) +
      run(' con sede legale in ') +
      run(esc(indirizzo)) +
      run(', ') +
      run('P.IVA ', { bold: true }) +
      run(piva);
    if (nomeRapp) {
      nolegRuns +=
        run(', rappresentata dal Sig. ') +
        run(nomeRapp.toUpperCase(), { bold: true }) +
        run(`, nella sua qualità di ${qualifica}, di seguito denominata “noleggiante”`);
    } else {
      nolegRuns += run(', di seguito denominata “noleggiante”');
    }
    paragraphs.push(para(nolegRuns));

    // ── SI STIPULA ───────────────────────────────────────────────────
    paragraphs.push(para(run('SI STIPULA E CONVIENE QUANTO SEGUE', { bold: true }), { align: 'center' }));

    // ── Art. 1 intro ─────────────────────────────────────────────────
    paragraphs.push(para(run(
      'La parte noleggiatrice concede, in quanto licenziataria del marchio General Logistics Systems, ' +
      'a far data dal giorno di sottoscrizione della presente scrittura, in noleggio alla parte noleggiante di'
    )));

    paragraphs.push(emptyLine());

    // ── Logo (immagine incorporata nel template, rId6 → word/media/image1.jpg) ──
    paragraphs.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="5234774" cy="828000"/>
        <wp:effectExtent l="0" t="0" r="4445" b="0"/>
        <wp:docPr id="9" name="Immagine 9"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="9" name="Immagine 9"/>
                <pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>
              </pic:nvPicPr>
              <pic:blipFill rotWithShape="1">
                <a:blip r:embed="rId6"/>
                <a:srcRect l="-1" t="1087" r="11966" b="-2678"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr bwMode="auto">
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="5318072" cy="841176"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:noFill/>
                <a:ln><a:noFill/></a:ln>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r></w:p>`);

    paragraphs.push(emptyLine());

    // ── Lista palmari noleggiati ──────────────────────────────────────
    paragraphs.push(para(run('LISTA PALMARI NOLEGGIATI', { bold: true }), { align: 'center' }));

    const headerRow = `<w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="4843" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run('NUMERO SERIALE', { bold: true, sz: 20 })}</w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="4843" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run('NUMERO SERIALE', { bold: true, sz: 20 })}</w:p>
      </w:tc>
    </w:tr>`;

    // Elenco dei soli numeri seriale (nessun numero assistenza), suddiviso su due colonne
    // per compattare la lista su meno righe.
    const seriali = palmari.map((p) => String(p.codice || p.imei || '—'));
    const metà = Math.ceil(seriali.length / 2);
    const colSx = seriali.slice(0, metà);
    const colDx = seriali.slice(metà);

    const dataRows = colSx.map((serialeSx, i) => {
      const serialeDx = colDx[i];
      return `<w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4843" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p>${run(serialeSx)}</w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4843" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p>${serialeDx ? run(serialeDx) : ''}</w:p>
        </w:tc>
      </w:tr>`;
    }).join('\n');

    const palmariTable = `<w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="Tabellasemplice-1"/>
        <w:tblW w:w="9686" w:type="dxa"/>
        <w:tblLook w:val="0480" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4843"/>
        <w:gridCol w:w="4843"/>
      </w:tblGrid>
      ${headerRow}
      ${dataRows}
    </w:tbl>`;
    paragraphs.push(palmariTable);

    paragraphs.push(emptyLine());

    // ── Termini di fornitura ───────────────────────────────────────────
    paragraphs.push(para(run('TERMINI DI FORNITURA PER PALMARE:', { bold: true, sz: 28 }), { align: 'center' }));

    paragraphs.push(para(
      run('1) ', { bold: true }) +
      run(
        'In caso di smarrimento/furto di Palmari, la Meditransport Sud SRL provvederà ad addebitare alla ditta ' +
        'noleggiante l’importo del palmare; che varia in base all’età dello stesso da un massimo di €1300 a un minimo di €200'
      )
    ));

    paragraphs.push(para(
      run('2) ', { bold: true }) +
      run(
        'Per ogni Palmare reso per fine noleggio, Meditransport Sud SRL addebiterà alla ditta noleggiante il costo ' +
        'di gestione per chiusura pratica, oggi pari a euro 12,50 + IVA'
      )
    ));

    paragraphs.push(para(run(
      'L’addebito avverrà mediante emissione di regolare fattura. Tutti i palmari restituiti per fine noleggio devono ' +
      'essere completi di Kit Auto, Micro SDHC Card originale, Batteria, TouchPen, laccio e SIM Card. In caso di mancanza, ' +
      'di uno o più accessori, gli stessi verranno addebitati alla ditta noleggiante;'
    )));

    paragraphs.push(para(
      run('3) ', { bold: true }) +
      run(
        'Per ogni Palmare ritrovato a seguito di smarrimento/furto, Meditransport Sud SRL addebiterà alla ditta ' +
        'noleggiante il costo di gestione per riapertura pratica, oggi pari a euro 20,00 +IVA. L’addebito avverrà mediante ' +
        'emissione di regolare fattura;'
      )
    ));

    paragraphs.push(para(
      run('4) ', { bold: true }) +
      run(
        'In fase di riparazione, qualunque danno risultasse irreparabile o causato da uso improprio, Meditransport Sud ' +
        'SRL provvederà a conteggiare il danno caso per caso e ad addebitare il costo di riparazione alla ditta noleggiante;'
      )
    ));

    paragraphs.push(para(
      run('5) ', { bold: true }) +
      run(
        'Ogni Palmare guasto deve essere inviato in riparazione all’Ufficio SPT completo di Batteria, Micro SDHC Card, ' +
        'Laccio, Pennino e SIM e caricatore. Per ogni accessorio mancante, Meditransport Sud SRL provvederà all’addebito ' +
        'd’Ufficio alla ditta noleggiante della parte mancante prima dell’invio dello stesso.'
      )
    ));

    paragraphs.push(emptyLine());

    // ── Luogo e data ─────────────────────────────────────────────────
    paragraphs.push(para(
      run('Luogo: ', { bold: true }) +
      run(`${NL.luogoContratto}, `) +
      run('data', { bold: true }) +
      run(`: ${dataB}`)
    ));

    paragraphs.push(emptyLine());

    // ── Firma ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('Noleggiatrice', { bold: true }) +
      run('                                                                                                                                   ') +
      run('Noleggiante', { bold: true })
    ));

    return this.buildFromTemplate(paragraphs.join('\n'));
  }

  /**
   * Legge il file template .docx, sostituisce il contenuto del body
   * mantenendo styles, numbering, immagini, ecc.
   * Usa solo moduli nativi Node.js — nessuna dipendenza esterna.
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
