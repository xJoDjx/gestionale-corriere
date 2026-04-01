import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req } from '@nestjs/common';
import { CodiciAutistaService, CreateCodiceAutistaDto, UpdateCodiceAutistaDto } from './codici-autista.service';

@Controller('codici-autista')
export class CodiciAutistaController {
  constructor(private service: CodiciAutistaService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 100,
    });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() data: CreateCodiceAutistaDto, @Req() req: any) {
    // Usa userId dal JWT se disponibile, altrimenti 'system' (AuditService gestisce il fallback)
    const userId: string = req.user?.id ?? 'system';
    return this.service.create(data, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateCodiceAutistaDto, @Req() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.update(id, data, userId);
  }

  @Put(':id/toggle-attivo')
  toggleAttivo(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.toggleAttivo(id, userId);
  }

  @Post(':id/assegnazioni')
  assegna(
    @Param('id') id: string,
    @Body() data: { padroncinoId: string; dataInizio: string },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.assegna(id, data.padroncinoId, data.dataInizio, userId);
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(@Param('assegnazioneId') id: string, @Req() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.chiudiAssegnazione(id, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.remove(id, userId);
  }
}
