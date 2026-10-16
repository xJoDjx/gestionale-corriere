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
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageN  = page  ? parseInt(page)  : 1;
    const limitN = limit ? parseInt(limit) : 50;

    // Ricerca full-text su entityId e campi JSON
    if (search?.trim()) {
      return this.auditService.searchAll({
        search: search.trim(),
        entityType,
        azione,
        userId,
        page: pageN,
        limit: limitN,
      });
    }

    const where: any = {};
    if (entityType) {
      // Supporta una lista separata da virgole (es. "palmare,assegnazione_palmare")
      // cosi' i widget "Ultime Modifiche" possono includere gli eventi di
      // assegnazione correlati insieme a quelli diretti sull'entita'.
      const types = entityType.split(',').map(t => t.trim()).filter(Boolean);
      where.entityType = types.length > 1 ? { in: types } : types[0];
    }
    if (entityId)   where.entityId   = entityId;
    if (azione)     where.azione     = azione;
    if (userId)     where.userId     = userId;

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

  /**
   * Log aggregato: entità + tutte le sue assegnazioni correlate
   * GET /audit/entity-full/mezzo/abc123
   * GET /audit/entity-full/palmare/abc123
   * GET /audit/entity-full/codice_autista/abc123
   */
  @Get('entity-full/:entityType/:entityId')
  async getByEntityFull(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.getByEntityFull(entityType, entityId);
  }
}
