import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';

@Injectable()
export class PadronciniService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: QueryPadronciniDto) {
    const { search, attivo, page = 1, limit = 20 } = query as any;
    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { ragioneSociale: { contains: search, mode: 'insensitive' } },
        { partitaIva: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (attivo !== undefined) where.attivo = attivo === 'true';

    const [data, total] = await Promise.all([
      this.prisma.padroncino.findMany({
        where,
        orderBy: { ragioneSociale: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assegnazioniMezzi: {
            where: { deletedAt: null, dataFine: null },
            include: { mezzo: { select: { id: true, targa: true } } },
          },
          assegnazioniPalmari: {
            where: { deletedAt: null, dataFine: null },
            include: { palmare: { select: { id: true, codice: true } } },
          },
          codiciAutista: {
            where: { deletedAt: null, dataFine: null },
            include: { codiceAutista: { select: { id: true, codice: true } } },
          },
          _count: { select: { conteggiMensili: true } },
        },
      }),
      this.prisma.padroncino.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        conteggiCount: p._count.conteggiMensili,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats() {
    const [totali, dismissi, alertDocs, flottaActive, palmariActive] = await Promise.all([
      this.prisma.padroncino.count({ where: { deletedAt: null } }),
      this.prisma.padroncino.count({ where: { deletedAt: null, attivo: false } }),
      this.prisma.padroncino.count({
        where: {
          deletedAt: null,
          attivo: true,
          OR: [
            { scadenzaDurc: { lte: new Date(Date.now() + 30 * 86400000) } },
            { scadenzaDvr: { lte: new Date(Date.now() + 30 * 86400000) } },
          ],
        },
      }),
      this.prisma.assegnazioneMezzo.count({ where: { deletedAt: null, dataFine: null } }),
      this.prisma.assegnazionePalmare.count({ where: { deletedAt: null, dataFine: null } }),
    ]);

    const totalMezzi = await this.prisma.mezzo.count({ where: { deletedAt: null } });
    const totalPalmari = await this.prisma.palmare.count({ where: { deletedAt: null } });

    return {
      attivi: totali - dismissi,
      dismissi,
      totali,
      alertDocumenti: alertDocs,
      flottaMezzi: flottaActive,
      flottaDisponibili: totalMezzi - flottaActive,
      palmariAttivi: palmariActive,
      palmariTotali: totalPalmari,
    };
  }

  async findOne(id: string) {
    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioniMezzi: {
          where: { deletedAt: null },
          include: {
            mezzo: {
              select: { id: true, targa: true, marca: true, modello: true, alimentazione: true, rataNoleggio: true, canoneNoleggio: true },
            },
          },
          orderBy: { dataInizio: 'desc' },
        },
        assegnazioniPalmari: {
          where: { deletedAt: null },
          include: {
            palmare: { select: { id: true, codice: true, tariffaMensile: true } },
          },
          orderBy: { dataInizio: 'desc' },
        },
        codiciAutista: {
          where: { deletedAt: null },
          include: { codiceAutista: true },
          orderBy: { dataInizio: 'desc' },
        },
        conteggiMensili: { orderBy: { mese: 'desc' }, take: 12 },
        documenti: { where: { deletedAt: null } },
        tags: true,
        noteEntita: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    return {
      ...padroncino,
      mezziAssegnati: padroncino.assegnazioniMezzi.map((a) => ({
        id: a.id, // ID assegnazione (per rimuovi)
        mezzoId: a.mezzo.id,
        targa: a.mezzo.targa,
        marca: a.mezzo.marca,
        modello: a.mezzo.modello,
        alimentazione: a.mezzo.alimentazione,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
        tariffa: a.mezzo.canoneNoleggio ? Number(a.mezzo.canoneNoleggio) : null,
        tariffaIvata: a.mezzo.canoneNoleggio ? Number(a.mezzo.canoneNoleggio) * 1.22 : null,
      })),
      palmariAssegnati: padroncino.assegnazioniPalmari.map((a) => ({
        id: a.id, // ID assegnazione
        palmareId: a.palmare.id,
        codice: a.palmare.codice,
        tariffa: Number(a.palmare.tariffaMensile ?? 0),
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      codiciAutista: padroncino.codiciAutista.map((a) => ({
        id: a.id, // ID assegnazione
        codiceId: a.codiceAutista.id,
        codice: a.codiceAutista.codice,
        nome: a.codiceAutista.nome,
        cognome: a.codiceAutista.cognome,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
    };
  }

  async create(dto: CreatePadroncinoDto, userId: string) {
    const padroncino = await this.prisma.padroncino.create({ data: dto as any });
    await this.audit.log({
      userId,
      entityType: 'padroncino',
      entityId: padroncino.id,
      azione: 'CREATE',
      dataDopo: padroncino as any,
    });
    return padroncino;
  }

  async update(id: string, dto: UpdatePadroncinoDto, userId: string) {
    const existing = await this.prisma.padroncino.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Padroncino non trovato');

    const updated = await this.prisma.padroncino.update({ where: { id }, data: dto as any });
    await this.audit.log({
      userId, entityType: 'padroncino', entityId: id,
      azione: 'UPDATE', dataPrima: existing as any, dataDopo: updated as any,
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.padroncino.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Padroncino non trovato');

    await this.prisma.padroncino.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ userId, entityType: 'padroncino', entityId: id, azione: 'DELETE' });
    return { deleted: true };
  }

  async listForSelect() {
    return this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
      orderBy: { ragioneSociale: 'asc' },
    });
  }

  async getScadenze(giorni: number) {
    const limite = new Date();
    limite.setDate(limite.getDate() + giorni);

    return this.prisma.padroncino.findMany({
      where: {
        deletedAt: null,
        attivo: true,
        OR: [
          { scadenzaDurc: { lte: limite } },
          { scadenzaDvr: { lte: limite } },
        ],
      },
      select: {
        id: true, ragioneSociale: true, scadenzaDurc: true, scadenzaDvr: true,
      },
    });
  }

  // ─── ASSEGNAZIONE MEZZO ──────────────────────────────────────────

  async assegnaMezzo(padroncinoId: string, mezzoId: string, dataInizio: string, userId: string) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const mezzo = await this.prisma.mezzo.findFirst({ where: { id: mezzoId, deletedAt: null } });
    if (!mezzo) throw new NotFoundException('Mezzo non trovato');

    // Chiudi eventuale assegnazione attiva di questo mezzo
    const assegnazioneAttiva = await this.prisma.assegnazioneMezzo.findFirst({
      where: { mezzoId, deletedAt: null, dataFine: null },
    });
    if (assegnazioneAttiva) {
      await this.prisma.assegnazioneMezzo.update({
        where: { id: assegnazioneAttiva.id },
        data: { dataFine: new Date(dataInizio) },
      });
    }

    const nuova = await this.prisma.assegnazioneMezzo.create({
      data: { mezzoId, padroncinoId, dataInizio: new Date(dataInizio) },
      include: { mezzo: { select: { targa: true } } },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_mezzo',
      entityId: nuova.id,
      azione: 'ASSEGNA',
      dataDopo: {
        targa: nuova.mezzo.targa,
        padroncinoId,
        ragioneSociale: padroncino.ragioneSociale,
        dataInizio,
      } as any,
    });

    return nuova;
  }

  async rimuoviMezzo(padroncinoId: string, assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, padroncinoId, deletedAt: null },
      include: { mezzo: { select: { targa: true } }, padroncino: { select: { ragioneSociale: true } } },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    await this.prisma.assegnazioneMezzo.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date(), deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_mezzo',
      entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { targa: ass.mezzo.targa, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });

    return { deleted: true };
  }

  // ─── ASSEGNAZIONE PALMARE ────────────────────────────────────────

  async assegnaPalmare(padroncinoId: string, palmareId: string, dataInizio: string, userId: string) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const palmare = await this.prisma.palmare.findFirst({ where: { id: palmareId, deletedAt: null } });
    if (!palmare) throw new NotFoundException('Palmare non trovato');

    // Chiudi eventuale assegnazione attiva del palmare
    const attiva = await this.prisma.assegnazionePalmare.findFirst({
      where: { palmareId, deletedAt: null, dataFine: null },
    });
    if (attiva) {
      await this.prisma.assegnazionePalmare.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dataInizio) },
      });
    }

