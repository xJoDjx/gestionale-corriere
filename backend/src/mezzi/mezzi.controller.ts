import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException, Request,
  Res, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { MezziService } from './mezzi.service';
import { ContrattiService } from './contratti.service';
import { CreateMezzoDto, UpdateMezzoDto, QueryMezziDto, CreateAssegnazioneMezzoDto, GeneraContrattoPdaDto } from './mezzi.dto';

@Controller('mezzi')
export class MezziController {
  constructor(
    private service: MezziService,
    private contratti: ContrattiService,
  ) {}

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

  @Post('importa-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const ext = file.originalname.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      throw new BadRequestException('Formato file non supportato. Usa .xlsx o .xls');
    }
    return this.service.importaExcel(file.buffer);
  }

  @Post()
  create(@Body() dto: CreateMezzoDto, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.create(dto, userId);
  }

  // ─── CONTRATTO PDA ─────────────────────────────────
  // IMPORTANTE: dichiarato PRIMA di @Put(':id') / @Delete(':id') per evitare conflitti di routing
  @Post(':id/contratto-pda')
  async generaContrattoPda(
    @Param('id') mezzoId: string,
    @Body() dto: GeneraContrattoPdaDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ): Promise<StreamableFile> {
    const userId: string = req.user?.id ?? 'system';
    const { buffer, filename } = await this.contratti.generaContrattoPda(mezzoId, dto, userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  @Post(':id/duplica')
  duplica(@Param('id') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.duplica(id, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMezzoDto, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.remove(id, userId);
  }

  // ─── ASSEGNAZIONI ──────────────────────────────────
  @Post(':id/assegnazioni')
  createAssegnazione(
    @Param('id') mezzoId: string,
    @Body() dto: CreateAssegnazioneMezzoDto,
    @Request() req: any,
  ) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.createAssegnazione(mezzoId, dto, userId);
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(
    @Param('assegnazioneId') id: string,
    @Body() body: { dataFine?: string },
    @Request() req: any,
  ) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.chiudiAssegnazione(id, userId, body?.dataFine);
  }

  @Delete('assegnazioni/:assegnazioneId')
  deleteAssegnazione(@Param('assegnazioneId') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.deleteAssegnazione(id, userId);
  }
}
