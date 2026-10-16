import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoceConteggioDto, UpdateVoceConteggioDto } from './voci-conteggio.dto';

@Injectable()
export class VociConteggioService {
  constructor(private prisma: PrismaService) {}

  async findAll(categoria?: string) {
    return this.prisma.voceConteggio.findMany({
      where: {
        deletedAt: null,
        ...(categoria ? { categoria: categoria as any } : {}),
      },
      orderBy: [{ categoria: 'asc' }, { descrizione: 'asc' }],
    });
  }

  async findOne(id: string) {
    const v = await this.prisma.voceConteggio.findFirst({ where: { id, deletedAt: null } });
    if (!v) throw new NotFoundException('Voce non trovata');
    return v;
  }

  async create(dto: CreateVoceConteggioDto) {
    return this.prisma.voceConteggio.create({
      data: {
        descrizione: dto.descrizione,
        contoVoce: dto.contoVoce ?? null,
        percIva: dto.percIva ?? 22,
        valoreDefault: dto.valoreDefault ?? null,
        categoria: dto.categoria as any,
        attivo: dto.attivo ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateVoceConteggioDto) {
    await this.findOne(id);
    return this.prisma.voceConteggio.update({
      where: { id },
      data: {
        ...(dto.descrizione !== undefined && { descrizione: dto.descrizione }),
        ...(dto.contoVoce !== undefined && { contoVoce: dto.contoVoce }),
        ...(dto.percIva !== undefined && { percIva: dto.percIva }),
        ...(dto.valoreDefault !== undefined && { valoreDefault: dto.valoreDefault }),
        ...(dto.categoria !== undefined && { categoria: dto.categoria as any }),
        ...(dto.attivo !== undefined && { attivo: dto.attivo }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.voceConteggio.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
