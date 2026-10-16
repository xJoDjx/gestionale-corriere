import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, Request,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto, UpdateTaskDto } from './task.dto';

@Controller('task')
export class TaskController {
  constructor(private service: TaskService) {}

  /** GET /task?entityType=flotta&entityId=mezzi */
  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId')   entityId?: string,
  ) {
    return this.service.findAll(entityType, entityId);
  }

  /** POST /task */
  @Post()
  create(@Body() dto: CreateTaskDto, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.create(dto, userId);
  }

  /** PATCH /task/:id */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(id, dto);
  }

  /** DELETE /task/:id */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const userId: string = req.user?.id ?? 'system';
    return this.service.remove(id, userId);
  }
}
