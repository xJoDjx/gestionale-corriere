import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('login')
  login(@Body() data: { email: string; password: string }) {
    return this.service.login(data.email, data.password);
  }

  @Post('register')
  register(@Body() data: { email: string; password: string; nome: string; cognome: string }) {
    return this.service.register(data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.service.getProfile(req.user.id);
  }
}
