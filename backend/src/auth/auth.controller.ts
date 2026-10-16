import { Controller, Post, Get, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() data: { email: string; password: string }) {
    return this.service.login(data.email, data.password);
  }

  /**
   * Registrazione protetta: solo utenti ADMIN autenticati possono creare account.
   * Usare POST /users per la creazione standard tramite pannello admin.
   */
  @Post('register')
  async register(
    @Body() data: { email: string; password: string; nome: string; cognome: string },
    @Request() req: any,
  ) {
    if (req.user?.ruolo !== 'ADMIN') {
      throw new ForbiddenException('Solo gli amministratori possono registrare nuovi utenti');
    }
    return this.service.register(data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.service.getProfile(req.user.id);
  }
}
