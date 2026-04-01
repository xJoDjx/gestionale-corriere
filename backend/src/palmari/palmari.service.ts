import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
            include: {
              padroncino: { select: { id: true, ragioneSociale: true } },
            },
            orderBy: { dataInizio: 'desc' },
          },
          tags: true,
        },
        orderBy: { codice: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.palmare.count({ where }),
    ]);

    // Mappa assegnazioni con ragioneSociale flat
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
      entrateMensili: Number(rateAttive._sum.tariffaMensile ?? 0),
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
        documenti: { where: { deletedAt: null } },
        tags: true,
      },
    });
    if (!palmare) throw new NotFoundException('Palmare non trovato');
    return palmare;
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
    const existing = await this.findOne(id);
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
    await this.findOne(palmareId);

    // Chiudi assegnazione attiva
    const attiva = await this.prisma.assegnazionePalmare.findFirst({
      where: { palmareId, deletedAt: null, dataFine: null },
    });
    if (attiva) {
      await this.prisma.assegnazionePalmare.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dto.dataInizio) },
      });
    }

    // Aggiorna stato palmare
    await this.prisma.palmare.update({ where: { id: palmareId }, data: { stato: 'ASSEGNATO' } });

    const assegnazione = await this.prisma.assegnazionePalmare.create({
      data: {
        palmareId,
        padroncinoId: dto.padroncinoId,
        dataInizio: new Date(dto.dataInizio),
      },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });

    await this.audit.log({
      userId, entityType: 'palmare', entityId: palmareId,
      azione: 'ASSEGNA', dataDopo: assegnazione as any,
    });
    return assegnazione;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const assegnazione = await this.prisma.assegnazionePalmare.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
    });
    if (!assegnazione) throw new NotFoundException('Assegnazione non trovata');

    const updated = await this.prisma.assegnazionePalmare.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });

    // Aggiorna stato palmare a DISPONIBILE
    await this.prisma.palmare.update({
      where: { id: assegnazione.palmareId },
      data: { stato: 'DISPONIBILE' },
    });

    await this.audit.log({
      userId, entityType: 'palmare', entityId: assegnazione.palmareId,
      azione: 'CHIUDI_ASSEGNAZIONE', dataDopo: updated as any,
    });
    return updated;
  }
}
