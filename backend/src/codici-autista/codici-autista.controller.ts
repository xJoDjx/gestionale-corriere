import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { CodiciAutistaService } from './codici-autista.service';

@Controller('codici-autista')
export class CodiciAutistaController {
  constructor(private service: CodiciAutistaService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() data: { codice: string; nome?: string; cognome?: string }) {
    return this.service.create(data, 'system');
  }

  @Post(':id/assegna')
  assegna(@Param('id') id: string, @Body() data: { padroncinoId: string; dataInizio: string }) {
    return this.service.assegna(id, data.padroncinoId, data.dataInizio, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id, 'system'); }
}
