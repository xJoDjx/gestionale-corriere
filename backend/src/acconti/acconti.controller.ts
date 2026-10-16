import {
  Controller, Get, Post, Put, Delete, Param, Query, Body, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AccontiService, CreateAccontoDto, UpdateAccontoDto } from './acconti.service';

@Controller('acconti')
export class AccontiController {
  constructor(private service: AccontiService) {}

  @Get()
  findAll(@Query('mese') mese?: string) {
    return this.service.findAll(mese);
  }

  @Get('verifica-codice/:codice')
  verificaCodice(@Param('codice') codice: string) {
    return this.service.verificaCodice(codice);
  }

  @Get('padroncino/:padroncinoId')
  findByPadroncino(
    @Param('padroncinoId') padroncinoId: string,
    @Query('mese') mese?: string,
  ) {
    return this.service.findByPadroncino(padroncinoId, mese);
  }

  @Post()
  create(@Body() dto: CreateAccontoDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccontoDto, @Req() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Post('importa')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importaExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('mese') mese: string,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File mancante');
    if (!mese) throw new BadRequestException('Mese di competenza mancante');
    return this.service.importaExcel(file, mese, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }
}
