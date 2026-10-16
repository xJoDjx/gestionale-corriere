import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentoDto, UpdateDocumentoDto } from './documenti.dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DocumentiService {
  constructor(private prisma: PrismaService) {}

  async upload(dto: CreateDocumentoDto, file: Express.Multer.File) {
    const scadenza = dto.scadenza ? new Date(dto.scadenza) : undefined;

    const doc = await this.prisma.documento.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        nome: dto.nome,
        tipo: dto.tipo ?? null,
        filePath: file.path,
        mimeType: file.mimetype,
        dimensione: file.size,
        scadenza: scadenza ?? null,
        note: dto.note ?? null,
      },
    });
    return doc;
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.documento.findMany({
      where: { entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.documento.findFirst({
      where: { id, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento non trovato');
    return doc;
  }

  async update(id: string, dto: UpdateDocumentoDto) {
    await this.findOne(id); // verifica esistenza
    return this.prisma.documento.update({
      where: { id },
      data: {
        ...(dto.nome      !== undefined && { nome:     dto.nome }),
        ...(dto.tipo      !== undefined && { tipo:     dto.tipo || null }),
        ...(dto.scadenza  !== undefined && {
          scadenza: dto.scadenza ? new Date(dto.scadenza) : null,
        }),
        ...(dto.note      !== undefined && { note:     dto.note || null }),
      },
    });
  }

  async remove(id: string) {
    const doc = await this.findOne(id);
    // Soft delete
    await this.prisma.documento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // Rimuovi file fisico
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
    return { ok: true };
  }

  getFilePath(doc: { filePath: string }) {
    return path.resolve(doc.filePath);
  }
}
