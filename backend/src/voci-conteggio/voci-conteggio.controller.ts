import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { VociConteggioService } from './voci-conteggio.service';
import { CreateVoceConteggioDto, UpdateVoceConteggioDto } from './voci-conteggio.dto';

@Controller('voci-conteggio')
export class VociConteggioController {
  constructor(private service: VociConteggioService) {}

  @Get()
  findAll(@Query('categoria') categoria?: string) {
    return this.service.findAll(categoria);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateVoceConteggioDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVoceConteggioDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
