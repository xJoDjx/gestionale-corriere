import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PadronciniService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: QueryPadronciniDto) {
    const { search, attivo, page = 1, limit = 50 } = query;

    const where: Prisma.PadroncinoWhereInput = {
      deletedAt: null,
      ...(attivo !== undefined && { attivo }),
      ...(search && {
        OR: [
          { ragioneSociale: { contains: search, mode: 'insensitive' } },
          { partitaIva: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.padroncino.findMany({
        where,
        include: {
          assegnazioniMezzi: {
            where: this.prisma.activeAssignmentFilter(),
            include: {
              mezzo: { select: { id: true, targa: true, marca: true, modello: true } },
            },
          },
          assegnazioniPalmari: {
            where: this.prisma.activeAssignmentFilter(),
            include: {
              palmare: { select: { id: true, codice: true } },
            },
          },
          codiciAutista: {
            where: this.prisma.activeAssignmentFilter(),
            include: {
              codiceAutista: { select: { id: true, codice: true, nome: true, cognome: true } },
            },
          },
          _count: { select: { conteggiMensili: true } },
        },
        orderBy: { ragioneSociale: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.padroncino.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioniMezzi: {
          where: { deletedAt: null },
          include: { mezzo: { select: { id: true, targa: true, marca: true, modello: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        assegnazioniPalmari: {
          where: { deletedAt: null },
          include: { palmare: { select: { id: true, codice: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        codiciAutista: {
          where: { deletedAt: null },
          include: { codiceAutista: true },
          orderBy: { dataInizio: 'desc' },
        },
        conteggiMensili: { orderBy: { mese: 'desc' }, take: 12 },
        documenti: { where: { deletedAt: null } },
        tags: true,
        noteEntita: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');
    return padroncino;
  }

  async create(dto: CreatePadroncinoDto, userId: string) {
    const padroncino = await this.prisma.padroncino.create({ data: dto as any });
    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId: padroncino.id,
      azione: 'CREATE',
      dataDopo: padroncino as any,
    });
    return padroncino;
  }

  async update(id: string, dto: UpdatePadroncinoDto, userId: string) {
    const existing = await this.findOne(id);
    const padroncino = await this.prisma.padroncino.update({
      where: { id },
      data: dto as any,
    });
    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: existing as any,
      dataDopo: padroncino as any,
    });
    return padroncino;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.padroncino.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId: id,
      azione: 'DELETE',
    });
    return { deleted: true };
  }

  // Lista semplificata per select/dropdown
  async listForSelect() {
    return this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
      orderBy: { ragioneSociale: 'asc' },
    });
  }

  // Scadenze DURC/DVR
  async getScadenze(giorniAvanti: number = 30) {
    const limite = new Date();
    limite.setDate(limite.getDate() + giorniAvanti);

    return this.prisma.padroncino.findMany({
      where: {
        deletedAt: null,
        attivo: true,
        OR: [
          { scadenzaDurc: { lte: limite } },
          { scadenzaDvr: { lte: limite } },
        ],
      },
      select: {
        id: true,
        ragioneSociale: true,
        scadenzaDurc: true,
        scadenzaDvr: true,
      },
    });
  }
}
