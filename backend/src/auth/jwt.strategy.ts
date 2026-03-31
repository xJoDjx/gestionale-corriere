import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    });
  }

  async validate(payload: { sub: string; email: string; ruolo: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permessi: true },
    });
    if (!user || !user.attivo || user.deletedAt) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      ruolo: user.ruolo,
      permessi: user.permessi,
    };
  }
}
