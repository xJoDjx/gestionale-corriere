import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as XLSX from 'xlsx';

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

export interface UpdateAccontoDto {
  codiceAutista?: string;
  importo?: number;
  data?: string;
  tipo?: 'ACCONTO' | 'RESTITUZIONE';
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
    // STORICO: usiamo la data dell'acconto per trovare l'assegnazione attiva in quel momento
    const result = await Promise.all(
      acconti.map(async (a) => {
        const dataAcconto = a.data;
        const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
          where: {
            codiceAutistaId: a.codiceAutistaId,
            deletedAt: null,
            dataInizio: { lte: dataAcconto },
            OR: [
              { dataFine: null },
              { dataFine: { gte: dataAcconto } },
            ],
          },
          // In caso di overlap tra due assegnazioni, preferisce la più recente
          orderBy: { dataInizio: 'desc' },
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
    // Trova tutti gli acconti il cui codice autista era assegnato a questo padroncino
    // ALLA DATA dell'acconto (non necessariamente oggi).
    // Strategia: carica gli acconti del mese (o tutti), poi filtra per storico assegnazione.
    const acconti = await this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        ...(mese && { mese }),
      },
      include: {
        codiceAutista: { select: { codice: true, nome: true, cognome: true } },
      },
      orderBy: { data: 'desc' },
    });

    // Filtra tenendo conto dello storico: l'acconto appartiene a questo padroncino
    // se alla data dell'acconto il codice autista era assegnato a lui.
    const result: typeof acconti = [];
    for (const a of acconti) {
      const assegnazione = await this.prisma.assegnazioneCodiceAutista.findFirst({
        where: {
          codiceAutistaId: a.codiceAutistaId,
          padroncinoId,
          deletedAt: null,
          dataInizio: { lte: a.data },
          OR: [
            { dataFine: null },
            { dataFine: { gte: a.data } },
          ],
        },
      });
      if (assegnazione) result.push(a);
    }
    return result;
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

  async update(id: string, dto: UpdateAccontoDto, userId: string) {
    const existing = await this.prisma.acconto.findFirst({
      where: { id, deletedAt: null },
      include: { codiceAutista: true },
    });
    if (!existing) throw new NotFoundException('Acconto non trovato');

    // Se viene fornito un codice autista testuale, risolvilo in id
    let codiceAutistaId = existing.codiceAutistaId;
    if (dto.codiceAutista !== undefined) {
      const ca = await this.prisma.codiceAutista.findFirst({
        where: { codice: dto.codiceAutista.trim().toUpperCase(), deletedAt: null },
      });
      if (!ca) throw new NotFoundException(`Codice autista "${dto.codiceAutista}" non trovato`);
      codiceAutistaId = ca.id;
    }

    // Gestione tipo + descrizione (retrocompatibilità con prefisso [RESTITUZIONE])
    const isRest =
      dto.tipo === 'RESTITUZIONE' ||
      (dto.tipo === undefined &&
        (existing.descrizione?.startsWith('[RESTITUZIONE]') ?? false));
    let descrizione = dto.descrizione !== undefined ? dto.descrizione : existing.descrizione;
    if (descrizione) descrizione = descrizione.replace(/^\[RESTITUZIONE\]\s*/, '');
    const descrSalvata = isRest && descrizione
      ? `[RESTITUZIONE] ${descrizione}`
      : isRest
      ? '[RESTITUZIONE]'
      : descrizione;

    const data = dto.data ? new Date(dto.data) : existing.data;
    const mese = dto.mese ?? dto.data?.substring(0, 7) ?? existing.mese;

    const updated = await this.prisma.acconto.update({
      where: { id },
      data: {
        codiceAutistaId,
        importo: dto.importo != null ? dto.importo : existing.importo,
        data,
        descrizione: descrSalvata,
        mese,
        note: dto.note !== undefined ? dto.note : existing.note,
      },
    });

    await this.audit.log({
      userId,
      entityType: 'acconto',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: existing as any,
      dataDopo: updated as any,
    });

    return { ...updated, importo: Number(updated.importo) };
  }

  async importaExcel(
    file: Express.Multer.File,
    mese: string,
    userId: string,
  ) {
    if (!file) throw new BadRequestException('File mancante');
    if (!mese || !/^\d{4}-\d{2}$/.test(mese)) {
      throw new BadRequestException('Mese di competenza non valido (atteso YYYY-MM)');
    }

    const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

    // Estrae il codice numerico da stringhe tipo "PRELIEVO 5012" (anche "prelievo  12A")
    const estraiCodice = (v: any): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      const m = s.replace(/prelievo/ig, '').trim();
      return m ? m.toUpperCase() : null;
    };

