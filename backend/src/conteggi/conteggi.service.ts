import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConteggioDto, UpdateConteggioStatoDto, CreateRigaDto, UpdateRigaDto } from './conteggi.dto';
import { Segno } from '@prisma/client';

@Injectable()
export class ConteggiService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── LIST ───────────────────────────────────────────
  async findAll(mese?: string, padroncinoId?: string) {
    return this.prisma.conteggioMensile.findMany({
      where: {
        deletedAt: null,
        ...(mese && { mese }),
        ...(padroncinoId && { padroncinoId }),
      },
      include: {
        padroncino: { select: { id: true, ragioneSociale: true } },
        righe: { orderBy: { ordine: 'asc' } },
        _count: { select: { righe: true } },
      },
      orderBy: [{ mese: 'desc' }, { padroncino: { ragioneSociale: 'asc' } }],
    });
  }

  // ─── DETAIL ─────────────────────────────────────────
  async findOne(id: string) {
    const conteggio = await this.prisma.conteggioMensile.findFirst({
      where: { id, deletedAt: null },
      include: {
        padroncino: true,
        righe: { orderBy: { ordine: 'asc' } },
      },
    });
    if (!conteggio) throw new NotFoundException('Conteggio non trovato');
    return conteggio;
  }

  // ─── DETTAGLIO CON TOTALI ───────────────────────────
  async findOneWithTotals(id: string) {
    const conteggio = await this.findOne(id);

    const totalePositivo = conteggio.righe
      .filter((r) => r.segno === 'POSITIVO')
      .reduce((sum, r) => sum + Number(r.importo), 0);

    const totaleNegativo = conteggio.righe
      .filter((r) => r.segno === 'NEGATIVO')
      .reduce((sum, r) => sum + Number(r.importo), 0);

    return {
      ...conteggio,
      totalePositivo,
      totaleNegativo,
      netto: totalePositivo - totaleNegativo,
    };
  }

  // ─── CREATE + AUTO-GENERATION ───────────────────────
  async create(dto: CreateConteggioDto, userId: string) {
    // Verifica padroncino
    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id: dto.padroncinoId, deletedAt: null },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    // Verifica unicità mese/padroncino
    const exists = await this.prisma.conteggioMensile.findUnique({
      where: {
        padroncinoId_mese: { padroncinoId: dto.padroncinoId, mese: dto.mese },
      },
    });
    if (exists) throw new BadRequestException('Conteggio già esistente per questo mese');

    // Crea conteggio
    const conteggio = await this.prisma.conteggioMensile.create({
      data: {
        padroncinoId: dto.padroncinoId,
        mese: dto.mese,
        note: dto.note,
      },
    });

    // Auto-genera righe
    await this.generaRigheAutomatiche(conteggio.id, dto.padroncinoId, dto.mese);

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: conteggio.id,
      azione: 'CREATE',
      dataDopo: { mese: dto.mese, padroncino: padroncino.ragioneSociale } as any,
    });

    return this.findOneWithTotals(conteggio.id);
  }

  // ─── GENERAZIONE AUTOMATICA RIGHE ───────────────────
  private async generaRigheAutomatiche(
    conteggioId: string,
    padroncinoId: string,
    mese: string,
  ) {
    const inizioMese = new Date(`${mese}-01`);
    const fineMese = new Date(inizioMese.getFullYear(), inizioMese.getMonth() + 1, 0);
    let ordine = 0;

    // 1. MEZZI ASSEGNATI → costi noleggio
    const assegnazioniMezzi = await this.prisma.assegnazioneMezzo.findMany({
      where: {
        padroncinoId,
        deletedAt: null,
        dataInizio: { lte: fineMese },
        OR: [{ dataFine: null }, { dataFine: { gte: inizioMese } }],
      },
      include: {
        mezzo: { select: { id: true, targa: true, marca: true, modello: true, rataNoleggio: true } },
      },
    });

    for (const ass of assegnazioniMezzi) {
      if (ass.mezzo.rataNoleggio && Number(ass.mezzo.rataNoleggio) > 0) {
        await this.prisma.conteggiRiga.create({
          data: {
            conteggioMensileId: conteggioId,
            tipo: 'NOLEGGIO',
            descrizione: `Noleggio ${ass.mezzo.targa} - ${ass.mezzo.marca} ${ass.mezzo.modello}`,
            importo: ass.mezzo.rataNoleggio,
            segno: 'NEGATIVO',
            categoria: 'noleggio',
            riferimentoTipo: 'mezzo',
            riferimentoId: ass.mezzo.id,
            ordine: ordine++,
          },
        });
      }
    }

    // 2. PALMARI ASSEGNATI → costi tariffa
    const assegnazioniPalmari = await this.prisma.assegnazionePalmare.findMany({
      where: {
        padroncinoId,
        deletedAt: null,
        dataInizio: { lte: fineMese },
        OR: [{ dataFine: null }, { dataFine: { gte: inizioMese } }],
      },
      include: {
        palmare: { select: { id: true, codice: true, tariffaMensile: true } },
      },
    });

    for (const ass of assegnazioniPalmari) {
      if (ass.palmare.tariffaMensile && Number(ass.palmare.tariffaMensile) > 0) {
        await this.prisma.conteggiRiga.create({
          data: {
            conteggioMensileId: conteggioId,
            tipo: 'PALMARE',
            descrizione: `Palmare ${ass.palmare.codice}`,
            importo: ass.palmare.tariffaMensile,
            segno: 'NEGATIVO',
            categoria: 'palmari',
            riferimentoTipo: 'palmare',
            riferimentoId: ass.palmare.id,
            ordine: ordine++,
          },
        });
      }
    }

    // 3. ACCONTI del mese → addebiti
    const codiciAutista = await this.prisma.assegnazioneCodiceAutista.findMany({
      where: {
        padroncinoId,
        deletedAt: null,
        dataInizio: { lte: fineMese },
        OR: [{ dataFine: null }, { dataFine: { gte: inizioMese } }],
      },
      select: { codiceAutistaId: true },
    });

    const codiciIds = codiciAutista.map((a) => a.codiceAutistaId);

    if (codiciIds.length > 0) {
      const acconti = await this.prisma.acconto.findMany({
        where: {
          deletedAt: null,
          codiceAutistaId: { in: codiciIds },
          mese,
        },
        include: {
          codiceAutista: { select: { codice: true, nome: true, cognome: true } },
        },
      });

      for (const acc of acconti) {
        const nomeAutista = [acc.codiceAutista.nome, acc.codiceAutista.cognome]
          .filter(Boolean)
          .join(' ') || acc.codiceAutista.codice;

        await this.prisma.conteggiRiga.create({
          data: {
            conteggioMensileId: conteggioId,
            tipo: 'ACCONTO',
            descrizione: `Acconto ${nomeAutista} - ${acc.descrizione || acc.data.toLocaleDateString('it-IT')}`,
            importo: acc.importo,
            segno: 'NEGATIVO',
            categoria: 'acconti',
            riferimentoTipo: 'acconto',
            riferimentoId: acc.id,
            ordine: ordine++,
          },
        });
      }
    }

    // 4. RICARICHE ELETTRICHE del mese
    const ricariche = await this.prisma.ricaricaElettrica.findMany({
      where: {
        deletedAt: null,
        padroncinoId,
        mese,
      },
    });

    for (const ric of ricariche) {
      await this.prisma.conteggiRiga.create({
        data: {
          conteggioMensileId: conteggioId,
          tipo: 'RICARICA',
          descrizione: `Ricarica ${ric.fornitore || 'elettrica'} - ${ric.data.toLocaleDateString('it-IT')}`,
          importo: ric.importo,
          segno: 'NEGATIVO',
          categoria: 'ricariche',
          ordine: ordine++,
        },
      });
    }
  }

  // ─── AGGIORNA STATO ─────────────────────────────────
  async updateStato(id: string, dto: UpdateConteggioStatoDto, userId: string) {
    const conteggio = await this.findOne(id);

    if (conteggio.stato === 'CONFERMATO' && dto.stato !== 'CONFERMATO') {
      throw new BadRequestException('Un conteggio confermato non può essere riaperto');
    }

    const updated = await this.prisma.conteggioMensile.update({
      where: { id },
      data: { stato: dto.stato },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: { stato: conteggio.stato } as any,
      dataDopo: { stato: dto.stato } as any,
    });

    return updated;
  }

  // ─── CRUD RIGHE ─────────────────────────────────────
  async addRiga(conteggioId: string, dto: CreateRigaDto, userId: string) {
    const conteggio = await this.findOne(conteggioId);
    if (conteggio.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    const maxOrdine = await this.prisma.conteggiRiga.aggregate({
      where: { conteggioMensileId: conteggioId },
      _max: { ordine: true },
    });

    const riga = await this.prisma.conteggiRiga.create({
      data: {
        conteggioMensileId: conteggioId,
        ...dto,
        ordine: dto.ordine ?? (maxOrdine._max.ordine || 0) + 1,
        modificaManuale: true,
      },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: riga.id,
      azione: 'CREATE',
      dataDopo: riga as any,
    });

    return riga;
  }

  async updateRiga(rigaId: string, dto: UpdateRigaDto, userId: string) {
    const riga = await this.prisma.conteggiRiga.findUnique({
      where: { id: rigaId },
      include: { conteggioMensile: true },
    });
    if (!riga) throw new NotFoundException('Riga non trovata');
    if (riga.conteggioMensile.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    const updated = await this.prisma.conteggiRiga.update({
      where: { id: rigaId },
      data: { ...dto, modificaManuale: true },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: rigaId,
      azione: 'UPDATE',
      dataPrima: riga as any,
      dataDopo: updated as any,
    });

    return updated;
  }

  async deleteRiga(rigaId: string, userId: string) {
    const riga = await this.prisma.conteggiRiga.findUnique({
      where: { id: rigaId },
      include: { conteggioMensile: true },
    });
    if (!riga) throw new NotFoundException('Riga non trovata');
    if (riga.conteggioMensile.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    await this.prisma.conteggiRiga.delete({ where: { id: rigaId } });

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: rigaId,
      azione: 'DELETE',
      dataPrima: riga as any,
    });

    return { deleted: true };
  }

  // ─── RIGENERA RIGHE AUTO ────────────────────────────
  async rigeneraRigheAuto(conteggioId: string, userId: string) {
    const conteggio = await this.findOne(conteggioId);
    if (conteggio.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi rigenerare un conteggio confermato');
    }

    // Rimuovi solo righe NON modificate manualmente
    await this.prisma.conteggiRiga.deleteMany({
      where: {
        conteggioMensileId: conteggioId,
        modificaManuale: false,
      },
    });

    // Rigenera
    await this.generaRigheAutomatiche(conteggioId, conteggio.padroncinoId, conteggio.mese);

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: conteggioId,
      azione: 'UPDATE',
      dataDopo: { azione: 'rigenerazione_righe_automatiche' } as any,
    });

    return this.findOneWithTotals(conteggioId);
  }

  // ─── SOFT DELETE ────────────────────────────────────
  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.conteggioMensile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      userId, entityType: 'conteggio_mensile', entityId: id, azione: 'DELETE',
    });
    return { deleted: true };
  }

  // ─── GENERA CONTEGGI BULK PER MESE ──────────────────
  async generaBulk(mese: string, userId: string) {
    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati: { padroncino: string; stato: string; id?: string; errore?: string }[] = [];
    for (const p of padroncini) {
      try {
        const conteggio = await this.create(
          { padroncinoId: p.id, mese },
          userId,
        );
        risultati.push({ padroncino: p.ragioneSociale, stato: 'creato', id: conteggio.id });
      } catch (err: any) {
        risultati.push({ padroncino: p.ragioneSociale, stato: 'errore', errore: err.message });
      }
    }

    return risultati;
  }
}
