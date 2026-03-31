import { Module } from '@nestjs/common';
import { PadronciniController } from './padroncini.controller';
import { PadronciniService } from './padroncini.service';

@Module({
  controllers: [PadronciniController],
  providers: [PadronciniService],
  exports: [PadronciniService],
})
export class PadronciniModule {}
