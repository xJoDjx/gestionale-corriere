import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto } from './mezzi.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MezziService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── LIST CON FILTRI ────────────────────────────────
  async findAll(query: QueryMezziDto) {
    const {
      search, stato, categoria, tipo, alimentazione,
      page = 1, limit = 50, sortBy = 'targa', sortOrder = 'asc',
    } = query;

    const where: Prisma.MezzoWhereInput = {
      deletedAt: null,
      ...(stato && { stato }),
      ...(categoria && { categoria }),
      ...(tipo && { tipo }),
      ...(alimentazione && { alimentazione }),
      ...(search && {
        OR: [
          { targa: { contains: search, mode: 'insensitive' } },
          { marca: { contains: search, mode: 'insensitive' } },
          { modello: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.mezzo.findMany({
        where,
        include: {
          assegnazioni: {
            where: this.prisma.activeAssignmentFilter(),
            include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          },
          tags: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mezzo.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── STATS FLOTTA ───────────────────────────────────
  async getStats() {
    const base = { deletedAt: null };

    const [totali, disponibili, assegnati, mezzi] = await Promise.all([
      this.prisma.mezzo.count({ where: base }),
      this.prisma.mezzo.count({ where: { ...base, stato: 'DISPONIBILE' } }),
      this.prisma.mezzo.count({ where: { ...base, stato: 'ASSEGNATO' } }),
      this.prisma.mezzo.findMany({
        where: { ...base, rataNoleggio: { not: null } },
        select: { rataNoleggio: true, canoneNoleggio: true },
      }),
    ]);

    const entrateNoleggio = mezzi.reduce(
      (sum, m) => sum + Number(m.rataNoleggio || 0), 0,
    );
    const canoniNoleggio = mezzi.reduce(
      (sum, m) => sum + Number(m.canoneNoleggio || 0), 0,
    );

    // Scadenze entro 30 giorni
    const fra30gg = new Date();
    fra30gg.setDate(fra30gg.getDate() + 30);

    const scadenzeImminenti = await this.prisma.mezzo.count({
      where: {
        ...base,
        OR: [
          { scadenzaAssicurazione: { lte: fra30gg, gte: new Date() } },
          { scadenzaRevisione: { lte: fra30gg, gte: new Date() } },
          { scadenzaBollo: { lte: fra30gg, gte: new Date() } },
        ],
      },
    });

    return {
      totali,
      disponibili,
      assegnati,
      entrateNoleggio,
      margine: entrateNoleggio - canoniNoleggio,
      scadenzeImminenti,
    };
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
        documenti: { where: { deletedAt: null } },
        tags: true,
        noteEntita: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!mezzo) throw new NotFoundException('Mezzo non trovato');
    return mezzo;
  }

  // ─── CREATE ─────────────────────────────────────────
  async create(dto: CreateMezzoDto, userId: string) {
    const exists = await this.prisma.mezzo.findUnique({ where: { targa: dto.targa } });
    if (exists) throw new ConflictException('Targa già esistente');

    const mezzo = await this.prisma.mezzo.create({ data: dto as any });

    await this.audit.log({
      userId,
      entityType: 'mezzo',
      entityId: mezzo.id,
      azione: 'CREATE',
      dataDopo: mezzo as any,
    });

    return mezzo;
  }

  // ─── UPDATE ─────────────────────────────────────────
  async update(id: string, dto: UpdateMezzoDto, userId: string) {
    const existing = await this.findOne(id);

    const mezzo = await this.prisma.mezzo.update({
      where: { id },
      data: dto as any,
    });

    await this.audit.log({
      userId,
      entityType: 'mezzo',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: existing as any,
      dataDopo: mezzo as any,
    });

    return mezzo;
  }

  // ─── SOFT DELETE ────────────────────────────────────
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);

    await this.prisma.mezzo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      entityType: 'mezzo',
      entityId: id,
      azione: 'DELETE',
      dataPrima: existing as any,
    });

    return { deleted: true };
  }

  // ─── ASSEGNAZIONI ──────────────────────────────────
  async createAssegnazione(mezzoId: string, dto: CreateAssegnazioneMezzoDto, userId: string) {
    await this.findOne(mezzoId);

    // Chiudi assegnazione attiva precedente
    const attiva = await this.prisma.assegnazioneMezzo.findFirst({
      where: {
        mezzoId,
        ...this.prisma.activeAssignmentFilter(),
      },
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
      },
    });

    // Aggiorna stato mezzo
    await this.prisma.mezzo.update({
      where: { id: mezzoId },
      data: { stato: 'ASSEGNATO' },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_mezzo',
      entityId: assegnazione.id,
      azione: 'CREATE',
      dataDopo: assegnazione as any,
    });

    return assegnazione;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const assegnazione = await this.prisma.assegnazioneMezzo.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });

    // Verifica se il mezzo ha altre assegnazioni attive
    const altreAttive = await this.prisma.assegnazioneMezzo.count({
      where: {
        mezzoId: assegnazione.mezzoId,
        id: { not: assegnazioneId },
        ...this.prisma.activeAssignmentFilter(),
      },
    });

    if (altreAttive === 0) {
      await this.prisma.mezzo.update({
        where: { id: assegnazione.mezzoId },
        data: { stato: 'DISPONIBILE' },
      });
    }

    await this.audit.log({
      userId,
      entityType: 'assegnazione_mezzo',
      entityId: assegnazioneId,
      azione: 'UPDATE',
      dataDopo: { dataFine: new Date() },
    });

    return assegnazione;
  }

  // ─── SCADENZE ───────────────────────────────────────
  async getScadenze(giorniAvanti: number = 30) {
    const limite = new Date();
    limite.setDate(limite.getDate() + giorniAvanti);

    return this.prisma.mezzo.findMany({
      where: {
        deletedAt: null,
        OR: [
          { scadenzaAssicurazione: { lte: limite } },
          { scadenzaRevisione: { lte: limite } },
          { scadenzaBollo: { lte: limite } },
          { scadenzaTagliando: { lte: limite } },
        ],
      },
      select: {
        id: true, targa: true, marca: true, modello: true,
        scadenzaAssicurazione: true, scadenzaRevisione: true,
        scadenzaBollo: true, scadenzaTagliando: true,
      },
      orderBy: { targa: 'asc' },
    });
  }
}
