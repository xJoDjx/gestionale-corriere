import { Module } from '@nestjs/common';
import { CodiciAutistaController } from './codici-autista.controller';
import { CodiciAutistaService } from './codici-autista.service';

@Module({
  controllers: [CodiciAutistaController],
  providers: [CodiciAutistaService],
  exports: [CodiciAutistaService],
})
export class CodiciAutistaModule {}
