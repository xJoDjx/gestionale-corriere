import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditPayload {
  userId: string;
  entityType: string;
  entityId: string;
  azione: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'ASSEGNA' | 'CHIUDI_ASSEGNAZIONE' | 'GENERA_CONTRATTO' | 'GENERA_CONTRATTO_PALMARE' | 'GENERA_CONTRATTO_CODICI' | 'GENERA_CONTRATTO_MEZZI' | 'LOGIN';
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

  /**
   * Restituisce gli eventi dell'entità + quelli delle sue assegnazioni correlate,
   * cercando nelle colonne JSON dataDopo/dataPrima il campo {entityType}Id.
   */
  async getByEntityFull(entityType: string, entityId: string) {
    // Mappa entità → tipo assegnazione e campo JSON che contiene l'id
    const relatedMap: Record<string, { assType: string; jsonKey: string }> = {
      mezzo:             { assType: 'assegnazione_mezzo',          jsonKey: 'mezzoId' },
      palmare:           { assType: 'assegnazione_palmare',        jsonKey: 'palmareId' },
      codice_autista:    { assType: 'assegnazione_codice_autista', jsonKey: 'codiceAutistaId' },
      // Log del conteggio: include anche gli eventi sulle singole righe
      // (inserimento/modifica/eliminazione addebiti, fatturato, ecc.)
      conteggio_mensile: { assType: 'conteggio_riga',              jsonKey: 'conteggioMensileId' },
    };

    const rel = relatedMap[entityType];

    // Events diretti sull'entità
    const direct = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { nome: true, cognome: true } } },
    });

    if (!rel) return direct;

    // Events sulle assegnazioni correlate (cerchiamo l'id nei campi JSON)
    const related = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        al.id,
        al.entity_type  AS "entityType",
        al.entity_id    AS "entityId",
        al.azione,
        al.created_at   AS "createdAt",
        al.data_prima   AS "dataPrima",
        al.data_dopo    AS "dataDopo",
        u.nome          AS "userName",
        u.cognome       AS "userCognome"
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity_type = ${rel.assType}
        AND (
          (al.data_dopo  IS NOT NULL AND al.data_dopo  ->>${rel.jsonKey} = ${entityId})
          OR
          (al.data_prima IS NOT NULL AND al.data_prima ->>${rel.jsonKey} = ${entityId})
        )
      ORDER BY al.created_at DESC
    `);

    // Normalizza la forma degli eventi correlati per corrispondere a quelli Prisma
    const normalizedRelated = related.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      azione: r.azione,
      createdAt: r.createdAt,
      dataPrima: r.dataPrima,
      dataDopo: r.dataDopo,
      user: r.userName ? { nome: r.userName, cognome: r.userCognome } : null,
    }));

    // Unisci e riordina per data
    const all = [...direct, ...normalizedRelated];
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all;
  }

  async searchAll(opts: {
    search: string;
    entityType?: string;
    azione?: string;
    userId?: string;
    page: number;
    limit: number;
  }) {
    const { search, entityType, azione, userId, page, limit } = opts;
    const s = `%${search}%`;
    const offset = (page - 1) * limit;

    const entityTypeFilter = entityType
      ? (entityType.includes(',')
          ? Prisma.sql`AND al.entity_type = ANY(${entityType.split(',').map(t => t.trim()).filter(Boolean)})`
          : Prisma.sql`AND al.entity_type = ${entityType}`)
      : Prisma.empty;
    const azioneFilter = azione
      ? Prisma.sql`AND al.azione = ${azione}`
      : Prisma.empty;
    const userIdFilter = userId
      ? Prisma.sql`AND al.user_id = ${userId}`
      : Prisma.empty;

    const [rawData, countResult] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          al.id,
          al.entity_type  AS "entityType",
          al.entity_id    AS "entityId",
          al.azione,
          al.created_at   AS "createdAt",
          al.data_prima   AS "dataPrima",
          al.data_dopo    AS "dataDopo",
          CASE WHEN u.id IS NOT NULL
            THEN json_build_object('nome', u.nome, 'cognome', u.cognome, 'email', u.email)
            ELSE NULL
          END AS user
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE (
          al.entity_id   ILIKE ${s}
          OR al.data_dopo::text  ILIKE ${s}
          OR al.data_prima::text ILIKE ${s}
        )
        ${entityTypeFilter}
        ${azioneFilter}
        ${userIdFilter}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM audit_logs al
        WHERE (
          al.entity_id   ILIKE ${s}
          OR al.data_dopo::text  ILIKE ${s}
          OR al.data_prima::text ILIKE ${s}
        )
        ${entityTypeFilter}
        ${azioneFilter}
        ${userIdFilter}
      `),
    ]);

    const total = Number(countResult[0].count);
    return { data: rawData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
