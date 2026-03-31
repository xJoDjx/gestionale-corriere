import { Module } from '@nestjs/common';
import { PalmariController } from './palmari.controller';
import { PalmariService } from './palmari.service';

@Module({
  controllers: [PalmariController],
  providers: [PalmariService],
  exports: [PalmariService],
})
export class PalmariModule {}
