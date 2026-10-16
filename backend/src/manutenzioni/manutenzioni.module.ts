import { Module } from '@nestjs/common';
import { ManutenzioniController } from './manutenzioni.controller';
import { ManutenzioniService } from './manutenzioni.service';

@Module({
  controllers: [ManutenzioniController],
  providers: [ManutenzioniService],
})
export class ManutenzioniModule {}
