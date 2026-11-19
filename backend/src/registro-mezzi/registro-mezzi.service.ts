import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normTarga, riconosci } from './registro-parser';
import { CreateRegistroMezzoDto, UpdateRegistroMezzoDto } from './registro-mezzi.dto';

const INCLUDE = {
  mezzo: { select: { id: true, targa: true, marca: true, modello: true } },
  padroncino: { select: { id: true, ragioneSociale: true } },
} as const;

/**
 * Registro verbali / franchigie / rifatturazioni per mezzo.
 *
 * Le voci automatiche si sincronizzano dagli ADDEBITI dei conteggi che contengono una targa:
 * il registro LEGGE i conteggi e non li modifica mai. L'importo resta sempre quello del conteggio.
 * Tipo, numero, data e targa riconosciuti si possono correggere a mano: da quel momento la
 * sincronizzazione non li sovrascrive più (modificatoAMano).
 */
@Injectable()
export class RegistroMezziService implements OnApplicationBootstrap {
  private readonly logger = new Logger('RegistroMezzi');

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Al primo avvio (registro vuoto) importa gli addebiti con targa di tutti i conteggi esistenti. */
  async onApplicationBootstrap() {
    try {
      const n = await this.prisma.registroMezzo.count();
      if (n === 0) {
        this.sincronizzaTutti()
          .then((r) => this.logger.log(`Registro mezzi inizializzato dai conteggi: ${r.voci} voci da ${r.conteggi} conteggi`))
          .catch((e) => this.logger.warn(`Inizializzazione registro mezzi non riuscita: ${e?.message ?? e}`));
      }
    } catch (e: any) {
      this.logger.warn(`Registro mezzi non disponibile: ${e?.message ?? e}`);
    }
  }

  private async targheFlotta(): Promise<Map<string, string>> {
    const mezzi = await this.prisma.mezzo.findMany({ where: { deletedAt: null }, select: { id: true, targa: true } });
    return new Map(mezzi.map((m) => [normTarga(m.targa), m.id]));
  }

  /** Versione "sicura" da chiamare dopo ogni salvataggio dei conteggi: un errore qui non blocca mai il conteggio. */
  async sincronizzaConteggioSafe(conteggioId: string | null | undefined) {
    if (!conteggioId) return;
    try {
      await this.sincronizzaConteggio(conteggioId);
    } catch (e: any) {
      this.logger.warn(`Sincronizzazione registro mezzi fallita per il conteggio ${conteggioId}: ${e?.message ?? e}`);
    }
  }

  async sincronizzaConteggio(conteggioId: string, flotta?: Map<string, string>): Promise<number> {
    const conteggio = await this.prisma.conteggioMensile.findUnique({
      where: { id: conteggioId },
      include: { righe: { where: { tipo: 'ADDEBITO' } } },
    });
    const esistenti = await this.prisma.registroMezzo.findMany({ where: { conteggioMensileId: conteggioId, manuale: false } });
    const perRiga = new Map(esistenti.filter((e) => e.conteggioRigaId).map((e) => [e.conteggioRigaId as string, e]));
    const righe = conteggio && !conteggio.deletedAt ? conteggio.righe : [];
    const fl = flotta ?? (await this.targheFlotta());
    const viste = new Set<string>();
    let voci = 0;

    for (const r of righe) {
      viste.add(r.id);
      const ex = perRiga.get(r.id);
      if (ex?.deletedAt) continue; // eliminata dal registro dall'utente: non ricrearla
      const ric = riconosci(r.descrizione, new Set(fl.keys()));
      const targa = ex?.modificatoAMano ? ex.targa : ric.targa;
      if (!targa) {
        if (ex) await this.prisma.registroMezzo.update({ where: { id: ex.id }, data: { deletedAt: new Date() } });
        continue;
      }
      const base: any = {
        conteggioMensileId: conteggioId,
        mese: conteggio!.mese,
        padroncinoId: conteggio!.padroncinoId,
        descrizione: r.descrizione,
        importo: r.importo,
        percIva: r.percIva,
        rigaEliminata: false,
      };
      if (!ex?.modificatoAMano) {
        Object.assign(base, {
          targa: ric.targa,
          mezzoId: fl.get(normTarga(ric.targa!)) ?? null,
          tipo: ric.tipo,
          numero: ric.numero,
          dataEvento: ric.dataEvento,
        });
      }
      if (ex) {
        const cambiato = Object.keys(base).some((k) => {
          const a = (ex as any)[k], b = base[k];
          if (a instanceof Date || b instanceof Date) return (a ? new Date(a).getTime() : null) !== (b ? new Date(b).getTime() : null);
          if (a != null && b != null && typeof a === 'object') return String(a) !== String(b); // Decimal
          return (a ?? null) !== (b ?? null) && String(a ?? '') !== String(b ?? '');
        });
        if (cambiato) await this.prisma.registroMezzo.update({ where: { id: ex.id }, data: base });
      } else {
        await this.prisma.registroMezzo.create({ data: { ...base, conteggioRigaId: r.id } });
      }
      voci++;
    }

    // Righe sparite dal conteggio: se la voce era stata completata a mano la teniamo
    // (segnata "riga eliminata"), altrimenti la togliamo dal registro.
    for (const ex of esistenti) {
      if (ex.deletedAt || !ex.conteggioRigaId || viste.has(ex.conteggioRigaId)) continue;
      const tenere = ex.modificatoAMano || (ex.note ?? '').trim() !== '' || ex.stato !== 'APERTO';
      await this.prisma.registroMezzo.update({
        where: { id: ex.id },
        data: tenere ? { rigaEliminata: true } : { deletedAt: new Date() },
      });
    }
    return voci;
  }

