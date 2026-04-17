import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConteggioDto, UpdateConteggioStatoDto, CreateRigaDto, UpdateRigaDto } from './conteggi.dto';
import { Segno } from '@prisma/client';
import * as XLSX from 'xlsx';

@Injectable()
export class ConteggiService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── LIST ───────────────────────────────────────────
  async findAll(mese?: string, padroncinoId?: string) {
    const conteggi = await this.prisma.conteggioMensile.findMany({
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

    return conteggi.map((c) => ({
      ...c,
      ...this.calcolaTotali(c.righe),
    }));
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

  // ─── CALCOLO TOTALI (formula unica, coerente con UI) ───
  // FATTURATO è salvato come imponibile → moltiplichiamo ×1.22
  // ADDEBITI (NOLEGGIO, PALMARE, RICARICA, ADDEBITO) già con IVA
  // COMPENSAZIONI (ACCREDITO, BONUS, FINE_MESE, ACCONTO) vanno sottratte
  private calcolaTotali(righe: { tipo: string; importo: any }[]) {
    const ADDEBITI = ['NOLEGGIO', 'PALMARE', 'RICARICA', 'ADDEBITO'];
    const COMPENSAZIONI = ['ACCREDITO', 'BONUS', 'FINE_MESE', 'ACCONTO'];

    const totFatturato = righe
      .filter((r) => r.tipo === 'FATTURATO')
      .reduce((s, r) => s + Number(r.importo), 0);
    const totAddebiti = righe
      .filter((r) => ADDEBITI.includes(r.tipo))
      .reduce((s, r) => s + Number(r.importo), 0);
    const totCompen = righe
      .filter((r) => COMPENSAZIONI.includes(r.tipo))
      .reduce((s, r) => s + Number(r.importo), 0);

    const totalePositivo = righe
      .filter((r) => (r as any).segno === 'POSITIVO')
      .reduce((s, r) => s + Number(r.importo), 0);
    const totaleNegativo = righe
      .filter((r) => (r as any).segno === 'NEGATIVO')
      .reduce((s, r) => s + Number(r.importo), 0);

    return {
      totalePositivo,
      totaleNegativo,
      netto: Math.round((totFatturato * 1.22 - totAddebiti - totCompen) * 100) / 100,
    };
  }

  // ─── DETTAGLIO CON TOTALI ───────────────────────────
  async findOneWithTotals(id: string) {
    const conteggio = await this.findOne(id);
    return { ...conteggio, ...this.calcolaTotali(conteggio.righe) };
  }

  // ─── CREATE + AUTO-GENERATION ───────────────────────
  async create(dto: CreateConteggioDto, userId: string) {
    // Verifica padroncino
    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id: dto.padroncinoId, deletedAt: null },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    // Verifica unicità mese/padroncino
    const existing = await this.prisma.conteggioMensile.findFirst({
      where: {
        padroncinoId: dto.padroncinoId,
        mese: dto.mese,
      },
    });
 
    if (existing) {
      if (existing.deletedAt === null) {
        // Conteggio attivo: blocca la creazione
        throw new BadRequestException('Conteggio già esistente per questo mese');
      } else {
        // Conteggio soft-deleted: rimuovilo fisicamente così la constraint si libera
        // Le righe vengono eliminate in cascade (onDelete: Cascade nello schema)
        await this.prisma.conteggioMensile.delete({
          where: { id: existing.id },
        });
      }
    }

    // ─── AUTO-CHIUDI conteggi BOZZA del mese precedente per lo stesso padroncino
    const [year, month] = dto.mese.split('-').map(Number);   // ← dto.mese
    const prevDate = new Date(year, month - 2, 1);
    const prevMese = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    await this.prisma.conteggioMensile.updateMany({
      where: {
        padroncinoId: dto.padroncinoId,   // ← dto.padroncinoId
        mese: prevMese,
        stato: 'BOZZA',
        deletedAt: null,
      },
      data: { stato: 'CHIUSO' },
    });   
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
    const [_year, _month] = mese.split('-').map(Number);
    const inizioMese = new Date(Date.UTC(_year, _month - 1, 1));
    const fineMese   = new Date(Date.UTC(_year, _month, 0, 23, 59, 59, 999));
    let ordine = 0;

    // 1. MEZZI ASSEGNATI → costi noleggio
    let assegnazioniMezzi = await this.prisma.assegnazioneMezzo.findMany({
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
    // Fallback: se nessuna assegnazione copre il mese, usa le assegnazioni attualmente attive
    if (assegnazioniMezzi.length === 0) {
      assegnazioniMezzi = await this.prisma.assegnazioneMezzo.findMany({
        where: { padroncinoId, deletedAt: null, dataFine: null },
        include: {
          mezzo: { select: { id: true, targa: true, marca: true, modello: true, rataNoleggio: true } },
        },
      });
    }

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
    let assegnazioniPalmari = await this.prisma.assegnazionePalmare.findMany({
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
    if (assegnazioniPalmari.length === 0) {
      assegnazioniPalmari = await this.prisma.assegnazionePalmare.findMany({
        where: { padroncinoId, deletedAt: null, dataFine: null },
        include: {
          palmare: { select: { id: true, codice: true, tariffaMensile: true } },
        },
      });
    }

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
    let codiciAutista = await this.prisma.assegnazioneCodiceAutista.findMany({
      where: {
        padroncinoId,
        deletedAt: null,
        dataInizio: { lte: fineMese },
        OR: [{ dataFine: null }, { dataFine: { gte: inizioMese } }],
      },
      select: { codiceAutistaId: true },
    });
    if (codiciAutista.length === 0) {
      codiciAutista = await this.prisma.assegnazioneCodiceAutista.findMany({
        where: { padroncinoId, deletedAt: null, dataFine: null },
        select: { codiceAutistaId: true },
      });
    }

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
    // Cerca per padroncinoId diretto O per mezzoId dei mezzi assegnati (fallback se padroncinoId è null)
    const mezziIds = assegnazioniMezzi.map((a) => a.mezzo.id);
    const ricariche = await this.prisma.ricaricaElettrica.findMany({
      where: {
        deletedAt: null,
        mese,
        OR: [
          { padroncinoId },
          ...(mezziIds.length > 0 ? [{ mezzoId: { in: mezziIds } }] : []),
        ],
      },
    });
    // Deduplicazione per id (evita doppioni se sia padroncinoId che mezzoId corrispondono)
    const ricaricheUniche = [...new Map(ricariche.map((r) => [r.id, r])).values()];

    for (const ric of ricaricheUniche) {
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

  // ─── IMPORTA FATTURA PROFORMA EXCEL ─────────────────
  async importaFatturaProforma(file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    const totali: Record<string, number> = {};
    for (const row of rows) {
      const fornitore = String(row['Fornitore'] ?? '').trim();
      const importo = Number(row['Importo Totale'] ?? 0);
      if (!fornitore || isNaN(importo)) continue;
      totali[fornitore] = (totali[fornitore] ?? 0) + importo;
    }

    return Object.entries(totali).map(([fornitore, totale]) => ({
      fornitore,
      totale: Math.round(totale * 100) / 100,
    }));
  }

  // ─── APPLICA FATTURA PROFORMA — BULK SU TUTTI I PADRONCINI ──────────────
  private normalizzaNome(nome: string): string {
    return nome.replace(/\s*\([^)]*\)\s*/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  }

  async applicaFatturaProforma(file: Express.Multer.File, mese: string, userId: string) {
    // Colonne (0-based): A=0 B=1 C=2 F=5 G=6 P=15 Q=16 AB=27 AD=29 AE=30
    const COL = { A: 0, B: 1, C: 2, F: 5, G: 6, P: 15, Q: 16, AB: 27, AD: 29, AE: 30 };

    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // header:1 → ogni riga è un array indicizzato per colonna
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: 0 });

    const estraiCodice = (val: any): string | null => {
      const matches = String(val ?? '').match(/\(([^)]+)\)/g);
      if (!matches) return null;
      return matches[matches.length - 1].slice(1, -1).trim() || null;
    };
    const toNum = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };

    /** Converte il valore di colonna C in stringa "DD/MM/YYYY".
     *  Gestisce: Date JS (quando cellDates:true), serial numerico Excel, stringa già formattata. */
    const estraiData = (v: any): string | undefined => {
      if (!v || v === 0) return undefined;
      if (v instanceof Date) {
        const d = v.getDate().toString().padStart(2, '0');
        const m = (v.getMonth() + 1).toString().padStart(2, '0');
        const y = v.getFullYear();
        return `${d}/${m}/${y}`;
      }
      if (typeof v === 'number') {
        // Excel date serial (giorni dal 1/1/1900, con il bug del 1900 leap year)
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          const dd = d.getUTCDate().toString().padStart(2, '0');
          const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
          const yy = d.getUTCFullYear();
          return `${dd}/${mm}/${yy}`;
        }
      }
      if (typeof v === 'string' && v.trim()) return v.trim();
      return undefined;
    };

    // Strutture di aggregazione
    type StatRow = {
      data?: string;
      fatturato: number; consegneAffidate: number; consegneFatte: number;
      ritiriAffidati: number; ritiriFatti: number;
      consegneAffidateShop: number; consegneFatteShop: number;
    };
    const emptyTot = (): StatRow => ({
      fatturato: 0, consegneAffidate: 0, consegneFatte: 0,
      ritiriAffidati: 0, ritiriFatti: 0, consegneAffidateShop: 0, consegneFatteShop: 0,
    });

    // Per padroncino → { totFatturato, byCode: Map<codice, {tot, righe}> }
    const perFornitore = new Map<string, { totFatturato: number; byCode: Map<string, { tot: StatRow; righe: StatRow[] }> }>();

    for (const row of rawRows) {
      const fornitore = String(row[COL.A] ?? '').trim();
      if (!fornitore) continue;
      const fatturato = toNum(row[COL.AB]);
      if (typeof row[COL.AB] !== 'number' && fatturato === 0 && typeof row[COL.A] === 'string' && isNaN(Number(row[COL.A]))) {
        // Probabilmente riga header — skip se col AB non è un numero
        if (typeof row[COL.AB] === 'string') continue;
      }

      if (!perFornitore.has(fornitore)) {
        perFornitore.set(fornitore, { totFatturato: 0, byCode: new Map() });
      }
      const entry = perFornitore.get(fornitore)!;
      entry.totFatturato += fatturato;

      const codice = estraiCodice(row[COL.B]);
      if (codice) {
        const rigaDati: StatRow = {
          data:                 estraiData(row[COL.C]),
          fatturato,
          consegneAffidate:     toNum(row[COL.G]),
          consegneFatte:        toNum(row[COL.F]),
          ritiriAffidati:       toNum(row[COL.Q]),
          ritiriFatti:          toNum(row[COL.P]),
          consegneAffidateShop: toNum(row[COL.AE]),
          consegneFatteShop:    toNum(row[COL.AD]),
        };
        if (!entry.byCode.has(codice)) {
          entry.byCode.set(codice, { tot: emptyTot(), righe: [] });
        }
        const c = entry.byCode.get(codice)!;
        c.righe.push(rigaDati);
        for (const k of Object.keys(rigaDati) as (keyof StatRow)[]) {
          if (k !== 'data') c.tot[k] += rigaDati[k] as number;
        }
      }
    }

    // Costruisce il JSON di distribuzione per un fornitore
    const buildDistribuzione = (entry: { totFatturato: number; byCode: Map<string, { tot: StatRow; righe: StatRow[] }> }) => {
      const codici = Array.from(entry.byCode.values()).map((e, i) => ({
        codice: Array.from(entry.byCode.keys())[i],
        ...e.tot,
        righe: e.righe,
      }));
      const riepilogo = codici.reduce<StatRow>((s, c) => {
        for (const k of Object.keys(s) as (keyof StatRow)[]) {
          if (k !== 'data') (s as any)[k] += (c as any)[k];
        }
        return s;
      }, emptyTot());
      return { riepilogo, codici };
    };

    // 2. Carica tutti i padroncini attivi
    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati: { fornitore: string; padroncino?: string; totale: number; azione: string }[] = [];

    for (const [fornitore, entry] of perFornitore.entries()) {
      const totale = Math.round(entry.totFatturato * 100) / 100;
      const nomeNorm = this.normalizzaNome(fornitore);
      const padroncino = padroncini.find((p) => this.normalizzaNome(p.ragioneSociale) === nomeNorm);

      if (!padroncino) {
        risultati.push({ fornitore, totale, azione: 'non_trovato' });
        continue;
      }

      // 3. Cerca o crea conteggio del mese
      let conteggioId: string;
      const conteggioEsistente = await this.prisma.conteggioMensile.findFirst({
        where: { padroncinoId: padroncino.id, mese, deletedAt: null },
        select: { id: true, stato: true },
      });

      if (conteggioEsistente) {
        if (conteggioEsistente.stato === 'CONFERMATO') {
          risultati.push({ fornitore, padroncino: padroncino.ragioneSociale, totale, azione: 'saltato_confermato' });
          continue;
        }
        conteggioId = conteggioEsistente.id;
      } else {
        const nuovoConteggio = await this.create({ padroncinoId: padroncino.id, mese }, userId);
        conteggioId = nuovoConteggio.id;
      }

      // 4. Aggiorna riga FATTURATO
      const rigaEsistente = await this.prisma.conteggiRiga.findFirst({
        where: { conteggioMensileId: conteggioId, tipo: 'FATTURATO' },
        orderBy: { ordine: 'asc' },
      });

      if (rigaEsistente) {
        await this.prisma.conteggiRiga.update({
          where: { id: rigaEsistente.id },
          data: { importo: totale, modificaManuale: true, note: 'Importato da Fattura Proforma' },
        });
        risultati.push({ fornitore, padroncino: padroncino.ragioneSociale, totale, azione: 'aggiornato' });
      } else {
        await this.prisma.conteggiRiga.create({
          data: {
            conteggioMensileId: conteggioId,
            tipo: 'FATTURATO',
            descrizione: 'Fatturato distribuzione',
            importo: totale,
            segno: 'POSITIVO',
            categoria: 'fatturato',
            ordine: 0,
            modificaManuale: true,
            note: 'Importato da Fattura Proforma',
          },
        });
        risultati.push({ fornitore, padroncino: padroncino.ragioneSociale, totale, azione: 'creato' });
      }

      // 5. Salva JSON di distribuzione per codice autista
      if (entry.byCode.size > 0) {
        await this.prisma.conteggioMensile.update({
          where: { id: conteggioId },
          data: { distribuzioneJson: buildDistribuzione(entry) as any },
        });
      }
    }

    const processati = risultati.filter((r) => r.azione === 'creato' || r.azione === 'aggiornato').length;
    const saltati = risultati.filter((r) => r.azione === 'non_trovato' || r.azione === 'saltato_confermato').length;

    return { processati, saltati, risultati };
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
