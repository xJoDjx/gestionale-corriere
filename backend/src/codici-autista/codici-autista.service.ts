import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
}

export interface UpdateCodiceAutistaDto {
  nome?: string;
  cognome?: string;
  note?: string;
  tariffaFissa?: number;
  tariffaRitiro?: number;
  target?: number;
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
    return ca;
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
      azione: 'ASSEGNA', dataDopo: nuova as any,
    });
    return nuova;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
    });
    if (!assegnazione) throw new NotFoundException('Assegnazione non trovata');

    return this.prisma.assegnazioneCodiceAutista.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });
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
