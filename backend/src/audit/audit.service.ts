import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Logga un'azione sull'audit log.
   * Se userId non esiste nel DB (es. 'system'), cerca l'admin o salta il log
   * senza far crashare l'operazione principale.
   */
  async log(payload: AuditPayload): Promise<void> {
    try {
      // Risolvi userId: se è 'system' o non valido, cerca il primo admin
      const userId = await this.resolveUserId(payload.userId);
      if (!userId) {
        this.logger.warn(
          `AuditLog skipped: userId '${payload.userId}' non trovato e nessun admin disponibile. ` +
          `Action: ${payload.azione} on ${payload.entityType}:${payload.entityId}`,
        );
        return;
      }

      await this.prisma.auditLog.create({
        data: {
          userId,
          entityType: payload.entityType,
          entityId: payload.entityId,
          azione: payload.azione,
          dataPrima: payload.dataPrima ?? undefined,
          dataDopo: payload.dataDopo ?? undefined,
        },
      });
    } catch (err) {
      // L'audit log non deve MAI far fallire l'operazione principale
      this.logger.error(
        `AuditLog error (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Risolve un userId: se valido lo restituisce, altrimenti cerca il primo admin.
   */
  private async resolveUserId(userId: string): Promise<string | null> {
    if (userId && userId !== 'system') {
      // Verifica che l'utente esista
      const exists = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (exists) return exists.id;
    }

    // Fallback: primo admin disponibile
    const admin = await this.prisma.user.findFirst({
      where: { ruolo: 'ADMIN', attivo: true, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin?.id ?? null;
  }

  async getByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { nome: true, cognome: true } } },
    });
  }
}
