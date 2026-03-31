import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
} from '@nestjs/common';
import { MezziService } from './mezzi.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto } from './mezzi.dto';

@Controller('mezzi')
export class MezziController {
  constructor(private service: MezziService) {}

  @Get()
  findAll(@Query() query: QueryMezziDto) {
    return this.service.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('scadenze')
  getScadenze(@Query('giorni') giorni?: string) {
    return this.service.getScadenze(giorni ? parseInt(giorni) : 30);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMezzoDto) {
    // TODO: estrarre userId dal JWT
    return this.service.create(dto, 'system');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMezzoDto) {
    return this.service.update(id, dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }

  // ─── ASSEGNAZIONI ──────────────────────────────────
  @Post(':id/assegnazioni')
  createAssegnazione(
    @Param('id') mezzoId: string,
    @Body() dto: CreateAssegnazioneMezzoDto,
  ) {
    return this.service.createAssegnazione(mezzoId, dto, 'system');
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(@Param('assegnazioneId') id: string) {
    return this.service.chiudiAssegnazione(id, 'system');
  }
}
