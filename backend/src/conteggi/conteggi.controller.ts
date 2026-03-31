import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
} from '@nestjs/common';
import { ConteggiService } from './conteggi.service';
import {
  CreateConteggioDto, UpdateConteggioStatoDto, CreateRigaDto, UpdateRigaDto,
} from './conteggi.dto';

@Controller('conteggi')
export class ConteggiController {
  constructor(private service: ConteggiService) {}

  @Get()
  findAll(@Query('mese') mese?: string, @Query('padroncinoId') padroncinoId?: string) {
    return this.service.findAll(mese, padroncinoId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOneWithTotals(id);
  }

  @Post()
  create(@Body() dto: CreateConteggioDto) {
    return this.service.create(dto, 'system');
  }

  @Post('bulk')
  generaBulk(@Body() data: { mese: string }) {
    return this.service.generaBulk(data.mese, 'system');
  }

  @Put(':id/stato')
  updateStato(@Param('id') id: string, @Body() dto: UpdateConteggioStatoDto) {
    return this.service.updateStato(id, dto, 'system');
  }

  @Post(':id/rigenera')
  rigeneraRigheAuto(@Param('id') id: string) {
    return this.service.rigeneraRigheAuto(id, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }

  // ─── RIGHE ──────────────────────────────────────────
  @Post(':id/righe')
  addRiga(@Param('id') id: string, @Body() dto: CreateRigaDto) {
    return this.service.addRiga(id, dto, 'system');
  }

  @Put('righe/:rigaId')
  updateRiga(@Param('rigaId') rigaId: string, @Body() dto: UpdateRigaDto) {
    return this.service.updateRiga(rigaId, dto, 'system');
  }

  @Delete('righe/:rigaId')
  deleteRiga(@Param('rigaId') rigaId: string) {
    return this.service.deleteRiga(rigaId, 'system');
  }
}
