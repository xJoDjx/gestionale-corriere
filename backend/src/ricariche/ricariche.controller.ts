import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import { RicaricheService, ImportRicaricheDto } from './ricariche.service';

@Controller('ricariche')
export class RicaricheController {
  constructor(private service: RicaricheService) {}

  /** Lista dei mesi con dati */
  @Get('mesi')
  listMesi() {
    return this.service.listMesi();
  }

  /** Sessioni di un mese */
  @Get()
  findByMese(@Query('mese') mese: string) {
    if (!mese) return { mese: null, tariffe: null, sessioni: [] };
    return this.service.findByMese(mese);
  }

  /** Riepilogo per padroncino (per conteggi) */
  @Get('riepilogo-padroncini')
  riepilogoPadroncini(@Query('mese') mese: string) {
    return this.service.riepilogoPadroncini(mese);
  }

  /** Importa sessioni CSV elaborate */
  @Post('importa')
  importa(@Body() dto: ImportRicaricheDto) {
    return this.service.importa(dto);
  }

  @Put(':mese/tariffe')
  aggiornaTariffe(
    @Param('mese') mese: string,
    @Body() body: { fatturaImporto?: number; fatturaKwh?: number; costoEsternoKwh?: number }
  ) {
    return this.service.aggiornaTariffe(mese, body);
  }

  /** Elimina tutte le sessioni di un mese */
  @Delete(':mese')
  eliminaMese(@Param('mese') mese: string) {
    return this.service.eliminaMese(mese);
  }
}

