import {
  Controller, Get, Post, Put, Delete, Param, Query, Body, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConteggiService } from './conteggi.service';
import {
  CreateConteggioDto, UpdateConteggioStatoDto, CreateRigaDto, UpdateRigaDto,
  DuplicaConteggioDto, DuplicaBulkDto, UpdateNettoDto, UpdateNoteConteggioDto, ReplaceRigheDto,
} from './conteggi.dto';

@Controller('conteggi')
export class ConteggiController {
  constructor(private service: ConteggiService) {}

  @Get()
  findAll(@Query('mese') mese?: string, @Query('padroncinoId') padroncinoId?: string) {
    return this.service.findAll(mese, padroncinoId);
  }

  @Get('stats')
  getStats(@Query('mese') mese?: string) {
    return this.service.getStats(mese);
  }

  @Get('andamento')
  getAndamento(@Query('mesi') mesi?: string) {
    const n = mesi ? parseInt(mesi, 10) : 12;
    return this.service.getAndamentoGlobale(isNaN(n) || n <= 0 ? 12 : n);
  }

  @Get('top-da-bonificare')
  getTopDaBonificare(@Query('mese') mese?: string, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 5;
    return this.service.getTopDaBonificare(mese, isNaN(n) || n <= 0 ? 5 : n);
  }

  @Get('competenze-attive/:mese')
  getCompetenzeAttive(@Param('mese') mese: string) {
    return this.service.getCompetenzeAttive(mese);
  }

  @Put('competenze-attive/:mese')
  setCompetenzeAttive(@Param('mese') mese: string, @Body('valore') valore: number | string | null, @Req() req: any) {
    const v = valore == null || valore === '' ? null : Number(valore);
    return this.service.setCompetenzeAttive(mese, v, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOneWithTotals(id);
  }

  @Post()
  create(@Body() dto: CreateConteggioDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('bulk')
  generaBulk(@Body() data: { mese: string }, @Req() req: any) {
    return this.service.generaBulk(data.mese, req.user.id);
  }

  @Post('duplica')
  duplica(@Body() dto: DuplicaConteggioDto, @Req() req: any) {
    return this.service.duplicaDaMese(dto, req.user.id);
  }

  @Post('duplica-bulk')
  duplicaBulk(@Body() dto: DuplicaBulkDto, @Req() req: any) {
    return this.service.duplicaBulk(dto, req.user.id);
  }

  @Put(':id/netto')
  updateNetto(@Param('id') id: string, @Body() dto: UpdateNettoDto, @Req() req: any) {
    return this.service.updateNettoSalvato(id, dto.netto, req.user.id);
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
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File mancante');
    if (!mese) throw new BadRequestException('Parametro mese mancante');
    return this.service.applicaFatturaProforma(file, mese, req.user.id);
  }

  @Put(':id/stato')
  updateStato(@Param('id') id: string, @Body() dto: UpdateConteggioStatoDto, @Req() req: any) {
    return this.service.updateStato(id, dto, req.user.id);
  }

  @Put(':id/note')
  updateNote(@Param('id') id: string, @Body() dto: UpdateNoteConteggioDto, @Req() req: any) {
    return this.service.updateNote(id, dto, req.user.id);
  }

  @Post(':id/righe/replace')
  replaceRighe(@Param('id') id: string, @Body() dto: ReplaceRigheDto, @Req() req: any) {
    return this.service.replaceRighe(id, dto, req.user.id);
  }

  @Post(':id/rigenera')
  rigeneraRigheAuto(@Param('id') id: string, @Req() req: any) {
    return this.service.rigeneraRigheAuto(id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }

  // ─── RIGHE ──────────────────────────────────────────
  @Post(':id/righe')
  addRiga(@Param('id') id: string, @Body() dto: CreateRigaDto, @Req() req: any) {
    return this.service.addRiga(id, dto, req.user.id);
  }

  @Put('righe/:rigaId')
  updateRiga(@Param('rigaId') rigaId: string, @Body() dto: UpdateRigaDto, @Req() req: any) {
    return this.service.updateRiga(rigaId, dto, req.user.id);
  }

  @Delete('righe/:rigaId')
  deleteRiga(@Param('rigaId') rigaId: string, @Req() req: any) {
    return this.service.deleteRiga(rigaId, req.user.id);
  }
}
