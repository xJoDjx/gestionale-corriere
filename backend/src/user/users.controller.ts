import {
  Controller, Get, Post, Put, Delete, Param, Body, Req, ForbiddenException,
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
    return this.service.toggleAttivo(id, req.user.id);
  }

  @Put(':id/password')
  changePassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.service.changePassword(id, body.password);
  }

  @Put(':id/sezioni')
  updateSezioni(@Param('id') id: string, @Body() body: { sezioni: string[] }) {
    return this.service.updateSezioni(id, body.sezioni ?? []);
  }

  @Get(':id/password-plain')
  getPasswordPlain(@Param('id') id: string, @Req() req: any) {
    if (req.user?.ruolo !== 'ADMIN') {
      throw new ForbiddenException('Solo gli Admin possono visualizzare le password');
    }
    return this.service.getPasswordPlain(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }
}
