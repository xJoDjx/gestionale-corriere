import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PalmariService } from './palmari.service';
import { CreatePalmareDto, UpdatePalmareDto, CreateAssegnazionePalmareDto } from './palmari.dto';

@Controller('palmari')
export class PalmariController {
  constructor(private service: PalmariService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreatePalmareDto) { return this.service.create(dto, 'system'); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePalmareDto) {
    return this.service.update(id, dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id, 'system'); }

  @Post(':id/assegnazioni')
  createAssegnazione(@Param('id') id: string, @Body() dto: CreateAssegnazionePalmareDto) {
    return this.service.createAssegnazione(id, dto, 'system');
  }
}
