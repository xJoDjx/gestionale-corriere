import { Module } from '@nestjs/common';
import { PadronciniController } from './padroncini.controller';
import { PadronciniService } from './padroncini.service';
import { ContrattiPalmareService } from './contratti-palmare.service';
import { ContrattiCodiciService } from './contratti-codici.service';
import { ContrattiMezziService } from './contratti-mezzi.service';

@Module({
  controllers: [PadronciniController],
  providers: [PadronciniService, ContrattiPalmareService, ContrattiCodiciService, ContrattiMezziService],
  exports: [PadronciniService],
})
export class PadronciniModule {}
