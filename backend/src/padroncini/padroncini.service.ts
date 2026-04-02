import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class PadronciniService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── LIST ────────────────────────────────────────────────────────

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
        },
      }),
      this.prisma.padroncino.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        mezziAssegnati: p.assegnazioniMezzi.map((a) => ({
          id: a.id,
          mezzoId: a.mezzo.id,
          targa: a.mezzo.targa,
          dataFine: null,
        })),
        palmariAssegnati: p.assegnazioniPalmari.map((a) => ({
          id: a.id,
          palmareId: a.palmare.id,
          codice: a.palmare.codice,
          dataFine: null,
        })),
        codiciAutista: p.codiciAutista.map((a) => ({
          id: a.id,
          codiceId: a.codiceAutista.id,
          codice: a.codiceAutista.codice,
          dataFine: null,
        })),
        conteggiCount: 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── STATS ───────────────────────────────────────────────────────

  async getStats() {
    const [attivi, dismissi, palmariTot, palmariAss, mezziDisp, alertDocs] = await Promise.all([
      this.prisma.padroncino.count({ where: { deletedAt: null, attivo: true } }),
      this.prisma.padroncino.count({ where: { deletedAt: null, attivo: false } }),
      this.prisma.palmare.count({ where: { deletedAt: null } }),
      this.prisma.palmare.count({ where: { deletedAt: null, stato: 'ASSEGNATO' } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'DISPONIBILE' } }),
      this.prisma.padroncino.count({
        where: {
          deletedAt: null,
          attivo: true,
          OR: [
            { scadenzaDurc: { lte: new Date() } },
            { scadenzaDvr: { lte: new Date() } },
          ],
        },
      }),
    ]);

    return {
      attivi,
      dismissi,
      totali: attivi + dismissi,
      alertDocumenti: alertDocs,
      flottaMezzi: 0,
      flottaDisponibili: mezziDisp,
      palmariAttivi: palmariAss,
      palmariTotali: palmariTot,
    };
  }

  // ─── DETAIL ──────────────────────────────────────────────────────

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
                alimentazione: true, canoneNoleggio: true,
              },
            },
          },
          orderBy: { dataInizio: 'desc' },
        },
        assegnazioniPalmari: {
          where: { deletedAt: null },
          include: { palmare: { select: { id: true, codice: true, tariffaMensile: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        codiciAutista: {
          where: { deletedAt: null },
          include: {
            codiceAutista: { select: { id: true, codice: true, nome: true, cognome: true } },
          },
          orderBy: { dataInizio: 'desc' },
        },
        conteggiMensili: { orderBy: { mese: 'desc' }, take: 12 },
        // tags, noteEntita, documenti rimossi: relazioni polimorfiche eliminate dallo schema
        // i documenti vengono caricati separatamente via $queryRaw
      },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const documenti = await this.getDocumenti(id);

    return {
      ...padroncino,
      documenti,
      mezziAssegnati: padroncino.assegnazioniMezzi.map((a) => ({
        id: a.id,
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
        id: a.id,
        palmareId: a.palmare.id,
        codice: a.palmare.codice,
        tariffa: Number(a.palmare.tariffaMensile ?? 0),
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
      codiciAutista: padroncino.codiciAutista.map((a) => ({
        id: a.id,
        codiceId: a.codiceAutista.id,
        codice: a.codiceAutista.codice,
        nome: a.codiceAutista.nome,
        cognome: a.codiceAutista.cognome,
        dataInizio: a.dataInizio,
        dataFine: a.dataFine,
      })),
    };
  }

  // ─── CRUD ────────────────────────────────────────────────────────

  async create(dto: CreatePadroncinoDto, userId: string) {
    const p = await this.prisma.padroncino.create({ data: dto as any });
    await this.audit.log({ userId, entityType: 'padroncino', entityId: p.id, azione: 'CREATE', dataDopo: p as any });
    return p;
  }

  async update(id: string, dto: UpdatePadroncinoDto, userId: string) {
    const ex = await this.prisma.padroncino.findFirst({ where: { id, deletedAt: null } });
    if (!ex) throw new NotFoundException('Padroncino non trovato');
    const up = await this.prisma.padroncino.update({ where: { id }, data: dto as any });
    await this.audit.log({ userId, entityType: 'padroncino', entityId: id, azione: 'UPDATE', dataPrima: ex as any, dataDopo: up as any });
    return up;
  }

  async remove(id: string, userId: string) {
    const ex = await this.prisma.padroncino.findFirst({ where: { id, deletedAt: null } });
    if (!ex) throw new NotFoundException('Padroncino non trovato');
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
        deletedAt: null, attivo: true,
        OR: [{ scadenzaDurc: { lte: limite } }, { scadenzaDvr: { lte: limite } }],
      },
      select: { id: true, ragioneSociale: true, scadenzaDurc: true, scadenzaDvr: true },
    });
  }

  // ─── ASSEGNAZIONE MEZZO ──────────────────────────────────────────

  async assegnaMezzo(padroncinoId: string, mezzoId: string, dataInizio: string, userId: string) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const mezzo = await this.prisma.mezzo.findFirst({ where: { id: mezzoId, deletedAt: null } });
    if (!mezzo) throw new NotFoundException('Mezzo non trovato');

    const attiva = await this.prisma.assegnazioneMezzo.findFirst({ where: { mezzoId, deletedAt: null, dataFine: null } });
    if (attiva) {
      await this.prisma.assegnazioneMezzo.update({ where: { id: attiva.id }, data: { dataFine: new Date(dataInizio) } });
    }

    const nuova = await this.prisma.assegnazioneMezzo.create({
      data: { mezzoId, padroncinoId, dataInizio: new Date(dataInizio) },
      include: { mezzo: { select: { targa: true } } },
    });

    // ✅ Stato mezzo → ASSEGNATO
    await this.prisma.mezzo.update({ where: { id: mezzoId }, data: { stato: 'ASSEGNATO' } });

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: nuova.id, azione: 'ASSEGNA',
      dataDopo: { targa: nuova.mezzo.targa, padroncinoId, ragioneSociale: padroncino.ragioneSociale, dataInizio } as any,
    });
    return nuova;
  }

  async rimuoviMezzo(padroncinoId: string, assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, padroncinoId, deletedAt: null },
      include: { mezzo: { select: { id: true, targa: true } }, padroncino: { select: { ragioneSociale: true } } },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    await this.prisma.assegnazioneMezzo.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date(), deletedAt: new Date() },
    });

    // ✅ Stato mezzo → DISPONIBILE se nessuna altra assegnazione attiva
    const altre = await this.prisma.assegnazioneMezzo.count({
      where: { mezzoId: ass.mezzo.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
    });
    if (altre === 0) {
      await this.prisma.mezzo.update({ where: { id: ass.mezzo.id }, data: { stato: 'DISPONIBILE' } });
    }

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazioneId, azione: 'CHIUDI_ASSEGNAZIONE',
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

    const attiva = await this.prisma.assegnazionePalmare.findFirst({ where: { palmareId, deletedAt: null, dataFine: null } });
    if (attiva) {
      await this.prisma.assegnazionePalmare.update({ where: { id: attiva.id }, data: { dataFine: new Date(dataInizio) } });
    }

    const nuova = await this.prisma.assegnazionePalmare.create({
      data: { palmareId, padroncinoId, dataInizio: new Date(dataInizio) },
      include: { palmare: { select: { codice: true } } },
    });

    // ✅ Stato palmare → ASSEGNATO
    await this.prisma.palmare.update({ where: { id: palmareId }, data: { stato: 'ASSEGNATO' } });

    await this.audit.log({
      userId, entityType: 'assegnazione_palmare', entityId: nuova.id, azione: 'ASSEGNA',
      dataDopo: { codicePalmare: nuova.palmare.codice, padroncinoId, ragioneSociale: padroncino.ragioneSociale, dataInizio } as any,
    });
    return nuova;
  }

  async rimuoviPalmare(padroncinoId: string, assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazionePalmare.findFirst({
      where: { id: assegnazioneId, padroncinoId, deletedAt: null },
      include: { palmare: { select: { id: true, codice: true } }, padroncino: { select: { ragioneSociale: true } } },
    });
    if (!ass) throw new NotFoundException('Assegnazione palmare non trovata');

    await this.prisma.assegnazionePalmare.update({
      where: { id: assegnazioneId },
      data: { dataFine: new Date(), deletedAt: new Date() },
    });

    // ✅ Stato palmare → DISPONIBILE se nessuna altra assegnazione attiva
    const altre = await this.prisma.assegnazionePalmare.count({
      where: { palmareId: ass.palmare.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
    });
    if (altre === 0) {
      await this.prisma.palmare.update({ where: { id: ass.palmare.id }, data: { stato: 'DISPONIBILE' } });
    }

    await this.audit.log({
      userId, entityType: 'assegnazione_palmare', entityId: assegnazioneId, azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { codicePalmare: ass.palmare.codice, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });
    return { deleted: true };
  }

  // ─── ASSEGNAZIONE CODICE AUTISTA ─────────────────────────────────
  // Stesse funzionalità di mezzi e palmari.
  // CodiceAutista non ha campo "stato" nel DB → lo stato è derivato
  // dall'esistenza di un'assegnazione attiva (dataFine null).
  // Nelle pagine Codici Autisti e Palmari, il badge ASSEGNATO/DISPONIBILE
  // viene calcolato lato frontend/backend in base alle assegnazioni.

  async assegnaCodice(padroncinoId: string, codiceAutistaId: string, dataInizio: string, userId: string) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const ca = await this.prisma.codiceAutista.findFirst({ where: { id: codiceAutistaId, deletedAt: null } });
    if (!ca) throw new NotFoundException('Codice autista non trovato');

    // Chiudi eventuale assegnazione attiva del codice (anche se ad altro padroncino)
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
      userId, entityType: 'assegnazione_codice_autista', entityId: nuova.id, azione: 'ASSEGNA',
      dataDopo: { codiceAutista: nuova.codiceAutista.codice, padroncinoId, ragioneSociale: padroncino.ragioneSociale, dataInizio } as any,
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
      userId, entityType: 'assegnazione_codice_autista', entityId: assegnazioneId, azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: { codiceAutista: ass.codiceAutista.codice, ragioneSociale: ass.padroncino.ragioneSociale } as any,
    });
    return { deleted: true };
  }

  // ─── DOCUMENTI (via $queryRaw — FK polimorfici rimossi dal DB) ───

  async getDocumenti(padroncinoId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id, entity_type, entity_id, nome, tipo, file_path,
             mime_type, dimensione, scadenza, note, created_at, updated_at
      FROM documenti
      WHERE entity_id   = ${padroncinoId}
        AND entity_type = 'padroncino'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      nome: r.nome,
      tipo: r.tipo,
      filePath: r.file_path,
      mimeType: r.mime_type,
      dimensione: r.dimensione != null ? Number(r.dimensione) : null,
      scadenza: r.scadenza ? new Date(r.scadenza).toISOString() : null,
      note: r.note,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }));
  }

  async addDocumento(
    padroncinoId: string,
    data: {
      nome: string;
      tipo: string;
      filePath: string;
      mimeType?: string;
      dimensione?: number;
      scadenza?: string;
      note?: string;
    },
    userId: string,
  ) {
    const padroncino = await this.prisma.padroncino.findFirst({ where: { id: padroncinoId, deletedAt: null } });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const newId      = randomUUID();
    const now        = new Date();
    const scad       = data.scadenza ? new Date(data.scadenza) : null;
    const mimeType   = data.mimeType   ?? null;
    const dimensione = data.dimensione != null ? data.dimensione : null;
    const noteVal    = data.note       ?? null;

    await this.prisma.$executeRaw`
      INSERT INTO documenti
        (id, entity_type, entity_id, nome, tipo, file_path,
         mime_type, dimensione, scadenza, note, created_at, updated_at)
      VALUES
        (${newId}, 'padroncino', ${padroncinoId}, ${data.nome}, ${data.tipo},
         ${data.filePath}, ${mimeType}, ${dimensione}, ${scad},
         ${noteVal}, ${now}, ${now})
    `;

    const tipoNorm = data.tipo?.toUpperCase?.();
    if (tipoNorm === 'DURC') {
      await this.prisma.padroncino.update({
        where: { id: padroncinoId },
        data: { scadenzaDurc: scad },
      });
    } else if (tipoNorm === 'DVR') {
      await this.prisma.padroncino.update({
        where: { id: padroncinoId },
        data: { scadenzaDvr: scad, dvrEsente: false },
      });
    }

    await this.audit.log({
      userId, entityType: 'documento', entityId: newId, azione: 'CREATE',
      dataDopo: { nome: data.nome, tipo: data.tipo, padroncinoId } as any,
    });

    return {
      id: newId,
      nome: data.nome,
      tipo: data.tipo,
      filePath: data.filePath,
      mimeType: data.mimeType ?? null,
      dimensione: data.dimensione ?? null,
      scadenza: data.scadenza ?? null,
      createdAt: now.toISOString(),
    };
  }

  async removeDocumento(padroncinoId: string, documentoId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id, nome FROM documenti
      WHERE id          = ${documentoId}
        AND entity_id   = ${padroncinoId}
        AND entity_type = 'padroncino'
        AND deleted_at IS NULL
    `;
    if (!rows || rows.length === 0) throw new NotFoundException('Documento non trovato');

    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE documenti
      SET deleted_at = ${now}, updated_at = ${now}
      WHERE id = ${documentoId}
    `;

    await this.audit.log({
      userId, entityType: 'documento', entityId: documentoId, azione: 'DELETE',
      dataDopo: { nome: rows[0].nome, padroncinoId } as any,
    });
    return { deleted: true };
  }
}
