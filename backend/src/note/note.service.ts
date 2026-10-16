import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotaDto } from './note.dto';

@Injectable()
export class NoteService {
  constructor(private prisma: PrismaService) {}

  async findAll(entityType?: string, entityId?: string, limit = 50) {
    const where: Record<string, any> = {};
    if (entityType) where['entityType'] = entityType;
    if (entityId)   where['entityId']   = entityId;

    return (this.prisma.nota as any).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
      },
    });
  }

  async create(dto: CreateNotaDto, userId: string) {
    return (this.prisma.nota as any).create({
      data: {
        entityType: dto.entityType,
        entityId:   dto.entityId,
        contenuto:  dto.contenuto,
        userId,
      },
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
      },
    });
  }

  async remove(id: string, userId: string) {
    const nota = await (this.prisma.nota as any).findUnique({ where: { id } });
    if (!nota) throw new NotFoundException(`Nota ${id} non trovata`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ruolo: true },
    });
    if (nota['userId'] !== userId && user?.ruolo !== 'ADMIN') {
      throw new ForbiddenException('Non autorizzato a eliminare questa nota');
    }

    await this.prisma.nota.delete({ where: { id } });
    return { ok: true };
  }
}
