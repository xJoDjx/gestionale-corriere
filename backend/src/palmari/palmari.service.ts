import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { resolveDataFineAssegnazione } from '../common/data-fine-assegnazione.util';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePalmareDto, UpdatePalmareDto, CreateAssegnazionePalmareDto } from './palmari.dto';

@Injectable()
export class PalmariService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query?: { search?: string; stato?: string; page?: number; limit?: number }) {
    const { search, stato, page = 1, limit = 50 } = query || {};

    const where: any = {
      deletedAt: null,
      ...(stato && stato !== 'TUTTI' && { stato }),
      ...(search && {
        OR: [
          { codice: { contains: search, mode: 'insensitive' } },
          { marca: { contains: search, mode: 'insensitive' } },
          { modello: { contains: search, mode: 'insensitive' } },
          { imei: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.palmare.findMany({
        where,
        include: {
          assegnazioni: {
            where: { deletedAt: null },
            include: { padroncino: { select: { id: true, ragioneSociale: true } } },
            orderBy: { dataInizio: 'desc' },
          },
          // tags e documenti rimossi: relazioni polimorfiche eliminate dallo schema
        },
        orderBy: { codice: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.palmare.count({ where }),
    ]);

    const mappedData = data.map((p) => ({
      ...p,
      assegnazioni: p.assegnazioni.map((a) => ({
        id: a.id,
        padroncinoId: a.padroncinoId,
        ragioneSociale: a.padroncino.ragioneSociale,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
    }));

    return { data: mappedData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getStats() {
    const [totali, disponibili, assegnati, guasti, rateAttive] = await Promise.all([
      this.prisma.palmare.count({ where: { deletedAt: null } }),
      this.prisma.palmare.count({ where: { deletedAt: null, stato: 'DISPONIBILE' } }),
      this.prisma.palmare.count({ where: { deletedAt: null, stato: 'ASSEGNATO' } }),
      this.prisma.palmare.count({ where: { deletedAt: null, stato: 'GUASTO' } }),
      this.prisma.palmare.aggregate({
        where: { deletedAt: null, stato: 'ASSEGNATO' },
        _sum: { tariffaMensile: true },
      }),
    ]);

    return {
      totali,
      disponibili,
      assegnati,
      guasti,
      // tariffaMensile contiene la tariffa GIORNALIERA: la portiamo a mese con i giorni del mese corrente
      entrateMensili: +(Number(rateAttive._sum.tariffaMensile ?? 0) *
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()).toFixed(2),
    };
  }

  async findOne(id: string) {
    const palmare = await this.prisma.palmare.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioni: {
          where: { deletedAt: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        // documenti e tags rimossi: relazioni polimorfiche eliminate dallo schema
      },
    });
    if (!palmare) throw new NotFoundException('Palmare non trovato');

    return {
      ...palmare,
      assegnazioni: palmare.assegnazioni.map((a) => ({
        id: a.id,
        padroncinoId: a.padroncinoId,
        ragioneSociale: a.padroncino.ragioneSociale,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
    };
  }

  // ─── IMPORTA EXCEL ──────────────────────────────────
  // Colonne (0-indexed): A=padroncino, B=modello, C=seriale/imei, D=codice, E=tariffa, F=dataAssegnazione
  async importaExcel(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const risultati: { creati: number; saltati: number; errori: string[] } = {
      creati: 0, saltati: 0, errori: [],
    };

    const parseNum = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const n = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, ''));
      return isNaN(n) ? null : n;
    };

    const parseDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      const s = String(val).trim();
      if (!s || s === 'null') return null;
      const itMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (itMatch) return new Date(`${itMatch[3]}-${itMatch[2].padStart(2, '0')}-${itMatch[1].padStart(2, '0')}T00:00:00.000Z`);
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00.000Z`);
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1, defval: null, raw: false, dateNF: 'yyyy-mm-dd',
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Col C (2) = Seriale → codice (chiave univoca)
        // Col D (3) = Codice Associato
        const codiceRaw = row[2]; // col C
        if (!codiceRaw || String(codiceRaw).trim() === '') continue;

        const codice = String(codiceRaw).trim().toUpperCase();

        try {
          const exists = await this.prisma.palmare.findFirst({
            where: { codice, deletedAt: null },
          });
          if (exists) { risultati.saltati++; continue; }

          const modello          = row[1] ? String(row[1]).trim() || null : null;
          const codiceAssociato  = row[3] ? String(row[3]).trim() || null : null; // col D
          const tariffaMensile   = parseNum(row[4]);
          const dataAssegnazione = parseDate(row[5]);
          const padroncinoRaw    = row[0] ? String(row[0]).trim() : null;

          const palmare = await this.prisma.palmare.create({
            data: {
              codice,
              ...(modello && { modello }),
              ...(codiceAssociato && { codiceAssociato }),
              ...(tariffaMensile !== null && { tariffaMensile }),
            },
          });
          risultati.creati++;

          if (padroncinoRaw) {
            try {
              const padroncino = await this.prisma.padroncino.findFirst({
                where: { ragioneSociale: { contains: padroncinoRaw, mode: 'insensitive' }, deletedAt: null },
              });
              if (padroncino) {
                // Se data mancante usa oggi
                const dataInizio = dataAssegnazione ?? new Date();
                await this.prisma.assegnazionePalmare.create({
                  data: { palmareId: palmare.id, padroncinoId: padroncino.id, dataInizio },
                });
                await this.prisma.palmare.update({
                  where: { id: palmare.id }, data: { stato: 'ASSEGNATO' },
                });
              } else {
                risultati.errori.push(`Codice ${codice}: padroncino "${padroncinoRaw}" non trovato`);
              }
            } catch (assErr: any) {
              risultati.errori.push(`Codice ${codice}: errore assegnazione - ${assErr.message}`);
            }
          }
        } catch (err: any) {
          risultati.errori.push(`Codice ${codice}: ${err.message}`);
        }
      }
    }

    return risultati;
  }

  async create(dto: CreatePalmareDto, userId: string) {
    const exists = await this.prisma.palmare.findUnique({ where: { codice: dto.codice } });
    if (exists) throw new ConflictException('Codice palmare già esistente');

    const palmare = await this.prisma.palmare.create({ data: dto as any });
    await this.audit.log({
      userId, entityType: 'palmare', entityId: palmare.id,
      azione: 'CREATE', dataDopo: palmare as any,
    });
    return palmare;
  }

  async update(id: string, dto: UpdatePalmareDto, userId: string) {
    const existing = await this.prisma.palmare.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Palmare non trovato');
    const palmare = await this.prisma.palmare.update({ where: { id }, data: dto as any });
    await this.audit.log({
      userId, entityType: 'palmare', entityId: id,
      azione: 'UPDATE', dataPrima: existing as any, dataDopo: palmare as any,
    });
    return palmare;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.palmare.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ userId, entityType: 'palmare', entityId: id, azione: 'DELETE' });
    return { deleted: true };
  }

  async createAssegnazione(palmareId: string, dto: CreateAssegnazionePalmareDto, userId: string) {
    const palmareInfo = await this.findOne(palmareId);

    // Chiudi assegnazione attiva
    const attiva = await this.prisma.assegnazionePalmare.findFirst({
      where: { palmareId, deletedAt: null, dataFine: null },
      include: { padroncino: { select: { ragioneSociale: true } } },
    });
    if (attiva) {
      await this.prisma.assegnazionePalmare.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dto.dataInizio) },
      });
      // Logga la chiusura implicita (riassegnazione), altrimenti sparisce dallo storico
      await this.audit.log({
        userId, entityType: 'assegnazione_palmare', entityId: attiva.id,
        azione: 'CHIUDI_ASSEGNAZIONE',
        dataDopo: { codicePalmare: palmareInfo.codice, ragioneSociale: attiva.padroncino?.ragioneSociale } as any,
      });
    }

    // Aggiorna stato palmare → ASSEGNATO
    await this.prisma.palmare.update({ where: { id: palmareId }, data: { stato: 'ASSEGNATO' } });

    const assegnazione = await this.prisma.assegnazionePalmare.create({
      data: {
        palmareId,
        padroncinoId: dto.padroncinoId,
        dataInizio: new Date(dto.dataInizio),
        dataFine: dto.dataFine ? new Date(dto.dataFine) : undefined,
      },
      include: { padroncino: { select: { ragioneSociale: true } } },
    });

    await this.audit.log({
      userId, entityType: 'assegnazione_palmare', entityId: assegnazione.id,
      azione: 'ASSEGNA',
      dataDopo: { codicePalmare: palmareInfo.codice, padroncinoId: dto.padroncinoId, ragioneSociale: assegnazione.padroncino.ragioneSociale } as any,
    });

    return {
      ...assegnazione,
      ragioneSociale: assegnazione.padroncino.ragioneSociale,
    };
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string, dataFineStr?: string) {
    const ass = await this.prisma.assegnazionePalmare.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
      include: {
        palmare: { select: { id: true, codice: true } },
        padroncino: { select: { ragioneSociale: true } },
      },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    const dataFine = resolveDataFineAssegnazione(dataFineStr, ass.dataInizio);

    await this.prisma.assegnazionePalmare.update({
      where: { id: assegnazioneId },
      data: { dataFine },
    });

    // Aggiorna stato palmare → DISPONIBILE (se nessuna altra assegnazione attiva)
    const altre = await this.prisma.assegnazionePalmare.count({
      where: { palmareId: ass.palmare.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
    });
    if (altre === 0) {
      await this.prisma.palmare.update({ where: { id: ass.palmare.id }, data: { stato: 'DISPONIBILE' } });
    }

    await this.audit.log({
      userId, entityType: 'assegnazione_palmare', entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { codicePalmare: ass.palmare.codice, ragioneSociale: ass.padroncino?.ragioneSociale, dataInizio: ass.dataInizio, dataFine } as any,
    });

    return { closed: true };
  }
}
