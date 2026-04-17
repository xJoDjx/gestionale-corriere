import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateCodiceAutistaDto {
  codice: string;
  nome?: string;
  cognome?: string;
  note?: string;
  tariffaFissa?: number;
  tariffaRitiro?: number;
  target?: number;
  bonusMalus?: string;
  zone?: string;
}

export interface UpdateCodiceAutistaDto {
  nome?: string;
  cognome?: string;
  note?: string;
  tariffaFissa?: number;
  tariffaRitiro?: number;
  target?: number;
  bonusMalus?: string;
  zone?: string;
  attivo?: boolean;
}

@Injectable()
export class CodiciAutistaService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query?: { search?: string; page?: number; limit?: number }) {
    const { search, page = 1, limit = 100 } = query || {};

    const where: any = {
      deletedAt: null,
      ...(search && {
        OR: [
          { codice: { contains: search, mode: 'insensitive' } },
          { nome: { contains: search, mode: 'insensitive' } },
          { cognome: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.codiceAutista.findMany({
        where,
        include: {
          assegnazioni: {
            where: { deletedAt: null },
            include: {
              padroncino: { select: { id: true, ragioneSociale: true } },
            },
            orderBy: { dataInizio: 'desc' },
          },
        },
        orderBy: { codice: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.codiceAutista.count({ where }),
    ]);

    // Mappa assegnazioni con ragioneSociale flat
    const mappedData = data.map((c) => ({
      ...c,
      assegnazioni: c.assegnazioni.map((a) => ({
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
    const now = new Date();

    const [totali, assegnatiCount, attivi, tariffe] = await Promise.all([
      this.prisma.codiceAutista.count({ where: { deletedAt: null } }),
      this.prisma.assegnazioneCodiceAutista.count({
        where: { deletedAt: null, dataFine: null },
      }),
      this.prisma.codiceAutista.count({ where: { deletedAt: null, attivo: true } }),
      this.prisma.codiceAutista.aggregate({
        where: { deletedAt: null },
        _avg: {
          tariffaFissa: true,
          tariffaRitiro: true,
        },
      }),
    ]);

    return {
      totali,
      assegnati: assegnatiCount,
      disponibili: attivi - assegnatiCount > 0 ? attivi - assegnatiCount : 0,
      tariffaFissaMedia: Number(tariffe._avg.tariffaFissa ?? 0),
      tariffaRitiroMedia: Number(tariffe._avg.tariffaRitiro ?? 0),
    };
  }

  async findOne(id: string) {
    const ca = await this.prisma.codiceAutista.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioni: {
          where: { deletedAt: null },
          include: {
            padroncino: { select: { id: true, ragioneSociale: true } },
          },
          orderBy: { dataInizio: 'desc' },
        },
        acconti: { orderBy: { data: 'desc' } },
      },
    });
    if (!ca) throw new NotFoundException('Codice autista non trovato');
    return {
      ...ca,
      assegnazioni: ca.assegnazioni.map((a) => ({
        id: a.id,
        padroncinoId: a.padroncinoId,
        ragioneSociale: a.padroncino.ragioneSociale,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
    };
  }

  // ─── IMPORTA EXCEL ──────────────────────────────────
  // Colonne (0-indexed): A=padroncino, B=dataAssegnazione, C=codice, D=tariffaFissa,
  //                      E=target, F=bonusMalus(skip), G=tariffaRitiro, H=note, I=zone(skip)
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

        const codiceRaw = row[2]; // col C
        if (!codiceRaw || String(codiceRaw).trim() === '') continue;

        const codice = String(codiceRaw).trim().toUpperCase();

        try {
          const exists = await this.prisma.codiceAutista.findFirst({
            where: { codice, deletedAt: null },
          });
          if (exists) { risultati.saltati++; continue; }

          const padroncinoRaw   = row[0] ? String(row[0]).trim() : null;
          const dataAssegnazione = parseDate(row[1]);
          const tariffaFissa    = parseNum(row[3]);
          const target          = row[4] !== null && row[4] !== undefined && row[4] !== '' ? parseInt(String(row[4])) : null;
          const bonusMalus      = row[5] ? String(row[5]).trim() || null : null; // col F (testo)
          const tariffaRitiro   = parseNum(row[6]);
          const note            = row[7] ? String(row[7]).trim() || null : null;
          const zone            = row[8] ? String(row[8]).trim() || null : null; // col I

          const ca = await this.prisma.codiceAutista.create({
            data: {
              codice,
              ...(tariffaFissa !== null && { tariffaFissa }),
              ...(tariffaRitiro !== null && { tariffaRitiro }),
              ...(target !== null && !isNaN(target) && { target }),
              ...(bonusMalus !== null && { bonusMalus }),
              ...(zone && { zone }),
              ...(note && { note }),
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
                await this.prisma.assegnazioneCodiceAutista.create({
                  data: { codiceAutistaId: ca.id, padroncinoId: padroncino.id, dataInizio },
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

  async create(data: CreateCodiceAutistaDto, userId: string) {
    const exists = await this.prisma.codiceAutista.findUnique({ where: { codice: data.codice } });
    if (exists) throw new ConflictException('Codice già esistente');

    const ca = await this.prisma.codiceAutista.create({ data: data as any });
    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: ca.id,
      azione: 'CREATE', dataDopo: ca as any,
    });
    return ca;
  }

  async update(id: string, data: UpdateCodiceAutistaDto, userId: string) {
    const existing = await this.findOne(id);
    const ca = await this.prisma.codiceAutista.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: id,
      azione: 'UPDATE', dataPrima: existing as any, dataDopo: ca as any,
    });
    return ca;
  }

  async toggleAttivo(id: string, userId: string) {
    const ca = await this.findOne(id);
    const updated = await this.prisma.codiceAutista.update({
      where: { id },
      data: { attivo: !ca.attivo },
    });
    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: id,
      azione: 'UPDATE', dataDopo: { attivo: updated.attivo } as any,
    });
    return updated;
  }

  async assegna(codiceAutistaId: string, padroncinoId: string, dataInizio: string, userId: string) {
    await this.findOne(codiceAutistaId);

    // Chiudi assegnazione attiva
    const attiva = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId, deletedAt: null, dataFine: null },
    });
    if (attiva) {
      await this.prisma.assegnazioneCodiceAutista.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dataInizio) },
      });
    }

    const nuova = await this.prisma.assegnazioneCodiceAutista.create({
      data: {
        codiceAutistaId,
        padroncinoId,
        dataInizio: new Date(dataInizio),
      },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });

    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: codiceAutistaId,
      azione: 'ASSEGNA', dataDopo: {
        id: nuova.id,
        padroncinoId: nuova.padroncinoId,
        ragioneSociale: nuova.padroncino.ragioneSociale,
        dataInizio: nuova.dataInizio,
        dataFine: nuova.dataFine,
      } as any,
    });
    return nuova;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
    if (!assegnazione) throw new NotFoundException('Assegnazione non trovata');

    const updated = await this.prisma.assegnazioneCodiceAutista.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });

    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: assegnazione.codiceAutistaId,
      azione: 'CHIUDI_ASSEGNAZIONE', dataDopo: {
        id: assegnazione.id,
        padroncinoId: assegnazione.padroncinoId,
        ragioneSociale: assegnazione.padroncino.ragioneSociale,
        dataInizio: assegnazione.dataInizio,
        dataFine: updated.dataFine,
      } as any,
    });

    return updated;
  }

  async findPadroncinoAttivo(codiceAutistaId: string) {
    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId, deletedAt: null, dataFine: null },
      include: { padroncino: true },
    });
    return assegnazione?.padroncino || null;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.codiceAutista.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ userId, entityType: 'codice_autista', entityId: id, azione: 'DELETE' });
    return { deleted: true };
  }
}
