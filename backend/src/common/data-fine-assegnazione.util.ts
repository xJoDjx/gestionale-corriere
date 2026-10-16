import { BadRequestException } from '@nestjs/common';

/**
 * Risolve la data di chiusura di un'assegnazione.
 * - se non viene passata nulla → adesso (comportamento storico)
 * - accetta date passate e future
 * - non può precedere la data di inizio dell'assegnazione (confronto sul solo giorno, UTC)
 */
export function resolveDataFineAssegnazione(dataFine: string | undefined | null, dataInizio: Date): Date {
  if (!dataFine) return new Date();

  const fine = new Date(dataFine);
  if (isNaN(fine.getTime())) {
    throw new BadRequestException('Data di chiusura non valida');
  }

  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (day(fine) < day(new Date(dataInizio))) {
    throw new BadRequestException('La data di chiusura non può essere precedente alla data di inizio assegnazione');
  }
  return fine;
}
