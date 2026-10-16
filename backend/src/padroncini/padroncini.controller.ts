import {
  Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, Req, Res,
  UseInterceptors, UploadedFile, BadRequestException, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';
import { PadronciniService } from './padroncini.service';
import { ContrattiPalmareService } from './contratti-palmare.service';
import { ContrattiCodiciService } from './contratti-codici.service';
import { ContrattiMezziService } from './contratti-mezzi.service';
import {
  CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto, UpdateDocumentoDto,
  GeneraContrattoPalmareDto, GeneraContrattoCodiciDto, GeneraContrattoMezziDto,
} from './padroncini.dto';

@Controller('padroncini')
export class PadronciniController {
  constructor(
    private service: PadronciniService,
    private contrattiPalmare: ContrattiPalmareService,
    private contrattiCodici: ContrattiCodiciService,
    private contrattiMezzi: ContrattiMezziService,
  ) {}

  @Get()
  findAll(@Query() query: QueryPadronciniDto) {
    return this.service.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('select')
  listForSelect() {
    return this.service.listForSelect();
  }

  @Get('scadenze')
  getScadenze(@Query('giorni') giorni?: string) {
    return this.service.getScadenze(giorni ? parseInt(giorni) : 30);
  }

  @Post('importa-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const ext = file.originalname.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      throw new BadRequestException('Formato non supportato. Usa .xlsx o .xls');
    }
    return this.service.importaExcel(file.buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/log')
  getPadroncinoLog(@Param('id') id: string) {
    return this.service.getPadroncinoLog(id);
  }

  @Post()
  create(@Body() dto: CreatePadroncinoDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePadroncinoDto, @Req() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }

  // ─── CONTRATTO MEZZI ────────────────────────────────────────────
  @Post(':id/contratto-mezzi')
  async generaContrattoMezzi(
    @Param('id') padroncinoId: string,
    @Body() dto: GeneraContrattoMezziDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: any,
  ): Promise<StreamableFile> {
    const userId: string = req.user?.id ?? 'system';
    const { buffer, filename } = await this.contrattiMezzi.generaContrattoMezzi(padroncinoId, dto, userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  // ─── ASSEGNAZIONE MEZZO ────────────────────────────────────────
  @Post(':id/mezzi')
  assegnaMezzo(
    @Param('id') padroncinoId: string,
    @Body() body: { mezzoId: string; dataInizio: string },
    @Req() req: any,
  ) {
    return this.service.assegnaMezzo(padroncinoId, body.mezzoId, body.dataInizio, req.user.id);
  }

  @Delete(':id/mezzi/:assegnazioneId')
  rimuoviMezzo(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
    @Req() req: any,
  ) {
    return this.service.rimuoviMezzo(padroncinoId, assegnazioneId, req.user.id);
  }

  // ─── ASSEGNAZIONE PALMARE ──────────────────────────────────────
  @Post(':id/palmari')
  assegnaPalmare(
    @Param('id') padroncinoId: string,
    @Body() body: { palmareId: string; dataInizio: string },
    @Req() req: any,
  ) {
    return this.service.assegnaPalmare(padroncinoId, body.palmareId, body.dataInizio, req.user.id);
  }

  @Delete(':id/palmari/:assegnazioneId')
  rimuoviPalmare(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
    @Req() req: any,
  ) {
    return this.service.rimuoviPalmare(padroncinoId, assegnazioneId, req.user.id);
  }

  // ─── CONTRATTO PALMARI ─────────────────────────────────────────
  @Post(':id/contratto-palmari')
  async generaContrattoPalmari(
    @Param('id') padroncinoId: string,
    @Body() dto: GeneraContrattoPalmareDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: any,
  ): Promise<StreamableFile> {
    const userId: string = req.user?.id ?? 'system';
    const { buffer, filename } = await this.contrattiPalmare.generaContrattoPalmare(padroncinoId, dto, userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  // ─── CONTRATTO CODICI AUTISTA ───────────────────────────────────
  @Post(':id/contratto-codici')
  async generaContrattoCodici(
    @Param('id') padroncinoId: string,
    @Body() dto: GeneraContrattoCodiciDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: any,
  ): Promise<StreamableFile> {
    const userId: string = req.user?.id ?? 'system';
    const { buffer, filename } = await this.contrattiCodici.generaContrattoCodici(padroncinoId, dto, userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  // ─── ASSEGNAZIONE CODICE AUTISTA ───────────────────────────────
  @Post(':id/codici-autista')
  assegnaCodice(
    @Param('id') padroncinoId: string,
    @Body() body: { codiceAutistaId: string; dataInizio: string },
    @Req() req: any,
  ) {
    return this.service.assegnaCodice(padroncinoId, body.codiceAutistaId, body.dataInizio, req.user.id);
  }

  @Delete(':id/codici-autista/:assegnazioneId')
  rimuoviCodice(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
    @Req() req: any,
  ) {
    return this.service.rimuoviCodice(padroncinoId, assegnazioneId, req.user.id);
  }

  // ─── STORICO CONTEGGI ──────────────────────────────────────────
  @Get(':id/storico-conteggi')
  getStoricoConteggi(@Param('id') id: string) {
    return this.service.getStoricoConteggi(id);
  }

  // ─── ANDAMENTO FATTURATO ───────────────────────────────────────
  @Get(':id/andamento')
  getAndamento(
    @Param('id') id: string,
    @Query('dal') dal?: string,
    @Query('al') al?: string,
  ) {
    return this.service.getAndamento(id, dal, al);
  }

  // ─── DOCUMENTI ─────────────────────────────────────────────────
  @Get(':id/documenti')
  getDocumenti(@Param('id') id: string) {
    return this.service.getDocumenti(id);
  }

  @Post(':id/documenti')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/padroncini',
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];
        const ext = extname(file.originalname).toLowerCase();
        cb(allowed.includes(ext) ? null : new BadRequestException('Tipo file non supportato'), allowed.includes(ext));
      },
    }),
  )
  async addDocumento(
    @Param('id') padroncinoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { nome?: string; tipo: string; scadenza?: string; note?: string },
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File obbligatorio');
    return this.service.addDocumento(
      padroncinoId,
      {
        nome: body.nome || file.originalname,
        tipo: body.tipo,
        filePath: file.path,
        mimeType: file.mimetype,
        dimensione: file.size,
        scadenza: body.scadenza,
        note: body.note,
      },
      req.user.id,
    );
  }

  @Patch(':id/documenti/:documentoId')
  updateDocumento(
    @Param('id') padroncinoId: string,
    @Param('documentoId') documentoId: string,
    @Body() dto: UpdateDocumentoDto,
    @Req() req: any,
  ) {
    return this.service.updateDocumento(padroncinoId, documentoId, dto, req.user.id);
  }

  @Delete(':id/documenti/:documentoId')
  removeDocumento(
    @Param('id') padroncinoId: string,
    @Param('documentoId') documentoId: string,
    @Req() req: any,
  ) {
    return this.service.removeDocumento(padroncinoId, documentoId, req.user.id);
  }
}
