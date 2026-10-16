import { Module } from '@nestjs/common';
import { VociConteggioController } from './voci-conteggio.controller';
import { VociConteggioService } from './voci-conteggio.service';

@Module({
  controllers: [VociConteggioController],
  providers: [VociConteggioService],
  exports: [VociConteggioService],
})
export class VociConteggioModule {}
