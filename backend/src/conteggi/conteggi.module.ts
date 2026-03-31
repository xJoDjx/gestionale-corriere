import { Module } from '@nestjs/common';
import { ConteggiController } from './conteggi.controller';
import { ConteggiService } from './conteggi.service';

@Module({
  controllers: [ConteggiController],
  providers: [ConteggiService],
  exports: [ConteggiService],
})
export class ConteggiModule {}
