import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { GeneraContrattoMezziDto } from './padroncini.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ─── NOLEGGIATRICE (noi) — identica a mezzi/contratti.service.ts ────────────
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
  rappQualifica:       'Amministratore Unico',
  luogoContratto:      'Rende',
  indirizzoContratto:  'C. da Coda di Volpe, Zona industriale',
};

// ─── PATH AL TEMPLATE .docx ──────────────────────────────────────────────────
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'contratto_mezzi_bulk_template.docx');

// ─── HELPERS XML (identici a mezzi/contratti.service.ts) ────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function run(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; underline?: boolean; sz?: number },
): string {
  const sz = opts?.sz ?? 22;
  const bold       = opts?.bold      ? '<w:b/><w:bCs/>' : '';
  const italic     = opts?.italic    ? '<w:i/><w:iCs/>' : '';
  const underline  = opts?.underline ? '<w:u w:val="single"/>' : '';
  const space = text.startsWith(' ') || text.endsWith(' ') ? ' xml:space="preserve"' : '';
  return `<w:r>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Times New Roman" w:cs="Courier New"/>
        ${bold}${italic}${underline}
        <w:spacing w:val="-22"/>
        <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>
        <w:lang w:bidi="ar-SA"/>
      </w:rPr>
      <w:t${space}>${esc(text)}</w:t>
    </w:r>`;
}

function para(
  runs: string,
  opts?: { align?: 'left' | 'center' | 'right' | 'both'; indent?: number },
): string {
  const jc    = opts?.align  ?? 'both';
  const ind   = opts?.indent ? `<w:ind w:left="${opts.indent}"/>` : '';
  return `<w:p>
    <w:pPr>
      <w:pStyle w:val="Normal"/>
      <w:spacing w:lineRule="exact" w:line="560"/>
      ${ind}
      <w:jc w:val="${jc}"/>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Times New Roman" w:cs="Courier New"/>
        <w:spacing w:val="-22"/>
        <w:sz w:val="22"/><w:szCs w:val="22"/>
        <w:lang w:bidi="ar-SA"/>
      </w:rPr>
    </w:pPr>
    ${runs}
  </w:p>`;
}

function emptyLine(): string {
  return para(run(''));
}

/** Paragrafo elenco puntato (mezzo), stesso numId=1 del template originale. */
function mezzoBulletPara(runs: string): string {
  return `<w:p>
    <w:pPr>
      <w:pStyle w:val="Normal"/>
      <w:numPr>
        <w:ilvl w:val="0"/>
        <w:numId w:val="1"/>
      </w:numPr>
      <w:spacing w:lineRule="exact" w:line="560"/>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>
        <w:spacing w:val="-22"/>
        <w:sz w:val="22"/><w:szCs w:val="22"/>
      </w:rPr>
    </w:pPr>
    ${runs}
  </w:p>`;
}

