import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Corregge le date di un'assegnazione già esistente (es. un anno sbagliato),
 * senza chiuderla e senza crearne una nuova.
 *
 * Controlli:
 * - date valide; la fine (se c'è) non prima dell'inizio (confronto sul giorno, UTC)
 * - nessuna sovrapposizione con le altre assegnazioni dello stesso mezzo/palmare/codice
 *
 * I conteggi già salvati non vengono ricalcolati: le nuove date valgono
 * per i conteggi creati o ricalcolati da qui in avanti.
 */
export async function correggiDateAssegnazione(opts: {
  delegate: any;              // es. prisma.assegnazionePalmare
  chiave: string;             // es. 'palmareId'
  id: string;
  dataInizio?: string;
  dataFine?: string | null;   // null = assegnazione ancora in corso
}) {
  const { delegate, chiave, id } = opts;
  const ass = await delegate.findFirst({ where: { id, deletedAt: null } });
  if (!ass) throw new NotFoundException('Assegnazione non trovata');

  const parse = (s: string, cosa: string) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new BadRequestException(`Data di ${cosa} non valida`);
    return d;
  };
  const inizio: Date = opts.dataInizio ? parse(opts.dataInizio, 'inizio') : ass.dataInizio;
  const fine: Date | null = opts.dataFine === undefined ? ass.dataFine : opts.dataFine === null ? null : parse(opts.dataFine, 'fine');

  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (fine && day(fine) < day(inizio)) {
    throw new BadRequestException('La data di fine non può essere precedente alla data di inizio');
  }

  // Sovrapposizioni con le altre assegnazioni dello stesso elemento
  const altre = await delegate.findMany({ where: { [chiave]: ass[chiave], deletedAt: null, id: { not: id } } });
  const fineMs = fine ? day(fine) : Infinity;
  const conflitto = altre.find((a: any) => {
    const aIni = day(new Date(a.dataInizio));
    const aFine = a.dataFine ? day(new Date(a.dataFine)) : Infinity;
    // Si toccano solo nel giorno di passaggio (fine dell'una = inizio dell'altra): ammesso
    return aIni < fineMs && day(inizio) < aFine;
  });
  if (conflitto) {
    const f = (d: Date | null) => (d ? new Date(d).toLocaleDateString('it-IT') : 'in corso');
    throw new BadRequestException(
      `Le date si sovrappongono a un'altra assegnazione (${f(conflitto.dataInizio)} → ${f(conflitto.dataFine)})`,
    );
  }

  const aggiornata = await delegate.update({ where: { id }, data: { dataInizio: inizio, dataFine: fine } });
  return { prima: { dataInizio: ass.dataInizio, dataFine: ass.dataFine }, dopo: { dataInizio: aggiornata.dataInizio, dataFine: aggiornata.dataFine }, ass };
}
