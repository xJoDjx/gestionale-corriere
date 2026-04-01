import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditPayload {
  userId: string;
  entityType: string;
  entityId: string;
  azione: 'CREATE' | 'UPDATE' | 'DELETE' | 'ASSEGNA' | 'CHIUDI_ASSEGNAZIONE';
  dataPrima?: Record<string, any>;
  dataDopo?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(payload: AuditPayload) {
    return this.prisma.auditLog.create({ data: payload });
  }

  async getByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { nome: true, cognome: true } } },
    });
  }
}
