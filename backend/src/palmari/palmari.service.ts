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

  async findAll() {
    return this.prisma.palmare.findMany({
      where: { deletedAt: null },
      include: {
        assegnazioni: {
          where: this.prisma.activeAssignmentFilter(),
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
        },
        tags: true,
      },
      orderBy: { codice: 'asc' },
    });
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
      where: { palmareId, ...this.prisma.activeAssignmentFilter() },
    });
    if (attiva) {
      await this.prisma.assegnazionePalmare.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dto.dataInizio) },
      });
    }

    const assegnazione = await this.prisma.assegnazionePalmare.create({
      data: {
        palmareId,
        padroncinoId: dto.padroncinoId,
        dataInizio: new Date(dto.dataInizio),
        dataFine: dto.dataFine ? new Date(dto.dataFine) : null,
      },
    });

    await this.prisma.palmare.update({
      where: { id: palmareId },
      data: { stato: 'ASSEGNATO' },
    });

    await this.audit.log({
      userId, entityType: 'assegnazione_palmare', entityId: assegnazione.id,
      azione: 'CREATE', dataDopo: assegnazione as any,
    });
    return assegnazione;
  }
}
