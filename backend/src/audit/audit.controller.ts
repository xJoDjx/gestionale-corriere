import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit')
export class AuditController {
  constructor(
    private auditService: AuditService,
    private prisma: PrismaService,
  ) {}

  /**
   * Log storico globale con filtri opzionali
   * GET /audit?entityType=mezzo&entityId=xxx&page=1&limit=50
   */
  @Get()
  async getAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('azione') azione?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageN  = page  ? parseInt(page)  : 1;
    const limitN = limit ? parseInt(limit) : 50;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId)   where.entityId   = entityId;
    if (azione)     where.azione     = azione;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageN - 1) * limitN,
        take: limitN,
        include: {
          user: { select: { nome: true, cognome: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: pageN, limit: limitN, totalPages: Math.ceil(total / limitN) };
  }

  /**
   * Log per entità specifica
   * GET /audit/entity/mezzo/abc123
   */
  @Get('entity/:entityType/:entityId')
  async getByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.getByEntity(entityType, entityId);
  }
}
