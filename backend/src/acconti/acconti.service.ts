import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateAccontoDto {
  // L'utente digita il CODICE testuale (es. "AUT001"), non l'id
  codiceAutista: string;
  importo: number;
  data: string;
  tipo?: 'ACCONTO' | 'RESTITUZIONE'; // default ACCONTO
  descrizione?: string;
  mese?: string;
  note?: string;
}

@Injectable()
export class AccontiService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(mese?: string) {
    const acconti = await this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        ...(mese && { mese }),
      },
      include: {
        codiceAutista: {
          select: { id: true, codice: true, nome: true, cognome: true },
          // include assegnazione attiva per trovare padroncino
        },
      },
      orderBy: { data: 'desc' },
    });

    // Per ogni acconto, cerchiamo il padroncino collegato al codice autista
    const result = await Promise.all(
      acconti.map(async (a) => {
        const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
          where: {
            codiceAutistaId: a.codiceAutistaId,
            deletedAt: null,
            dataFine: null,
          },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
        });

        // Controlla se esiste un ConteggioMensile per il padroncino + mese dell'acconto.
        // Gli acconti appaiono nel DettaglioConteggio come sezione read-only caricata
        // dall'API, non come ConteggiRiga, quindi basta verificare l'esistenza del conteggio.
        let addebitatoIn: { mese: string; ragioneSociale: string } | null = null;
        if (assegnazione?.padroncino && a.mese) {
          const conteggio = await this.prisma.conteggioMensile.findFirst({
            where: {
              padroncinoId: assegnazione.padroncino.id,
              mese: a.mese,
              deletedAt: null,
            },
            select: {
              mese: true,
              padroncino: { select: { ragioneSociale: true } },
            },
          });
          if (conteggio) {
            addebitatoIn = {
              mese: conteggio.mese,
              ragioneSociale: conteggio.padroncino.ragioneSociale,
            };
          }
        }

        return {
          ...a,
          importo: Number(a.importo),
          tipo: (a as any).tipo ?? 'ACCONTO',
          codice: a.codiceAutista.codice,
          nomeAutista: [a.codiceAutista.nome, a.codiceAutista.cognome].filter(Boolean).join(' ') || 'N/D',
          ragioneSociale: assegnazione?.padroncino?.ragioneSociale ?? 'N/A',
          padroncinoId: assegnazione?.padroncino?.id ?? null,
          addebitatoIn,
        };
      }),
    );

    return result;
  }

  async create(dto: CreateAccontoDto, userId: string) {
    // Cerca il codice autista per CODICE TESTUALE (es. "AUT001")
    const ca = await this.prisma.codiceAutista.findFirst({
      where: { codice: dto.codiceAutista.trim().toUpperCase(), deletedAt: null },
    });

    if (!ca) {
      throw new NotFoundException(`Codice autista "${dto.codiceAutista}" non trovato`);
    }

    // Cerca padroncino collegato (può essere null → N/A, non blocca)
    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId: ca.id, deletedAt: null, dataFine: null },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });

    const mese = dto.mese || dto.data.substring(0, 7);
    const tipo = dto.tipo ?? 'ACCONTO';

    const acconto = await this.prisma.acconto.create({
      data: {
        codiceAutistaId: ca.id,
        importo: dto.importo,
        data: new Date(dto.data),
        descrizione: dto.descrizione,
        mese,
        note: dto.note,
        // il campo tipo va aggiunto allo schema prisma se non esiste ancora
        // per ora lo salviamo in note se il campo non esiste
        ...(tipo === 'RESTITUZIONE' ? { descrizione: `[RESTITUZIONE] ${dto.descrizione ?? ''}`.trim() } : {}),
      },
    });

    await this.audit.log({
      userId,
      entityType: 'acconto',
      entityId: acconto.id,
      azione: 'CREATE',
      dataDopo: {
        codiceAutista: ca.codice,
        nomeAutista: [ca.nome, ca.cognome].filter(Boolean).join(' '),
        importo: dto.importo,
        tipo,
        padroncinoCollegato: assegnazione?.padroncino?.ragioneSociale ?? 'N/A',
      } as any,
    });

    return {
      ...acconto,
      importo: Number(acconto.importo),
      tipo,
      codice: ca.codice,
      nomeAutista: [ca.nome, ca.cognome].filter(Boolean).join(' ') || 'N/D',
      ragioneSociale: assegnazione?.padroncino?.ragioneSociale ?? 'N/A',
      padroncinoId: assegnazione?.padroncino?.id ?? null,
      padroncinoCollegato: assegnazione?.padroncino
        ? { id: assegnazione.padroncino.id, ragioneSociale: assegnazione.padroncino.ragioneSociale }
        : null,
    };
  }

  async findByPadroncino(padroncinoId: string, mese?: string) {
    // Trova tutti i codici autista assegnati a questo padroncino
    const assegnazioni = await this.prisma.assegnazioneCodiceAutista.findMany({
      where: { padroncinoId, deletedAt: null },
      select: { codiceAutistaId: true },
    });
    const ids = assegnazioni.map((a) => a.codiceAutistaId);

    return this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        codiceAutistaId: { in: ids },
        ...(mese && { mese }),
      },
      include: {
        codiceAutista: { select: { codice: true, nome: true, cognome: true } },
      },
      orderBy: { data: 'desc' },
    });
  }

  // Endpoint per verificare un codice autista prima di inviare
  async verificaCodice(codice: string) {
    const ca = await this.prisma.codiceAutista.findFirst({
      where: { codice: codice.trim().toUpperCase(), deletedAt: null },
    });

    if (!ca) {
      return { found: false, codice, padroncino: null };
    }

    const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId: ca.id, deletedAt: null, dataFine: null },
      include: { padroncino: { select: { id: true, ragioneSociale: true } } },
    });

    return {
      found: true,
      codice: ca.codice,
      id: ca.id,
      nome: ca.nome,
      cognome: ca.cognome,
      padroncino: assegnazione?.padroncino ?? null,
    };
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.acconto.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Acconto non trovato');

    await this.prisma.acconto.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      userId, entityType: 'acconto', entityId: id, azione: 'DELETE',
    });
    return { deleted: true };
  }
}
