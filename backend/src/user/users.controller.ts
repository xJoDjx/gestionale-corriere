import {
  Controller, Get, Post, Put, Delete, Param, Body, Req,
} from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/toggle-attivo')
  toggleAttivo(@Param('id') id: string, @Req() req: any) {
    const requesterId: string = req.user?.id ?? id; // fallback safe
    return this.service.toggleAttivo(id, requesterId);
  }

  @Put(':id/password')
  changePassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.service.changePassword(id, body.password);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const requesterId: string = req.user?.id ?? '';
    return this.service.remove(id, requesterId);
  }
}
