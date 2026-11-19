import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Blocca lato server le API delle sezioni che l'utente non ha tra le "sezioni visibili".
 *
 * - ADMIN e utenti con la lista vuota ("nessun limite") passano sempre.
 * - Per ogni area dell'API: le sezioni che possono leggere e scrivere (rw)
 *   e quelle che possono solo leggere (r), perché le loro pagine mostrano quei dati
 *   (es. la Panoramica legge mezzi e conteggi, ma non li modifica).
 * - Le aree non elencate (auth, note, task) restano aperte a tutti gli utenti autenticati.
 *
 * L'elenco è stato ricavato registrando le chiamate che ogni pagina fa davvero:
 * se una pagina nuova usa un'altra area, va aggiunta qui.
 */
type Regola = { rw: string[]; r?: string[] };

const REGOLE: Record<string, Regola> = {
  mezzi:              { rw: ['flotta'], r: ['dashboard', 'ricariche', 'padroncini', 'esportazione'] },
  manutenzioni:       { rw: ['flotta'] },
  'registro-mezzi':   { rw: ['flotta'], r: ['padroncini', 'conteggi'] },
  documenti:          { rw: ['flotta', 'padroncini'] },
  palmari:            { rw: ['palmari'], r: ['dashboard', 'padroncini', 'esportazione'] },
  'codici-autista':   { rw: ['codici-autista'], r: ['dashboard', 'padroncini', 'esportazione'] },
  padroncini:         { rw: ['padroncini'], r: ['dashboard', 'flotta', 'palmari', 'codici-autista', 'conteggi', 'addebiti-sospesi', 'carte-eni', 'esportazione'] },
  conteggi:           { rw: ['conteggi'], r: ['dashboard', 'esportazione'] },
  acconti:            { rw: ['acconti', 'conteggi'] },
  'addebiti-sospesi': { rw: ['addebiti-sospesi', 'conteggi'], r: ['dashboard'] },
  ricariche:          { rw: ['ricariche'], r: ['dashboard', 'conteggi', 'flotta'] },
  'carte-eni':        { rw: ['carte-eni'], r: ['dashboard'] },
  'voci-conteggio':   { rw: ['impostazioni'], r: ['conteggi'] },
  audit:              { rw: ['log', 'utenti'], r: ['flotta', 'palmari', 'codici-autista', 'conteggi', 'padroncini'] },
  users:              { rw: ['utenti'], r: ['log'] },
  search:             { rw: ['ricerca'] },
  'db-admin':         { rw: ['impostazioni'] },
  // conta-doppi: le rotte "margini/..." sono della sezione Margini, le altre dell'Analisi spedizioni
  'conta-doppi':      { rw: ['analisi-spedizioni'] },
  'conta-doppi/margini': { rw: ['margini'] },
};

@Injectable()
export class SezioniGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user || user.ruolo === 'ADMIN') return true;

    const sezioni: string[] = (user.permessi ?? []).filter((p: any) => p.risorsa === 'sezione').map((p: any) => p.azione);
    if (sezioni.length === 0) return true; // nessun limite

    const parti = String(req.path ?? req.url ?? '').split('?')[0].replace(/^\/?api\//, '').split('/').filter(Boolean);
    const area = parti[0] === 'conta-doppi' && parti[1] === 'margini' ? 'conta-doppi/margini' : parti[0];
    const regola = REGOLE[area];
    if (!regola) return true;

    const lettura = req.method === 'GET' || req.method === 'HEAD';
    const ammesse = lettura ? [...regola.rw, ...(regola.r ?? [])] : regola.rw;
    if (ammesse.some((s) => sezioni.includes(s))) return true;

    throw new ForbiddenException('Questa sezione non è abilitata per il tuo utente');
  }
}
