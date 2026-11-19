import { Module } from '@nestjs/common';
import { RegistroMezziController } from './registro-mezzi.controller';
import { RegistroMezziService } from './registro-mezzi.service';

@Module({
  controllers: [RegistroMezziController],
  providers: [RegistroMezziService],
  exports: [RegistroMezziService],
})
export class RegistroMezziModule {}
