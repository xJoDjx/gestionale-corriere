import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { AddebitivSospesoService } from './addebiti-sospesi.service';
import { CreateAddebitoSospesoDto, UpdateAddebitoSospesoDto } from './addebiti-sospesi.dto';

@Controller('addebiti-sospesi')
export class AddebitivSospesoController {
  constructor(private service: AddebitivSospesoService) {}

  @Get()
  findAll(
    @Query('padroncinoId') padroncinoId?: string,
    @Query('meseTarget')   meseTarget?: string,
    @Query('stato')        stato?: 'PENDENTE' | 'EVASO',
  ) {
    return this.service.findAll({ padroncinoId, meseTarget, stato });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAddebitoSospesoDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAddebitoSospesoDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/evadi')
  evadi(@Param('id') id: string) {
    return this.service.evadi(id);
  }

  @Patch(':id/riapri')
  riapri(@Param('id') id: string) {
    return this.service.riapri(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
