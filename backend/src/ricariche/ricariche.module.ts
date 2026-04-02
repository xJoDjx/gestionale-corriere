import { Module } from '@nestjs/common';
import { RicaricheController } from './ricariche.controller';
import { RicaricheService } from './ricariche.service';

@Module({
  controllers: [RicaricheController],
  providers: [RicaricheService],
  exports: [RicaricheService],
})
export class RicaricheModule {}
