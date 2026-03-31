import { Module } from '@nestjs/common';
import { MezziController } from './mezzi.controller';
import { MezziService } from './mezzi.service';

@Module({
  controllers: [MezziController],
  providers: [MezziService],
  exports: [MezziService],
})
export class MezziModule {}