/** Formatta un importo in stile italiano con 2 decimali (virgola), es. 760 -> "760,00". */
function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIZIO
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ContrattiMezziService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async generaContrattoMezzi(
    padroncinoId: string,
    dto: GeneraContrattoMezziDto,
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
      ...(dto.mezzoIds?.length ? { mezzoId: { in: dto.mezzoIds } } : {}),
    };

    const assegnazioni = await this.prisma.assegnazioneMezzo.findMany({
      where: assegnazioniWhere,
      include: {
        mezzo: {
          select: { id: true, targa: true, rataNoleggio: true },
        },
      },
      orderBy: { dataInizio: 'asc' },
    });

    if (assegnazioni.length === 0) {
      throw new BadRequestException('Il padroncino non ha mezzi assegnati attivi');
    }

    const mezzi = assegnazioni.map((a) => a.mezzo);

    const buffer = await this.buildDoc({ padroncino, mezzi, dto });

    const ragSocFile = (padroncino.ragioneSociale as string)
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();

    const oggi = dto.dataFirma ? new Date(dto.dataFirma) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const dataFile = `${dd}-${mm}-${yyyy}`;

    const filename = `CONTRATTO DI NOLEGGIO MEZZI - ${ragSocFile} - DEL ${dataFile}.docx`;

    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId:   padroncinoId,
      azione:     'GENERA_CONTRATTO_MEZZI',
      dataDopo: {
        filename,
        padroncino:    padroncino.ragioneSociale,
        dataContratto: dataFile,
        rappresentante: [dto.nomeRapp, dto.cognomeRapp].filter(Boolean).join(' ') || null,
        mezzi: mezzi.map((m: any) => ({
          id: m.id, targa: m.targa,
          rataNoleggio: m.rataNoleggio ? Number(m.rataNoleggio) : null,
        })),
      },
    });

    return { buffer, filename };
  }

  // ─────────────────────────────────────────────────────────────────────
  private async buildDoc({
    padroncino, mezzi, dto,
  }: {
    padroncino: any; mezzi: any[]; dto: GeneraContrattoMezziDto;
  }): Promise<Buffer> {

    // ── Date ──────────────────────────────────────────────────────────
    const oggi  = dto.dataFirma ? new Date(dto.dataFirma) : new Date();
    const MESI  = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                   'luglio','agosto','settembre','ottobre','novembre','dicembre'];
    const dataL = `${oggi.getDate()} del mese di ${MESI[oggi.getMonth()]} dell’anno ${oggi.getFullYear()}`;
    const dataB = oggi.toLocaleDateString('it-IT');

    // ── Noleggiante (padroncino) ───────────────────────────────────────
    const ragSoc    = (padroncino.ragioneSociale as string).toUpperCase();
    const indirizzo = (padroncino.indirizzo as string | null) ?? '';
    const piva      = padroncino.partitaIva as string;
    const nomeRapp  = [dto.nomeRapp?.trim(), dto.cognomeRapp?.trim()].filter(Boolean).join(' ');
    const qualifica = dto.qualificaRapp?.trim() || 'Amministratore Unico';

    // ── Economici ─────────────────────────────────────────────────────
    const eccKm  = dto.eccedenzaKm ?? 0.10;
    const eccStr = eccKm.toFixed(2).replace('.', ',');

    const paragraphs: string[] = [];

    // ── Titolo ─────────────────────────────────────────────────────────
    paragraphs.push(`<w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:lineRule="exact" w:line="560"/>
        <w:jc w:val="center"/>
        <w:rPr>
          <w:sz w:val="26"/><w:szCs w:val="26"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Times New Roman" w:cs="Courier New"/>
          <w:b/><w:bCs/>
          <w:sz w:val="26"/><w:szCs w:val="26"/>
        </w:rPr>
        <w:t>CONTRATTO DI NOLEGGIO DI BREVE TERMINE</w:t>
      </w:r>
    </w:p>`);

    // ── Intro data/luogo ─────────────────────────────────────────────
    paragraphs.push(para(
      run(`Il giorno ${dataL}, in ${NL.luogoContratto}, alla ${NL.indirizzoContratto}`)
    ));

    // ── TRA ─────────────────────────────────────────────────────────
    paragraphs.push(para(run('TRA', { bold: true }), { align: 'center' }));

    // ── Noleggiatrice ────────────────────────────────────────────────
    paragraphs.push(para(
      run('La Società ') +
      run(NL.ragioneSociale, { bold: true }) +
      run(`, con sede legale in ${NL.sedeLegale}, in ${NL.indirizzoSedeLegale}`) +
      run(` e con sede operativa in ${NL.sedeOperativa}; P. Iva.${NL.piva},`) +
      run(` iscritta nell’albo dei trasportatori per conto terzi al n° ${NL.alboNumero} `) +
      run('rappresentata', { underline: true }) +
      run(` dall’${NL.rappQualifica}, sig. ${NL.rappNome} ${NL.rappCognome}, nato a ${NL.natoDove} il ${NL.natoQuando},`)
    ));

    paragraphs.push(para(run('di seguito denominata “noleggiatrice”', { italic: true })));

    // ── E ───────────────────────────────────────────────────────────
    paragraphs.push(para(run('E', { bold: true }), { align: 'center' }));

    // ── Noleggiante ──────────────────────────────────────────────────
    let nolegRuns =
      run('La ditta ') +
      run(ragSoc, { bold: true }) +
      run(`. con sede legale in ${esc(indirizzo)}, P.IVA ${piva},`);
    if (nomeRapp) {
      nolegRuns +=
        run(' rappresentata dal Sig. ') +
        run(nomeRapp.toUpperCase(), { bold: true }) +
        run(`, nella sua qualità di ${qualifica}, di seguito denominata “noleggiante”`);
    } else {
      nolegRuns += run(' di seguito denominata “noleggiante”');
    }
    paragraphs.push(para(nolegRuns));

    // ── SI STIPULA ───────────────────────────────────────────────────
    paragraphs.push(para(run('SI STIPULA E CONVIENE QUANTO SEGUE', { bold: true }), { align: 'center' }));

    // ── Art.1 intro ──────────────────────────────────────────────────
    paragraphs.push(para(
      run('1. ') +
      run('La parte noleggiatrice concede, a far data dal giorno di sottoscrizione' +
          ' della presente scrittura, in noleggio alla parte noleggiante di')
    ));

    // ── Nr N automezzo di seguito elencato ────────────────────────────
    paragraphs.push(para(
      run('Nr ') +
      run(String(mezzi.length), { bold: true }) +
      run(' automezzo di seguito elencato:')
    ));

    // ── Riga vuota ───────────────────────────────────────────────────
    paragraphs.push(emptyLine());

    // ── Elenco mezzi (bullet numId=1): targa + rata + km inclusi ──────
    const KM_MENSILI_FISSI = 4000;
    for (const m of mezzi) {
      const rata    = m.rataNoleggio != null ? Number(m.rataNoleggio) : null;
      const rataStr = rata != null ? fmtEuro(rata) : '______';
      const kmStr   = KM_MENSILI_FISSI.toLocaleString('it-IT');

      paragraphs.push(mezzoBulletPara(
        run(m.targa as string, { bold: true }) +
        run(` Nolo ${rataStr} + Iva `) +
        run(`km ${kmStr} mese inclusi con eccedenza di `) +
        run(`${eccStr} cent`, { bold: true }) +
        run(' per ogni Km in più')
      ));
    }

    // ── Riga vuota ───────────────────────────────────────────────────
    paragraphs.push(emptyLine());

    // ── 1.1 Fatturazione ─────────────────────────────────────────────
    paragraphs.push(para(
      run('1.1 ', { bold: true }) +
      run('La fatturazione sarà posticipata al primo giorno di ogni mese.')
    ));

    // ── 1.2 Diligenza ────────────────────────────────────────────────
    paragraphs.push(para(
      run('1.2 ', { bold: true }) +
      run('Il Noleggiante deve servirsene con la dovuta diligenza e per lo' +
          ' svolgimento dell’attività di Trasporto garantendone la custodia.')
    ));

    // ── Inclusi ──────────────────────────────────────────────────────
    paragraphs.push(para(run(
      'Sono inclusi nel canone del noleggio la manutenzione ordinaria e' +
      ' straordinaria, soccorso traino, Bollo, assicurazione RCA con casco' +
      ' collisione, con franchigia per singolo sinistro passivo di euro 500,00.'
    )));

    // ── Esclusi ───────────────────────────────────────────────────────
    paragraphs.push(para(run(
      'Sono, invece, esclusi dal noleggio, la sostituzione degli pneumatici,' +
      ' il veicolo sostitutivo in caso di fermo riparazione, il carburante,' +
      ' Ad blue e additivi vari.'
    )));

    // ── Art.2 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('2.  ') +
      run('Tutte le spese derivanti dall’utilizzo del suddetto automezzo sono' +
          ' completamente a carico della parte noleggiante, la quale si impegna' +
          ' a mantenerla nello stesso stato di conservazione in cui l’ha ricevuta.')
    ));

    paragraphs.push(para(run(
      'Si intendono inoltre a carico della parte noleggiante anche tutte le' +
      ' spese ed ogni altro onere derivante dalla disponibilità e dall’uso' +
      ' del suddetto veicolo.'
    )));

    // ── Art.2.1 RCA ──────────────────────────────────────────────────
    paragraphs.push(para(
      run('2.1 ', { bold: true }) +
      run('Si precisa che il contratto di assicurazione R.C.A. continuerà ad' +
          ' essere intestato alla parte noleggiatrice e le tasse di possesso' +
          ' continueranno a riportare l’indicazione della parte noleggiatrice,' +
          ' in quanto proprietario ai sensi di legge dell’autovettura, ma il' +
          ' relativo onere e l’effettivo sostenimento finanziario sarà a totale' +
          ' carico della parte noleggiante; per questo faranno fede i documenti' +
          ' quietanzati che la parte rilascerà a dimostrazione della certezza,' +
          ' dell’effettività e dell’inerenza della spesa;')
    ));

    // ── Art.3 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('3. ', { bold: true }) +
      run('Il noleggio di che trattasi è da intendersi a “freddo” nel senso' +
          ' che esso è caratterizzato dalla predisposizione da parte della ditta' +
          ' noleggiante a favore della ditta noleggiatrice, solo dell’automezzo' +
          ' sopra specificato, corredato da quanto occorre per il perfetto funzionamento.')
    ));

    // ── Art.4 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('4. ', { bold: true }) +
      run('La ditta noleggiante deve curare che il mezzo sia idoneo ad eseguire' +
          ' le prestazioni per i quali è stato noleggiato.')
    ));

    paragraphs.push(para(run(
      'Codesta rimane responsabile di quei difetti che il mezzo o i mezzi' +
      ' d’opera potrebbero presentare in sede di lavoro.'
    )));

    paragraphs.push(para(run(
      'Pertanto, qualsiasi onere connesso al normale funzionamento del mezzo' +
      ' noleggiato pertiene al noleggiante. Di conseguenza si dà il permesso' +
      ' alla ditta noleggiante o a suoi rappresentanti o dipendenti il permesso' +
      ' di accesso in sede in qualsiasi momento per il controllo, la verifica' +
      ' e l’eventuale manutenzione straordinaria dei mezzi noleggiati.'
    )));

    // ── Art.5 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('5. ', { bold: true }) +
      run('Per il patto espresso tra le parti, la ditta noleggiante non potrà' +
          ' cedere ad alcuni il presente contratto e la ditta noleggiatrice si' +
          ' impegna a non costituire sub - noleggio del mezzo noleggiato.')
    ));

    // ── Art.6 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('6. ', { bold: true }) +
      run('La durata del contratto è temporanea con validità di 30 giorni.')
    ));

    // ── Art.7 ────────────────────────────────────────────────────────
    paragraphs.push(para(
      run('7. ', { bold: true }) +
      run('Per quanto non espressamente previsto nel presente contratto valgono,' +
          ' in quanto applicabili, le norme del Codice civile.')
    ));

    // ── Righe vuote ────────────────────────────────────────────────
    paragraphs.push(emptyLine());
    paragraphs.push(emptyLine());
    paragraphs.push(emptyLine());

    // ── Accettazione artt. ────────────────────────────────────────────
    paragraphs.push(para(run(
      'Le parti accettano e sottoscrivono gli artt. del presente contratto:'
    )));

    paragraphs.push(para(run('1, 2, 3, 4, 5, 6, 7.', { underline: true })));

    paragraphs.push(para(run('Tutto ciò, Letto confermato e sottoscritto.', { underline: true })));

    paragraphs.push(emptyLine());

    // ── Luogo e data ─────────────────────────────────────────────────
    paragraphs.push(para(run(`Luogo: ${NL.luogoContratto}, data ${dataB}`)));

    paragraphs.push(emptyLine());

    // ── Tabella firma: 2 colonne ───────────────────────────────────────
    const firmaTable = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="7308" w:type="dxa"/>
        <w:jc w:val="start"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="0" w:type="dxa"/>
          <w:start w:w="70" w:type="dxa"/>
          <w:bottom w:w="0" w:type="dxa"/>
          <w:end w:w="70" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3654"/>
        <w:gridCol w:w="3654"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr>
          <w:trHeight w:val="938" w:hRule="atLeast"/>
        </w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3654" w:type="dxa"/>
            <w:tcBorders>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            </w:tcBorders>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Normal"/>
              <w:spacing w:lineRule="exact" w:line="560"/>
              <w:jc w:val="center"/>
            </w:pPr>
            ${run('  Società Noleggiatrice', { sz: 22 })}
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3654" w:type="dxa"/>
            <w:tcBorders>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            </w:tcBorders>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Normal"/>
              <w:spacing w:lineRule="exact" w:line="560"/>
              <w:jc w:val="center"/>
            </w:pPr>
            ${run('Società Noleggiante  ', { sz: 22 })}
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>`;

    // ── Righe vuote finali ─────────────────────────────────────────────
    const emptySmall = `<w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:lineRule="exact" w:line="360"/>
        <w:rPr>
          <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>
          <w:spacing w:val="-22"/>
          <w:sz w:val="22"/><w:szCs w:val="22"/>
        </w:rPr>
      </w:pPr>
      ${run('')}
    </w:p>`;

    const finalEmpties = Array(14).fill(emptySmall).join('\n');

    return this.buildFromTemplate(
      paragraphs.join('\n') + '\n' + firmaTable + '\n' + finalEmpties
    );
  }

  /**
   * Legge il file template .docx, sostituisce il contenuto del body
   * mantenendo header, styles, numbering, ecc. Usa solo moduli nativi Node.js.
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
  // ZIP UTILITIES (senza dipendenze esterne) — identiche alle altre service
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
