import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';

export type ResetSection =
  | 'all'
  | 'padroncini'
  | 'mezzi'
  | 'palmari'
  | 'codici-autisti'
  | 'acconti'
  | 'ricariche'
  | 'conteggi';

/**
 * Entità con soft-delete (colonna deletedAt) recuperabili dal pannello
 * "Ripristino Emergenza". Ogni entryType corrisponde all'entityType usato
 * nell'AuditLog per l'azione DELETE della relativa entità.
 */
export type EntityRestoreType =
  | 'mezzo'
  | 'padroncino'
  | 'palmare'
  | 'codice_autista'
  | 'acconto'
  | 'conteggio_mensile';

const RESTORE_ENTITY_LABELS: Record<EntityRestoreType, string> = {
  mezzo: 'Mezzo',
  padroncino: 'Padroncino',
  palmare: 'Palmare',
  codice_autista: 'Codice Autista',
  acconto: 'Acconto',
  conteggio_mensile: 'Conteggio Mensile',
};

@Injectable()
export class DbAdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async verifyAdmin(email: string, password: string) {
    if (!email || !password) throw new BadRequestException('Credenziali mancanti');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.attivo) throw new UnauthorizedException('Credenziali non valide');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Password errata');
    if (user.ruolo !== 'ADMIN') throw new ForbiddenException('Operazione riservata agli admin');
    return user;
  }

  async backup(email: string, password: string) {
    await this.verifyAdmin(email, password);
    const p = this.prisma;
    const [
      users, permessi, auditLogs,
      mezzi, assegnazioniMezzi,
      padroncini,
      palmari, assegnazioniPalmari,
      codiciAutisti, assegnazioniCodiciAutisti,
      acconti,
      conteggiMensili, conteggiRighe,
      documenti, tags, note,
      ricaricheElettriche,
      vociConteggio,
    ] = await Promise.all([
      p.user.findMany(),
      p.permesso.findMany(),
      p.auditLog.findMany(),
      p.mezzo.findMany(),
      p.assegnazioneMezzo.findMany(),
      p.padroncino.findMany(),
      p.palmare.findMany(),
      p.assegnazionePalmare.findMany(),
      p.codiceAutista.findMany(),
      p.assegnazioneCodiceAutista.findMany(),
      p.acconto.findMany(),
      p.conteggioMensile.findMany(),
      p.conteggiRiga.findMany(),
      p.documento.findMany(),
      p.tag.findMany(),
      p.nota.findMany(),
      p.ricaricaElettrica.findMany(),
      p.voceConteggio.findMany(),
    ]);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        version: 1,
      },
      data: {
        users, permessi, auditLogs,
        mezzi, assegnazioniMezzi,
        padroncini,
        palmari, assegnazioniPalmari,
        codiciAutisti, assegnazioniCodiciAutisti,
        acconti,
        conteggiMensili, conteggiRighe,
        documenti, tags, note,
        ricaricheElettriche,
        vociConteggio,
      },
    };
  }

  async reset(email: string, password: string, section: ResetSection) {
    await this.verifyAdmin(email, password);
    const p = this.prisma;

    const resetPadroncini = async () => {
      await p.assegnazioneMezzo.deleteMany({});
      await p.assegnazionePalmare.deleteMany({});
      await p.assegnazioneCodiceAutista.deleteMany({});
      await p.conteggiRiga.deleteMany({});
      await p.conteggioMensile.deleteMany({});
      await p.ricaricaElettrica.deleteMany({});
      await p.padroncino.deleteMany({});
    };

    const resetMezzi = async () => {
      await p.assegnazioneMezzo.deleteMany({});
      await p.ricaricaElettrica.deleteMany({});
      await p.mezzo.deleteMany({});
    };

    const resetPalmari = async () => {
      await p.assegnazionePalmare.deleteMany({});
      await p.palmare.deleteMany({});
    };

    const resetCodiciAutisti = async () => {
      await p.acconto.deleteMany({});
      await p.assegnazioneCodiceAutista.deleteMany({});
      await p.codiceAutista.deleteMany({});
    };

    const resetAcconti = async () => {
      await p.acconto.deleteMany({});
    };

    const resetRicariche = async () => {
      await p.ricaricaElettrica.deleteMany({});
    };

    const resetConteggi = async () => {
      await p.conteggiRiga.deleteMany({});
      await p.conteggioMensile.deleteMany({});
    };

    const resetAll = async () => {
      await p.conteggiRiga.deleteMany({});
      await p.conteggioMensile.deleteMany({});
      await p.acconto.deleteMany({});
      await p.ricaricaElettrica.deleteMany({});
      await p.assegnazioneMezzo.deleteMany({});
      await p.assegnazionePalmare.deleteMany({});
      await p.assegnazioneCodiceAutista.deleteMany({});
      await p.codiceAutista.deleteMany({});
      await p.palmare.deleteMany({});
      await p.mezzo.deleteMany({});
      await p.padroncino.deleteMany({});
      await p.documento.deleteMany({});
      await p.tag.deleteMany({});
      await p.nota.deleteMany({});
      await p.auditLog.deleteMany({});
    };

    switch (section) {
      case 'padroncini': await resetPadroncini(); break;
      case 'mezzi': await resetMezzi(); break;
      case 'palmari': await resetPalmari(); break;
      case 'codici-autisti': await resetCodiciAutisti(); break;
      case 'acconti': await resetAcconti(); break;
      case 'ricariche': await resetRicariche(); break;
      case 'conteggi': await resetConteggi(); break;
      case 'all': await resetAll(); break;
      default: throw new BadRequestException('Sezione non valida');
    }
    return { ok: true, section };
  }

  /** Statistiche sui log: conteggio totale e distribuzione per anzianità */
  async logStats() {
    const now = new Date();
    const cutoffs = [30, 60, 90, 180, 365].map((d) => {
      const t = new Date(now);
      t.setDate(t.getDate() - d);
      return { giorni: d, data: t };
    });

    const [totale, ...olderCounts] = await Promise.all([
      this.prisma.auditLog.count(),
      ...cutoffs.map((c) =>
        this.prisma.auditLog.count({ where: { createdAt: { lt: c.data } } }),
      ),
    ]);

    const oldest = await this.prisma.auditLog.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    return {
      totale,
      oldest: oldest?.createdAt ?? null,
      eliminabili: cutoffs.map((c, i) => ({
        giorni: c.giorni,
        count: olderCounts[i],
      })),
    };
  }

  /** Elimina log più vecchi di N giorni. Richiede autenticazione admin. */
  async cleanupLogs(email: string, password: string, giorni: number) {
    await this.verifyAdmin(email, password);
    if (giorni < 7) throw new BadRequestException('Minimo 7 giorni');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - giorni);
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { ok: true, eliminati: count, cutoff };
  }

  // ─── RIPRISTINO EMERGENZA ───────────────────────────
  // Le "eliminazioni" nel gestionale sono quasi tutte soft-delete
  // (colonna deletedAt): il record resta nel DB, solo nascosto dalle liste.
  // Queste due funzioni permettono a un admin di elencare i record
  // eliminati di un certo tipo e di ripristinarli (deletedAt → null),
  // per rimediare a cancellazioni fatte per errore.

  /** Elenco record eliminati (deletedAt non nullo) di un tipo, più recenti prima. */
  async listDeleted(email: string, password: string, entityType: EntityRestoreType) {
    await this.verifyAdmin(email, password);
    const p = this.prisma;

    switch (entityType) {
      case 'mezzo':
        return p.mezzo.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
        });
      case 'padroncino':
        return p.padroncino.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
        });
      case 'palmare':
        return p.palmare.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
        });
      case 'codice_autista':
        return p.codiceAutista.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
        });
      case 'acconto':
        return p.acconto.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
          include: { codiceAutista: { select: { codice: true, nome: true, cognome: true } } },
        });
      case 'conteggio_mensile':
        return p.conteggioMensile.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: 100,
          include: { padroncino: { select: { ragioneSociale: true } } },
        });
      default:
        throw new BadRequestException('Tipo entità non valido');
    }
  }

  /** Ripristina un record eliminato (deletedAt → null) e logga l'operazione. */
  async restoreEntity(
    email: string,
    password: string,
    entityType: EntityRestoreType,
    entityId: string,
  ) {
    const admin = await this.verifyAdmin(email, password);
    const p = this.prisma;

    const restore = async <T extends { deletedAt: Date | null }>(
      findOne: () => Promise<T | null>,
      doUpdate: () => Promise<T>,
    ): Promise<T> => {
      const existing = await findOne();
      if (!existing) throw new NotFoundException('Record non trovato');
      if (!existing.deletedAt) throw new BadRequestException('Il record non risulta eliminato');
      try {
        return await doUpdate();
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(
            'Impossibile ripristinare: esiste già un altro record attivo con lo stesso valore univoco (es. targa/codice). Modifica o elimina prima quello attuale.',
          );
        }
        throw err;
      }
    };

    let restored: any;
    switch (entityType) {
      case 'mezzo':
        restored = await restore(
          () => p.mezzo.findUnique({ where: { id: entityId } }),
          () => p.mezzo.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      case 'padroncino':
        restored = await restore(
          () => p.padroncino.findUnique({ where: { id: entityId } }),
          () => p.padroncino.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      case 'palmare':
        restored = await restore(
          () => p.palmare.findUnique({ where: { id: entityId } }),
          () => p.palmare.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      case 'codice_autista':
        restored = await restore(
          () => p.codiceAutista.findUnique({ where: { id: entityId } }),
          () => p.codiceAutista.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      case 'acconto':
        restored = await restore(
          () => p.acconto.findUnique({ where: { id: entityId } }),
          () => p.acconto.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      case 'conteggio_mensile':
        restored = await restore(
          () => p.conteggioMensile.findUnique({ where: { id: entityId } }),
          () => p.conteggioMensile.update({ where: { id: entityId }, data: { deletedAt: null } }),
        );
        break;
      default:
        throw new BadRequestException('Tipo entità non valido');
    }

    await this.audit.log({
      userId: admin.id,
      entityType,
      entityId,
      azione: 'RESTORE',
      dataDopo: restored as any,
    });

    return { restored: true, label: RESTORE_ENTITY_LABELS[entityType], data: restored };
  }
}
