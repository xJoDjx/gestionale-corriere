import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './task.dto';

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

  async findAll(entityType?: string, entityId?: string) {
    const where: Record<string, any> = {};
    if (entityType) where['entityType'] = entityType;
    if (entityId)   where['entityId']   = entityId;

    return (this.prisma.task as any).findMany({
      where,
      orderBy: [{ completata: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
      },
    });
  }

  async create(dto: CreateTaskDto, userId: string) {
    return (this.prisma.task as any).create({
      data: {
        entityType:    dto.entityType,
        entityId:      dto.entityId,
        testo:         dto.testo,
        targa:         dto.targa || undefined,
        codiceAutista: dto.codiceAutista || undefined,
        palmare:       dto.palmare || undefined,
        padroncino:    dto.padroncino || undefined,
        userId,
      },
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await (this.prisma.task as any).findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} non trovato`);

    return (this.prisma.task as any).update({
      where: { id },
      data: {
        ...(dto.testo         !== undefined ? { testo: dto.testo }                 : {}),
        ...(dto.targa         !== undefined ? { targa: dto.targa || null }         : {}),
        ...(dto.codiceAutista !== undefined ? { codiceAutista: dto.codiceAutista || null } : {}),
        ...(dto.palmare       !== undefined ? { palmare: dto.palmare || null }     : {}),
        ...(dto.padroncino    !== undefined ? { padroncino: dto.padroncino || null } : {}),
        ...(dto.completata !== undefined
          ? { completata: dto.completata, completedAt: dto.completata ? new Date() : null }
          : {}),
      },
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
      },
    });
  }

  async remove(id: string, userId: string) {
    const task = await (this.prisma.task as any).findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} non trovato`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ruolo: true },
    });
    if (task['userId'] !== userId && user?.ruolo !== 'ADMIN') {
      throw new ForbiddenException('Non autorizzato a eliminare questa attività');
    }

    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}
