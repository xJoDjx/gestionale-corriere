import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
  chiudiAssegnazione(@Param('assegnazioneId') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.chiudiAssegnazione(id, userId);
  }
}
