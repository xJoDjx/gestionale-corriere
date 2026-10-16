import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calcolaTotaliConteggio } from '../conteggi/conteggi-calc.utils';

// ── Soglie tariffe ────────────────────────────────────────────────────────────
// Ingiustificati: tariffaFissa < 10 → usa tariffa; >= 10 → usa 1€
const SOGLIA_TARIFFA_ALTA = 10;
// Forza Maggiore: tariffaFissa > 5 → codice escluso (non si applica la trattenuta)
const SOGLIA_ESCLUSIONE_FM = 5;
// Statistica Consegne: % Non Consegnate >= 13 → segnalato in rosso
export const SOGLIA_NON_CONSEGNATE = 13;

// ── Types condivisi ───────────────────────────────────────────────────────────

export type AzioneApplica =
  | 'creato'
  | 'aggiornato'
  | 'saltato_confermato'
  | 'conteggio_non_trovato'
  | 'padroncino_non_trovato';

export interface ApplicaRisultatoRiga {
  nome: string;
  importo: number;
  azione: AzioneApplica;
}

export interface ApplicaResult {
  applicati: number;
  saltati: number;
  risultati: ApplicaRisultatoRiga[];
}

// ── Types Consegne Doppie ─────────────────────────────────────────────────────

export interface RigaDettaglio {
  nome: string;
  codice: string;
  spedDoppie: number;
  spedDoppieMetà: number;
}

export interface RigaTotale {
  nome: string;
  spedDoppie: number;
  spedDoppieMetà: number;
}

export interface ContaDoppiResult {
  dettaglio: RigaDettaglio[];
  totali: RigaTotale[];
  codiciNonAssociati: string[];
  totaleSpedizioniAnalizzate: number;
  totaleDoppiTrovati: number;
}

export interface ApplicaRiga {
  nome: string;
  spedDoppieMetà: number;
}

// ── Types Ingiustificati ──────────────────────────────────────────────────────

export interface RigaIngiustificatiDettaglio {
  nome: string;
  codice: string;
  tariffaFissa: number | null;
  tariffaApplicata: number;    // tariffa reale se < SOGLIA, altrimenti 1€
  spedIngiustificate: number;
  importo: number;             // spedIngiustificate × tariffaApplicata
}

export interface RigaIngiustificatiTotale {
  nome: string;
  spedIngiustificate: number;
  importo: number;
}

export interface IngiustificatiResult {
  dettaglio: RigaIngiustificatiDettaglio[];
  totali: RigaIngiustificatiTotale[];
  codiciNonAssociati: string[];
  totaleSpedizioniAnalizzate: number;
  totaleIngiustificati: number;
  totaleImporto: number;
}

export interface ApplicaIngiustificatiRiga {
  nome: string;
  importo: number;
  spedIngiustificate: number;
}

// ── Types Forza Maggiore / 48-72h ─────────────────────────────────────────────

export interface RigaForzaMaggioreDettaglio {
  nome: string;
  codice: string;
  tariffaFissa: number;        // sempre ≤ SOGLIA_ESCLUSIONE_FM
  spedizioni: number;
  importo: number;             // spedizioni × tariffaFissa
}

export interface RigaForzaMaggioreTotale {
  nome: string;
  spedizioni: number;
  importo: number;
}

export interface ForzaMaggioreResult {
  dettaglio: RigaForzaMaggioreDettaglio[];
  totali: RigaForzaMaggioreTotale[];
  codiciNonAssociati: string[];  // codice non trovato nel DB
  codiciEsclusi: string[];       // tariffa > 5€ → esclusi
  totaleSpedizioni: number;
  totaleImporto: number;
}

export interface ApplicaForzaMaggioreRiga {
  nome: string;
  importo: number;
  spedizioni: number;
}

// ── Types Controllo Zone ──────────────────────────────────────────────────────

export interface RigaControlloDettaglio {
  nome: string;           // padroncino
  codice: string;
  zonaControllo: string;  // es. "Cosenza"
  tariffaFissa: number;
  spedizioni: number;
  importo: number;
}

export interface RigaControlloTotale {
  nome: string;
  zonaControllo: string;
  spedizioni: number;
  importo: number;
}

export interface ControlloZonaGroup {
  zonaControllo: string;
  dettaglio: RigaControlloDettaglio[];
  totali: RigaControlloTotale[];
  totaleSpedizioni: number;
  totaleImporto: number;
}

export interface ControlloZoneResult {
  zone: ControlloZonaGroup[];           // una entry per ogni zona configurata
  codiciNonAssociati: string[];         // codice presente nel DB ma senza padroncino
  totaleSpedizioniGlobale: number;
  totaleImportoGlobale: number;
}

export interface ApplicaControlloZonaRiga {
  nome: string;
  zonaControllo: string;
  importo: number;
  spedizioni: number;
}

// ── Risultato analisi combinata ───────────────────────────────────────────────

export interface AnalisiResult {
  doppie: ContaDoppiResult;
  ingiustificati: IngiustificatiResult;
  forzaMaggiore: ForzaMaggioreResult;
  controlloZone: ControlloZoneResult;
}

// ── Types Margini (Fatturato + Competenze Attive da import diretti, indipendenti dai conteggi) ─

export interface DettaglioNonConsegnata {
  esito: string;
  nonConsegnate: number;
  percNonConsegnate: number;
}

export interface RigaMargine {
  codice: string;
  autista: string;
  padroncino: string | null;          // risolto via Codici Autista, oppure sovrascritto manualmente
  fatturato: number | null;           // da import diretto Fattura Proforma (tab Margini), oppure sovrascritto manualmente
  competenzeAttive: number | null;    // da import Statistica Margini Dist., oppure sovrascritto manualmente
  noli: number | null;
  costi: number | null;
  extra: number | null;               // inserito manualmente, si somma al fatturato nel calcolo
  note: string | null;                // libera, inserita manualmente
  differenza: number | null;          // competenzeAttive - (fatturato + extra)
  percentuale: number | null;         // differenza / competenzeAttive * 100
  percNonConsegnate: number | null;         // da import Statistica Consegne: somma % Non Consegnate (colonna AE) per codice
  dettaglioNonConsegnate: DettaglioNonConsegnata[] | null; // dettaglio per Esito (colonne AC/AD/AE)
}

export interface MarginiResult {
  mese: string;
  righe: RigaMargine[];
  statisticaImportata: boolean;
  statisticaAggiornataAl: Date | null;
  fatturatoImportato: boolean;
  fatturatoAggiornatoAl: Date | null;
  statisticaConsegneImportata: boolean;
  statisticaConsegneAggiornataAl: Date | null;
  codiciSoloStatistica: string[];  // hanno Competenze Attive ma nessun Fatturato/Extra
  codiciSoloFatturato: string[];   // hanno Fatturato ma nessuna Competenza Attiva
  totaleFatturato: number;
  totaleCompetenzeAttive: number;
  totaleDifferenza: number;
  totaleFatturatoPda: number;  // Fatturato del mese (come in Dashboard), solo padroncini attivi
  esclusi: RigaEsclusa[];      // codici esclusi manualmente dal calcolo per questo mese
}

