import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { RegistroMezziService } from './registro-mezzi.service';
import { CreateRegistroMezzoDto, UpdateRegistroMezzoDto } from './registro-mezzi.dto';

@Controller('registro-mezzi')
export class RegistroMezziController {
  constructor(private service: RegistroMezziService) {}

  @Get()
  findAll(
    @Query('mezzoId') mezzoId?: string,
    @Query('targa') targa?: string,
    @Query('padroncinoId') padroncinoId?: string,
    @Query('mese') mese?: string,
    @Query('tipo') tipo?: string,
  ) {
    return this.service.findAll({ mezzoId, targa, padroncinoId, mese, tipo });
  }

  /** Rilegge tutti i conteggi (idempotente): utile dopo aver aggiunto mezzi alla flotta. */
  @Post('sincronizza')
  sincronizza() {
    return this.service.sincronizzaTutti();
  }

  @Post()
  create(@Body() dto: CreateRegistroMezzoDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRegistroMezzoDto, @Req() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }
}
