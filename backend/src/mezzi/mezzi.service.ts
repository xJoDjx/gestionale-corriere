import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto } from './mezzi.dto';

@Injectable()
export class MezziService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Normalizza DTO ─────────────────────────────────
  private normalizeDto(dto: CreateMezzoDto): Record<string, any> {
    const { proprietario, nContratto, ...rest } = dto as any;
    const data: Record<string, any> = { ...rest };

    if (proprietario && !data.societaNoleggio) data.societaNoleggio = proprietario;
    if (nContratto && !data.riferimentoContratto) data.riferimentoContratto = nContratto;
    delete data.proprietario;
    delete data.nContratto;

    const dateFields = [
      'scadenzaAssicurazione', 'scadenzaRevisione', 'scadenzaBollo',
      'scadenzaTagliando', 'scadenzaTachigrafo', 'inizioNoleggio', 'fineNoleggio',
      'kmAttualiAl',
    ];
    for (const field of dateFields) {
      if (data[field] && typeof data[field] === 'string' && data[field].length === 10) {
        data[field] = new Date(data[field] + 'T00:00:00.000Z');
      }
    }

    return data;
  }

  // ─── LIST ────────────────────────────────────────────
  async findAll(query: QueryMezziDto) {
    const {
      search, stato, categoria, tipo, alimentazione,
      page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const where: any = { deletedAt: null };
    if (stato) where.stato = stato;
    if (categoria) where.categoria = categoria;
    if (tipo) where.tipo = tipo;
    if (alimentazione) where.alimentazione = alimentazione;
    if (search) {
      where.OR = [
        { targa: { contains: search, mode: 'insensitive' } },
        { marca: { contains: search, mode: 'insensitive' } },
        { modello: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.mezzo.findMany({
        where,
        include: {
          assegnazioni: {
            where: { deletedAt: null, dataFine: null },
            include: { padroncino: { select: { id: true, ragioneSociale: true } } },
            orderBy: { dataInizio: 'desc' },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mezzo.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── STATS ──────────────────────────────────────────
  async getStats() {
    const [totali, disponibili, assegnati, canoniRaw, scadenzeImminenti] = await Promise.all([
      this.prisma.mezzo.count({ where: { deletedAt: null } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'DISPONIBILE' } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'ASSEGNATO' } }),
      this.prisma.mezzo.findMany({
        where: { deletedAt: null, canoneNoleggio: { not: null } },
        select: { canoneNoleggio: true, rataNoleggio: true },
      }),
      this.prisma.mezzo.count({
        where: {
          deletedAt: null,
          OR: [
            { scadenzaAssicurazione: { lte: new Date(Date.now() + 30 * 86400000) } },
            { scadenzaRevisione: { lte: new Date(Date.now() + 30 * 86400000) } },
          ],
        },
      }),
    ]);

    const entrateNoleggio = canoniRaw.reduce((s, m) => s + Number(m.canoneNoleggio ?? 0), 0);
    const canoniNoleggio  = canoniRaw.reduce((s, m) => s + Number(m.rataNoleggio   ?? 0), 0);

    return {
      totali, disponibili, assegnati,
      entrateNoleggio,
      margine: entrateNoleggio - canoniNoleggio,
      scadenzeImminenti,
    };
  }

  // ─── SCADENZE ───────────────────────────────────────
  async getScadenze(giorni = 30) {
    const entro = new Date(Date.now() + giorni * 86400000);
    return this.prisma.mezzo.findMany({
      where: {
        deletedAt: null,
        OR: [
          { scadenzaAssicurazione: { lte: entro } },
          { scadenzaRevisione: { lte: entro } },
          { scadenzaBollo: { lte: entro } },
          { fineNoleggio: { lte: entro } },
        ],
      },
      include: {
        assegnazioni: {
          where: { deletedAt: null, dataFine: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          take: 1,
        },
      },
      orderBy: { scadenzaAssicurazione: 'asc' },
    });
  }

  // ─── DETAIL ─────────────────────────────────────────
  async findOne(id: string) {
    const mezzo = await this.prisma.mezzo.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioni: {
          where: { deletedAt: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        // tags, documenti, noteEntita rimossi: relazioni polimorfiche eliminate dallo schema
      },
    });
    if (!mezzo) throw new NotFoundException('Mezzo non trovato');
    return mezzo;
  }

  // ─── IMPORTA EXCEL ──────────────────────────────────
  async importaExcel(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    const risultati: { creati: number; saltati: number; errori: string[] } = {
      creati: 0,
      saltati: 0,
      errori: [],
    };

    // Fogli da importare e loro configurazione
    // NOTA colonne:
    //   col 3 = TIPO nel file ma è la MARCA del veicolo (IVECO, FORD, VW…)
    //   col 4 = MODELLO
    //   sheet0 col 24 = km attuali (intestazione = data snapshot, es. "km 10-2-2022")
    //   sheet1 col 16 = km attuali (intestazione = data snapshot, es. "23/01/2026")
    const FOGLI: Array<{
      nome: string;
      stato: string;
      tipoPossesso: string;
      colTarga: number;
      colMarca: number;
      colModello: number;
      colAlimentazione: number;
      colScadAssicurazione: number;
      colScadRevisione: number;
      colScadBollo: number | null;
      colProprietario: number;
      colInizioContratto: number;
      colFineContratto: number;
      colCanone: number;
      colRata: number;
      colKmLimite: number | null;
      colKmAttuali: number | null;
      colImmatric: number | null;
      colNote: number | null;
    }> = [
      {
        nome: 'PARCO VEICOLI MEDISUD SRL',
        stato: 'DISPONIBILE',
        tipoPossesso: 'PROPRIETA',
        colTarga: 2,
        colMarca: 3,      // "TIPO" nel file = MARCA (IVECO, FORD…)
        colModello: 4,
        colAlimentazione: 9,
        colScadAssicurazione: 10,
        colScadRevisione: 12,
        colScadBollo: 11,
        colProprietario: 15,
        colInizioContratto: 16,
        colFineContratto: 17,
        colCanone: 18,
        colRata: 22,
        colKmLimite: null,
        colKmAttuali: 24, // intestazione = data snapshot km
        colImmatric: 6,
        colNote: 23,
      },
      {
        nome: 'NOLEGGIO LUNGO TERMINE',
        stato: 'DISPONIBILE',
        tipoPossesso: 'NOLEGGIO',
        colTarga: 2,
        colMarca: 3,      // "TIPO" nel file = MARCA
        colModello: 4,
        colAlimentazione: 6,
        colScadAssicurazione: 7,
        colScadRevisione: 8,
        colScadBollo: null,
        colProprietario: 9,
        colInizioContratto: 10,
        colFineContratto: 11,
        colCanone: 12,
        colRata: 14,
        colKmLimite: 15,
        colKmAttuali: 16, // intestazione = data snapshot km (es. 23/01/2026)
        colImmatric: null,
        colNote: null,
      },
    ];

    for (const foglio of FOGLI) {
      const ws = wb.Sheets[foglio.nome];
      if (!ws) continue;

      // Leggi come array di array (raw), con date come oggetti
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: null,
        raw: false,
        dateNF: 'yyyy-mm-dd',
      });

      // Estrai la data di aggiornamento km dall'intestazione della colonna km
      let kmAttualiAl: Date | null = null;
      if (foglio.colKmAttuali !== null && rows[0]) {
        const headerKm = String(rows[0][foglio.colKmAttuali] ?? '').trim();
        // Prova vari formati: "km 10-2-2022", "23/01/2026", "2026-01-23"
        const itMatch = headerKm.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        const dmyShort = headerKm.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
        const isoMatch = headerKm.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (itMatch) {
          kmAttualiAl = new Date(`${itMatch[3]}-${itMatch[2].padStart(2,'0')}-${itMatch[1].padStart(2,'0')}T00:00:00.000Z`);
        } else if (dmyShort) {
          const y = parseInt(dmyShort[3]) + 2000;
          kmAttualiAl = new Date(`${y}-${dmyShort[2].padStart(2,'0')}-${dmyShort[1].padStart(2,'0')}T00:00:00.000Z`);
        } else if (isoMatch) {
          kmAttualiAl = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00.000Z`);
        }
        if (kmAttualiAl && isNaN(kmAttualiAl.getTime())) kmAttualiAl = null;
      }

      // Salta la riga header (riga 0) e righe vuote
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const targaRaw = row[foglio.colTarga];
        if (!targaRaw || String(targaRaw).trim() === '' || String(targaRaw).trim() === 'TARGA') continue;

        const targa = String(targaRaw).trim().toUpperCase().replace(/\s+/g, '');
        if (targa.length < 5) continue; // Salta righe che non sembrano targhe

        try {
          // Controlla se esiste già
          const exists = await this.prisma.mezzo.findFirst({
            where: { targa, deletedAt: null },
          });
          if (exists) {
            risultati.saltati++;
            continue;
          }

          // Marca: dalla colonna "TIPO" del file (che è la marca, es. IVECO, FORD…)
          const marca = String(row[foglio.colMarca] ?? '').trim() || 'N/D';
          // Modello: dalla colonna MODELLO
          const modello = String(row[foglio.colModello] ?? '').trim() || marca;

          // Mappa alimentazione
          const alimentazioneRaw = String(row[foglio.colAlimentazione] ?? '').trim().toUpperCase();
          const alimentazione = this.mapAlimentazione(alimentazioneRaw);

          // Date helper
          const parseDate = (val: any): Date | null => {
            if (!val) return null;
            if (val instanceof Date) return val;
            const s = String(val).trim();
            if (!s || s === 'null') return null;
            // Formato italiano dd/mm/yyyy
            const itMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (itMatch) return new Date(`${itMatch[3]}-${itMatch[2].padStart(2, '0')}-${itMatch[1].padStart(2, '0')}T00:00:00.000Z`);
            // Formato yyyy-mm-dd
            const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00.000Z`);
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
          };

          // Anno immatricolazione
          let annoImmatricolazione: number | null = null;
          if (foglio.colImmatric !== null) {
            const immatRaw = row[foglio.colImmatric];
            const immatDate = parseDate(immatRaw);
            if (immatDate) annoImmatricolazione = immatDate.getFullYear();
          }

          // Importo helper
          const parseNum = (val: any): number | null => {
            if (val === null || val === undefined || val === '') return null;
            const n = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, ''));
            return isNaN(n) ? null : n;
          };

          const societaNoleggio = row[foglio.colProprietario]
            ? String(row[foglio.colProprietario]).trim()
            : null;

          const roundOrNull = (v: number | null) => v !== null ? Math.round(v) : null;

          const data: any = {
            targa,
            marca,
            modello,
            alimentazione,
            stato: foglio.stato,
            tipoPossesso: foglio.tipoPossesso,
            societaNoleggio,
            inizioNoleggio: parseDate(row[foglio.colInizioContratto]),
            fineNoleggio: parseDate(row[foglio.colFineContratto]),
            canoneNoleggio: parseNum(row[foglio.colCanone]),
            rataNoleggio: parseNum(row[foglio.colRata]),
            scadenzaAssicurazione: parseDate(row[foglio.colScadAssicurazione]),
            scadenzaRevisione: parseDate(row[foglio.colScadRevisione]),
            scadenzaBollo: foglio.colScadBollo !== null ? parseDate(row[foglio.colScadBollo]) : null,
            kmLimite: foglio.colKmLimite !== null ? roundOrNull(parseNum(row[foglio.colKmLimite])) : null,
            kmAttuali: foglio.colKmAttuali !== null ? roundOrNull(parseNum(row[foglio.colKmAttuali])) : null,
            kmAttualiAl,
            annoImmatricolazione,
            note: foglio.colNote !== null && row[foglio.colNote] ? String(row[foglio.colNote]).trim() : null,
          };

          // Rimuovi null per non sovrascrivere default Prisma
          for (const key of Object.keys(data)) {
            if (data[key] === null) delete data[key];
          }

          await this.prisma.mezzo.create({ data });
          risultati.creati++;
        } catch (err: any) {
          risultati.errori.push(`Targa ${targa}: ${err.message}`);
        }
      }
    }

    return risultati;
  }

  private mapAlimentazione(raw: string): string {
    if (raw.includes('ELETTR')) return 'ELETTRICO';
    if (raw.includes('IBRIDO') || raw.includes('HYBRID')) return 'IBRIDO';
    if (raw.includes('MHEV') || raw.includes('MILD')) return 'GASOLIO_MHEV';
    if (raw.includes('BENZINA') || raw.includes('BENZ')) return 'BENZINA';
    if (raw.includes('METANO') || raw.includes('GNL') || raw.includes('GPL')) return 'METANO';
    if (raw === 'DIESEL') return 'DIESEL';
    return 'GASOLIO'; // default (copre anche 'GASOLIO' esplicito)
  }


  // ─── CREATE ─────────────────────────────────────────
  async create(dto: CreateMezzoDto, userId: string) {
    // ✅ FIX BUG 1: usare findFirst con deletedAt: null invece di findUnique
    // findUnique trovava anche i mezzi soft-deleted, impedendo il reinserimento
    const exists = await this.prisma.mezzo.findFirst({
      where: { targa: dto.targa, deletedAt: null },
    });
    if (exists) throw new ConflictException('Targa già esistente');

    const data = this.normalizeDto(dto);
    const mezzo = await this.prisma.mezzo.create({ data: data as any });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: mezzo.id,
      azione: 'CREATE', dataDopo: mezzo as any,
    });

    return mezzo;
  }

  // ─── UPDATE ─────────────────────────────────────────
  async update(id: string, dto: UpdateMezzoDto, userId: string) {
    const existing = await this.findOne(id);
    const data = this.normalizeDto(dto);

    const mezzo = await this.prisma.mezzo.update({ where: { id }, data: data as any });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: id,
      azione: 'UPDATE', dataPrima: existing as any, dataDopo: mezzo as any,
    });

    return mezzo;
  }

  // ─── SOFT DELETE ────────────────────────────────────
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);

    await this.prisma.mezzo.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: id,
      azione: 'DELETE', dataPrima: existing as any,
    });

    return { deleted: true };
  }

  // ─── ASSEGNAZIONI ───────────────────────────────────
  async createAssegnazione(mezzoId: string, dto: CreateAssegnazioneMezzoDto, userId: string) {
    await this.findOne(mezzoId);

    // Chiudi assegnazione attiva precedente
    const attiva = await this.prisma.assegnazioneMezzo.findFirst({
      where: { mezzoId, deletedAt: null, dataFine: null },
    });
    if (attiva) {
      await this.prisma.assegnazioneMezzo.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dto.dataInizio) },
      });
    }

    const assegnazione = await this.prisma.assegnazioneMezzo.create({
      data: {
        mezzoId,
        padroncinoId: dto.padroncinoId,
        dataInizio: new Date(dto.dataInizio),
        dataFine: dto.dataFine ? new Date(dto.dataFine) : null,
        note: dto.note,
      },
      include: {
        padroncino: { select: { id: true, ragioneSociale: true } },
        mezzo: { select: { targa: true } },
      },
    });

    // Aggiorna stato mezzo → ASSEGNATO
    await this.prisma.mezzo.update({ where: { id: mezzoId }, data: { stato: 'ASSEGNATO' } });

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazione.id,
      azione: 'ASSEGNA',
      dataDopo: {
        targa: assegnazione.mezzo.targa,
        ragioneSociale: assegnazione.padroncino.ragioneSociale,
        dataInizio: dto.dataInizio,
      } as any,
    });

    return assegnazione;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
      include: {
        mezzo: { select: { id: true, targa: true } },
        padroncino: { select: { ragioneSociale: true } },
      },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    await this.prisma.assegnazioneMezzo.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });

    // Controlla se ci sono altre assegnazioni attive
    const altreAttive = await this.prisma.assegnazioneMezzo.count({
      where: { mezzoId: ass.mezzo.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
    });
    if (altreAttive === 0) {
      await this.prisma.mezzo.update({ where: { id: ass.mezzo.id }, data: { stato: 'DISPONIBILE' } });
    }

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { targa: ass.mezzo.targa, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });

    return { closed: true };
  }
}
