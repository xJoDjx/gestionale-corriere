import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CarteEniService } from './carte-eni.service';
import { CreateCartaEniDto, UpdateCartaEniDto, AggiornaPrezzoGiornoDto, UpdateStazioneEniDto, CreateStazioneEniDto } from './carte-eni.dto';

@Controller('carte-eni')
export class CarteEniController {
  constructor(private service: CarteEniService) {}

  // ── Anagrafica carte ──
  @Get('carte')
  findAllCarte() {
    return this.service.findAllCarte();
  }

  @Post('carte')
  createCarta(@Body() dto: CreateCartaEniDto) {
    return this.service.createCarta(dto);
  }

  @Put('carte/:id')
  updateCarta(@Param('id') id: string, @Body() dto: UpdateCartaEniDto) {
    return this.service.updateCarta(id, dto);
  }

  @Delete('carte/:id')
  removeCarta(@Param('id') id: string) {
    return this.service.removeCarta(id);
  }

  // ── Anagrafica stazioni ──
  @Get('stazioni')
  findAllStazioni() {
    return this.service.findAllStazioni();
  }

  @Post('stazioni')
  createStazione(@Body() dto: CreateStazioneEniDto) {
    return this.service.createStazione(dto);
  }

  @Put('stazioni/:id')
  updateStazione(@Param('id') id: string, @Body() dto: UpdateStazioneEniDto) {
    return this.service.updateStazione(id, dto);
  }

  // ── Prezzi giorno ──
  @Get('prezzi')
  listPrezziGiorno(@Query('mese') mese: string) {
    if (!mese) return [];
    return this.service.listPrezziGiorno(mese);
  }

  @Put('prezzi/:data/:prodotto')
  aggiornaPrezzoGiorno(
    @Param('data') data: string,
    @Param('prodotto') prodotto: 'DIESEL' | 'HVO' | 'BENZINA' | 'ALTRO',
    @Body() dto: AggiornaPrezzoGiornoDto,
  ) {
    return this.service.aggiornaPrezzoGiorno(data, prodotto, dto.prezzoUnitario);
  }

  @Post('prezzi/importa')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaPrezzi(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File obbligatorio');
    return this.service.importaPrezzi(file.buffer);
  }

  // ── Mesi / transazioni ──
  @Get('mesi')
  listMesi() {
    return this.service.listMesi();
  }

  @Get()
  findByMese(@Query('mese') mese: string) {
    if (!mese) return { mese: null, transazioni: [] };
    return this.service.findByMese(mese);
  }

  @Post('importa')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importa(@UploadedFile() file: Express.Multer.File, @Query('mese') mese: string) {
    if (!file) throw new BadRequestException('File obbligatorio');
    if (!mese) throw new BadRequestException('Parametro "mese" obbligatorio (formato YYYY-MM)');
    return this.service.importa(mese, file.buffer);
  }

  @Delete(':mese')
  eliminaMese(@Param('mese') mese: string) {
    return this.service.eliminaMese(mese);
  }
}
