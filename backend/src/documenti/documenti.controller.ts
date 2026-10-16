import {
  Controller, Get, Post, Patch, Delete, Param, Query, Res,
  UseInterceptors, UploadedFile, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { DocumentiService } from './documenti.service';
import { CreateDocumentoDto, UpdateDocumentoDto } from './documenti.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

const uploadStorage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname));
  },
});

@ApiTags('documenti')
@ApiBearerAuth()
@Controller('documenti')
export class DocumentiController {
  constructor(private svc: DocumentiService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentoDto,
  ) {
    return this.svc.upload(dto, file);
  }

  @Get()
  async findByEntity(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.svc.findByEntity(entityType, entityId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.svc.findOne(id);
    const filePath = this.svc.getFilePath(doc);
    res.download(filePath, doc.nome);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentoDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
