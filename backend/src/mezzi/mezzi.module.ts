import { Module } from '@nestjs/common';
import { MezziController } from './mezzi.controller';
import { MezziService } from './mezzi.service';
import { ContrattiService } from './contratti.service';

@Module({
  controllers: [MezziController],
  providers: [MezziService, ContrattiService],
  exports: [MezziService],
})
export class MezziModule {}
