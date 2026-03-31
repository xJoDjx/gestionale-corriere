import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CodiciAutistaService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.codiceAutista.findMany({
      where: { deletedAt: null },
      include: {
        assegnazioni: {
          where: this.prisma.activeAssignmentFilter(),
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
        },
      },
      orderBy: { codice: 'asc' },
    });
  }

  async findOne(id: string) {
    const ca = await this.prisma.codiceAutista.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioni: {
          where: { deletedAt: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        acconti: { orderBy: { data: 'desc' } },
      },
    });
    if (!ca) throw new NotFoundException('Codice autista non trovato');
    return ca;
  }

  async create(data: { codice: string; nome?: string; cognome?: string; note?: string }, userId: string) {
    const exists = await this.prisma.codiceAutista.findUnique({ where: { codice: data.codice } });
    if (exists) throw new ConflictException('Codice già esistente');

    const ca = await this.prisma.codiceAutista.create({ data });
    await this.audit.log({
      userId, entityType: 'codice_autista', entityId: ca.id,
      azione: 'CREATE', dataDopo: ca as any,
    });
    return ca;
  }

  async assegna(codiceAutistaId: string, padroncinoId: string, dataInizio: string, userId: string) {
    await this.findOne(codiceAutistaId);

    // Chiudi assegnazione attiva
    const attiva = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId, ...this.prisma.activeAssignmentFilter() },
    });
    if (attiva) {
      await this.prisma.assegnazioneCodiceAutista.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dataInizio) },
      });
    }

    return this.prisma.assegnazioneCodiceAutista.create({
      data: {
        codiceAutistaId,
        padroncinoId,
        dataInizio: new Date(dataInizio),
      },
    });
  }

  /**
   * Trova il padroncino attivo collegato a un codice autista
   * Usato dal sistema acconti per il collegamento automatico
   */
  async findPadroncinoAttivo(codiceAutistaId: string) {
    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId, ...this.prisma.activeAssignmentFilter() },
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