export interface ImportaMarginiResult {
  mese: string;
  righeImportate: number;
  nonRiconosciuti: string[]; // valori "Autista" da cui non è stato possibile estrarre un codice
}

export interface SalvaRigaManualeDto {
  mese: string;
  codice: string;
  extra?: number | null;
  note?: string | null;
  escluso?: boolean;
  // Usati sia per aggiungere manualmente un codice assente da entrambi gli
  // import (Statistica/Fattura Proforma), sia per sovrascrivere il valore
  // già importato (l'utente può correggere Padroncino/Fatturato/Competenze
  // Attive direttamente dalla tabella): quando presenti hanno sempre
  // precedenza sul dato importato.
  autista?: string | null;
  padroncino?: string | null;
  fatturato?: number | null;
  competenzeAttive?: number | null;
}

export interface RigaEsclusa {
  codice: string;
  autista: string;
}

// ── Mapping interno ───────────────────────────────────────────────────────────

interface MappingEntry {
  ragioneSociale: string;
  tariffaFissa: number | null;
  zonaControllo: string | null;  // es. "Cosenza", "Rende"
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ContaDoppiService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Mapping codice → {ragioneSociale, tariffaFissa} ──────────────────────

  private async buildFullMapping(): Promise<Map<string, MappingEntry>> {
    const codici = await this.prisma.codiceAutista.findMany({
      where: { deletedAt: null },
      select: {
        codice: true,
        tariffaFissa: true,
        zonaControllo: true,
        assegnazioni: {
          where: { deletedAt: null, dataFine: null },
          select: {
            padroncino: { select: { ragioneSociale: true } },
          },
          orderBy: { dataInizio: 'desc' },
          take: 1,
        },
      },
    });

    const map = new Map<string, MappingEntry>();
    for (const c of codici) {
      const rs = c.assegnazioni[0]?.padroncino?.ragioneSociale;
      if (rs) {
        map.set(c.codice.trim().toUpperCase(), {
          ragioneSociale: rs.trim(),
          tariffaFissa: c.tariffaFissa != null ? Number(c.tariffaFissa) : null,
          zonaControllo: (c as any).zonaControllo ?? null,
        });
      }
    }
    return map;
  }

  // ── Carica ultima analisi dal DB ─────────────────────────────────────────

