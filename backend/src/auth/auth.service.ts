import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditService: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { permessi: { where: { risorsa: 'sezione' } } },
    });
    if (!user || !user.attivo) throw new UnauthorizedException('Credenziali non valide');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Credenziali non valide');

    const sezioniVisibili = user.ruolo === 'ADMIN'
      ? null
      : user.permessi.map(p => p.azione);

    // Traccia l'accesso nel log storico (non deve mai bloccare il login)
    this.auditService.log({
      userId: user.id,
      entityType: 'utente',
      entityId: user.id,
      azione: 'LOGIN',
      dataDopo: { email: user.email, nome: user.nome, cognome: user.cognome },
    });

    const payload = { sub: user.id, email: user.email, ruolo: user.ruolo };
    return {
      token: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cognome: user.cognome,
        ruolo: user.ruolo,
        sezioniVisibili,
      },
    };
  }

  async register(data: { email: string; password: string; nome: string; cognome: string }) {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('Email già registrata');

    const hashed = await bcrypt.hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: { ...data, password: hashed },
    });

    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      ruolo: user.ruolo,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permessi: true },
    });
    if (!user) throw new UnauthorizedException();
    const { password, ...result } = user;
    return result;
  }
}
