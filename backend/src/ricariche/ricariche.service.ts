import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SessioneRicaricaDto {
  targa: string;
  sessioneId?: string;
  tipoRicarica: 'INTERNA' | 'ESTERNA';
  stazione?: string;
  durata?: string;
  inizioSessione?: string;
  fineSessione?: string;
  kwh: number;
  costoUnitario: number;
  costoBase: number;
  maggiorazione: number;
  importo: number; // costo finale
  categoriaMezzo?: string;
  padroncinoId?: string;
  mezzoId?: string;
  // snapshot tariffe
  costoInternoKwh?: number;
  costoEsternoKwh?: number;
  fatturaImporto?: number;
  fatturaKwh?: number;
}

export interface ImportRicaricheDto {
  mese: string; // "2026-02"
  sessioni: SessioneRicaricaDto[];
}

function normalizeTarga(value?: string | null): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

@Injectable()
export class RicaricheService {
  constructor(private prisma: PrismaService) {}

  /**
   * Carica tutti i dati ricariche per un mese, arricchiti con info mezzo/padroncino
   */
  async findByMese(mese: string) {
    const righe = await this.prisma.ricaricaElettrica.findMany({
      where: { mese, deletedAt: null },
      include: {
        mezzo: {
          select: {
            id: true, 
            targa: true, 
            marca: true, 
            modello: true,
            categoria: true,
            maggiorazioneRicarica: true, // ORA FUNZIONA
          },
        },
        padroncino: {
          select: { id: true, ragioneSociale: true },
        },
      },
      orderBy: [{ targa: 'asc' }, { inizioSessione: 'asc' }],
    });

    // Recupera anche la configurazione tariffe del mese (dalla prima riga)
    const primaRiga = righe[0];
    const tariffe = primaRiga ? {
      costoInternoKwh: primaRiga.costoInternoKwh ? Number(primaRiga.costoInternoKwh) : null,
      costoEsternoKwh: primaRiga.costoEsternoKwh ? Number(primaRiga.costoEsternoKwh) : null,
      fatturaImporto: primaRiga.fatturaImporto ? Number(primaRiga.fatturaImporto) : null,
      fatturaKwh: primaRiga.fatturaKwh ? Number(primaRiga.fatturaKwh) : null,
    } : null;

    return {
      mese,
      tariffe,
      sessioni: righe.map((r) => ({
        id: r.id,
        // Se r.targa è null, prova a prenderla dal mezzo relazionato
        targa: r.targa ?? r.mezzo?.targa ?? '', 
        sessioneId: r.sessioneId,
        tipoRicarica: r.tipoRicarica,
        stazione: r.stazione,
        durata: r.durata,
        inizioSessione: r.inizioSessione,
        fineSessione: r.fineSessione,
        kwh: r.kwh ? Number(r.kwh) : 0,
        costoUnitario: r.costoUnitario ? Number(r.costoUnitario) : 0,
        costoBase: r.costoBase ? Number(r.costoBase) : 0,
        maggiorazione: r.maggiorazione ? Number(r.maggiorazione) : 0,
        costoFinale: Number(r.importo),
        categoriaMezzo: r.categoriaMezzo ?? r.mezzo?.categoria ?? null,
        mezzoId: r.mezzoId,
        padroncinoId: r.padroncinoId,
        padroncino: r.padroncino?.ragioneSociale ?? null, // Ora TS lo riconoscerà
        data: r.data,
      })),
    };
  }
  /**
   * Lista dei mesi che hanno dati ricariche
   */
  async listMesi() {
    const risultati = await this.prisma.ricaricaElettrica.groupBy({
      by: ['mese'],
      where: { deletedAt: null, mese: { not: null } },
      _count: { id: true },
      orderBy: { mese: 'desc' },
    });
    return risultati.map((r) => ({ mese: r.mese, count: r._count.id }));
  }

