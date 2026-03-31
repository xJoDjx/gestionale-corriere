import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import { PadronciniService } from './padroncini.service';
import { CreatePadroncinoDto, UpdatePadroncinoDto, QueryPadronciniDto } from './padroncini.dto';

@Controller('padroncini')
export class PadronciniController {
  constructor(private service: PadronciniService) {}

  @Get()
  findAll(@Query() query: QueryPadronciniDto) {
    return this.service.findAll(query);
  }

  @Get('select')
  listForSelect() {
    return this.service.listForSelect();
  }

  @Get('scadenze')
  getScadenze(@Query('giorni') giorni?: string) {
    return this.service.getScadenze(giorni ? parseInt(giorni) : 30);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePadroncinoDto) {
    return this.service.create(dto, 'system');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePadroncinoDto) {
    return this.service.update(id, dto, 'system');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id, 'system');
  }
}
