import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post('importa-fattura-proforma')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importaFatturaProforma(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File mancante');
    return this.service.importaFatturaProforma(file);
  }

  @Post('applica-fattura-proforma')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  applicaFatturaProforma(
    @UploadedFile() file: Express.Multer.File,
    @Body('mese') mese: string,
  ) {
    if (!file) throw new BadRequestException('File mancante');
    if (!mese) throw new BadRequestException('Parametro mese mancante');
    return this.service.applicaFatturaProforma(file, mese, 'system');
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
