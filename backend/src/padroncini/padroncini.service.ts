import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PadronciniService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: QueryPadronciniDto) {
    // Estraiamo i parametri, ignoriamo 'include' nella logica se vogliamo 
    // mantenere il controllo totale sulle relazioni caricate qui sotto.
    const { search, attivo, page = 1, limit = 50 } = query;

    const where: Prisma.PadroncinoWhereInput = {
      deletedAt: null,
      ...(attivo !== undefined && { attivo }),
      ...(search && {
        OR: [
          { ragioneSociale: { contains: search, mode: 'insensitive' } },
          { partitaIva: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.padroncino.findMany({
        where,
        include: {
          assegnazioniMezzi: {
            where: { deletedAt: null, dataFine: null }, // Solo quelli attivi
            include: {
              mezzo: {
                select: { id: true, targa: true, marca: true, modello: true, alimentazione: true },
              },
            },
          },
          assegnazioniPalmari: {
            where: { deletedAt: null, dataFine: null }, // Solo quelli attivi
            include: {
              palmare: { select: { id: true, codice: true, tariffaMensile: true } },
            },
          },
          codiciAutista: {
            where: { deletedAt: null, dataFine: null }, // Solo quelli attivi
            include: {
              codiceAutista: { select: { id: true, codice: true, nome: true, cognome: true } },
            },
          },
          _count: { 
            select: { conteggiMensili: true } 
          },
        },
        orderBy: { ragioneSociale: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.padroncino.count({ where }),
    ]);

    // Mapping pulito dei dati per il frontend
    const mappedData = data.map((p) => ({
      ...p, // Copia tutte le proprietà base (ragioneSociale, indirizzo, ecc.)
      
      // Trasformiamo le relazioni in array più semplici e piatti
      mezziAssegnati: p.assegnazioniMezzi.map((a) => ({
        ...a.mezzo,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      
      palmariAssegnati: p.assegnazioniPalmari.map((a) => ({
        id: a.palmare.id,
        codice: a.palmare.codice,
        tariffa: Number(a.palmare.tariffaMensile ?? 0),
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      
      codiciAutista: p.codiciAutista.map((a) => ({
        ...a.codiceAutista,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      
      // Pulizia dei nomi per il conteggio
      conteggiCount: p._count.conteggiMensili,
      
      // Rimuoviamo le proprietà originali di Prisma che non servono più al frontend
      assegnazioniMezzi: undefined,
      assegnazioniPalmari: undefined,
      _count: undefined,
    }));

    return { 
      data: mappedData, 
      total, 
      page, 
      limit, 
      totalPages: Math.ceil(total / limit) 
    };
  }

  async getStats() {
    const oggi = new Date();
    const tra30gg = new Date();
    tra30gg.setDate(oggi.getDate() + 30);

    const [attivi, totali, flottaMezzi, flottaDisponibili, palmariAttivi, palmariTotali,
      durcScaduti, dvrAssenti] = await Promise.all([
      this.prisma.padroncino.count({ where: { deletedAt: null, attivo: true } }),
      this.prisma.padroncino.count({ where: { deletedAt: null } }),
      this.prisma.mezzo.count({ where: { deletedAt: null } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'DISPONIBILE' } }),
      this.prisma.palmare.count({ where: { deletedAt: null, stato: 'ASSEGNATO' } }),
      this.prisma.palmare.count({ where: { deletedAt: null } }),
      // DURC scaduti o in scadenza entro 30gg
      this.prisma.padroncino.count({
        where: {
          deletedAt: null, attivo: true,
          OR: [
            { scadenzaDurc: null },
            { scadenzaDurc: { lte: tra30gg } },
          ],
        },
      }),
      // DVR assente
      this.prisma.padroncino.count({
        where: { deletedAt: null, attivo: true, scadenzaDvr: null },
      }),
    ]);

    return {
      attivi,
      dismissi: totali - attivi,
      totali,
      alertDocumenti: durcScaduti + dvrAssenti,
      flottaMezzi,
      flottaDisponibili,
      palmariAttivi,
      palmariTotali,
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
              select: {
                id: true, targa: true, marca: true, modello: true,
                alimentazione: true, rataNoleggio: true, canoneNoleggio: true,
              },
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
        id: a.mezzo.id,
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
        id: a.palmare.id,
        codice: a.palmare.codice,
        tariffa: Number(a.palmare.tariffaMensile ?? 0),
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      codiciAutista: padroncino.codiciAutista.map((a) => ({
        id: a.codiceAutista.id,
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
}
