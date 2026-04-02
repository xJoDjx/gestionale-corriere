import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { PadronciniService } from './padroncini.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';

@Controller('padroncini')
export class PadronciniController {
  constructor(private service: PadronciniService) {}

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePadroncinoDto) {
    return this.service.create(dto, 'system');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePadroncinoDto) {
    return this.service.update(id, dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }

  // ─── ASSEGNAZIONE MEZZO ────────────────────────────────────────
  @Post(':id/mezzi')
  assegnaMezzo(
    @Param('id') padroncinoId: string,
    @Body() body: { mezzoId: string; dataInizio: string },
  ) {
    return this.service.assegnaMezzo(padroncinoId, body.mezzoId, body.dataInizio, 'system');
  }

  @Delete(':id/mezzi/:assegnazioneId')
  rimuoviMezzo(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
  ) {
    return this.service.rimuoviMezzo(padroncinoId, assegnazioneId, 'system');
  }

  // ─── ASSEGNAZIONE PALMARE ──────────────────────────────────────
  @Post(':id/palmari')
  assegnaPalmare(
    @Param('id') padroncinoId: string,
    @Body() body: { palmareId: string; dataInizio: string },
  ) {
    return this.service.assegnaPalmare(padroncinoId, body.palmareId, body.dataInizio, 'system');
  }

  @Delete(':id/palmari/:assegnazioneId')
  rimuoviPalmare(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
  ) {
    return this.service.rimuoviPalmare(padroncinoId, assegnazioneId, 'system');
  }

  // ─── ASSEGNAZIONE CODICE AUTISTA ───────────────────────────────
  @Post(':id/codici-autista')
  assegnaCodice(
    @Param('id') padroncinoId: string,
    @Body() body: { codiceAutistaId: string; dataInizio: string },
  ) {
    return this.service.assegnaCodice(padroncinoId, body.codiceAutistaId, body.dataInizio, 'system');
  }

  @Delete(':id/codici-autista/:assegnazioneId')
  rimuoviCodice(
    @Param('id') padroncinoId: string,
    @Param('assegnazioneId') assegnazioneId: string,
  ) {
    return this.service.rimuoviCodice(padroncinoId, assegnazioneId, 'system');
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
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];
        const ext = extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Tipo file non supportato'), false);
        }
      },
    }),
  )
  async addDocumento(
    @Param('id') padroncinoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { nome?: string; tipo: string; scadenza?: string; note?: string },
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
      'system',
    );
  }

  @Delete(':id/documenti/:documentoId')
  removeDocumento(
    @Param('id') padroncinoId: string,
    @Param('documentoId') documentoId: string,
  ) {
    return this.service.removeDocumento(padroncinoId, documentoId, 'system');
  }
}
