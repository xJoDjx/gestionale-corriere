import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MezziModule } from './mezzi/mezzi.module';
import { PadronciniModule } from './padroncini/padroncini.module';
import { PalmariModule } from './palmari/palmari.module';
import { CodiciAutistaModule } from './codici-autista/codici-autista.module';
import { AccontiModule } from './acconti/acconti.module';
import { ConteggiModule } from './conteggi/conteggi.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './user/users.module';
import { RicaricheModule } from './ricariche/ricariche.module';
import { VociConteggioModule } from './voci-conteggio/voci-conteggio.module';
import { DbAdminModule } from './db-admin/db-admin.module';
import { SearchModule } from './search/search.module';
import { AddebitivSospesoModule } from './addebiti-sospesi/addebiti-sospesi.module';
import { ContaDoppiModule } from './conta-doppi/conta-doppi.module';
import { DocumentiModule } from './documenti/documenti.module';
import { ManutenzioniModule } from './manutenzioni/manutenzioni.module';
import { NoteModule } from './note/note.module';
import { CarteEniModule } from './carte-eni/carte-eni.module';
import { TaskModule } from './task/task.module';

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
    UsersModule,
    RicaricheModule,
    VociConteggioModule,
    DbAdminModule,
    SearchModule,
    AddebitivSospesoModule,
    ContaDoppiModule,
    DocumentiModule,
    ManutenzioniModule,
    NoteModule,
    CarteEniModule,
    TaskModule,
  ],
  providers: [
    // Guard JWT applicato globalmente a tutti gli endpoint.
    // Usare @Public() per escludere singoli endpoint (login, register, db-admin).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
