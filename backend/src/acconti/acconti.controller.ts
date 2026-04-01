import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { AccontiService, CreateAccontoDto } from './acconti.service';

@Controller('acconti')
export class AccontiController {
  constructor(private service: AccontiService) {}

  @Get()
  findAll(@Query('mese') mese?: string) {
    return this.service.findAll(mese);
  }

  @Get('verifica-codice/:codice')
  verificaCodice(@Param('codice') codice: string) {
    return this.service.verificaCodice(codice);
  }

  @Get('padroncino/:padroncinoId')
  findByPadroncino(
    @Param('padroncinoId') padroncinoId: string,
    @Query('mese') mese?: string,
  ) {
    return this.service.findByPadroncino(padroncinoId, mese);
  }

  @Post()
  create(@Body() dto: CreateAccontoDto) {
    return this.service.create(dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }
}
