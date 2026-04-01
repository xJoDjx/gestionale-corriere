import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto } from './mezzi.dto';

@Injectable()
export class MezziService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Normalizza DTO: mappa alias frontend → campi schema ───
  private normalizeDto(dto: CreateMezzoDto): Record<string, any> {
    const { proprietario, nContratto, ...rest } = dto as any;
    const data: Record<string, any> = { ...rest };

    // alias "proprietario" → "societaNoleggio" (se societaNoleggio non è già fornito)
    if (proprietario && !data.societaNoleggio) {
      data.societaNoleggio = proprietario;
    }
    // alias "nContratto" → "riferimentoContratto"
    if (nContratto && !data.riferimentoContratto) {
      data.riferimentoContratto = nContratto;
    }

    // rimuovi campi alias non mappabili direttamente a prisma
    delete data.proprietario;
    delete data.nContratto;

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
          tags: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mezzo.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

    const entrateNoleggio = canoniRaw.reduce(
      (s, m) => s + Number(m.canoneNoleggio ?? 0), 0,
    );
    const canoniNoleggio = canoniRaw.reduce(
      (s, m) => s + Number(m.rataNoleggio ?? 0), 0,
    );

    return {
      totali,
      disponibili,
      assegnati,
      entrateNoleggio,
      margine: entrateNoleggio - canoniNoleggio,
      scadenzeImminenti,
    };
  }

  // ─── SCADENZE ───────────────────────────────────────
  async getScadenze(giorni: number = 30) {
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

    const data = this.normalizeDto(dto);
    const mezzo = await this.prisma.mezzo.create({ data: data as any });

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
    const data = this.normalizeDto(dto);

    const mezzo = await this.prisma.mezzo.update({
      where: { id },
      data: data as any,
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
    });

    // Aggiorna stato mezzo
    await this.prisma.mezzo.update({
      where: { id: mezzoId },
      data: { stato: 'ASSEGNATO' },
    });

    await this.audit.log({
      userId,
      entityType: 'mezzo',
      entityId: mezzoId,
      azione: 'ASSEGNA',
      dataDopo: assegnazione as any,
    });

    return assegnazione;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string) {
    const assegnazione = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
    });
    if (!assegnazione) throw new NotFoundException('Assegnazione non trovata');

    const updated = await this.prisma.assegnazioneMezzo.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date() },
    });

    // Aggiorna stato mezzo
    await this.prisma.mezzo.update({
      where: { id: assegnazione.mezzoId },
      data: { stato: 'DISPONIBILE' },
    });

    await this.audit.log({
      userId,
      entityType: 'mezzo',
      entityId: assegnazione.mezzoId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: updated as any,
    });

    return updated;
  }
}
