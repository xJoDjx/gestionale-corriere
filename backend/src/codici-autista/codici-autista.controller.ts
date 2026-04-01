import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { CodiciAutistaService, CreateCodiceAutistaDto, UpdateCodiceAutistaDto } from './codici-autista.service';
// Importa il tuo guard (solitamente si chiama JwtAuthGuard)
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 

@Controller('codici-autista')
// @UseGuards(JwtAuthGuard) // <--- Attiva questo per proteggere tutte le rotte e popolare req.user
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
  create(@Body() data: CreateCodiceAutistaDto, @Req() req) {
    // req.user viene popolato dal JwtAuthGuard dopo il login
    const userId = req.user.id; 
    return this.service.create(data, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateCodiceAutistaDto, @Req() req) {
    return this.service.update(id, data, req.user.id);
  }

  @Put(':id/toggle-attivo')
  toggleAttivo(@Param('id') id: string, @Req() req) {
    return this.service.toggleAttivo(id, req.user.id);
  }

  @Post(':id/assegnazioni')
  assegna(
    @Param('id') id: string,
    @Body() data: { padroncinoId: string; dataInizio: string },
    @Req() req
  ) {
    return this.service.assegna(id, data.padroncinoId, data.dataInizio, req.user.id);
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(@Param('assegnazioneId') id: string, @Req() req) {
    return this.service.chiudiAssegnazione(id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.service.remove(id, req.user.id);
  }
}