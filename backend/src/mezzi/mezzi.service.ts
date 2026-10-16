import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { resolveDataFineAssegnazione } from '../common/data-fine-assegnazione.util';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto } from './mezzi.dto';
import { Alimentazione, StatoMezzo } from '@prisma/client';

@Injectable()
export class MezziService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Normalizza DTO ─────────────────────────────────
  private normalizeDto(dto: CreateMezzoDto | UpdateMezzoDto): Record<string, any> {
    const { proprietario, nContratto, ...rest } = dto as any;
    const data: Record<string, any> = { ...rest };

    if (proprietario && !data.societaNoleggio) data.societaNoleggio = proprietario;
    // riferimentoContratto (alias legacy) → riferimento_contratto
    if (nContratto && !data.riferimentoContratto && !data.riferimento_contratto) {
      data.riferimento_contratto = nContratto;
    }
    delete data.proprietario;
    delete data.nContratto;

    // Converti date (camelCase ancora, prima del remap)
    const dateFields = [
      'scadenzaAssicurazione', 'scadenzaRevisione', 'scadenzaBollo',
      'scadenzaTagliando', 'scadenzaTachigrafo', 'inizioNoleggio', 'fineNoleggio',
      'kmAttualiAl',
    ];
    for (const field of dateFields) {
      if (data[field] && typeof data[field] === 'string' && data[field].length === 10) {
        data[field] = new Date(data[field] + 'T00:00:00.000Z');
      }
    }

    // ── Remap camelCase → snake_case per i campi dello schema Prisma ──
    // Questi campi sono definiti in snake_case nello schema senza @map,
    // quindi Prisma li espone ancora in snake_case.
    const camelToSnake: Record<string, string> = {
      tipoPossesso:         'tipo_possesso',
      pIvaLocatore:         'p_iva_locatore',
      telefonoLocatore:     'telefono_locatore',
      emailLocatore:        'email_locatore',
      riferimentoContratto: 'riferimento_contratto',
      kmAttualiAl:          'km_attuali_al',
    };
    for (const [camel, snake] of Object.entries(camelToSnake)) {
      if (camel in data) {
        data[snake] = data[camel];
        delete data[camel];
      }
    }

    return data;
  }

  // ─── Normalizza risposta Prisma → camelCase ──────────
  // I campi definiti snake_case nello schema senza @map vengono restituiti
  // da Prisma in snake_case; il frontend si aspetta camelCase.
  private normalizeMezzo(m: any): any {
    if (!m) return m;
    const { tipo_possesso, p_iva_locatore, telefono_locatore, email_locatore,
            riferimento_contratto, km_attuali_al, ...rest } = m;
    return {
      ...rest,
      tipoPossesso:         tipo_possesso         ?? rest.tipoPossesso,
      pIvaLocatore:         p_iva_locatore         ?? rest.pIvaLocatore,
      telefonoLocatore:     telefono_locatore      ?? rest.telefonoLocatore,
      emailLocatore:        email_locatore         ?? rest.emailLocatore,
      riferimentoContratto: riferimento_contratto  ?? rest.riferimentoContratto,
      kmAttualiAl:          km_attuali_al          ?? rest.kmAttualiAl,
    };
  }

  // ─── LIST ────────────────────────────────────────────
  async findAll(query: QueryMezziDto) {
    const {
      search, stato, categoria, tipo, alimentazione,
      page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const where: any = { deletedAt: null };
    if (stato) where.stato = stato;
    if (categoria) where.categoria = categoria;
    if (tipo) where.tipo = tipo;
    if (alimentazione) where.alimentazione = alimentazione;
    if (search) {
      where.OR = [
        { targa: { contains: search, mode: 'insensitive' } },
        { marca: { contains: search, mode: 'insensitive' } },
        { modello: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.mezzo.findMany({
        where,
        include: {
          assegnazioni: {
            where: { deletedAt: null, dataFine: null },
            include: { padroncino: { select: { id: true, ragioneSociale: true } } },
            orderBy: { dataInizio: 'desc' },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mezzo.count({ where }),
    ]);

    return { data: data.map((m) => this.normalizeMezzo(m)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── STATS ──────────────────────────────────────────
  async getStats() {
    const [totali, disponibili, assegnati, canoniRaw, scadenzeImminenti] = await Promise.all([
      this.prisma.mezzo.count({ where: { deletedAt: null } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'DISPONIBILE' } }),
      this.prisma.mezzo.count({ where: { deletedAt: null, stato: 'ASSEGNATO' } }),
      this.prisma.mezzo.findMany({
        where: { deletedAt: null, canoneNoleggio: { not: null } },
        select: { canoneNoleggio: true, rataNoleggio: true },
      }),
      this.prisma.mezzo.count({
        where: {
          deletedAt: null,
          stato: { notIn: ['DISMESSO', 'VENDUTO'] },
          OR: [
            { scadenzaAssicurazione: { lte: new Date(Date.now() + 30 * 86400000) } },
            { scadenzaRevisione: { lte: new Date(Date.now() + 30 * 86400000) } },
          ],
        },
      }),
    ]);

    const entrateNoleggio = canoniRaw.reduce((s, m) => s + Number(m.canoneNoleggio ?? 0), 0);
    const canoniNoleggio  = canoniRaw.reduce((s, m) => s + Number(m.rataNoleggio   ?? 0), 0);

    return {
      totali, disponibili, assegnati,
      entrateNoleggio,
      sommaRate: canoniNoleggio,
      margine: entrateNoleggio - canoniNoleggio,
      scadenzeImminenti,
    };
  }

  // ─── SCADENZE ───────────────────────────────────────
  async getScadenze(giorni = 30) {
    const entro = new Date(Date.now() + giorni * 86400000);
    return this.prisma.mezzo.findMany({
      where: {
        deletedAt: null,
        // Un mezzo dismesso/venduto è fuori flotta: le sue scadenze non
        // interessano più, altrimenti restano per sempre in lista come dati
        // obsoleti (bug segnalato: scadenze "imminenti" di mezzi non più in uso).
        stato: { notIn: ['DISMESSO', 'VENDUTO'] },
        OR: [
          { scadenzaAssicurazione: { lte: entro } },
          { scadenzaRevisione: { lte: entro } },
          { scadenzaBollo: { lte: entro } },
          { fineNoleggio: { lte: entro } },
        ],
      },
      include: {
        assegnazioni: {
          where: { deletedAt: null, dataFine: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          take: 1,
        },
      },
      orderBy: { scadenzaAssicurazione: 'asc' },
    });
  }

  // ─── DETAIL ─────────────────────────────────────────
  async findOne(id: string) {
    const mezzo = await this.prisma.mezzo.findFirst({
      where: { id, deletedAt: null },
      include: {
        assegnazioni: {
          where: { deletedAt: null },
          include: { padroncino: { select: { id: true, ragioneSociale: true } } },
          orderBy: { dataInizio: 'desc' },
        },
        // tags, documenti, noteEntita rimossi: relazioni polimorfiche eliminate dallo schema
      },
    });
    if (!mezzo) throw new NotFoundException('Mezzo non trovato');
    return this.normalizeMezzo(mezzo);
  }

  // ─── IMPORTA EXCEL ──────────────────────────────────
async importaExcel(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const risultati: { creati: number; aggiornati: number; errori: string[] } = {
    creati: 0,
    aggiornati: 0,
    errori: [],
  };

  const FOGLI: Array<{
    nome: string; stato: string; tipoPossesso: string;
    colTarga: number; colMarca: number; colModello: number;
    colAlimentazione: number; colScadAssicurazione: number;
    colScadRevisione: number; colScadBollo: number | null;
    colProprietario: number; colInizioContratto: number;
    colFineContratto: number; colCanone: number; colRata: number;
    colKmLimite: number | null; colKmAttuali: number | null;
    colImmatric: number | null; colNote: number | null;
    colPadroncino: number | null;
  }> = [
    {
      nome: 'PARCO VEICOLI MEDISUD SRL',
      stato: 'DISPONIBILE',
      tipoPossesso: 'PROPRIETA',
      colTarga: 2, colMarca: 3, colModello: 4, colAlimentazione: 9,
      colScadAssicurazione: 10, colScadRevisione: 12, colScadBollo: 11,
      colProprietario: 15, colInizioContratto: 16, colFineContratto: 17,
      colCanone: 18, colRata: 22, colKmLimite: null, colKmAttuali: 24,
      colImmatric: 6, colNote: 23,
      colPadroncino: 18, // Colonna S
    },
    {
      nome: 'NOLEGGIO LUNGO TERMINE',
      stato: 'DISPONIBILE',
      tipoPossesso: 'NOLEGGIO',
      colTarga: 2, colMarca: 3, colModello: 4, colAlimentazione: 6,
      colScadAssicurazione: 7, colScadRevisione: 8, colScadBollo: null,
      colProprietario: 9, colInizioContratto: 10, colFineContratto: 11,
      colCanone: 12, colRata: 14, colKmLimite: 15, colKmAttuali: 16,
      colImmatric: null, colNote: null,
      colPadroncino: 18, // Colonna S
    },
  ];

  const parseDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s || s === 'null') return null;
    const itMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (itMatch) return new Date(`${itMatch[3]}-${itMatch[2].padStart(2, '0')}-${itMatch[1].padStart(2, '0')}T00:00:00.000Z`);
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00.000Z`);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const parseNum = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, ''));
    return isNaN(n) ? null : n;
  };

  for (const foglio of FOGLI) {
    const ws = wb.Sheets[foglio.nome];
    if (!ws) continue;

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: 'yyyy-mm-dd' });

    let kmAttualiAl: Date | null = null;
    if (foglio.colKmAttuali !== null && rows[0]) {
      kmAttualiAl = parseDate(rows[0][foglio.colKmAttuali]);
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[foglio.colTarga]) continue;

      const targaRaw = row[foglio.colTarga];
      if (String(targaRaw).trim().toUpperCase() === 'TARGA') continue;

      const targa = String(targaRaw).trim().toUpperCase().replace(/\s+/g, '');
      if (targa.length < 5) continue;

      try {
        const marca = String(row[foglio.colMarca] ?? '').trim() || 'N/D';
        const modello = String(row[foglio.colModello] ?? '').trim() || marca;
        const padroncinoRaw = foglio.colPadroncino !== null ? String(row[foglio.colPadroncino] ?? '').trim() : null;

        // Prepariamo l'oggetto dati (rimuovendo i null se vuoi mantenere i valori esistenti nel DB)
        const dataPayload: any = {
          targa,
          marca,
          modello,
          alimentazione: this.mapAlimentazione(String(row[foglio.colAlimentazione] ?? '').trim()) as Alimentazione,
          stato: foglio.stato as StatoMezzo,
          tipo_possesso: foglio.tipoPossesso,
          societaNoleggio: row[foglio.colProprietario] ? String(row[foglio.colProprietario]).trim() : null,
          inizioNoleggio: parseDate(row[foglio.colInizioContratto]),
          fineNoleggio: parseDate(row[foglio.colFineContratto]),
          canoneNoleggio: parseNum(row[foglio.colCanone]),
          rataNoleggio: parseNum(row[foglio.colRata]),
          scadenzaAssicurazione: parseDate(row[foglio.colScadAssicurazione]),
          scadenzaRevisione: parseDate(row[foglio.colScadRevisione]),
          scadenzaBollo: foglio.colScadBollo !== null ? parseDate(row[foglio.colScadBollo]) : null,
          kmLimite: foglio.colKmLimite !== null ? parseNum(row[foglio.colKmLimite]) : null,
          kmAttuali: foglio.colKmAttuali !== null ? parseNum(row[foglio.colKmAttuali]) : null,
          km_attuali_al: kmAttualiAl,
          annoImmatricolazione: foglio.colImmatric !== null ? parseDate(row[foglio.colImmatric])?.getFullYear() : null,
          note: foglio.colNote !== null && row[foglio.colNote] ? String(row[foglio.colNote]).trim() : null,
        };

        // Pulizia dei null per non sovrascrivere dati esistenti con il nulla (opzionale)
        for (const key of Object.keys(dataPayload)) {
          if (dataPayload[key] === null) delete dataPayload[key];
        }

        // Controllo esistenza per UPDATE o CREATE
        let mezzo = await this.prisma.mezzo.findFirst({ where: { targa, deletedAt: null } });

        if (mezzo) {
          mezzo = await this.prisma.mezzo.update({ where: { id: mezzo.id }, data: dataPayload });
          risultati.aggiornati++;
        } else {
          mezzo = await this.prisma.mezzo.create({ data: { ...dataPayload, maggiorazioneRicarica: 20 } });
          risultati.creati++;
        }

        // ─── LOGICA ASSEGNAZIONE ───
        if (padroncinoRaw && padroncinoRaw.toLowerCase() !== 'null' && padroncinoRaw !== '') {
          const padroncino = await this.prisma.padroncino.findFirst({
            where: { ragioneSociale: { contains: padroncinoRaw, mode: 'insensitive' }, deletedAt: null },
          });

          if (padroncino) {
            // Cerchiamo se esiste già un'assegnazione attiva per questo mezzo
            const attiva = await this.prisma.assegnazioneMezzo.findFirst({
              where: { mezzoId: mezzo.id, deletedAt: null, dataFine: null },
            });

            // Se non c'è un'assegnazione attiva, o se è assegnato a un padroncino DIVERSO
            if (!attiva || attiva.padroncinoId !== padroncino.id) {
              // Se era assegnato a qualcun altro, chiudiamo la vecchia assegnazione
              if (attiva) {
                await this.prisma.assegnazioneMezzo.update({
                  where: { id: attiva.id },
                  data: { dataFine: new Date() },
                });
              }

              // Creiamo la nuova assegnazione
              await this.prisma.assegnazioneMezzo.create({
                data: {
                  mezzoId: mezzo.id,
                  padroncinoId: padroncino.id,
                  dataInizio: new Date(),
                },
              });

              // Portiamo lo stato del mezzo a ASSEGNATO
              await this.prisma.mezzo.update({
                where: { id: mezzo.id },
                data: { stato: 'ASSEGNATO' },
              });
            }
          } else {
            risultati.errori.push(`Targa ${targa}: padroncino "${padroncinoRaw}" non trovato nel database.`);
          }
        }
      } catch (err: any) {
        risultati.errori.push(`Targa ${targa}: ${err.message}`);
      }
    }
  }

  return risultati;
}

  private mapAlimentazione(raw: string): string {
    if (raw.includes('ELETTR')) return 'ELETTRICO';
    if (raw.includes('IBRIDO') || raw.includes('HYBRID')) return 'IBRIDO';
    if (raw.includes('MHEV') || raw.includes('MILD')) return 'GASOLIO_MHEV';
    if (raw.includes('BENZINA') || raw.includes('BENZ')) return 'BENZINA';
    if (raw.includes('METANO') || raw.includes('GNL') || raw.includes('GPL')) return 'METANO';
    if (raw === 'DIESEL') return 'DIESEL';
    return 'GASOLIO'; // default (copre anche 'GASOLIO' esplicito)
  }


  // ─── CREATE ─────────────────────────────────────────
  async create(dto: CreateMezzoDto, userId: string) {
    // ✅ FIX BUG 1: usare findFirst con deletedAt: null invece di findUnique
    // findUnique trovava anche i mezzi soft-deleted, impedendo il reinserimento
    const exists = await this.prisma.mezzo.findFirst({
      where: { targa: dto.targa, deletedAt: null },
    });
    if (exists) throw new ConflictException('Targa già esistente');

    const data = this.normalizeDto(dto);
    const mezzo = await this.prisma.mezzo.create({ data: data as any });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: mezzo.id,
      azione: 'CREATE', dataDopo: mezzo as any,
    });

    return this.normalizeMezzo(mezzo);
  }

  // ─── UPDATE ─────────────────────────────────────────
  async update(id: string, dto: UpdateMezzoDto, userId: string) {
    // Fetch "prima" senza relazioni: deve avere la stessa forma di "mezzo" (dataDopo)
    // qui sotto, altrimenti il diff nell'audit log segnala sempre falsi cambiamenti
    // (es. "assegnazioni") solo perché una versione include la relazione e l'altra no.
    const existing = await this.prisma.mezzo.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Mezzo non trovato');
    const data = this.normalizeDto(dto);

    const mezzo = await this.prisma.mezzo.update({ where: { id }, data: data as any });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: id,
      azione: 'UPDATE', dataPrima: existing as any, dataDopo: mezzo as any,
    });

    return this.normalizeMezzo(mezzo);
  }

  // ─── DUPLICA ────────────────────────────────────────
  // Copia tutti i campi del mezzo tranne: id, targa (rigenerata), createdAt/updatedAt/deletedAt,
  // stato/utilizzatore (resettati: la nuova copia non è assegnata) e note.
  // Assegnazioni, note (entità separata), log di audit e documenti NON vengono copiati:
  // partono vuoti per il nuovo mezzo perché sono relazioni indipendenti, non campi del record.
  async duplica(id: string, userId: string) {
    const original = await this.prisma.mezzo.findFirst({ where: { id, deletedAt: null } });
    if (!original) throw new NotFoundException('Mezzo non trovato');

    const {
      id: _id, targa: _targa, createdAt, updatedAt, deletedAt,
      note, stato, utilizzatore,
      ...rest
    } = original as any;

    const nuovaTarga = `COPIA-${original.targa}-${Date.now().toString().slice(-5)}`;

    const mezzo = await this.prisma.mezzo.create({
      data: {
        ...rest,
        targa: nuovaTarga,
        stato: 'DISPONIBILE',
        utilizzatore: null,
        note: null,
      },
    });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: mezzo.id,
      azione: 'CREATE', dataDopo: mezzo as any,
    });

    return this.normalizeMezzo(mezzo);
  }

  // ─── SOFT DELETE ────────────────────────────────────
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);

    await this.prisma.mezzo.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      userId, entityType: 'mezzo', entityId: id,
      azione: 'DELETE', dataPrima: existing as any,
    });

    return { deleted: true };
  }

  // ─── ASSEGNAZIONI ───────────────────────────────────
  async createAssegnazione(mezzoId: string, dto: CreateAssegnazioneMezzoDto, userId: string) {
    const mezzoInfo = await this.findOne(mezzoId); // validazione fuori dalla transazione

    // Operazioni atomiche: chiudi attiva + crea nuova + aggiorna stato mezzo
    let chiusaAttiva: { id: string; ragioneSociale?: string } | null = null;
    const assegnazione = await this.prisma.$transaction(async (tx) => {
      const attiva = await tx.assegnazioneMezzo.findFirst({
        where: { mezzoId, deletedAt: null, dataFine: null },
        include: { padroncino: { select: { ragioneSociale: true } } },
      });
      if (attiva) {
        await tx.assegnazioneMezzo.update({
          where: { id: attiva.id },
          data: { dataFine: new Date(dto.dataInizio) },
        });
        chiusaAttiva = { id: attiva.id, ragioneSociale: attiva.padroncino?.ragioneSociale };
      }

      const assegnazione = await tx.assegnazioneMezzo.create({
        data: {
          mezzoId,
          padroncinoId: dto.padroncinoId,
          dataInizio: new Date(dto.dataInizio),
          dataFine: dto.dataFine ? new Date(dto.dataFine) : null,
          note: dto.note,
        },
        include: {
          padroncino: { select: { id: true, ragioneSociale: true } },
          mezzo: { select: { targa: true } },
        },
      });

      await tx.mezzo.update({ where: { id: mezzoId }, data: { stato: 'ASSEGNATO' } });
      return assegnazione;
    });

    // Logga la chiusura implicita (riassegnazione), altrimenti sparisce dallo storico
    if (chiusaAttiva) {
      await this.audit.log({
        userId, entityType: 'assegnazione_mezzo', entityId: (chiusaAttiva as any).id,
        azione: 'CHIUDI_ASSEGNAZIONE',
        dataDopo: { targa: (mezzoInfo as any).targa, ragioneSociale: (chiusaAttiva as any).ragioneSociale } as any,
      });
    }

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazione.id,
      azione: 'ASSEGNA',
      dataDopo: {
        targa: assegnazione.mezzo.targa,
        ragioneSociale: assegnazione.padroncino.ragioneSociale,
        padroncinoId: dto.padroncinoId,
        mezzoId,
        dataInizio: dto.dataInizio,
      } as any,
    });

    return assegnazione;
  }

  async chiudiAssegnazione(assegnazioneId: string, userId: string, dataFineStr?: string) {
    const ass = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
      include: {
        mezzo: { select: { id: true, targa: true } },
        padroncino: { select: { id: true, ragioneSociale: true } },
      },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    const dataFine = resolveDataFineAssegnazione(dataFineStr, ass.dataInizio);

    // Atomico: chiudi assegnazione + aggiorna stato mezzo se necessario
    await this.prisma.$transaction(async (tx) => {
      await tx.assegnazioneMezzo.update({
        where: { id: assegnazioneId },
        data: { dataFine },
      });
      const altreAttive = await tx.assegnazioneMezzo.count({
        where: { mezzoId: ass.mezzo.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
      });
      if (altreAttive === 0) {
        await tx.mezzo.update({ where: { id: ass.mezzo.id }, data: { stato: 'DISPONIBILE' } });
      }
    });

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazioneId,
      azione: 'CHIUDI_ASSEGNAZIONE',
      dataDopo: {
        targa: ass.mezzo.targa,
        ragioneSociale: ass.padroncino.ragioneSociale,
        padroncinoId: ass.padroncino.id,
        mezzoId: ass.mezzo.id,
        dataInizio: ass.dataInizio,
        dataFine,
      } as any,
    });

    return { closed: true };
  }

  async deleteAssegnazione(assegnazioneId: string, userId: string) {
    const ass = await this.prisma.assegnazioneMezzo.findFirst({
      where: { id: assegnazioneId, deletedAt: null },
      include: {
        mezzo: { select: { id: true, targa: true } },
        padroncino: { select: { id: true, ragioneSociale: true } },
      },
    });
    if (!ass) throw new NotFoundException('Assegnazione non trovata');

    // Soft delete dell'assegnazione
    await this.prisma.$transaction(async (tx) => {
      await tx.assegnazioneMezzo.update({
        where: { id: assegnazioneId },
        data: { deletedAt: new Date() },
      });

      // Ricalcola stato mezzo: se non rimangono assegnazioni attive → DISPONIBILE
      const altreAttive = await tx.assegnazioneMezzo.count({
        where: { mezzoId: ass.mezzo.id, deletedAt: null, dataFine: null, id: { not: assegnazioneId } },
      });
      if (altreAttive === 0) {
        await tx.mezzo.update({ where: { id: ass.mezzo.id }, data: { stato: 'DISPONIBILE' } });
      }
    });

    await this.audit.log({
      userId, entityType: 'assegnazione_mezzo', entityId: assegnazioneId,
      azione: 'DELETE',
      dataPrima: {
        targa: ass.mezzo.targa,
        ragioneSociale: ass.padroncino.ragioneSociale,
        padroncinoId: ass.padroncino.id,
        mezzoId: ass.mezzo.id,
        dataInizio: ass.dataInizio,
        dataFine: ass.dataFine,
      } as any,
    });

    return { deleted: true };
  }
}
