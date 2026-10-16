import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddebitoSospesoDto, UpdateAddebitoSospesoDto } from './addebiti-sospesi.dto';

@Injectable()
export class AddebitivSospesoService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST ───────────────────────────────────────────────────────────────────
  async findAll(opts?: {
    padroncinoId?: string;
    meseTarget?: string;
    stato?: 'PENDENTE' | 'EVASO';
  }) {
    return this.prisma.addebitoSospeso.findMany({
      where: {
        deletedAt: null,
        ...(opts?.padroncinoId && { padroncinoId: opts.padroncinoId }),
        ...(opts?.meseTarget   && { meseTarget: opts.meseTarget }),
        ...(opts?.stato        && { stato: opts.stato }),
      },
      include: {
        padroncino: { select: { id: true, ragioneSociale: true } },
      },
      orderBy: [{ meseTarget: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Shortcut: addebiti PENDENTI per un padroncino in un determinato mese target
  async findPendentiPerConteggio(padroncinoId: string, meseTarget: string) {
    return this.prisma.addebitoSospeso.findMany({
      where: { padroncinoId, meseTarget, stato: 'PENDENTE', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── DETAIL ─────────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const record = await this.prisma.addebitoSospeso.findFirst({
      where: { id, deletedAt: null },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
    if (!record) throw new NotFoundException('Addebito sospeso non trovato');
    return record;
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  async create(dto: CreateAddebitoSospesoDto) {
    return this.prisma.addebitoSospeso.create({
      data: {
        padroncinoId: dto.padroncinoId,
        tipo:         (dto.tipo ?? 'ADDEBITO') as any,
        descrizione:  dto.descrizione,
        importo:      dto.importo ?? null,
        meseOrigine:  dto.meseOrigine ?? null,
        meseTarget:   dto.meseTarget,
        note:         dto.note ?? null,
      },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateAddebitoSospesoDto) {
    await this.findOne(id);
    return this.prisma.addebitoSospeso.update({
      where: { id },
      data: {
        ...(dto.padroncinoId !== undefined && { padroncinoId: dto.padroncinoId }),
        ...(dto.tipo        !== undefined && { tipo: dto.tipo as any }),
        ...(dto.descrizione !== undefined && { descrizione: dto.descrizione }),
        ...(dto.importo     !== undefined && { importo: dto.importo }),
        ...(dto.meseOrigine !== undefined && { meseOrigine: dto.meseOrigine }),
        ...(dto.meseTarget  !== undefined && { meseTarget: dto.meseTarget }),
        ...(dto.note        !== undefined && { note: dto.note }),
      },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
  }

  // ─── EVADI ──────────────────────────────────────────────────────────────────
  async evadi(id: string) {
    await this.findOne(id);
    return this.prisma.addebitoSospeso.update({
      where: { id },
      data: { stato: 'EVASO' },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
  }

  // ─── RIAPRI ─────────────────────────────────────────────────────────────────
  async riapri(id: string) {
    await this.findOne(id);
    return this.prisma.addebitoSospeso.update({
      where: { id },
      data: { stato: 'PENDENTE' },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });
  }

  // ─── DELETE (soft) ──────────────────────────────────────────────────────────
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.addebitoSospeso.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Eliminato' };
  }
}