  /**
   * Importa sessioni CSV per un mese.
   * Prima elimina le sessioni esistenti per quel mese (sostituzione completa).
   */
  async importa(dto: ImportRicaricheDto) {
    const { mese, sessioni } = dto;

    // Soft-delete delle sessioni esistenti per questo mese
    await this.prisma.ricaricaElettrica.updateMany({
      where: { mese, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (sessioni.length === 0) {
      return { importate: 0, mese };
    }

    // Arricchisci con dati dal DB (mezzoId, padroncinoId, categoriaMezzo)
    const targhe = [...new Set(sessioni.map((s) => normalizeTarga(s.targa)).filter(Boolean))];
    const mezziDB = await this.prisma.mezzo.findMany({
      where: { targa: { in: targhe }, deletedAt: null },
      include: {
        assegnazioni: {
          where: {
            deletedAt: null,
            dataInizio: { lte: new Date(`${mese}-28`) },
            OR: [
              { dataFine: null },
              { dataFine: { gte: new Date(`${mese}-01`) } },
            ],
          },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          orderBy: { dataInizio: 'desc' },
          take: 1,
        },
      },
    });

    const mezzoMap = new Map(mezziDB.map((m) => [normalizeTarga(m.targa), m]));

    // Crea tutte le sessioni
    const create = sessioni.map((s) => {
      const targaNorm = normalizeTarga(s.targa);
      const mezzo = mezzoMap.get(targaNorm);
      const assegnazioneAttiva = mezzo?.assegnazioni?.[0];
      const primoGiornoMese = new Date(`${mese}-01`);

      return {
        targa: targaNorm || (s.targa ?? '').toUpperCase(),
        sessioneId: s.sessioneId,
        tipoRicarica: s.tipoRicarica,
        stazione: s.stazione,
        durata: s.durata,
        inizioSessione: s.inizioSessione,
        fineSessione: s.fineSessione,
        kwh: s.kwh,
        costoUnitario: s.costoUnitario,
        costoBase: s.costoBase,
        maggiorazione: s.maggiorazione,
        importo: s.importo,
        categoriaMezzo: mezzo?.categoria ?? s.categoriaMezzo ?? null,
        mezzoId: mezzo?.id ?? null,
        padroncinoId: assegnazioneAttiva?.padroncino?.id ?? null,
        costoInternoKwh: s.costoInternoKwh ?? null,
        costoEsternoKwh: s.costoEsternoKwh ?? null,
        fatturaImporto: s.fatturaImporto ?? null,
        fatturaKwh: s.fatturaKwh ?? null,
        mese,
        fornitore: s.tipoRicarica === 'INTERNA' ? 'Juice' : 'Esterno',
        data: primoGiornoMese,
      };
    });

    await this.prisma.ricaricaElettrica.createMany({ data: create as any });

    return { importate: create.length, mese };
  }

  /**
   * Riepilogo per padroncino (per i conteggi mensili)
   */
  async riepilogoPadroncini(mese: string) {
    const righe = await this.prisma.ricaricaElettrica.findMany({
      where: { mese, deletedAt: null, padroncinoId: { not: null } },
      include: {
        padroncino: { select: { id: true, ragioneSociale: true } },
        mezzo: { select: { targa: true, categoria: true } },
      },
    });

    const map = new Map<string, {
      padroncinoId: string;
      ragioneSociale: string;
      totale: number;
      mezzi: Map<string, number>;
    }>();

    for (const r of righe) {
      if (!r.padroncinoId || !r.padroncino) continue;
      if (!map.has(r.padroncinoId)) {
        map.set(r.padroncinoId, {
          padroncinoId: r.padroncinoId,
          ragioneSociale: r.padroncino.ragioneSociale,
          totale: 0,
          mezzi: new Map(),
        });
      }
      const entry = map.get(r.padroncinoId)!;
      const costo = Number(r.importo);
      entry.totale += costo;
      const targa = r.targa ?? r.mezzo?.targa ?? 'N/A';
      entry.mezzi.set(targa, (entry.mezzi.get(targa) ?? 0) + costo);
    }

    return Array.from(map.values()).map((e) => ({
      padroncinoId: e.padroncinoId,
      ragioneSociale: e.ragioneSociale,
      totale: e.totale,
      mezzi: Array.from(e.mezzi.entries()).map(([targa, costo]) => ({ targa, costo })),
    }));
  }

  async aggiornaTariffe(mese: string, tariffe: { fatturaImporto?: number; fatturaKwh?: number; costoEsternoKwh?: number }) {
    // Aggiorna snapshot su tutte le sessioni del mese
    await this.prisma.ricaricaElettrica.updateMany({
      where: { mese, deletedAt: null },
      data: {
        ...(tariffe.fatturaImporto != null && { fatturaImporto: tariffe.fatturaImporto }),
        ...(tariffe.fatturaKwh != null && { fatturaKwh: tariffe.fatturaKwh }),
        ...(tariffe.costoEsternoKwh != null && { costoEsternoKwh: tariffe.costoEsternoKwh }),
      },
    });
    
    // Se cambiano fatturaImporto/fatturaKwh, ricalcola costoUnitario e importo per le INTERNE
    if (tariffe.fatturaImporto != null && tariffe.fatturaKwh != null && tariffe.fatturaKwh > 0) {
      const nuovoCostoInt = tariffe.fatturaImporto / tariffe.fatturaKwh;
      const sessioni = await this.prisma.ricaricaElettrica.findMany({
        where: { mese, deletedAt: null, tipoRicarica: 'INTERNA' }
      });
      for (const s of sessioni) {
        const kwh = Number(s.kwh);
        const mag = Number(s.maggiorazione);
        const nuovaBase = kwh * nuovoCostoInt;
        const nuovoTot = nuovaBase * (1 + mag / 100);
        await this.prisma.ricaricaElettrica.update({
          where: { id: s.id },
          data: { costoUnitario: nuovoCostoInt, costoBase: nuovaBase, importo: nuovoTot, costoInternoKwh: nuovoCostoInt },
        });
      }
    }
    return { aggiornate: true, mese };
  }


  /**
   * Elimina tutte le sessioni di un mese
   */
  async eliminaMese(mese: string) {
    await this.prisma.ricaricaElettrica.updateMany({
      where: { mese, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: true, mese };
  }
}
