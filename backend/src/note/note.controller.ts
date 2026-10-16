import {
  Controller, Get, Post, Delete,
  Param, Query, Body, Request,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { NoteService } from './note.service';
import { CreateNotaDto } from './note.dto';

@Controller('note')
export class NoteController {
  constructor(private service: NoteService) {}

  /** GET /note?entityType=mezzo&entityId=xxx&limit=20 */
  @Get()
  findAll(
    @Query('entityType')                          entityType?: string,
    @Query('entityId')                            entityId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll(entityType, entityId, limit);
  }

  /** POST /note */
  @Post()
  create(@Body() dto: CreateNotaDto, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.create(dto, userId);
  }

  /** DELETE /note/:id */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.remove(id, userId);
  }
}
