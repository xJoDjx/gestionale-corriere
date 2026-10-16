import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, Req,
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
  create(@Body() dto: CreatePalmareDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePalmareDto, @Req() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }

  @Post(':id/assegnazioni')
  createAssegnazione(
    @Param('id') id: string,
    @Body() dto: CreateAssegnazionePalmareDto,
    @Req() req: any,
  ) {
    return this.service.createAssegnazione(id, dto, req.user.id);
  }

  @Put('assegnazioni/:assegnazioneId/chiudi')
  chiudiAssegnazione(
    @Param('assegnazioneId') id: string,
    @Body() body: { dataFine?: string },
    @Req() req: any,
  ) {
    return this.service.chiudiAssegnazione(id, req.user.id, body?.dataFine);
  }
}
