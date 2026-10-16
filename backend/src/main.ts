import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { json, urlencoded, Request, Response } from 'express';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.setGlobalPrefix('api');

  // Servi il frontend React dalla cartella public/ (sempre attivo se esiste)
  const publicPath = join(process.cwd(), 'public');
  app.use(express.static(publicPath));

  // SPA fallback: intercetta PRIMA che NestJS gestisca le route non trovate.
  // Le route API (/api/*) passano al next handler (NestJS).
  // I path con estensione (es. .js, .css) sono già serviti da express.static.
  app.use((req: any, res: any, next: any) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
      res.sendFile(join(publicPath, 'index.html'));
    } else {
      next();
    }
  });

  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Gestionale Corriere API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Gestionale Corriere in ascolto sulla porta ${port}`);
}
bootstrap();
