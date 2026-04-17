import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PalmariService } from './palmari.service';
import { CreatePalmareDto, UpdatePalmareDto, CreateAssegnazionePalmareDto } from './palmari.dto';

@Controller('palmari')
export class PalmariController {
  constructor(private service: PalmariService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('stato') stato?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      search,
      stato,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
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

  @Post()
  create(@Body() dto: CreatePalmareDto) {
    return this.service.create(dto, 'system');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePalmareDto) {
    return this.service.update(id, dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }

  @Post(':id/assegnazioni')
  createAssegnazione(
    @Param('id') id: string,
    @Body() dto: CreateAssegnazionePalmareDto,
  ) {
    return this.service.createAssegnazione(id, dto, 'system');
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(@Param('assegnazioneId') id: string) {
    return this.service.chiudiAssegnazione(id, 'system');
  }
}
