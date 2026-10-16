import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManutenzioneDto, UpdateManutenzioneDto } from './manutenzioni.dto';
import * as fs from 'fs';

@Injectable()
export class ManutenzioniService {
  constructor(private prisma: PrismaService) {}

  async findByMezzo(mezzoId: string) {
    return this.prisma.manutenzione.findMany({
      where: { mezzoId, deletedAt: null },
      orderBy: { dataInizio: 'desc' },
    });
  }

  async findOne(id: string) {
    const m = await this.prisma.manutenzione.findFirst({
      where: { id, deletedAt: null },
    });
    if (!m) throw new NotFoundException('Manutenzione non trovata');
    return m;
  }

  async create(dto: CreateManutenzioneDto, file?: Express.Multer.File) {
    return this.prisma.manutenzione.create({
      data: {
        mezzoId: dto.mezzoId,
        dataInizio: new Date(dto.dataInizio),
        dataFine: dto.dataFine ? new Date(dto.dataFine) : null,
        descrizione: dto.descrizione,
        costo: dto.costo ?? null,
        fatturaPath: file?.path ?? null,
        fatturaNome: file?.originalname ?? null,
        fornitore: dto.fornitore ?? null,
        note: dto.note ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateManutenzioneDto, file?: Express.Multer.File) {
    const existing = await this.findOne(id);

    // Se c'è un nuovo file, elimina il vecchio
    if (file && existing.fatturaPath && fs.existsSync(existing.fatturaPath)) {
      fs.unlinkSync(existing.fatturaPath);
    }

    return this.prisma.manutenzione.update({
      where: { id },
      data: {
        ...(dto.dataInizio && { dataInizio: new Date(dto.dataInizio) }),
        ...(dto.dataFine !== undefined && { dataFine: dto.dataFine ? new Date(dto.dataFine) : null }),
        ...(dto.descrizione && { descrizione: dto.descrizione }),
        ...(dto.costo !== undefined && { costo: dto.costo }),
        ...(dto.fornitore !== undefined && { fornitore: dto.fornitore }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(file && { fatturaPath: file.path, fatturaNome: file.originalname }),
      },
    });
  }

  async remove(id: string) {
    const m = await this.findOne(id);
    await this.prisma.manutenzione.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (m.fatturaPath && fs.existsSync(m.fatturaPath)) {
      fs.unlinkSync(m.fatturaPath);
    }
    return { ok: true };
  }

  async downloadFattura(id: string) {
    return this.findOne(id);
  }
}
