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
    return this.prisma.user.findMany({
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
      },
      orderBy: { createdAt: 'asc' },
    });
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
        permessi: true,
      },
    });
    if (!user) throw new NotFoundException('Utente non trovato');
    return user;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email già registrata');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
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

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }
    delete data.password; // già hashata sopra se presente
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
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
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    return { success: true };
  }
}
