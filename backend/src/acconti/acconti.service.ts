import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CodiciAutistaService } from '../codici-autista/codici-autista.service';

export interface CreateAccontoDto {
  codiceAutistaId: string;
  importo: number;
  data: string;
  descrizione?: string;
  mese?: string;
  note?: string;
}

@Injectable()
export class AccontiService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private codiciAutista: CodiciAutistaService,
  ) {}

  async findAll(mese?: string) {
    return this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        ...(mese && { mese }),
      },
      include: {
        codiceAutista: {
          select: { id: true, codice: true, nome: true, cognome: true },
        },
      },
      orderBy: { data: 'desc' },
    });
  }

  async create(dto: CreateAccontoDto, userId: string) {
    // Verifica codice autista
    const ca = await this.prisma.codiceAutista.findFirst({
      where: { id: dto.codiceAutistaId, deletedAt: null },
    });
    if (!ca) throw new NotFoundException('Codice autista non trovato');

    // Trova padroncino collegato automaticamente
    const padroncino = await this.codiciAutista.findPadroncinoAttivo(dto.codiceAutistaId);
    if (!padroncino) {
      throw new BadRequestException(
        'Nessun padroncino attivo collegato a questo codice autista. Assegnare prima il codice.',
      );
    }

    // Calcola mese se non fornito
    const mese = dto.mese || dto.data.substring(0, 7);

    const acconto = await this.prisma.acconto.create({
      data: {
        codiceAutistaId: dto.codiceAutistaId,
        importo: dto.importo,
        data: new Date(dto.data),
        descrizione: dto.descrizione,
        mese,
        note: dto.note,
      },
    });

    await this.audit.log({
      userId,
      entityType: 'acconto',
      entityId: acconto.id,
      azione: 'CREATE',
      dataDopo: {
        ...acconto,
        padroncinoCollegato: padroncino.ragioneSociale,
      } as any,
    });

    return {
      ...acconto,
      padroncinoCollegato: {
        id: padroncino.id,
        ragioneSociale: padroncino.ragioneSociale,
      },
    };
  }

  async findByPadroncino(padroncinoId: string, mese?: string) {
    // Trova tutti i codici autista assegnati al padroncino
    const assegnazioni = await this.prisma.assegnazioneCodiceAutista.findMany({
      where: {
        padroncinoId,
        deletedAt: null,
        ...(mese && {
          dataInizio: { lte: new Date(`${mese}-28`) },
          OR: [
            { dataFine: null },
            { dataFine: { gte: new Date(`${mese}-01`) } },
          ],
        }),
      },
      select: { codiceAutistaId: true },
    });

    const codiciIds = assegnazioni.map((a) => a.codiceAutistaId);

    return this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        codiceAutistaId: { in: codiciIds },
        ...(mese && { mese }),
      },
      include: {
        codiceAutista: {
          select: { id: true, codice: true, nome: true, cognome: true },
        },
      },
      orderBy: { data: 'desc' },
    });
  }

  async remove(id: string, userId: string) {
    const acconto = await this.prisma.acconto.findFirst({
      where: { id, deletedAt: null },
    });
    if (!acconto) throw new NotFoundException('Acconto non trovato');

    await this.prisma.acconto.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      userId, entityType: 'acconto', entityId: id, azione: 'DELETE',
    });
    return { deleted: true };
  }
}
