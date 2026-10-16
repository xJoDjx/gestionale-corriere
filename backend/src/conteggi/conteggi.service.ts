import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConteggioDto, UpdateConteggioStatoDto, CreateRigaDto, UpdateRigaDto, DuplicaConteggioDto, DuplicaBulkDto, UpdateNoteConteggioDto, ReplaceRigheDto } from './conteggi.dto';
import { Segno } from '@prisma/client';
import * as XLSX from 'xlsx';
import { calcolaTotaliConteggio } from './conteggi-calc.utils';

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
        padroncino: { deletedAt: null },   // dismessi inclusi: lo storico deve restare visibile
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

    return conteggi.map((c) => {
      const totali = this.calcolaTotali(c.righe);
      // Se il detail ha salvato il proprio "Netto da bonificare", lo usiamo
      // come sorgente di verità (la formula del detail include palmari/mezzi
      // calcolati live che possono differire leggermente dai saved rows).
      const nettoFinale = c.nettoSalvato != null
        ? Number(c.nettoSalvato)
        : totali.netto;
      return {
        ...c,
        ...totali,
        netto: nettoFinale,
      };
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

  // ─── CALCOLO TOTALI (formula unica, coerente con UI DettaglioConteggio) ───
  // FATTURATO è salvato come imponibile → moltiplichiamo ×1.22
  // NOLEGGIO, RICARICA, ADDEBITO: importo salvato con IVA già inclusa
  // PALMARE: importo salvato come IMPONIBILE (senza IVA) → applichiamo ×1.22
  // BOLLO VIRTUALE: se la somma degli imponibili esenti (IVA ≠ 22) di
  //   RICARICA + ADDEBITO ≥ SOGLIA_BOLLO, si aggiunge COSTO_BOLLO (2,00 €)
  // COMPENSAZIONI (ACCREDITO, BONUS, FINE_MESE, ACCONTO) vanno sottratte
  // ACCONTO_FATTURA = acconto inserito manualmente nella tab Fatturato:
  //   l'importo è salvato come NEGATIVO → incluso nel totale FATTURATO,
  //   dove riduce direttamente il lordo. NON va nelle compensazioni (evita doppio conteggio).
  //   Nelle statistiche viene ignorato (contate solo righe tipo FATTURATO),
  //   così il fatturato lordo rimane corretto.
  private calcolaTotali(
    righe: { tipo: string; importo: any; percIva?: any; segno?: any }[],
  ) {
    return calcolaTotaliConteggio(righe);
  }

  // ─── DETTAGLIO CON TOTALI ───────────────────────────
  async findOneWithTotals(id: string) {
    const conteggio = await this.findOne(id);
    const totali = this.calcolaTotali(conteggio.righe);
    const nettoFinale = (conteggio as any).nettoSalvato != null
      ? Number((conteggio as any).nettoSalvato)
      : totali.netto;

    // Addebiti sospesi PENDENTI per questo padroncino in questo mese
    const addebitivSospesi = await this.prisma.addebitoSospeso.findMany({
      where: {
        padroncinoId: conteggio.padroncinoId,
        meseTarget:   conteggio.mese,
        stato:        'PENDENTE',
        deletedAt:    null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { ...conteggio, ...totali, netto: nettoFinale, addebitivSospesi };
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

    // Deduplica per mezzoId: se lo stesso mezzo ha più assegnazioni nel mese
    // (es. riassegnato dopo una chiusura), crea UNA SOLA riga noleggio.
    const mezziGiaInseriti = new Set<string>();
    for (const ass of assegnazioniMezzi) {
      if (mezziGiaInseriti.has(ass.mezzo.id)) continue;
      mezziGiaInseriti.add(ass.mezzo.id);
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

    // N.B. tariffaMensile contiene in realtà la TARIFFA GIORNALIERA (es. 1.99 €/gg)
    // Si moltiplica per i giorni del mese per ottenere il costo totale mensile.
    const giorniMese = new Date(Date.UTC(_year, _month, 0)).getUTCDate();
    // Deduplica per palmareId (stesso motivo della deduplicazione mezzi)
    const palmariGiaInseriti = new Set<string>();
    for (const ass of assegnazioniPalmari) {
      if (palmariGiaInseriti.has(ass.palmare.id)) continue;
      palmariGiaInseriti.add(ass.palmare.id);
      const tariffaGiorno = Number(ass.palmare.tariffaMensile ?? 0);
      if (tariffaGiorno > 0) {
        const importoMese = +(tariffaGiorno * giorniMese).toFixed(2);
        await this.prisma.conteggiRiga.create({
          data: {
            conteggioMensileId: conteggioId,
            tipo: 'PALMARE',
            descrizione: `Palmare ${ass.palmare.codice} — ${tariffaGiorno.toFixed(2)} €/gg × ${giorniMese}gg`,
            importo: importoMese,
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

    const padroncino = await this.prisma.padroncino.findUnique({
      where: { id: conteggio.padroncinoId },
      select: { ragioneSociale: true },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: { stato: conteggio.stato } as any,
      dataDopo: {
        azione: 'cambio_stato',
        stato: dto.stato,
        mese: conteggio.mese,
        padroncino: padroncino?.ragioneSociale,
      } as any,
    });

    return updated;
  }

  // ─── AGGIORNA NOTE ──────────────────────────────────
  async updateNote(id: string, dto: UpdateNoteConteggioDto, userId: string) {
    const conteggio = await this.findOne(id);
    const updated = await this.prisma.conteggioMensile.update({
      where: { id },
      data: { note: dto.note ?? null },
    });
    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: { note: conteggio.note } as any,
      dataDopo: { azione: 'aggiorna_note', note: dto.note } as any,
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

    // Le righe sono cambiate: invalida il netto salvato finché il detail
    // non persisterà di nuovo il valore calcolato.
    await this.prisma.conteggioMensile.update({
      where: { id: conteggioId },
      data: { nettoSalvato: null },
    });

    const padroncino = await this.prisma.padroncino.findUnique({
      where: { id: conteggio.padroncinoId },
      select: { ragioneSociale: true },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: riga.id,
      azione: 'CREATE',
      dataDopo: {
        ...(riga as any),
        mese: conteggio.mese,
        padroncino: padroncino?.ragioneSociale,
      } as any,
    });

    return riga;
  }

  async updateRiga(rigaId: string, dto: UpdateRigaDto, userId: string) {
    const riga = await this.prisma.conteggiRiga.findUnique({
      where: { id: rigaId },
      include: {
        conteggioMensile: {
          include: { padroncino: { select: { ragioneSociale: true } } },
        },
      },
    });
    if (!riga) throw new NotFoundException('Riga non trovata');
    if (riga.conteggioMensile.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    const updated = await this.prisma.conteggiRiga.update({
      where: { id: rigaId },
      data: { ...dto, modificaManuale: true },
    });

    await this.prisma.conteggioMensile.update({
      where: { id: riga.conteggioMensileId },
      data: { nettoSalvato: null },
    });

    const { conteggioMensile, ...rigaData } = riga;
    const ctx = {
      mese: conteggioMensile.mese,
      padroncino: (conteggioMensile as any).padroncino?.ragioneSociale,
    };

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: rigaId,
      azione: 'UPDATE',
      dataPrima: { ...rigaData, ...ctx } as any,
      dataDopo: { ...updated, ...ctx } as any,
    });

    return updated;
  }

  async deleteRiga(rigaId: string, userId: string) {
    const riga = await this.prisma.conteggiRiga.findUnique({
      where: { id: rigaId },
      include: {
        conteggioMensile: {
          include: { padroncino: { select: { ragioneSociale: true } } },
        },
      },
    });
    if (!riga) throw new NotFoundException('Riga non trovata');
    if (riga.conteggioMensile.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    await this.prisma.conteggiRiga.delete({ where: { id: rigaId } });

    await this.prisma.conteggioMensile.update({
      where: { id: riga.conteggioMensileId },
      data: { nettoSalvato: null },
    });

    const { conteggioMensile, ...rigaData } = riga;

    await this.audit.log({
      userId,
      entityType: 'conteggio_riga',
      entityId: rigaId,
      azione: 'DELETE',
      dataPrima: {
        ...rigaData,
        mese: conteggioMensile.mese,
        padroncino: (conteggioMensile as any).padroncino?.ragioneSociale,
      } as any,
    });

    return { deleted: true };
  }

  // ─── REPLACE RIGHE (bulk save atomico, audit granulare per riga) ───────────
  // Sostituisce TUTTE le righe del conteggio in un'unica transazione Prisma,
  // ma logga UN evento audit per ogni riga effettivamente aggiunta/modificata/
  // eliminata (stesso formato di addRiga/updateRiga/deleteRiga), così il log
  // del conteggio mostra "Aggiunto addebito X di Y€", "Modificato importo
  // noleggio ... da A a B", ecc. invece di un generico "Salvato conteggio".
  async replaceRighe(conteggioId: string, dto: ReplaceRigheDto, userId: string) {
    const conteggio = await this.findOne(conteggioId);
    if (conteggio.stato === 'CONFERMATO') {
      throw new BadRequestException('Non puoi modificare un conteggio confermato');
    }

    const padroncino = await this.prisma.padroncino.findUnique({
      where: { id: conteggio.padroncinoId },
      select: { ragioneSociale: true },
    });
    const ctx = { mese: conteggio.mese, padroncino: padroncino?.ragioneSociale };

    // ── Smart UPSERT: preserva updatedAt delle righe non cambiate ────────────
    // Carica le righe esistenti nel DB
    const existingRighe = await this.prisma.conteggiRiga.findMany({
      where: { conteggioMensileId: conteggioId },
    });
    const existingMap = new Map(existingRighe.map((r) => [r.id, r]));

    // Mappa secondaria tipo+riferimentoId: alcune righe (es. NOLEGGIO/RICARICA
    // non modificate manualmente) arrivano dal frontend con un id "sintetico"
    // (es. "mez-<mezzoId>") invece dell'id reale della riga già salvata, perché
    // vengono ricalcolate live dai mezzi assegnati. Senza questo fallback ogni
    // salvataggio le cancellerebbe e ricreerebbe da zero, perdendo lo storico
    // e riempiendo il log di falsi "eliminato"/"aggiunto".
    const byTipoRiferimento = new Map<string, (typeof existingRighe)[number]>();
    for (const ex of existingRighe) {
      if (ex.riferimentoId) byTipoRiferimento.set(`${ex.tipo}::${ex.riferimentoId}`, ex);
    }

    const matchedIds = new Set<string>();          // id DB già abbinati in questo salvataggio
    const toUpdate: { id: string; data: any; prima: any }[] = [];
    const toInsert: any[] = [];

    const imp = (v: any) => Math.round(Number(v ?? 0) * 100);
    const str = (v: any) => v ?? null;

    for (let i = 0; i < dto.righe.length; i++) {
      const r = dto.righe[i];
      const ordine = r.ordine ?? i;
      // Includiamo un campo SOLO se il frontend lo ha effettivamente inviato:
      // un campo assente non va né confrontato né sovrascritto a null, altrimenti
      // una riga costruita da un percorso del frontend che non valorizza un
      // certo campo (es. FINE_MESE non invia percIva) risulterebbe "modificata"
      // ad ogni salvataggio pur non avendo nulla di realmente cambiato.
      const rowData: any = {
        conteggioMensileId: conteggioId,
        tipo:            r.tipo,
        descrizione:     r.descrizione,
        importo:         r.importo,
        segno:           r.segno,
        ordine,
        modificaManuale: r.modificaManuale ?? false,
      };
      if (r.categoria       !== undefined) rowData.categoria       = r.categoria;
      if (r.riferimentoTipo !== undefined) rowData.riferimentoTipo = r.riferimentoTipo;
      if (r.riferimentoId   !== undefined) rowData.riferimentoId   = r.riferimentoId;
      if (r.contoVoce       !== undefined) rowData.contoVoce       = r.contoVoce;
      if (r.percIva         !== undefined) rowData.percIva         = r.percIva;
      if (r.note             !== undefined) rowData.note            = r.note;

      // 1) match per id reale, 2) fallback per tipo+riferimentoId (vedi sopra)
      let ex = r.id && !r.id.startsWith('new-') ? existingMap.get(r.id) : undefined;
      if (!ex && r.riferimentoId) {
        const candidate = byTipoRiferimento.get(`${r.tipo}::${r.riferimentoId}`);
        if (candidate && !matchedIds.has(candidate.id)) ex = candidate;
      }

      if (ex) {
        matchedIds.add(ex.id);
        // Confronta solo i campi che il payload ha effettivamente inviato
        const changed =
          ex.tipo             !== rowData.tipo             ||
          ex.descrizione      !== rowData.descrizione      ||
          imp(ex.importo)     !== imp(rowData.importo)     ||
          ex.segno            !== rowData.segno            ||
          ex.ordine           !== rowData.ordine           ||
          ex.modificaManuale  !== rowData.modificaManuale  ||
          (r.categoria       !== undefined && str(ex.categoria)       !== str(rowData.categoria)) ||
          (r.riferimentoTipo !== undefined && str(ex.riferimentoTipo) !== str(rowData.riferimentoTipo)) ||
          (r.riferimentoId   !== undefined && str(ex.riferimentoId)   !== str(rowData.riferimentoId)) ||
          (r.contoVoce       !== undefined && str(ex.contoVoce)       !== str(rowData.contoVoce)) ||
          (r.percIva         !== undefined && imp(ex.percIva)         !== imp(rowData.percIva)) ||
          (r.note             !== undefined && str(ex.note)            !== str(rowData.note));

        if (changed) {
          const { conteggioMensileId: _omit, ...updateFields } = rowData;
          toUpdate.push({ id: ex.id, data: updateFields, prima: ex });
        }
        // else: dati identici → skip, updatedAt rimane invariato
      } else {
        toInsert.push(rowData);
      }
    }

    // Righe nel DB non più presenti nel payload → da eliminare
    const toDeleteRighe = existingRighe.filter((r) => !matchedIds.has(r.id));
    const toDelete = toDeleteRighe.map((r) => r.id);

    const inserted: any[] = [];
    const updated: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.conteggiRiga.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const { id, data } of toUpdate) {
        updated.push(await tx.conteggiRiga.update({ where: { id }, data }));
      }
      // Insert singoli (invece di createMany) per poter loggare ogni riga con
      // il suo id generato.
      for (const rowData of toInsert) {
        inserted.push(await tx.conteggiRiga.create({ data: rowData }));
      }
      await tx.conteggioMensile.update({
        where: { id: conteggioId },
        data: { nettoSalvato: dto.netto ?? null },
      });
    });

    // ── Audit granulare: un evento per ogni riga aggiunta/modificata/eliminata ──
    for (const riga of inserted) {
      await this.audit.log({
        userId, entityType: 'conteggio_riga', entityId: riga.id, azione: 'CREATE',
        dataDopo: { ...riga, ...ctx } as any,
      });
    }
    for (let i = 0; i < toUpdate.length; i++) {
      await this.audit.log({
        userId, entityType: 'conteggio_riga', entityId: updated[i].id, azione: 'UPDATE',
        dataPrima: { ...toUpdate[i].prima, ...ctx } as any,
        dataDopo:  { ...updated[i], ...ctx } as any,
      });
    }
    for (const riga of toDeleteRighe) {
      await this.audit.log({
        userId, entityType: 'conteggio_riga', entityId: riga.id, azione: 'DELETE',
        dataPrima: { ...riga, ...ctx } as any,
      });
    }

    // Se non è cambiata nessuna riga (es. solo ricalcolo del netto) logghiamo
    // comunque un evento minimo sul conteggio, altrimenti il salvataggio
    // sarebbe invisibile nel log.
    if (inserted.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      await this.audit.log({
        userId,
        entityType: 'conteggio_mensile',
        entityId:   conteggioId,
        azione:     'UPDATE',
        dataDopo: { azione: 'salva_netto', nettoSalvato: dto.netto, ...ctx } as any,
      });
    }

    return this.findOneWithTotals(conteggioId);
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

    const padroncino = await this.prisma.padroncino.findUnique({
      where: { id: conteggio.padroncinoId },
      select: { ragioneSociale: true },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: conteggioId,
      azione: 'UPDATE',
      dataDopo: {
        azione: 'rigenerazione_righe_automatiche',
        mese: conteggio.mese,
        padroncino: padroncino?.ragioneSociale,
      } as any,
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

      // Calcola totale shop fatte (somma consegneFatteShop di tutti i codici autista)
      const totalShopFatte = Array.from(entry.byCode.values()).reduce(
        (sum, c) => sum + c.tot.consegneFatteShop,
        0,
      );
      const shopImporto = Math.round(totalShopFatte * 0.50 * 100) / 100;
      const notaFattura = totalShopFatte > 0
        ? `Di cui ${shopImporto.toFixed(2)}€ Shop`
        : 'Importato da Fattura Proforma';

      if (rigaEsistente) {
        await this.prisma.conteggiRiga.update({
          where: { id: rigaEsistente.id },
          data: { importo: totale, modificaManuale: true, note: notaFattura },
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
            note: notaFattura,
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
    const conteggio = await this.findOne(id);
    await this.prisma.conteggioMensile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      userId, entityType: 'conteggio_mensile', entityId: id, azione: 'DELETE',
      dataPrima: {
        mese: conteggio.mese,
        padroncino: conteggio.padroncino.ragioneSociale,
        padroncinoId: conteggio.padroncinoId,
        stato: conteggio.stato,
      } as any,
    });
    return { deleted: true };
  }

  // ─── DUPLICA CONTEGGIO DA ALTRO MESE ────────────────
  // Copia tutte le righe del conteggio sorgente nel conteggio destinazione.
  // Se la destinazione non esiste, la crea (senza auto-generare righe).
  // Se esiste ed è in BOZZA, ne sostituisce le righe. Se è CONFERMATA, blocca.
  async duplicaDaMese(dto: DuplicaConteggioDto, userId: string) {
    const { padroncinoId, meseSorgente, meseDestinazione } = dto;

    if (meseSorgente === meseDestinazione) {
      throw new BadRequestException('Il mese sorgente e di destinazione coincidono');
    }

    const padroncino = await this.prisma.padroncino.findFirst({
      where: { id: padroncinoId, deletedAt: null },
    });
    if (!padroncino) throw new NotFoundException('Padroncino non trovato');

    const sorgente = await this.prisma.conteggioMensile.findFirst({
      where: { padroncinoId, mese: meseSorgente, deletedAt: null },
      include: { righe: { orderBy: { ordine: 'asc' } } },
    });
    if (!sorgente) throw new NotFoundException('Conteggio sorgente non trovato');

    // Duplichiamo SOLO le voci inserite manualmente dall'utente:
    //   - FATTURATO (fatturato distribuzione)
    //   - ADDEBITO  (addebiti vari)
    //   - FINE_MESE (fatture fine mese)
    // NOLEGGIO/PALMARE/RICARICA/ACCONTO/ACCREDITO/BONUS sono ricalcolati
    // automaticamente da mezzi assegnati, ricariche e acconti del mese
    // destinazione e quindi non vanno duplicati.
    const TIPI_DUPLICABILI = ['FATTURATO', 'ADDEBITO', 'FINE_MESE'];
    const righeDaCopiare = sorgente.righe.filter((r) =>
      TIPI_DUPLICABILI.includes(r.tipo),
    );
    if (righeDaCopiare.length === 0) {
      throw new BadRequestException(
        'Il conteggio sorgente non contiene righe duplicabili (fatturato, addebiti vari o fatture fine mese)',
      );
    }

    // Trova o crea il conteggio destinazione
    let destinazione = await this.prisma.conteggioMensile.findFirst({
      where: { padroncinoId, mese: meseDestinazione },
    });

    if (destinazione) {
      if (destinazione.deletedAt !== null) {
        // soft-deleted → rimuovi per liberare la unique constraint
        await this.prisma.conteggioMensile.delete({ where: { id: destinazione.id } });
        destinazione = null;
      } else if (destinazione.stato === 'CONFERMATO') {
        throw new BadRequestException('Il conteggio di destinazione è CONFERMATO e non può essere modificato');
      }
    }

    if (!destinazione) {
      // Auto-chiudi BOZZA del mese precedente (stessa logica di create())
      const [year, month] = meseDestinazione.split('-').map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevMese = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      await this.prisma.conteggioMensile.updateMany({
        where: { padroncinoId, mese: prevMese, stato: 'BOZZA', deletedAt: null },
        data: { stato: 'CHIUSO' },
      });

      destinazione = await this.prisma.conteggioMensile.create({
        data: { padroncinoId, mese: meseDestinazione },
      });
    } else {
      // Destinazione esistente e non confermata: svuota solo le righe dei tipi
      // che stiamo per duplicare (le altre — mezzi/palmari/ricariche/acconti —
      // sono state generate automaticamente per il mese destinazione e vanno
      // preservate).
      await this.prisma.conteggiRiga.deleteMany({
        where: {
          conteggioMensileId: destinazione.id,
          tipo: { in: TIPI_DUPLICABILI },
        },
      });
      // Invalida il netto salvato: le righe sono cambiate, la lista ricalcolerà
      // dalla formula backend finché il detail non salverà di nuovo.
      await this.prisma.conteggioMensile.update({
        where: { id: destinazione.id },
        data: { nettoSalvato: null },
      });
    }

    // Copia le righe (marcate manuale per evitare che rigenera-auto le sovrascriva)
    for (const r of righeDaCopiare) {
      await this.prisma.conteggiRiga.create({
        data: {
          conteggioMensileId: destinazione.id,
          tipo: r.tipo,
          descrizione: r.descrizione,
          importo: r.importo,
          segno: r.segno,
          categoria: r.categoria,
          riferimentoTipo: r.riferimentoTipo,
          riferimentoId: r.riferimentoId,
          ordine: r.ordine,
          modificaManuale: true,
          contoVoce: r.contoVoce,
          percIva: r.percIva,
          note: r.note,
        },
      });
    }

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: destinazione.id,
      azione: 'UPDATE',
      dataDopo: {
        azione: 'duplica_da_mese',
        meseSorgente,
        meseDestinazione,
        righeCopiate: righeDaCopiare.length,
        tipiCopiati: TIPI_DUPLICABILI,
        padroncino: padroncino.ragioneSociale,
      } as any,
    });

    return this.findOneWithTotals(destinazione.id);
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

  // ─── DUPLICA CONTEGGI IN BULK ────────────────────────
  // Duplica le voci manuali (FATTURATO, ADDEBITO, FINE_MESE) dal mese sorgente
  // al mese destinazione per TUTTI i padroncini attivi che hanno un conteggio
  // sorgente con almeno una voce duplicabile.
  async duplicaBulk(dto: DuplicaBulkDto, userId: string) {
    const { meseSorgente, meseDestinazione } = dto;
    if (meseSorgente === meseDestinazione) {
      throw new BadRequestException('Il mese sorgente e di destinazione coincidono');
    }

    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati: { padroncino: string; stato: string; id?: string; errore?: string }[] = [];
    for (const p of padroncini) {
      try {
        const conteggio = await this.duplicaDaMese(
          { padroncinoId: p.id, meseSorgente, meseDestinazione },
          userId,
        );
        risultati.push({ padroncino: p.ragioneSociale, stato: 'duplicato', id: conteggio.id });
      } catch (err: any) {
        // Errori attesi (sorgente assente / nessuna riga duplicabile / conteggio
        // confermato) vengono riportati come "saltato" invece di bloccare l'intero batch.
        const msg: string = err?.message ?? String(err);
        const saltabile =
          msg.includes('non trovato') ||
          msg.includes('non contiene righe duplicabili') ||
          msg.includes('CONFERMATO');
        risultati.push({
          padroncino: p.ragioneSociale,
          stato: saltabile ? 'saltato' : 'errore',
          errore: msg,
        });
      }
    }
    return risultati;
  }

  // ─── DASHBOARD: STATS DEL MESE ──────────────────────
  // Restituisce conteggio per stato + totali aggregati (fatturato, addebiti,
  // bonifici di conteggi confermati, da bonificare di conteggi non confermati).
  async getStats(mese?: string) {
    const targetMese = mese || this.meseCorrente();

    const [byStato, conteggiMese] = await Promise.all([
      this.prisma.conteggioMensile.groupBy({
        by: ['stato'],
        where: { deletedAt: null, mese: targetMese },
        _count: { _all: true },
      }),
      this.prisma.conteggioMensile.findMany({
        where: { deletedAt: null, mese: targetMese },
        include: { righe: true },
      }),
    ]);

    const stato = { BOZZA: 0, CHIUSO: 0, CONFERMATO: 0 } as Record<string, number>;
    for (const r of byStato) stato[r.stato] = r._count._all;
    const totali = stato.BOZZA + stato.CHIUSO + stato.CONFERMATO;

    let fatturato = 0;
    let addebiti = 0;
    let compensazioni = 0;
    let bonifici = 0;
    let daBonificare = 0;

    for (const c of conteggiMese) {
      const t = this.calcolaTotali(c.righe);
      fatturato     += t.fatturatoLordoImponibile; // imponibile, senza IVA (esclude ACCONTO_FATTURA)
      addebiti      += t.addebiti;
      compensazioni += t.compensazioni;
      const netto = c.nettoSalvato != null ? Number(c.nettoSalvato) : t.netto;
      if (c.stato === 'CONFERMATO') bonifici += netto;
      else daBonificare += netto;
    }

    return {
      mese: targetMese,
      totali,
      bozza: stato.BOZZA,
      chiuso: stato.CHIUSO,
      confermato: stato.CONFERMATO,
      fatturato:     Math.round(fatturato     * 100) / 100,
      addebiti:      Math.round(addebiti      * 100) / 100,
      compensazioni: Math.round(compensazioni  * 100) / 100,
      bonifici:      Math.round(bonifici       * 100) / 100,
      daBonificare:  Math.round(daBonificare   * 100) / 100,
    };
  }

  // ─── DASHBOARD: ANDAMENTO ULTIMI N MESI ─────────────
  async getAndamentoGlobale(mesi: number) {
    const meseCorr = this.meseCorrente();
    const mesiList = this.ultimiNMesi(meseCorr, mesi);
    const min = mesiList[0];

    const conteggi = await this.prisma.conteggioMensile.findMany({
      where: { deletedAt: null, mese: { gte: min, lte: meseCorr } },
      include: { righe: true },
    });

    type Acc = { fatturato: number; addebiti: number; bonifici: number; daBonificare: number };
    const byMese = new Map<string, Acc>();
    for (const m of mesiList) byMese.set(m, { fatturato: 0, addebiti: 0, bonifici: 0, daBonificare: 0 });

    for (const c of conteggi) {
      const acc = byMese.get(c.mese);
      if (!acc) continue;
      const t = this.calcolaTotali(c.righe);
      acc.fatturato += t.fatturatoLordoImponibile; // imponibile, senza IVA (esclude ACCONTO_FATTURA)
      acc.addebiti  += t.addebiti;
      const netto = c.nettoSalvato != null
        ? Number(c.nettoSalvato)
        : t.netto;
      if (c.stato === 'CONFERMATO') acc.bonifici += netto;
      else acc.daBonificare += netto;
    }

    return mesiList.map((m) => {
      const a = byMese.get(m)!;
      return {
        mese: m,
        fatturato: Math.round(a.fatturato * 100) / 100,
        addebiti: Math.round(a.addebiti * 100) / 100,
        bonifici: Math.round(a.bonifici * 100) / 100,
        daBonificare: Math.round(a.daBonificare * 100) / 100,
      };
    });
  }

  // ─── COMPETENZE ATTIVE (valore manuale per mese) ────
  // Valore unico inserito a mano dall'utente nella pagina Conteggi Mensili
  // e riportato come KPI in Dashboard. Non è collegato al dettaglio per
  // codice autista di Margini (StatisticaMargini/MarginiManuali).
  async getCompetenzeAttive(mese: string) {
    const rec = await (this.prisma as any).competenzaAttivaMese.findUnique({ where: { mese } });
    return { mese, valore: rec ? Number(rec.valore) : null };
  }

  async setCompetenzeAttive(mese: string, valore: number | null, userId: string) {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese)) {
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    }
    const prima = await (this.prisma as any).competenzaAttivaMese.findUnique({ where: { mese } });

    if (valore == null || isNaN(valore)) {
      if (prima) await (this.prisma as any).competenzaAttivaMese.delete({ where: { mese } });
      await this.audit.log({
        userId,
        entityType: 'competenze_attive_mese',
        entityId: mese,
        azione: 'DELETE',
        dataPrima: prima ? { mese, valore: Number(prima.valore) } : undefined,
      });
      return { mese, valore: null };
    }

    const rec = await (this.prisma as any).competenzaAttivaMese.upsert({
      where: { mese },
      create: { mese, valore },
      update: { valore },
    });
    await this.audit.log({
      userId,
      entityType: 'competenze_attive_mese',
      entityId: mese,
      azione: prima ? 'UPDATE' : 'CREATE',
      dataPrima: prima ? { mese, valore: Number(prima.valore) } : undefined,
      dataDopo: { mese, valore: Number(rec.valore) },
    });
    return { mese, valore: Number(rec.valore) };
  }

  // ─── DASHBOARD: TOP PADRONCINI DA BONIFICARE ────────
  async getTopDaBonificare(mese: string | undefined, limit: number) {
    const targetMese = mese || this.meseCorrente();
    const conteggi = await this.prisma.conteggioMensile.findMany({
      where: { deletedAt: null, mese: targetMese, stato: { not: 'CONFERMATO' } },
      include: {
        righe: true,
        padroncino: { select: { id: true, ragioneSociale: true } },
      },
    });

    const rows = conteggi.map((c) => {
      const netto = c.nettoSalvato != null
        ? Number(c.nettoSalvato)
        : this.calcolaTotali(c.righe).netto;
      return {
        padroncinoId: c.padroncinoId,
        ragioneSociale: c.padroncino.ragioneSociale,
        conteggioId: c.id,
        stato: c.stato,
        daBonificare: Math.round(netto * 100) / 100,
      };
    });

    return rows
      .filter((r) => r.daBonificare > 0)
      .sort((a, b) => b.daBonificare - a.daBonificare)
      .slice(0, limit);
  }

  private meseCorrente(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private ultimiNMesi(meseFinale: string, n: number): string[] {
    const [y, m] = meseFinale.split('-').map(Number);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }

  // ─── AGGIORNA NETTO SALVATO ─────────────────────────
  // Il detail del conteggio calcola il "Netto da bonificare" a partire dallo
  // stato di lavoro (palmari/mezzi/ricariche live). Al momento del salvataggio
  // persistiamo quel valore qui, così la lista mostra ESATTAMENTE lo stesso
  // importo visualizzato nel dettaglio.
  async updateNettoSalvato(id: string, netto: number, userId: string) {
    const conteggio = await this.prisma.conteggioMensile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!conteggio) throw new NotFoundException('Conteggio non trovato');

    const updated = await this.prisma.conteggioMensile.update({
      where: { id },
      data: { nettoSalvato: netto },
    });

    const padroncino = await this.prisma.padroncino.findUnique({
      where: { id: conteggio.padroncinoId },
      select: { ragioneSociale: true },
    });

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: id,
      azione: 'UPDATE',
      dataPrima: { nettoSalvato: conteggio.nettoSalvato } as any,
      dataDopo: {
        azione: 'salva_netto',
        nettoSalvato: netto,
        mese: conteggio.mese,
        padroncino: padroncino?.ragioneSociale,
      } as any,
    });

    return updated;
  }
}