    // Converte data Excel (Date | serial | stringa) in Date JS
    const estraiData = (v: any): Date | null => {
      if (v == null || v === '') return null;
      if (v instanceof Date) return v;
      if (typeof v === 'number') {
        // Excel serial → Date (base 1899-12-30)
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof v === 'string') {
        // tenta "DD/MM/YYYY" o ISO
        const t = v.trim();
        const it = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (it) {
          const [_, dd, mm, yy] = it;
          const yyyy = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
          const d = new Date(Date.UTC(yyyy, Number(mm) - 1, Number(dd)));
          return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    const toNum = (v: any): number => {
      if (v == null || v === '') return NaN;
      if (typeof v === 'number') return v;
      const s = String(v).replace(/\s/g, '').replace(',', '.');
      const n = Number(s);
      return isNaN(n) ? NaN : n;
    };

    // Salta header se la prima cella non è né data né numero
    const dataRows = rows.filter((r, idx) => {
      if (idx === 0) {
        const a = r[0];
        if (typeof a === 'string' && !/^\d/.test(a.trim())) return false;
      }
      return Array.isArray(r) && r.length > 0;
    });

    type Esito = { riga: number; codice?: string; importo?: number; azione: 'creato' | 'saltato'; motivo?: string };
    const esiti: Esito[] = [];
    let creati = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rigaExcel = rows.indexOf(row) + 1; // 1-based per messaggi utente
      const data = estraiData(row[0]);
      const codice = estraiCodice(row[1]);
      const importo = toNum(row[3]);
      const descrizione = row[4] != null ? String(row[4]).trim() || undefined : undefined;

      if (!data) { esiti.push({ riga: rigaExcel, azione: 'saltato', motivo: 'data mancante/invalida' }); continue; }
      if (!codice) { esiti.push({ riga: rigaExcel, azione: 'saltato', motivo: 'codice mancante' }); continue; }
      if (!Number.isFinite(importo) || importo <= 0) {
        esiti.push({ riga: rigaExcel, codice, azione: 'saltato', motivo: 'importo non valido' });
        continue;
      }

      const ca = await this.prisma.codiceAutista.findFirst({
        where: { codice, deletedAt: null },
      });
      if (!ca) {
        esiti.push({ riga: rigaExcel, codice, importo, azione: 'saltato', motivo: 'codice autista non trovato' });
        continue;
      }

      const created = await this.prisma.acconto.create({
        data: {
          codiceAutistaId: ca.id,
          importo,
          data,
          descrizione,
          mese,
        },
      });
      creati++;

      await this.audit.log({
        userId,
        entityType: 'acconto',
        entityId: created.id,
        azione: 'CREATE',
        dataDopo: {
          origine: 'import_excel',
          codice,
          importo,
          mese,
        } as any,
      });

      esiti.push({ riga: rigaExcel, codice, importo, azione: 'creato' });
    }

    return {
      creati,
      saltati: esiti.filter((e) => e.azione === 'saltato').length,
      totaleRighe: dataRows.length,
      esiti,
    };
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.acconto.findFirst({
      where: { id, deletedAt: null },
      include: {
        codiceAutista: { select: { codice: true, nome: true, cognome: true } },
      },
    });
    if (!existing) throw new NotFoundException('Acconto non trovato');

    await this.prisma.acconto.update({ where: { id }, data: { deletedAt: new Date() } });

    // Rimuovi le ConteggiRiga di tipo ACCONTO che riferiscono questo acconto,
    // ma solo per conteggi non ancora CONFERMATI (i confermati sono immutabili).
    const righeOrfane = await this.prisma.conteggiRiga.findMany({
      where: { tipo: 'ACCONTO', riferimentoId: id },
      include: { conteggioMensile: { select: { stato: true } } },
    });
    const righeEliminabili = righeOrfane.filter(
      (r) => r.conteggioMensile.stato !== 'CONFERMATO',
    );
    if (righeEliminabili.length > 0) {
      await this.prisma.conteggiRiga.deleteMany({
        where: { id: { in: righeEliminabili.map((r) => r.id) } },
      });
      // Invalida il netto salvato dei conteggi toccati
      const conteggioIds = [...new Set(righeEliminabili.map((r) => r.conteggioMensileId))];
      await this.prisma.conteggioMensile.updateMany({
        where: { id: { in: conteggioIds } },
        data: { nettoSalvato: null },
      });
    }

    const { codiceAutista, ...accDati } = existing as any;
    await this.audit.log({
      userId, entityType: 'acconto', entityId: id, azione: 'DELETE',
      dataPrima: {
        ...accDati,
        codiceAutista: codiceAutista?.codice,
        nomeAutista: [codiceAutista?.nome, codiceAutista?.cognome].filter(Boolean).join(' ') || undefined,
      } as any,
      dataDopo: righeEliminabili.length > 0
        ? { righeConteggioEliminate: righeEliminabili.length } as any
        : undefined,
    });
    return { deleted: true };
  }
}
