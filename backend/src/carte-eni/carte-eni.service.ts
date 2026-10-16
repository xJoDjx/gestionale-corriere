import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCartaEniDto, UpdateCartaEniDto } from './carte-eni.dto';

// Tipi di transazione che rappresentano un rifornimento reale (con prodotto/litri/prezzo).
// "Authorization + Reservation Outdoor" è solo una pre-autorizzazione (blocco provvisorio,
// niente prodotto/litri) e va sempre esclusa.
const TIPI_VALIDI = ['Advice', 'Sale'];

function parseDataEni(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  // Formato Eni: "01-06-2026 05:42:51"
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min, ss] = m;
    return new Date(Date.UTC(
      parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
      parseInt(hh), parseInt(min), ss ? parseInt(ss) : 0,
    ));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function toStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Parser generico per la colonna "giorno" del file prezzi (Data JS, stringa o seriale Excel) */
function parseGenericDate(raw: any): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H ?? 0, parsed.M ?? 0, parsed.S ?? 0));
  }
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
  }
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    return new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function dataToGiorno(d: Date): Date {
  // Normalizza alla mezzanotte UTC (chiave per il listino prezzi giornaliero)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function meseOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Categorie di prodotto usate per il listino prezzi giornaliero: lo stesso giorno
// ha prezzi diversi per Diesel/HVO/Benzina, quindi il prezzo va sempre abbinato
// sia alla data che alla categoria di prodotto della transazione.
export const CATEGORIE_PRODOTTO = ['DIESEL', 'HVO', 'BENZINA', 'ALTRO'] as const;
export type CategoriaProdotto = typeof CATEGORIE_PRODOTTO[number];

function normalizzaProdotto(prodottoRaw: string | null | undefined): CategoriaProdotto {
  if (!prodottoRaw) return 'ALTRO';
  const s = prodottoRaw.toUpperCase();
  if (s.includes('HVO')) return 'HVO';
  if (s.includes('DIESEL')) return 'DIESEL';
  if (s.includes('BENZ')) return 'BENZINA';
  return 'ALTRO';
}

@Injectable()
export class CarteEniService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════ ANAGRAFICA CARTE ═══════════════

  async findAllCarte() {
    const carte = await this.prisma.cartaEni.findMany({
      where: { deletedAt: null },
      include: {
        padroncino: { select: { id: true, ragioneSociale: true } },
        _count: { select: { transazioni: { where: { deletedAt: null } } } },
      },
      orderBy: { numeroCarta: 'asc' },
    });
    return carte;
  }

  async createCarta(dto: CreateCartaEniDto) {
    return this.prisma.cartaEni.create({
      data: {
        numeroCarta: dto.numeroCarta.trim(),
        utilizzatore: dto.utilizzatore ?? null,
        padroncinoId: dto.padroncinoId ?? null,
        targaAbituale: dto.targaAbituale ?? null,
        attiva: dto.attiva ?? true,
        note: dto.note ?? null,
      },
    });
  }

  async updateCarta(id: string, dto: UpdateCartaEniDto) {
    const existing = await this.prisma.cartaEni.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Carta non trovata');
    return this.prisma.cartaEni.update({
      where: { id },
      data: {
        ...(dto.utilizzatore !== undefined && { utilizzatore: dto.utilizzatore }),
        ...(dto.padroncinoId !== undefined && { padroncinoId: dto.padroncinoId }),
        ...(dto.targaAbituale !== undefined && { targaAbituale: dto.targaAbituale }),
        ...(dto.attiva !== undefined && { attiva: dto.attiva }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
  }

  async removeCarta(id: string) {
    const existing = await this.prisma.cartaEni.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Carta non trovata');
    await this.prisma.cartaEni.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  // ═══════════════ MESI / TRANSAZIONI ═══════════════

  async listMesi() {
    const risultati = await this.prisma.transazioneCartaEni.groupBy({
      by: ['mese'],
      where: { deletedAt: null },
      _count: { id: true },
      _sum: { importo: true, quantita: true },
      orderBy: { mese: 'desc' },
    });
    return risultati.map((r) => ({
      mese: r.mese,
      count: r._count.id,
      totale: r._sum.importo ? Number(r._sum.importo) : 0,
      litri: r._sum.quantita ? Number(r._sum.quantita) : 0,
    }));
  }

  async findByMese(mese: string) {
    const righe = await this.prisma.transazioneCartaEni.findMany({
      where: { mese, deletedAt: null },
      include: {
        carta: {
          select: { id: true, numeroCarta: true, utilizzatore: true, padroncino: { select: { id: true, ragioneSociale: true } } },
        },
      },
      orderBy: [{ data: 'asc' }],
    });

    const codiciImpianto = Array.from(new Set(righe.map((r) => r.codiceImpianto).filter((c): c is string => !!c)));
    const stazioni = await this.prisma.stazioneEni.findMany({ where: { codiceImpianto: { in: codiciImpianto } } });
    const stazioniMap = new Map(stazioni.map((s) => [s.codiceImpianto, s]));

    return {
      mese,
      transazioni: righe.map((r) => ({
        id: r.id,
        numeroCarta: r.numeroCarta,
        utilizzatore: r.carta?.utilizzatore ?? null,
        padroncino: r.carta?.padroncino?.ragioneSociale ?? null,
        data: r.data,
        tipoTransazione: r.tipoTransazione,
        statoAutorizzativo: r.statoAutorizzativo,
        codiceImpianto: r.codiceImpianto,
        localita: r.localita,
        agevolata: r.codiceImpianto ? (stazioniMap.get(r.codiceImpianto)?.agevolata ?? false) : false,
        targa: r.targa,
        prodotto: r.prodotto,
        quantita: r.quantita ? Number(r.quantita) : 0,
        prezzoImportato: r.prezzoImportato ? Number(r.prezzoImportato) : null,
        prezzoUnitario: r.prezzoUnitario ? Number(r.prezzoUnitario) : null,
        importoImportato: r.importoImportato ? Number(r.importoImportato) : null,
        importo: r.importo ? Number(r.importo) : 0,
        codiceAutista: r.codiceAutista,
        numeroAutorizzazione: r.numeroAutorizzazione,
      })),
    };
  }

  // ═══════════════ ANAGRAFICA STAZIONI ═══════════════

  async findAllStazioni() {
    return this.prisma.stazioneEni.findMany({ orderBy: { codiceImpianto: 'asc' } });
  }

  async createStazione(dto: { codiceImpianto: string; localita?: string; agevolata?: boolean; note?: string }) {
    const codiceImpianto = dto.codiceImpianto.trim();
    const existing = await this.prisma.stazioneEni.findUnique({ where: { codiceImpianto } });
    if (existing) throw new BadRequestException('Esiste già una stazione con questo codice impianto');
    return this.prisma.stazioneEni.create({
      data: {
        codiceImpianto,
        localita: dto.localita ?? null,
        agevolata: dto.agevolata ?? false,
        note: dto.note ?? null,
      },
    });
  }

  async updateStazione(id: string, dto: { localita?: string; agevolata?: boolean; note?: string }) {
    const existing = await this.prisma.stazioneEni.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Stazione non trovata');
    return this.prisma.stazioneEni.update({
      where: { id },
      data: {
        ...(dto.localita !== undefined && { localita: dto.localita }),
        ...(dto.agevolata !== undefined && { agevolata: dto.agevolata }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
  }

  async eliminaMese(mese: string) {
    await this.prisma.transazioneCartaEni.updateMany({
      where: { mese, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: true, mese };
  }

  // ═══════════════ IMPORT TRANSAZIONI ═══════════════

  async importa(mese: string, buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const risultato = {
      mese,
      importate: 0,
      carteNuove: 0,
      stazioniNuove: 0,
      fuoriMese: 0,
      esclusiStatoOTipo: 0,
      righeSenzaData: 0,
    };

    // Prezzi giorno già impostati (per calcolare subito l'importo se disponibili),
    // chiave = "giorno|categoriaProdotto"
    const prezziGiorno = await this.prisma.prezzoGiornoEni.findMany();
    const prezziMap = new Map<string, number>();
    for (const p of prezziGiorno) prezziMap.set(`${p.data.toISOString().slice(0, 10)}|${p.prodotto}`, Number(p.prezzoUnitario));

    // Il listino prezzi giornaliero rappresenta il prezzo AGEVOLATO negoziato: va applicato solo
    // alle transazioni fatte in una stazione agevolata. Nelle stazioni "piena" (o non ancora
    // censite) il prezzo/importo deve restare quello originale del file importato.
    const stazioniEsistentiPerImport = await this.prisma.stazioneEni.findMany({ select: { codiceImpianto: true, agevolata: true } });
    const agevolataMap = new Map(stazioniEsistentiPerImport.map((s) => [s.codiceImpianto, s.agevolata]));

    const daCreare: any[] = [];
    const numeriCartaVisti = new Set<string>();
    const stazioniViste = new Map<string, string | null>(); // codiceImpianto -> localita

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;

      const numeroCarta = toStr(row[0]);
      if (!numeroCarta) continue;

      const tipoTransazione = toStr(row[2]);
      const statoAutorizzativo = toStr(row[5]);
      if (!tipoTransazione || !TIPI_VALIDI.includes(tipoTransazione)) { risultato.esclusiStatoOTipo++; continue; }
      if (!statoAutorizzativo || !statoAutorizzativo.startsWith('Approvata')) { risultato.esclusiStatoOTipo++; continue; }

      const data = parseDataEni(row[1]);
      if (!data) { risultato.righeSenzaData++; continue; }

      const meseRiga = meseOf(data);
      if (meseRiga !== mese) { risultato.fuoriMese++; continue; }

      const giornoKey = dataToGiorno(data).toISOString().slice(0, 10);
      const prodottoRaw = toStr(row[19]);
      const categoriaProdotto = normalizzaProdotto(prodottoRaw);
      const prezzoImportato = toNumber(row[20]);
      const quantita = toNumber(row[21]);
      const importoImportato = toNumber(row[3]);
      const codiceImpianto = toStr(row[9]);
      const localita = toStr(row[10]);
      const isAgevolata = codiceImpianto ? (agevolataMap.get(codiceImpianto) ?? false) : false;
      const prezzoDaListino = isAgevolata ? (prezziMap.get(`${giornoKey}|${categoriaProdotto}`) ?? null) : null;
      const prezzoUnitario = prezzoDaListino ?? prezzoImportato;
      const importo = (quantita != null && prezzoUnitario != null)
        ? quantita * prezzoUnitario
        : importoImportato;

      numeriCartaVisti.add(numeroCarta);
      if (codiceImpianto && !stazioniViste.has(codiceImpianto)) stazioniViste.set(codiceImpianto, localita);

      daCreare.push({
        numeroCarta,
        data,
        mese,
        tipoTransazione,
        statoAutorizzativo,
        canaleAutorizzativo: toStr(row[6]),
        paese: toStr(row[7]),
        reteVendita: toStr(row[8]),
        codiceImpianto,
        localita,
        targa: toStr(row[11])?.toUpperCase() ?? null,
        codiceSap: toStr(row[13]),
        numeroScontrino: toStr(row[14]),
        numeroAutorizzazione: toStr(row[15]),
        chilometraggio: toStr(row[16]),
        codiceAutista: toStr(row[17]),
        prodotto: prodottoRaw,
        quantita,
        prezzoImportato,
        prezzoUnitario,
        importoImportato,
        importo,
      });
    }

    // Anagrafica: crea automaticamente le carte non ancora censite
    const esistenti = await this.prisma.cartaEni.findMany({
      where: { numeroCarta: { in: Array.from(numeriCartaVisti) }, deletedAt: null },
      select: { numeroCarta: true, id: true },
    });
    const esistentiSet = new Set(esistenti.map((c) => c.numeroCarta));
    const nuove = Array.from(numeriCartaVisti).filter((n) => !esistentiSet.has(n));
    if (nuove.length > 0) {
      await this.prisma.cartaEni.createMany({
        data: nuove.map((numeroCarta) => ({ numeroCarta, attiva: true })),
        skipDuplicates: true,
      });
      risultato.carteNuove = nuove.length;
    }

    const carteMap = new Map(
      (await this.prisma.cartaEni.findMany({
        where: { numeroCarta: { in: Array.from(numeriCartaVisti) }, deletedAt: null },
        select: { id: true, numeroCarta: true },
      })).map((c) => [c.numeroCarta, c.id]),
    );

    // Anagrafica: censisce automaticamente le stazioni non ancora note (non agevolata di default,
    // va marcata manualmente in "Anagrafica Stazioni" una volta identificata come tale)
    const codiciVisti = Array.from(stazioniViste.keys());
    if (codiciVisti.length > 0) {
      const stazioniEsistenti = await this.prisma.stazioneEni.findMany({
        where: { codiceImpianto: { in: codiciVisti } },
        select: { codiceImpianto: true },
      });
      const stazioniEsistentiSet = new Set(stazioniEsistenti.map((s) => s.codiceImpianto));
      const stazioniNuove = codiciVisti.filter((c) => !stazioniEsistentiSet.has(c));
      if (stazioniNuove.length > 0) {
        await this.prisma.stazioneEni.createMany({
          data: stazioniNuove.map((codiceImpianto) => ({ codiceImpianto, localita: stazioniViste.get(codiceImpianto) ?? null, agevolata: false })),
          skipDuplicates: true,
        });
        risultato.stazioniNuove = stazioniNuove.length;
      }
    }

    // Sostituzione completa del mese (come per le ricariche elettriche)
    await this.prisma.transazioneCartaEni.updateMany({
      where: { mese, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (daCreare.length > 0) {
      await this.prisma.transazioneCartaEni.createMany({
        data: daCreare.map((r) => ({ ...r, cartaId: carteMap.get(r.numeroCarta) ?? null })),
      });
      risultato.importate = daCreare.length;
    }

    return risultato;
  }

  // ═══════════════ PREZZI GIORNO ═══════════════

  async listPrezziGiorno(mese: string) {
    const [year, month] = mese.split('-').map(Number);
    const inizio = new Date(Date.UTC(year, month - 1, 1));
    const fine = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const prezzi = await this.prisma.prezzoGiornoEni.findMany({
      where: { data: { gte: inizio, lte: fine } },
      orderBy: [{ data: 'asc' }, { prodotto: 'asc' }],
    });
    return prezzi.map((p) => ({ data: p.data, prodotto: p.prodotto as CategoriaProdotto, prezzoUnitario: Number(p.prezzoUnitario) }));
  }

  /** Imposta/modifica il prezzo di un giorno per un prodotto e ricalcola le transazioni corrispondenti */
  async aggiornaPrezzoGiorno(dataStr: string, prodotto: CategoriaProdotto, prezzoUnitario: number) {
    const giorno = dataToGiorno(new Date(`${dataStr}T00:00:00.000Z`));

    await this.prisma.prezzoGiornoEni.upsert({
      where: { data_prodotto: { data: giorno, prodotto } },
      create: { data: giorno, prodotto, prezzoUnitario },
      update: { prezzoUnitario },
    });

    const giornoFine = new Date(giorno.getTime() + 86_399_999);
    const transazioni = await this.prisma.transazioneCartaEni.findMany({
      where: { data: { gte: giorno, lte: giornoFine }, deletedAt: null },
    });

    // Il prezzo di listino è il prezzo AGEVOLATO: si applica solo alle transazioni fatte in una
    // stazione agevolata. Nelle stazioni "piena" (o non censite) il prezzo/importo va lasciato
    // (o riportato) a quello originale importato dal file.
    const codici = Array.from(new Set(transazioni.map((t) => t.codiceImpianto).filter((c): c is string => !!c)));
    const stazioni = await this.prisma.stazioneEni.findMany({ where: { codiceImpianto: { in: codici } }, select: { codiceImpianto: true, agevolata: true } });
    const agevolataMap = new Map(stazioni.map((s) => [s.codiceImpianto, s.agevolata]));

    let aggiornate = 0;
    for (const t of transazioni) {
      if (normalizzaProdotto(t.prodotto) !== prodotto) continue;
      const isAgevolata = t.codiceImpianto ? (agevolataMap.get(t.codiceImpianto) ?? false) : false;
      const quantita = t.quantita ? Number(t.quantita) : null;
      const nuovoPrezzo = isAgevolata ? prezzoUnitario : (t.prezzoImportato ? Number(t.prezzoImportato) : null);
      const importo = isAgevolata
        ? (quantita != null ? quantita * prezzoUnitario : (t.importoImportato ? Number(t.importoImportato) : null))
        : (t.importoImportato ? Number(t.importoImportato) : null);
      await this.prisma.transazioneCartaEni.update({
        where: { id: t.id },
        data: { prezzoUnitario: nuovoPrezzo, importo },
      });
      if (isAgevolata) aggiornate++;
    }

    return { data: giorno, prodotto, prezzoUnitario, transazioniAggiornate: aggiornate };
  }

  /**
   * Importa un file listino prezzi. Supporta tre formati:
   *  - lungo: colonne (giorno, prodotto, prezzo) — prodotto = DIESEL/HVO/BENZINA/ALTRO
   *  - largo semplice: colonne (giorno, prezzoDiesel, prezzoHvo[, prezzoBenzina]) — un solo
   *    prezzo (già IVA inclusa) per ciascun prodotto sulla stessa riga
   *  - largo "no IVA/IVA 22%" (es. file "Media Carburante"): colonne
   *    (giorno, gasolioNoIva, gasolioIva22, hvoNoIva, hvoIva22) — si prende sempre la colonna
   *    IVA inclusa (2ª e 4ª), che è la base usata da tutto il resto dell'app. La Benzina non ha
   *    listino agevolato quindi in questo formato non viene mai importata/toccata.
   *  Le righe non parsabili come data (intestazioni, riga "MEDIA" di riepilogo, ecc.) vengono
   *  ignorate automaticamente.
   */
  async importaPrezzi(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let importati = 0;
    const chiaviAggiornate = new Set<string>(); // "giornoKey|prodotto"

    const upsertPrezzo = async (giorno: Date, prodotto: CategoriaProdotto, prezzo: number) => {
      await this.prisma.prezzoGiornoEni.upsert({
        where: { data_prodotto: { data: giorno, prodotto } },
        create: { data: giorno, prodotto, prezzoUnitario: prezzo },
        update: { prezzoUnitario: prezzo },
      });
      chiaviAggiornate.add(`${giorno.toISOString().slice(0, 10)}|${prodotto}`);
      importati++;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row[0] == null) continue;

      const dataParsed = parseGenericDate(row[0]);
      const giorno = dataParsed ? dataToGiorno(dataParsed) : null;
      if (!giorno) continue; // intestazioni, riga "MEDIA", ecc.

      const col1IsProdotto = typeof row[1] === 'string' && CATEGORIE_PRODOTTO.includes(String(row[1]).toUpperCase() as CategoriaProdotto);
      const numeriche = [row[1], row[2], row[3], row[4]].filter((v) => toNumber(v) != null).length;

      if (col1IsProdotto) {
        // Formato lungo: giorno, prodotto, prezzo
        const prodotto = normalizzaProdotto(String(row[1]));
        const prezzo = toNumber(row[2]);
        if (prezzo != null) await upsertPrezzo(giorno, prodotto, prezzo);
      } else if (numeriche >= 4) {
        // Formato "no IVA/IVA 22%": giorno, gasolioNoIva, gasolioIva22, hvoNoIva, hvoIva22.
        // Si usano solo le colonne già IVA inclusa (2ª e 4ª); niente Benzina in questo formato.
        const prezzoDieselIva = toNumber(row[2]);
        const prezzoHvoIva = toNumber(row[4]);
        if (prezzoDieselIva != null) await upsertPrezzo(giorno, 'DIESEL', prezzoDieselIva);
        if (prezzoHvoIva != null) await upsertPrezzo(giorno, 'HVO', prezzoHvoIva);
      } else {
        // Formato largo semplice: giorno, prezzoDiesel, prezzoHvo[, prezzoBenzina] (già IVA inclusa)
        const prezzoDiesel = toNumber(row[1]);
        const prezzoHvo = toNumber(row[2]);
        const prezzoBenzina = toNumber(row[3]);
        if (prezzoDiesel != null) await upsertPrezzo(giorno, 'DIESEL', prezzoDiesel);
        if (prezzoHvo != null) await upsertPrezzo(giorno, 'HVO', prezzoHvo);
        if (prezzoBenzina != null) await upsertPrezzo(giorno, 'BENZINA', prezzoBenzina);
      }
    }

    // Ricalcola tutte le transazioni nei giorni/prodotti aggiornati. Il prezzo di listino è il
    // prezzo AGEVOLATO: si applica solo alle transazioni di stazioni agevolate. Nelle stazioni
    // "piena" (o non censite) prezzo/importo vanno riportati a quelli originali importati.
    let transazioniAggiornate = 0;
    for (const chiave of chiaviAggiornate) {
      const [giornoKey, prodotto] = chiave.split('|') as [string, CategoriaProdotto];
      const giorno = new Date(`${giornoKey}T00:00:00.000Z`);
      const giornoFine = new Date(giorno.getTime() + 86_399_999);
      const prezzo = await this.prisma.prezzoGiornoEni.findUnique({ where: { data_prodotto: { data: giorno, prodotto } } });
      if (!prezzo) continue;
      const prezzoUnitario = Number(prezzo.prezzoUnitario);
      const transazioni = await this.prisma.transazioneCartaEni.findMany({
        where: { data: { gte: giorno, lte: giornoFine }, deletedAt: null },
      });
      const codici = Array.from(new Set(transazioni.map((t) => t.codiceImpianto).filter((c): c is string => !!c)));
      const stazioni = await this.prisma.stazioneEni.findMany({ where: { codiceImpianto: { in: codici } }, select: { codiceImpianto: true, agevolata: true } });
      const agevolataMap = new Map(stazioni.map((s) => [s.codiceImpianto, s.agevolata]));
      for (const t of transazioni) {
        if (normalizzaProdotto(t.prodotto) !== prodotto) continue;
        const isAgevolata = t.codiceImpianto ? (agevolataMap.get(t.codiceImpianto) ?? false) : false;
        const quantita = t.quantita ? Number(t.quantita) : null;
        const nuovoPrezzo = isAgevolata ? prezzoUnitario : (t.prezzoImportato ? Number(t.prezzoImportato) : null);
        const importo = isAgevolata
          ? (quantita != null ? quantita * prezzoUnitario : (t.importoImportato ? Number(t.importoImportato) : null))
          : (t.importoImportato ? Number(t.importoImportato) : null);
        await this.prisma.transazioneCartaEni.update({
          where: { id: t.id },
          data: { prezzoUnitario: nuovoPrezzo, importo },
        });
        if (isAgevolata) transazioniAggiornate++;
      }
    }

    return { giorniImportati: importati, transazioniAggiornate };
  }
}