  async getUltimaAnalisi(): Promise<{ mese: string; risultato: AnalisiResult; tariffe: Record<string, number>; updatedAt: Date } | null> {
    const record = await (this.prisma as any).analisiContaDoppi.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!record) return null;
    return {
      mese:      record.mese,
      risultato: record.risultato as AnalisiResult,
      tariffe:   (record.tariffe as Record<string, number>) ?? {},
      updatedAt: record.updatedAt,
    };
  }

  async salvaTariffe(mese: string, tariffe: Record<string, number>): Promise<void> {
    await (this.prisma as any).analisiContaDoppi.update({
      where: { mese },
      data:  { tariffe },
    });
  }
  
  
  async getAnalisi(mese: string): Promise<{ mese: string; risultato: AnalisiResult; tariffe: Record<string, number>; updatedAt: Date } | null> {
    const record = await (this.prisma as any).analisiContaDoppi.findUnique({
      where: { mese },
    });
    if (!record) return null;
    return {
      mese:      record.mese,
      risultato: record.risultato as AnalisiResult,
      tariffe:   (record.tariffe as Record<string, number>) ?? {},
      updatedAt: record.updatedAt,
    };
  }

  /** Elimina l'analisi salvata per un mese (non tocca le trattenute già applicate ai conteggi) */
  async eliminaAnalisi(mese: string): Promise<{ eliminato: boolean }> {
    const record = await (this.prisma as any).analisiContaDoppi.findUnique({ where: { mese } });
    if (!record) return { eliminato: false };
    await (this.prisma as any).analisiContaDoppi.delete({ where: { mese } });
    return { eliminato: true };
  }

  /**
   * Azzera TUTTE le statistiche COD (pagina Margini / Statistiche COD) di un mese:
   * Statistica Margini Dist., Fattura Proforma, Statistica Consegne e righe manuali
   * (extra/note/codici aggiunti/esclusi). Non tocca i conteggi mensili né le trattenute già applicate.
   * Lo snapshot completo dei dati eliminati viene salvato nell'audit log (dataPrima).
   */
  async azzeraStatisticheCod(
    mese: string,
    userId: string,
  ): Promise<{ mese: string; eliminati: Record<string, boolean>; totale: number }> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');

    const p = this.prisma as any;
    const [stat, fatt, manuali, consegne] = await Promise.all([
      p.statisticaMargini.findUnique({ where: { mese } }),
      p.marginiFatturato.findUnique({ where: { mese } }),
      p.marginiManuali.findUnique({ where: { mese } }),
      p.statisticaConsegne.findUnique({ where: { mese } }),
    ]);

    const eliminati = {
      statisticaMargini: !!stat,
      fatturato: !!fatt,
      manuali: !!manuali,
      statisticaConsegne: !!consegne,
    };
    const totale = Object.values(eliminati).filter(Boolean).length;
    if (totale === 0) return { mese, eliminati, totale: 0 };

    await this.prisma.$transaction([
      p.statisticaMargini.deleteMany({ where: { mese } }),
      p.marginiFatturato.deleteMany({ where: { mese } }),
      p.marginiManuali.deleteMany({ where: { mese } }),
      p.statisticaConsegne.deleteMany({ where: { mese } }),
    ]);

    await this.audit.log({
      userId,
      entityType: 'statistica_cod',
      entityId: mese,
      azione: 'DELETE',
      dataPrima: {
        mese,
        statisticaMargini: stat?.dati ?? null,
        fatturato: fatt?.dati ?? null,
        manuali: manuali?.dati ?? null,
        statisticaConsegne: consegne?.dati ?? null,
      } as any,
      dataDopo: { azione: 'azzera_statistiche_cod', mese, eliminati } as any,
    });

    return { mese, eliminati, totale };
  }

  async applicaTutto(
    mese: string,
    doppie: ApplicaRiga[],
    ingiustificati: ApplicaIngiustificatiRiga[],
    forzaMaggiore: ApplicaForzaMaggioreRiga[],
    zone: ApplicaControlloZonaRiga[],
    userId: string,
  ): Promise<Record<string, ApplicaResult | null>> {
    const [rDoppie, rIngiust, rForza, rZone] = await Promise.allSettled([
      doppie?.length        ? this.applicaAiConteggi(mese, doppie, userId)               : Promise.resolve(null),
      ingiustificati?.length ? this.applicaIngiustificati(mese, ingiustificati, userId)   : Promise.resolve(null),
      forzaMaggiore?.length  ? this.applicaForzaMaggiore(mese, forzaMaggiore, userId)     : Promise.resolve(null),
      zone?.length           ? this.applicaControlloZona(mese, zone, userId)              : Promise.resolve(null),
    ]);

    const unwrap = (r: PromiseSettledResult<ApplicaResult | null>) =>
      r.status === 'fulfilled' ? r.value : null;

    return {
      doppie:         unwrap(rDoppie),
      ingiustificati: unwrap(rIngiust),
      forzaMaggiore:  unwrap(rForza),
      zone:           unwrap(rZone),
    };
  }

  // ── Analisi combinata (un solo upload, due risultati) ────────────────────

  async analizza(buffer: Buffer, mese: string): Promise<AnalisiResult> {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File Excel non valido o corrotto');
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('Il file Excel è vuoto');

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    if (rows.length === 0) throw new BadRequestException('Nessun dato trovato nel file Excel');

    // Verifica colonne obbligatorie
    const firstRow = rows[0];
    const missing: string[] = [];
    if (!('Spedizione'     in firstRow)) missing.push('"Spedizione"');
    if (!('Esito'          in firstRow)) missing.push('"Esito"');
    if (!('Codice Autista' in firstRow)) missing.push('"Codice Autista"');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Colonne mancanti: ${missing.join(', ')}. Trovate: ${Object.keys(firstRow).join(', ')}`,
      );
    }
    // "Nome Esito GLS" è opzionale (usata solo per Forza Maggiore)
    const hasNomeEsitoGls = 'Nome Esito GLS' in firstRow;

    const mapping = await this.buildFullMapping();

    const [doppie, ingiustificati, forzaMaggiore, controlloZone] = await Promise.all([
      this.analizzaDoppie(rows, mapping),
      this.analizzaIngiustificati(rows, mapping),
      this.analizzaForzaMaggiore(rows, mapping, hasNomeEsitoGls),
      this.analizzaControlloZone(rows, mapping),
    ]);

    const result: AnalisiResult = { doppie, ingiustificati, forzaMaggiore, controlloZone };

    // Persisti nel DB (upsert per mese)
    await (this.prisma as any).analisiContaDoppi.upsert({
      where: { mese },
      create: { mese, risultato: result as any },
      update: { risultato: result as any },
    });

    return result;
  }

  // ── Analisi Consegne Doppie ───────────────────────────────────────────────

  private async analizzaDoppie(
    rows: Record<string, any>[],
    mapping: Map<string, MappingEntry>,
  ): Promise<ContaDoppiResult> {
    const codiciNonAssociatiSet = new Set<string>();

    const righeValide = rows.filter((r) => {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      if (!codice) return false;
      if (!mapping.has(codice)) { codiciNonAssociatiSet.add(codice); return false; }
      return true;
    });

    const totaleSpedizioniAnalizzate = righeValide.length;

    // Conta quante volte ogni spedizione appare come "Consegnata"
    const conteggioPerSped = new Map<string, number>();
    for (const r of righeValide) {
      const esito = String(r['Esito'] ?? '').trim();
      if (!esito.includes('Consegnata')) continue;
      const sped = String(r['Spedizione'] ?? '').trim();
      if (!sped) continue;
      conteggioPerSped.set(sped, (conteggioPerSped.get(sped) ?? 0) + 1);
    }

    const spedizioniRipetute = new Set<string>(
      [...conteggioPerSped.entries()].filter(([, c]) => c > 1).map(([s]) => s),
    );

    const filtrate = righeValide.filter((r) => {
      const esito = String(r['Esito'] ?? '').trim();
      const sped  = String(r['Spedizione'] ?? '').trim();
      return esito === 'Consegnata' && spedizioniRipetute.has(sped);
    });

    const conteggioPerCodice = new Map<string, number>();
    for (const r of filtrate) {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      conteggioPerCodice.set(codice, (conteggioPerCodice.get(codice) ?? 0) + 1);
    }

    const dettaglio: RigaDettaglio[] = [];
    for (const [codice, spedDoppie] of conteggioPerCodice) {
      const nome = mapping.get(codice)?.ragioneSociale ?? codice;
      dettaglio.push({ nome, codice, spedDoppie, spedDoppieMetà: Math.ceil(spedDoppie / 2) });
    }
    dettaglio.sort((a, b) => b.spedDoppie - a.spedDoppie);

    const totaliMap = new Map<string, { spedDoppie: number; spedDoppieMetà: number }>();
    for (const r of dettaglio) {
      const ex = totaliMap.get(r.nome) ?? { spedDoppie: 0, spedDoppieMetà: 0 };
      totaliMap.set(r.nome, {
        spedDoppie:     ex.spedDoppie     + r.spedDoppie,
        spedDoppieMetà: ex.spedDoppieMetà + r.spedDoppieMetà,
      });
    }

    const totali: RigaTotale[] = [...totaliMap.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.spedDoppie - a.spedDoppie);

    return {
      dettaglio,
      totali,
      codiciNonAssociati: [...codiciNonAssociatiSet].sort(),
      totaleSpedizioniAnalizzate,
      totaleDoppiTrovati: dettaglio.reduce((s, r) => s + r.spedDoppie, 0),
    };
  }

  // ── Analisi Ingiustificati ────────────────────────────────────────────────

  private async analizzaIngiustificati(
    rows: Record<string, any>[],
    mapping: Map<string, MappingEntry>,
  ): Promise<IngiustificatiResult> {
    const codiciNonAssociatiSet = new Set<string>();

    // Filtra solo Ingiustificato con codice nel mapping
    const righeIngiust = rows.filter((r) => {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      const esito  = String(r['Esito'] ?? '').trim();
      if (!codice || esito !== 'Ingiustificato') return false;
      if (!mapping.has(codice)) { codiciNonAssociatiSet.add(codice); return false; }
      return true;
    });

    const totaleSpedizioniAnalizzate = rows.length;
    const totaleIngiustificati = righeIngiust.length;

    // Conta per codice autista
    const conteggioPerCodice = new Map<string, number>();
    for (const r of righeIngiust) {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      conteggioPerCodice.set(codice, (conteggioPerCodice.get(codice) ?? 0) + 1);
    }

    const dettaglio: RigaIngiustificatiDettaglio[] = [];
    for (const [codice, spedIngiustificate] of conteggioPerCodice) {
      const entry           = mapping.get(codice)!;
      const tariffaFissa    = entry.tariffaFissa;
      // Regola: tariffa < SOGLIA → usa tariffaFissa; altrimenti → 1€
      const tariffaApplicata =
        tariffaFissa != null && tariffaFissa < SOGLIA_TARIFFA_ALTA
          ? tariffaFissa
          : 1;
      const importo = Math.round(spedIngiustificate * tariffaApplicata * 100) / 100;

      dettaglio.push({
        nome: entry.ragioneSociale,
        codice,
        tariffaFissa,
        tariffaApplicata,
        spedIngiustificate,
        importo,
      });
    }
    dettaglio.sort((a, b) => b.importo - a.importo);

    // Raggruppa per padroncino
    const totaliMap = new Map<string, { spedIngiustificate: number; importo: number }>();
    for (const r of dettaglio) {
      const ex = totaliMap.get(r.nome) ?? { spedIngiustificate: 0, importo: 0 };
      totaliMap.set(r.nome, {
        spedIngiustificate: ex.spedIngiustificate + r.spedIngiustificate,
        importo: Math.round((ex.importo + r.importo) * 100) / 100,
      });
    }

    const totali: RigaIngiustificatiTotale[] = [...totaliMap.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.importo - a.importo);

    const totaleImporto = totali.reduce((s, r) => s + r.importo, 0);

    return {
      dettaglio,
      totali,
      codiciNonAssociati: [...codiciNonAssociatiSet].sort(),
      totaleSpedizioniAnalizzate,
      totaleIngiustificati,
      totaleImporto: Math.round(totaleImporto * 100) / 100,
    };
  }

  // ── Analisi Forza Maggiore / 48-72h ──────────────────────────────────────

  private async analizzaForzaMaggiore(
    rows: Record<string, any>[],
    mapping: Map<string, MappingEntry>,
    hasNomeEsitoGls: boolean,
  ): Promise<ForzaMaggioreResult> {
    const codiciNonAssociatiSet = new Set<string>();
    const codiciEsclusiSet      = new Set<string>();

    // Esiti colonna N validi
    const ESITI_VALIDI = new Set(['cause di forza maggiore', '-']);

    // Valori colonna P validi (case-insensitive, incluso vuoto/null)
    const NOME_ESITO_VALIDI = new Set([
      "localita' servita in 48 ore",
      "localita' servita in 72 ore",
      '',  // vuoto è valido
    ]);

    const righeFiltrate = rows.filter((r) => {
      const esito     = String(r['Esito'] ?? '').trim().toLowerCase();
      const codice    = String(r['Codice Autista'] ?? '').trim().toUpperCase();

      if (!ESITI_VALIDI.has(esito)) return false;

      // Colonna P: se non presente nel file la ignoriamo (accettiamo tutto)
      if (hasNomeEsitoGls) {
        const nomeEsito = String(r['Nome Esito GLS'] ?? '').trim().toLowerCase();
        if (!NOME_ESITO_VALIDI.has(nomeEsito)) return false;
      }

      if (!codice) return false;

      if (!mapping.has(codice)) {
        codiciNonAssociatiSet.add(codice);
        return false;
      }

      const tariffaFissa = mapping.get(codice)!.tariffaFissa;
      // Escludi codici senza tariffa o con tariffa > soglia
      if (tariffaFissa == null || tariffaFissa > SOGLIA_ESCLUSIONE_FM) {
        codiciEsclusiSet.add(codice);
        return false;
      }

      return true;
    });

    // Conta per codice
    const conteggioPerCodice = new Map<string, number>();
    for (const r of righeFiltrate) {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      conteggioPerCodice.set(codice, (conteggioPerCodice.get(codice) ?? 0) + 1);
    }

    const dettaglio: RigaForzaMaggioreDettaglio[] = [];
    for (const [codice, spedizioni] of conteggioPerCodice) {
      const entry        = mapping.get(codice)!;
      const tariffaFissa = entry.tariffaFissa!;
      const importo      = Math.round(spedizioni * tariffaFissa * 100) / 100;
      dettaglio.push({ nome: entry.ragioneSociale, codice, tariffaFissa, spedizioni, importo });
    }
    dettaglio.sort((a, b) => b.importo - a.importo);

    // Raggruppa per padroncino
    const totaliMap = new Map<string, { spedizioni: number; importo: number }>();
    for (const r of dettaglio) {
      const ex = totaliMap.get(r.nome) ?? { spedizioni: 0, importo: 0 };
      totaliMap.set(r.nome, {
        spedizioni: ex.spedizioni + r.spedizioni,
        importo: Math.round((ex.importo + r.importo) * 100) / 100,
      });
    }

    const totali: RigaForzaMaggioreTotale[] = [...totaliMap.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.importo - a.importo);

    return {
      dettaglio,
      totali,
      codiciNonAssociati: [...codiciNonAssociatiSet].sort(),
      codiciEsclusi:      [...codiciEsclusiSet].sort(),
      totaleSpedizioni:   dettaglio.reduce((s, r) => s + r.spedizioni, 0),
      totaleImporto:      Math.round(totali.reduce((s, r) => s + r.importo, 0) * 100) / 100,
    };
  }

  // ── Helper comune: applica trattenuta su conteggio ───────────────────────

  private async applicaTrattenuta(
    conteggioId: string,
    importoNegativo: number,
    descrizione: string,
    categoria: string,
  ): Promise<void> {
    // Cerca riga esistente con questa categoria o descrizione (supporta descrizione con conteggio)
    const descBase = descrizione.replace(/\s*\(\d+\s*Sped\.\)\s*$/, '').trim();
    const rigaEsistente = await this.prisma.conteggiRiga.findFirst({
      where: {
        conteggioMensileId: conteggioId,
        OR: [
          { tipo: 'TRATTENUTA', categoria },
          { tipo: 'TRATTENUTA', descrizione },
          { tipo: 'TRATTENUTA', descrizione: { startsWith: descBase } },
        ],
      },
    });

    if (rigaEsistente) {
      await this.prisma.conteggiRiga.update({
        where: { id: rigaEsistente.id },
        data: { importo: importoNegativo, categoria, descrizione, modificaManuale: true },
      });
    } else {
      const maxOrdine = await this.prisma.conteggiRiga.aggregate({
        where: { conteggioMensileId: conteggioId },
        _max: { ordine: true },
      });
      await this.prisma.conteggiRiga.create({
        data: {
          conteggioMensileId: conteggioId,
          tipo: 'TRATTENUTA',
          descrizione,
          importo: importoNegativo,
          segno: 'NEGATIVO',
          categoria,
          ordine: (maxOrdine._max.ordine ?? 0) + 1,
          modificaManuale: true,
        },
      });
    }

    await this.prisma.conteggioMensile.update({
      where: { id: conteggioId },
      data: { nettoSalvato: null },
    });
  }

  // ── Applica helper (logica comune find padroncino + conteggio) ────────────

  private async applicaPerPadroncino(
    mese: string,
    nome: string,
    importo: number,
    descrizione: string,
    categoria: string,
    padroncini: { id: string; ragioneSociale: string }[],
    userId: string,
  ): Promise<ApplicaRisultatoRiga> {
    const normalizza = (s: string) =>
      s.replace(/\s*\([^)]*\)\s*/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

    const importoNegativo = -Math.abs(importo);
    const nomeNorm = normalizza(nome);

    const padroncino = padroncini.find((p) => normalizza(p.ragioneSociale) === nomeNorm);
    if (!padroncino) return { nome, importo, azione: 'padroncino_non_trovato' };

    const conteggio = await this.prisma.conteggioMensile.findFirst({
      where: { padroncinoId: padroncino.id, mese, deletedAt: null },
      select: { id: true, stato: true },
    });
    if (!conteggio) return { nome, importo, azione: 'conteggio_non_trovato' };
    if (conteggio.stato === 'CONFERMATO') return { nome, importo, azione: 'saltato_confermato' };

    // Controlla se esisteva già (per sapere se è creato o aggiornato)
    const descBase = descrizione.replace(/\s*\(\d+\s*Sped\.\)\s*$/, '').trim();
    const esistente = await this.prisma.conteggiRiga.findFirst({
      where: {
        conteggioMensileId: conteggio.id,
        OR: [
          { tipo: 'TRATTENUTA', categoria },
          { tipo: 'TRATTENUTA', descrizione },
          { tipo: 'TRATTENUTA', descrizione: { startsWith: descBase } },
        ],
      },
    });

    await this.applicaTrattenuta(conteggio.id, importoNegativo, descrizione, categoria);

    await this.audit.log({
      userId,
      entityType: 'conteggio_mensile',
      entityId: conteggio.id,
      azione: 'UPDATE',
      dataDopo: { azione: categoria, mese, padroncino: padroncino.ragioneSociale, importo } as any,
    });

    return { nome, importo, azione: esistente ? 'aggiornato' : 'creato' };
  }

  // ── Applica Consegne Doppie ───────────────────────────────────────────────

  async applicaAiConteggi(
    mese: string,
    totali: ApplicaRiga[],
    userId: string,
  ): Promise<ApplicaResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    if (!totali?.length)
      throw new BadRequestException('Nessun dato da applicare');

    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati = await Promise.all(
      totali.map((entry) =>
        this.applicaPerPadroncino(
          mese,
          entry.nome,
          entry.spedDoppieMetà,
          'CONSEGNE DOPPIE',
          'consegne_doppie',
          padroncini,
          userId,
        ),
      ),
    );

    const applicati = risultati.filter((r) => r.azione === 'creato' || r.azione === 'aggiornato').length;
    return { applicati, saltati: risultati.length - applicati, risultati };
  }

  // ── Applica Ingiustificati ────────────────────────────────────────────────

  async applicaIngiustificati(
    mese: string,
    totali: ApplicaIngiustificatiRiga[],
    userId: string,
  ): Promise<ApplicaResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    if (!totali?.length)
      throw new BadRequestException('Nessun dato da applicare');

    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati = await Promise.all(
      totali.map((entry) =>
        this.applicaPerPadroncino(
          mese,
          entry.nome,
          entry.importo,
          `MALUS SPEDIZIONI NON GIUSTIFICATE (${entry.spedIngiustificate} Sped.)`,
          'malus_ingiustificati',
          padroncini,
          userId,
        ),
      ),
    );

    const applicati = risultati.filter((r) => r.azione === 'creato' || r.azione === 'aggiornato').length;
    return { applicati, saltati: risultati.length - applicati, risultati };
  }

  // ── Applica Forza Maggiore ────────────────────────────────────────────────

  async applicaForzaMaggiore(
    mese: string,
    totali: ApplicaForzaMaggioreRiga[],
    userId: string,
  ): Promise<ApplicaResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    if (!totali?.length)
      throw new BadRequestException('Nessun dato da applicare');

    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati = await Promise.all(
      totali.map((entry) =>
        this.applicaPerPadroncino(
          mese,
          entry.nome,
          entry.importo,
          `MALUS FORZA MAGGIORE / 48-72h (${entry.spedizioni} Sped.)`,
          'malus_forza_maggiore',
          padroncini,
          userId,
        ),
      ),
    );

    const applicati = risultati.filter((r) => r.azione === 'creato' || r.azione === 'aggiornato').length;
    return { applicati, saltati: risultati.length - applicati, risultati };
  }

  // ── Analisi Controllo Zone ────────────────────────────────────────────────
  // Filtra le righe dove:
  //   - Codice Autista ha zonaControllo configurato
  //   - "Nome Zona Distribuzione" (col K) contiene il nome della zona (case-insensitive)
  //   - "Shop ID" (col I) è vuoto / null

  private async analizzaControlloZone(
    rows: Record<string, any>[],
    mapping: Map<string, MappingEntry>,
  ): Promise<ControlloZoneResult> {
    const codiciNonAssociatiSet = new Set<string>();

    // Raccogli dati per codice: zona, spedizioni, tariffaFissa
    const perCodice = new Map<string, { entry: MappingEntry; spedizioni: number }>();

    for (const r of rows) {
      const codice = String(r['Codice Autista'] ?? '').trim().toUpperCase();
      if (!codice) continue;

      const entry = mapping.get(codice);
      if (!entry) continue;
      if (!entry.zonaControllo) continue; // codice non configurato per nessuna zona

      // Verifica Shop ID vuoto (colonna I)
      const shopId = String(r['Shop ID'] ?? '').trim();
      if (shopId && shopId !== '-') continue;

      // Verifica Località (colonna F) contiene la zona del codice
      const nomeZona = String(r['Località'] ?? '').trim().toLowerCase();
      if (!nomeZona.includes(entry.zonaControllo.toLowerCase())) continue;

      // Deve avere tariffaFissa configurata
      if (entry.tariffaFissa == null) {
        codiciNonAssociatiSet.add(codice);
        continue;
      }

      const ex = perCodice.get(codice) ?? { entry, spedizioni: 0 };
      perCodice.set(codice, { entry, spedizioni: ex.spedizioni + 1 });
    }

    // Costruisci dettaglio flat
    const dettaglioFlat: RigaControlloDettaglio[] = [];
    for (const [codice, { entry, spedizioni }] of perCodice) {
      const tariffaFissa = entry.tariffaFissa!;
      dettaglioFlat.push({
        nome:         entry.ragioneSociale,
        codice,
        zonaControllo: entry.zonaControllo!,
        tariffaFissa,
        spedizioni,
        importo: Math.round(spedizioni * tariffaFissa * 100) / 100,
      });
    }
    dettaglioFlat.sort((a, b) =>
      a.zonaControllo.localeCompare(b.zonaControllo) || b.importo - a.importo,
    );

    // Raggruppa per zona
    const zoneMap = new Map<string, { dettaglio: RigaControlloDettaglio[]; totaliMap: Map<string, { spedizioni: number; importo: number }> }>();
    for (const r of dettaglioFlat) {
      if (!zoneMap.has(r.zonaControllo)) {
        zoneMap.set(r.zonaControllo, { dettaglio: [], totaliMap: new Map() });
      }
      const zg = zoneMap.get(r.zonaControllo)!;
      zg.dettaglio.push(r);
      const ex = zg.totaliMap.get(r.nome) ?? { spedizioni: 0, importo: 0 };
      zg.totaliMap.set(r.nome, {
        spedizioni: ex.spedizioni + r.spedizioni,
        importo: Math.round((ex.importo + r.importo) * 100) / 100,
      });
    }

    const zone: ControlloZonaGroup[] = [...zoneMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([zonaControllo, { dettaglio, totaliMap }]) => {
        const totali: RigaControlloTotale[] = [...totaliMap.entries()]
          .map(([nome, v]) => ({ nome, zonaControllo, ...v }))
          .sort((a, b) => b.importo - a.importo);
        return {
          zonaControllo,
          dettaglio,
          totali,
          totaleSpedizioni: dettaglio.reduce((s, r) => s + r.spedizioni, 0),
          totaleImporto: Math.round(totali.reduce((s, r) => s + r.importo, 0) * 100) / 100,
        };
      });

    return {
      zone,
      codiciNonAssociati: [...codiciNonAssociatiSet].sort(),
      totaleSpedizioniGlobale: zone.reduce((s, z) => s + z.totaleSpedizioni, 0),
      totaleImportoGlobale: Math.round(zone.reduce((s, z) => s + z.totaleImporto, 0) * 100) / 100,
    };
  }

  // ── Applica Controllo Zona ────────────────────────────────────────────────

  async applicaControlloZona(
    mese: string,
    totali: ApplicaControlloZonaRiga[],
    userId: string,
  ): Promise<ApplicaResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    if (!totali?.length)
      throw new BadRequestException('Nessun dato da applicare');

    const padroncini = await this.prisma.padroncino.findMany({
      where: { deletedAt: null, attivo: true },
      select: { id: true, ragioneSociale: true },
    });

    const risultati = await Promise.all(
      totali.map((entry) =>
        this.applicaPerPadroncino(
          mese,
          entry.nome,
          entry.importo,
          `CONTROLLO CONSEGNE ${entry.zonaControllo} (${entry.spedizioni} Sped.)`,
          `controllo_${entry.zonaControllo.toLowerCase().replace(/\s+/g, '_')}`,
          padroncini,
          userId,
        ),
      ),
    );

    const applicati = risultati.filter((r) => r.azione === 'creato' || r.azione === 'aggiornato').length;
    return { applicati, saltati: risultati.length - applicati, risultati };
  }

  // ── Margini: import Statistica Margini Dist. + calcolo mensile ──────────────
  // Estrae il codice autista dal formato "Nome Cognome (CODICE)" — stesso
  // pattern usato in conteggi.service.ts per la Fattura Proforma, così i due
  // file si incrociano correttamente per codice.
  private estraiCodiceMargini(val: any): string | null {
    const matches = String(val ?? '').match(/\(([^)]+)\)/g);
    if (!matches) return null;
    return matches[matches.length - 1].slice(1, -1).trim().toUpperCase() || null;
  }

  // Converte stringhe numeriche europee ("1.234,56") o con doppi punti,
  // stesso comportamento di custom_parse_number dello script originale.
  private parseNumeroMargini(v: any): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    let s = String(v).trim().replace(',', '.');
    if (s.split('.').length - 1 > 1) {
      const last = s.lastIndexOf('.');
      s = s.slice(0, last).replace(/\./g, '') + s.slice(last);
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  async importaStatisticaMargini(buffer: Buffer, mese: string): Promise<ImportaMarginiResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File Excel non valido o corrotto');
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('Il file Excel è vuoto');

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    if (rows.length === 0) throw new BadRequestException('Nessun dato trovato nel file Excel');

    const firstRow = rows[0];
    const missing: string[] = [];
    if (!('Autista' in firstRow)) missing.push('"Autista"');
    if (!('Competenze Attive' in firstRow)) missing.push('"Competenze Attive"');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Colonne mancanti: ${missing.join(', ')}. Trovate: ${Object.keys(firstRow).join(', ')}`,
      );
    }

    const dati: Record<string, {
      autista: string;
      competenzeAttive: number | null;
      noli: number | null;
      costi: number | null;
      margineFile: number | null;
      percMargineFile: number | null;
    }> = {};
    const nonRiconosciuti: string[] = [];

    for (const row of rows) {
      const autistaRaw = String(row['Autista'] ?? '').trim();
      if (!autistaRaw) continue;
      const codice = this.estraiCodiceMargini(autistaRaw);
      if (!codice) { nonRiconosciuti.push(autistaRaw); continue; }
      // Se il codice ricorre più volte nel file, l'ultima riga vince
      // (equivalente al drop_duplicates() dello script originale).
      dati[codice] = {
        autista: autistaRaw,
        competenzeAttive: this.parseNumeroMargini(row['Competenze Attive']),
        noli: this.parseNumeroMargini(row['Noli']),
        costi: this.parseNumeroMargini(row['Costi']),
        margineFile: this.parseNumeroMargini(row['Margine']),
        percMargineFile: this.parseNumeroMargini(row['Percentuale Margine']),
      };
    }

    await (this.prisma as any).statisticaMargini.upsert({
      where: { mese },
      create: { mese, dati },
      update: { dati },
    });

    return {
      mese,
      righeImportate: Object.keys(dati).length,
      nonRiconosciuti: [...new Set(nonRiconosciuti)].sort(),
    };
  }

  // Import diretto della Fattura Proforma per il calcolo margini: somma
  // "Importo Totale" per codice autista (colonna "Autista", formato
  // "Nome Cognome (CODICE)"), indipendentemente da quale Padroncino è
  // associato al codice — cattura anche i codici interni non associati
  // a nessun PDA, che l'import bulk dei conteggi scarta perché aggrega
  // per "Fornitore" e richiede un match con un Padroncino attivo.
  async importaFatturaProformaMargini(buffer: Buffer, mese: string): Promise<ImportaMarginiResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File Excel non valido o corrotto');
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('Il file Excel è vuoto');

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    if (rows.length === 0) throw new BadRequestException('Nessun dato trovato nel file Excel');

    const firstRow = rows[0];
    const missing: string[] = [];
    if (!('Autista' in firstRow)) missing.push('"Autista"');
    if (!('Importo Totale' in firstRow)) missing.push('"Importo Totale"');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Colonne mancanti: ${missing.join(', ')}. Trovate: ${Object.keys(firstRow).join(', ')}`,
      );
    }

    const dati: Record<string, { autista: string; fatturato: number }> = {};
    const nonRiconosciuti: string[] = [];

    for (const row of rows) {
      const autistaRaw = String(row['Autista'] ?? '').trim();
      if (!autistaRaw) continue;
      const codice = this.estraiCodiceMargini(autistaRaw);
      if (!codice) { nonRiconosciuti.push(autistaRaw); continue; }
      const importo = this.parseNumeroMargini(row['Importo Totale']) ?? 0;
      if (!dati[codice]) dati[codice] = { autista: autistaRaw, fatturato: 0 };
      dati[codice].fatturato = Math.round((dati[codice].fatturato + importo) * 100) / 100;
    }

    await (this.prisma as any).marginiFatturato.upsert({
      where: { mese },
      create: { mese, dati },
      update: { dati },
    });

    return {
      mese,
      righeImportate: Object.keys(dati).length,
      nonRiconosciuti: [...new Set(nonRiconosciuti)].sort(),
    };
  }

  // Estrae il codice autista dal formato "Nome Cognome (CODICE) (ZONA)" usato
  // dal file "Statistica Consegne": a differenza di estraiCodiceMargini (che
  // prende l'ULTIMA coppia di parentesi, cioè la zona), qui serve la PRIMA
  // coppia di parentesi — es. "Ioni Costache (5001) (01 Cosenza)" → "5001".
  private estraiCodicePrimaParentesi(val: any): string | null {
    const match = String(val ?? '').match(/\(([^)]+)\)/);
    return match ? match[1].trim().toUpperCase() || null : null;
  }

  // Import del file "Statistica Consegne": per ogni codice (estratto dalla
  // colonna A, prima coppia di parentesi) ricava la "% Non Consegnate".
  // Il file ha intestazioni duplicate (es. "Non Consegnate" compare 3 volte),
  // quindi si legge per indice di colonna (header: 1) invece che per nome:
  //   A = 0 (Nome/Codice/Zona), M = 12 (Non Consegnate totale riga),
  //   N = 13 (% Non Consegnate / % Consegnate totale riga),
  //   AC = 28 (Esito), AD = 29 (Non Consegnate per esito),
  //   AE = 30 (% Non Consegnate per esito).
  // Il tracciato del file esportato da GLS non è sempre lo stesso: alcuni
  // export includono il dettaglio per Esito (colonne AC/AD/AE valorizzate,
  // eventualmente su più righe per lo stesso codice), altri no — in quel
  // caso AC/AD/AE risultano vuote su ogni riga (visto ad es. nell'export di
  // agosto 2026) e l'unico dato disponibile è il totale di riga in M/N.
  // Per ogni riga: se la colonna Esito (AC) è valorizzata si usa il
  // dettaglio per esito come in precedenza; altrimenti si usa direttamente
  // il totale di riga (M/N), così la % Non Consegnate viene popolata in
  // entrambi i formati.
  private readonly COL_NOME = 0;
  private readonly COL_NON_CONSEGNATE_TOT = 12;
  private readonly COL_PERC_NON_CONSEGNATE_TOT = 13;
  private readonly COL_ESITO = 28;
  private readonly COL_NON_CONSEGNATE = 29;
  private readonly COL_PERC_NON_CONSEGNATE = 30;

  async importaStatisticaConsegne(buffer: Buffer, mese: string): Promise<ImportaMarginiResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File Excel non valido o corrotto');
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('Il file Excel è vuoto');

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (rows.length < 2) throw new BadRequestException('Nessun dato trovato nel file Excel');

    const dataRows = rows.slice(1); // salta l'intestazione
    const dati: Record<string, { nome: string; percNonConsegnate: number; dettaglio: DettaglioNonConsegnata[] }> = {};
    const nonRiconosciuti: string[] = [];

    for (const row of dataRows) {
      const nomeRaw = String(row[this.COL_NOME] ?? '').trim();
      if (!nomeRaw) continue;
      const codice = this.estraiCodicePrimaParentesi(nomeRaw);
      if (!codice) { nonRiconosciuti.push(nomeRaw); continue; }

      if (!dati[codice]) dati[codice] = { nome: nomeRaw, percNonConsegnate: 0, dettaglio: [] };

      const esitoRaw = String(row[this.COL_ESITO] ?? '').trim();
      if (esitoRaw) {
        // Formato con dettaglio per Esito (colonne AC/AD/AE valorizzate).
        const nonConsegnate = this.parseNumeroMargini(row[this.COL_NON_CONSEGNATE]) ?? 0;
        const percRiga = this.parseNumeroMargini(row[this.COL_PERC_NON_CONSEGNATE]) ?? 0;
        dati[codice].percNonConsegnate = Math.round((dati[codice].percNonConsegnate + percRiga) * 100) / 100;
        dati[codice].dettaglio.push({ esito: esitoRaw, nonConsegnate, percNonConsegnate: percRiga });
      } else {
        // Formato senza dettaglio per Esito: si usa il totale di riga (M/N).
        const nonConsegnateTot = this.parseNumeroMargini(row[this.COL_NON_CONSEGNATE_TOT]) ?? 0;
        const percTot = this.parseNumeroMargini(row[this.COL_PERC_NON_CONSEGNATE_TOT]) ?? 0;
        dati[codice].percNonConsegnate = percTot;
        dati[codice].dettaglio.push({ esito: '-', nonConsegnate: nonConsegnateTot, percNonConsegnate: percTot });
      }
    }

    await (this.prisma as any).statisticaConsegne.upsert({
      where: { mese },
      create: { mese, dati },
      update: { dati },
    });

    return {
      mese,
      righeImportate: Object.keys(dati).length,
      nonRiconosciuti: [...new Set(nonRiconosciuti)].sort(),
    };
  }

  // Salva/aggiorna Extra, Note e/o lo stato "escluso" per un singolo codice
  // del mese. Merge parziale: un campo non presente nel body conserva il
  // valore già salvato (es. escludere un codice non deve cancellare Extra/Note
  // già inseriti, e viceversa).
  async salvaRigaManualeMargini(dto: SalvaRigaManualeDto): Promise<{ ok: true }> {
    const { mese, codice } = dto;
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');
    if (!codice) throw new BadRequestException('Codice obbligatorio');

    const codiceNorm = codice.trim().toUpperCase();
    const esistente = await (this.prisma as any).marginiManuali.findUnique({ where: { mese } });
    type ManualeEntry = {
      extra: number | null; note: string | null; escluso?: boolean;
      autista?: string | null; padroncino?: string | null;
      fatturato?: number | null; competenzeAttive?: number | null;
    };
    const dati: Record<string, ManualeEntry> = (esistente?.dati as any) ?? {};
    const prev: ManualeEntry = dati[codiceNorm] ?? { extra: null, note: null, escluso: false, autista: null, padroncino: null, fatturato: null, competenzeAttive: null };

    const extra = 'extra' in dto
      ? (dto.extra == null || (dto.extra as any) === '' ? null : Number(dto.extra))
      : prev.extra;
    const note = 'note' in dto
      ? (dto.note == null || dto.note === '' ? null : String(dto.note))
      : prev.note;
    const escluso = 'escluso' in dto ? !!dto.escluso : (prev.escluso ?? false);
    const autista = 'autista' in dto
      ? (dto.autista == null || dto.autista === '' ? null : String(dto.autista))
      : (prev.autista ?? null);
    const padroncino = 'padroncino' in dto
      ? (dto.padroncino == null || dto.padroncino === '' ? null : String(dto.padroncino))
      : (prev.padroncino ?? null);
    const fatturatoManuale = 'fatturato' in dto
      ? (dto.fatturato == null || (dto.fatturato as any) === '' ? null : Number(dto.fatturato))
      : (prev.fatturato ?? null);
    const competenzeManuali = 'competenzeAttive' in dto
      ? (dto.competenzeAttive == null || (dto.competenzeAttive as any) === '' ? null : Number(dto.competenzeAttive))
      : (prev.competenzeAttive ?? null);

    const vuoto = (extra == null || isNaN(extra)) && note == null && !escluso &&
      autista == null && padroncino == null &&
      (fatturatoManuale == null || isNaN(fatturatoManuale)) && (competenzeManuali == null || isNaN(competenzeManuali));

    if (vuoto) {
      delete dati[codiceNorm];
    } else {
      dati[codiceNorm] = {
        extra: extra != null && !isNaN(extra) ? extra : null,
        note,
        escluso,
        autista,
        padroncino,
        fatturato: fatturatoManuale != null && !isNaN(fatturatoManuale) ? fatturatoManuale : null,
        competenzeAttive: competenzeManuali != null && !isNaN(competenzeManuali) ? competenzeManuali : null,
      };
    }

    await (this.prisma as any).marginiManuali.upsert({
      where: { mese },
      create: { mese, dati },
      update: { dati },
    });

    return { ok: true };
  }

  async getMargini(mese: string): Promise<MarginiResult> {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Formato mese non valido. Usa "YYYY-MM"');

    const [statistica, fatturatoRec, manualiRec, consegneRec, conteggiPda] = await Promise.all([
      (this.prisma as any).statisticaMargini.findUnique({ where: { mese } }),
      (this.prisma as any).marginiFatturato.findUnique({ where: { mese } }),
      (this.prisma as any).marginiManuali.findUnique({ where: { mese } }),
      (this.prisma as any).statisticaConsegne.findUnique({ where: { mese } }),
      this.prisma.conteggioMensile.findMany({
        where: { mese, deletedAt: null, padroncino: { deletedAt: null, attivo: true } },
        select: { righe: true },
      }),
    ]);

    // Fatturato PDA del mese, IVA esclusa: stessa logica del campo "fatturato"
    // della Dashboard (ConteggiService.getStats()), ma presa dall'imponibile
    // (fatturatoLordoImponibile, prima del ×1.22) perché il valore che
    // fatturiamo ai padroncini è IVATO — qui serve al netto.
    const totaleFatturatoPda = Math.round(
      conteggiPda.reduce((s, c) => s + calcolaTotaliConteggio(c.righe as any).fatturatoLordoImponibile, 0) * 100,
    ) / 100;

    const datiStat: Record<string, any> = (statistica?.dati as any) ?? {};
    const datiFatt: Record<string, any> = (fatturatoRec?.dati as any) ?? {};
    const datiManuali: Record<string, any> = (manualiRec?.dati as any) ?? {};
    const datiConsegne: Record<string, { nome: string; percNonConsegnate: number; dettaglio: DettaglioNonConsegnata[] }> = (consegneRec?.dati as any) ?? {};

    // Padroncino associato al codice (se registrato in Codici Autista),
    // solo per visualizzazione — non influisce sul calcolo del fatturato.
    const mapping = await this.buildFullMapping();

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const tuttiCodici = new Set<string>([
      ...Object.keys(datiStat),
      ...Object.keys(datiFatt),
      ...Object.keys(datiManuali),
      ...Object.keys(datiConsegne),
    ]);
    const righe: RigaMargine[] = [];
    const esclusi: RigaEsclusa[] = [];

    for (const codice of tuttiCodici) {
      const stat = datiStat[codice];
      const fatt = datiFatt[codice];
      const man = datiManuali[codice];
      const consegne = datiConsegne[codice];

      // I valori manuali (man.fatturato/man.competenzeAttive/man.padroncino/
      // man.autista), quando presenti, hanno sempre precedenza sul dato
      // importato: servono sia per aggiungere un codice assente da entrambi
      // gli import, sia per correggere a mano un valore già importato.
      const autista = man?.autista ?? stat?.autista ?? fatt?.autista ?? mapping.get(codice)?.ragioneSociale ?? consegne?.nome ?? codice;

      if (man?.escluso) {
        esclusi.push({ codice, autista });
        continue;
      }

      const fatturato: number | null = man?.fatturato != null
        ? round2(man.fatturato)
        : (fatt?.fatturato != null ? round2(fatt.fatturato) : null);
      const competenzeAttive: number | null = man?.competenzeAttive ?? stat?.competenzeAttive ?? null;
      const padroncino: string | null = man?.padroncino ?? mapping.get(codice)?.ragioneSociale ?? null;
      const extra: number | null = man?.extra ?? null;
      const note: string | null = man?.note ?? null;

      let differenza: number | null = null;
      let percentuale: number | null = null;
      if (competenzeAttive != null && (fatturato != null || extra != null)) {
        const fatturatoConExtra = round2((fatturato ?? 0) + (extra ?? 0));
        differenza = round2(competenzeAttive - fatturatoConExtra);
        percentuale = competenzeAttive !== 0 ? round2((differenza / competenzeAttive) * 100) : null;
      }

      righe.push({
        codice,
        autista,
        padroncino,
        fatturato,
        competenzeAttive,
        noli: stat?.noli ?? null,
        costi: stat?.costi ?? null,
        extra,
        note,
        differenza,
        percentuale,
        percNonConsegnate: consegne?.percNonConsegnate ?? null,
        dettaglioNonConsegnate: consegne?.dettaglio ?? null,
      });
    }

    righe.sort((a, b) => (a.percentuale ?? Infinity) - (b.percentuale ?? Infinity));

    return {
      mese,
      righe,
      statisticaImportata: !!statistica,
      statisticaAggiornataAl: statistica?.updatedAt ?? null,
      fatturatoImportato: !!fatturatoRec,
      fatturatoAggiornatoAl: fatturatoRec?.updatedAt ?? null,
      statisticaConsegneImportata: !!consegneRec,
      statisticaConsegneAggiornataAl: consegneRec?.updatedAt ?? null,
      codiciSoloStatistica: righe.filter((r) => r.fatturato == null && r.extra == null).map((r) => r.codice).sort(),
      codiciSoloFatturato: righe.filter((r) => r.competenzeAttive == null).map((r) => r.codice).sort(),
      totaleFatturato: round2(righe.reduce((s, r) => s + (r.fatturato ?? 0) + (r.extra ?? 0), 0)),
      totaleCompetenzeAttive: round2(righe.reduce((s, r) => s + (r.competenzeAttive ?? 0), 0)),
      totaleDifferenza: round2(righe.reduce((s, r) => s + (r.differenza ?? 0), 0)),
      totaleFatturatoPda,
      esclusi: esclusi.sort((a, b) => a.codice.localeCompare(b.codice)),
    };
  }
}