    const nuova = await this.prisma.assegnazionePalmare.create({
      data: { palmareId, padroncinoId, dataInizio: new Date(dataInizio) },
      include: { palmare: { select: { codice: true } } },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_palmare',
      entityId: nuova.id,
      azione: 'ASSEGNA',
      dataDopo: {
        codicePalmare: nuova.palmare.codice,
        padroncinoId,
        ragioneSociale: padroncino.ragioneSociale,
        dataInizio,
      } as any,
    });

    return nuova;
  }

  async rimuoviPalmare(padroncinoId: string, assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazionePalmare.findFirst({
      where: { id: assegnazioneId, padroncinoId, deletedAt: null },
      include: { palmare: { select: { codice: true } }, padroncino: { select: { ragioneSociale: true } } },
    });
    if (!ass) throw new NotFoundException('Assegnazione palmare non trovata');

    await this.prisma.assegnazionePalmare.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date(), deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_palmare',
      entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { codicePalmare: ass.palmare.codice, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });

    return { deleted: true };
  }

  // ─── ASSEGNAZIONE CODICE AUTISTA ─────────────────────────────────

  async assegnaCodice(padroncinoId: string, codiceAutistaId: string, dataInizio: string, userId: string) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const ca = await this.prisma.codiceAutista.findFirst({ where: { id: codiceAutistaId, deletedAt: null } });
    if (!ca) throw new NotFoundException('Codice autista non trovato');

    // Chiudi eventuale assegnazione attiva di questo codice
    const attiva = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { codiceAutistaId, deletedAt: null, dataFine: null },
    });
    if (attiva) {
      await this.prisma.assegnazioneCodiceAutista.update({
        where: { id: attiva.id },
        data: { dataFine: new Date(dataInizio) },
      });
    }

    const nuova = await this.prisma.assegnazioneCodiceAutista.create({
      data: { codiceAutistaId, padroncinoId, dataInizio: new Date(dataInizio) },
      include: { codiceAutista: { select: { codice: true } } },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_codice_autista',
      entityId: nuova.id,
      azione: 'ASSEGNA',
      dataDopo: {
        codiceAutista: nuova.codiceAutista.codice,
        padroncinoId,
        ragioneSociale: padroncino.ragioneSociale,
        dataInizio,
      } as any,
    });

    return nuova;
  }

  async rimuoviCodice(padroncinoId: string, assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazioneCodiceAutista.findFirst({
      where: { id: assegnazioneId, padroncinoId, deletedAt: null },
      include: { codiceAutista: { select: { codice: true } }, padroncino: { select: { ragioneSociale: true } } },
    });
    if (!ass) throw new NotFoundException('Assegnazione codice autista non trovata');

    await this.prisma.assegnazioneCodiceAutista.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date(), deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      entityType: 'assegnazione_codice_autista',
      entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { codiceAutista: ass.codiceAutista.codice, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });

    return { deleted: true };
  }
}
