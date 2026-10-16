import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  ruolo?: 'ADMIN' | 'OPERATORE' | 'VIEWER';
}

export interface UpdateUserDto {
  email?: string;
  nome?: string;
  cognome?: string;
  ruolo?: 'ADMIN' | 'OPERATORE' | 'VIEWER';
  attivo?: boolean;
  password?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        ruolo: true,
        attivo: true,
        createdAt: true,
        updatedAt: true,
        permessi: { where: { risorsa: 'sezione' }, select: { azione: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(({ permessi, ...u }) => ({
      ...u,
      sezioniVisibili: permessi.map(p => p.azione),
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        ruolo: true,
        attivo: true,
        createdAt: true,
        updatedAt: true,
        permessi: { where: { risorsa: 'sezione' }, select: { azione: true } },
      },
    });
    if (!user) throw new NotFoundException('Utente non trovato');
    const { permessi, ...rest } = user;
    return { ...rest, sezioniVisibili: permessi.map(p => p.azione) };
  }

  async updateSezioni(id: string, sezioni: string[]) {
    await this.findOne(id);
    await this.prisma.permesso.deleteMany({ where: { userId: id, risorsa: 'sezione' } });
    if (sezioni.length > 0) {
      await this.prisma.permesso.createMany({
        data: sezioni.map(azione => ({ userId: id, risorsa: 'sezione', azione })),
        skipDuplicates: true,
      });
    }
    return { updated: true };
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email già registrata');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        passwordPlain: dto.password,
        nome: dto.nome,
        cognome: dto.cognome,
        ruolo: dto.ruolo ?? 'OPERATORE',
      },
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        ruolo: true,
        attivo: true,
        createdAt: true,
      },
    });
    return user;
  }

  async getPasswordPlain(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { passwordPlain: true },
    });
    if (!user) throw new NotFoundException('Utente non trovato');
    return { passwordPlain: user.passwordPlain ?? null };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const { password, ...rest } = dto;
    const data: any = { ...rest };
    if (password) {
      data.password = await bcrypt.hash(password, 12);
      data.passwordPlain = password;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        ruolo: true,
        attivo: true,
        updatedAt: true,
      },
    });
  }

  async toggleAttivo(id: string, requesterId: string) {
    const user = await this.findOne(id);
    if (id === requesterId) throw new ForbiddenException('Non puoi disattivare te stesso');

    return this.prisma.user.update({
      where: { id },
      data: { attivo: !user.attivo },
      select: { id: true, attivo: true },
    });
  }

  async remove(id: string, requesterId: string) {
    if (id === requesterId) throw new ForbiddenException('Non puoi eliminare te stesso');

    const user = await this.findOne(id);

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), attivo: false },
    });
    return { deleted: true };
  }

  async changePassword(id: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed, passwordPlain: newPassword },
    });
    return { success: true };
  }
}
