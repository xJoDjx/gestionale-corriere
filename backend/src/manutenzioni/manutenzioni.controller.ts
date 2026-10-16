import {
  Controller, Get, Post, Patch, Delete, Param, Query,
  Body, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { ManutenzioniService } from './manutenzioni.service';
import { CreateManutenzioneDto, UpdateManutenzioneDto } from './manutenzioni.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

const uploadStorage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname));
  },
});

@ApiTags('manutenzioni')
@ApiBearerAuth()
@Controller('manutenzioni')
export class ManutenzioniController {
  constructor(private svc: ManutenzioniService) {}

  @Get()
  findByMezzo(@Query('mezzoId') mezzoId: string) {
    return this.svc.findByMezzo(mezzoId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('fattura', { storage: uploadStorage }))
  create(
    @Body() dto: CreateManutenzioneDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.create(dto, file);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('fattura', { storage: uploadStorage }))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateManutenzioneDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.update(id, dto, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/fattura')
  async downloadFattura(@Param('id') id: string, @Res() res: Response) {
    const m = await this.svc.downloadFattura(id);
    if (!m.fatturaPath) return res.status(404).send('Nessuna fattura allegata');
    res.download(m.fatturaPath, m.fatturaNome ?? 'fattura');
  }
}
