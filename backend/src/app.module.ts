import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MezziModule } from './mezzi/mezzi.module';
import { PadronciniModule } from './padroncini/padroncini.module';
import { PalmariModule } from './palmari/palmari.module';
import { CodiciAutistaModule } from './codici-autista/codici-autista.module';
import { AccontiModule } from './acconti/acconti.module';
import { ConteggiModule } from './conteggi/conteggi.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    MezziModule,
    PadronciniModule,
    PalmariModule,
    CodiciAutistaModule,
    AccontiModule,
    ConteggiModule,
  ],
})
export class AppModule {}