  async sincronizzaTutti() {
    const flotta = await this.targheFlotta();
    const conteggi = await this.prisma.conteggioMensile.findMany({ select: { id: true } });
    let voci = 0;
    for (const c of conteggi) voci += await this.sincronizzaConteggio(c.id, flotta);
    return { conteggi: conteggi.length, voci };
  }

  async findAll(q: { mezzoId?: string; targa?: string; padroncinoId?: string; mese?: string; tipo?: string }) {
    const where: any = { deletedAt: null };
    if (q.mezzoId && q.targa) where.OR = [{ mezzoId: q.mezzoId }, { targa: normTarga(q.targa) }];
    else if (q.mezzoId) where.mezzoId = q.mezzoId;
    else if (q.targa) where.targa = normTarga(q.targa);
    if (q.padroncinoId) where.padroncinoId = q.padroncinoId;
    if (q.mese) where.mese = q.mese;
    if (q.tipo) where.tipo = q.tipo;
    return this.prisma.registroMezzo.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ mese: 'desc' }, { dataEvento: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async getOrThrow(id: string) {
    const v = await this.prisma.registroMezzo.findFirst({ where: { id, deletedAt: null } });
    if (!v) throw new NotFoundException('Voce del registro non trovata');
    return v;
  }

  private dataOrNull(s?: string | null) {
    if (s === undefined) return undefined;
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new BadRequestException('Data non valida');
    return d;
  }

  async create(dto: CreateRegistroMezzoDto, userId: string) {
    const targa = normTarga(dto.targa);
    if (!targa) throw new BadRequestException('La targa è obbligatoria');
    const flotta = await this.targheFlotta();
    const v = await this.prisma.registroMezzo.create({
      data: {
        manuale: true,
        targa,
        mezzoId: flotta.get(targa) ?? null,
        tipo: dto.tipo ?? 'ALTRO',
        numero: dto.numero || null,
        dataEvento: this.dataOrNull(dto.dataEvento) ?? null,
        descrizione: dto.descrizione,
        importo: dto.importo,
        percIva: dto.percIva ?? null,
        mese: dto.mese || null,
        padroncinoId: dto.padroncinoId || null,
        stato: dto.stato ?? 'APERTO',
        note: dto.note || null,
      },
      include: INCLUDE,
    });
    await this.audit.log({ userId, entityType: 'registro_mezzo', entityId: v.id, azione: 'CREATE', dataDopo: v as any });
    return v;
  }

  async update(id: string, dto: UpdateRegistroMezzoDto, userId: string) {
    const prima = await this.getOrThrow(id);
    const data: any = {};

    if (dto.ripristinaRiconoscimento && !prima.manuale) {
      data.modificatoAMano = false; // la prossima sincronizzazione rileggerà la descrizione
    }
    const riconosciuti: Record<string, any> = {};
    if (dto.targa !== undefined) {
      const t = normTarga(dto.targa);
      if (!t) throw new BadRequestException('La targa è obbligatoria');
      riconosciuti.targa = t;
      riconosciuti.mezzoId = (await this.targheFlotta()).get(t) ?? null;
    }
    if (dto.tipo !== undefined) riconosciuti.tipo = dto.tipo;
    if (dto.numero !== undefined) riconosciuti.numero = dto.numero || null;
    if (dto.dataEvento !== undefined) riconosciuti.dataEvento = this.dataOrNull(dto.dataEvento);
    const cambiaRiconosciuti = Object.keys(riconosciuti).some((k) => {
      const a = (prima as any)[k], b = riconosciuti[k];
      if (a instanceof Date || b instanceof Date) return (a ? new Date(a).getTime() : null) !== (b ? new Date(b).getTime() : null);
      return (a ?? null) !== (b ?? null);
    });
    if (cambiaRiconosciuti) {
      Object.assign(data, riconosciuti);
      if (!prima.manuale) data.modificatoAMano = true;
    }
    if (dto.stato !== undefined) data.stato = dto.stato;
    if (dto.note !== undefined) data.note = dto.note || null;

    if (prima.manuale) {
      if (dto.descrizione !== undefined) data.descrizione = dto.descrizione;
      if (dto.importo !== undefined) data.importo = dto.importo;
      if (dto.percIva !== undefined) data.percIva = dto.percIva;
      if (dto.mese !== undefined) data.mese = dto.mese || null;
      if (dto.padroncinoId !== undefined) data.padroncinoId = dto.padroncinoId || null;
    }

    const dopo = await this.prisma.registroMezzo.update({ where: { id }, data, include: INCLUDE });
    await this.audit.log({ userId, entityType: 'registro_mezzo', entityId: id, azione: 'UPDATE', dataPrima: prima as any, dataDopo: dopo as any });

    if (data.modificatoAMano === false && prima.conteggioMensileId) {
      await this.sincronizzaConteggioSafe(prima.conteggioMensileId);
      return this.prisma.registroMezzo.findUnique({ where: { id }, include: INCLUDE });
    }
    return dopo;
  }

  async remove(id: string, userId: string) {
    const prima = await this.getOrThrow(id);
    await this.prisma.registroMezzo.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ userId, entityType: 'registro_mezzo', entityId: id, azione: 'DELETE', dataPrima: prima as any });
    return { deleted: true };
  }
}
