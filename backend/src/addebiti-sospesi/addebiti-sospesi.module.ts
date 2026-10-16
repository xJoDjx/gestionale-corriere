import { Module } from '@nestjs/common';
import { AddebitivSospesoController } from './addebiti-sospesi.controller';
import { AddebitivSospesoService } from './addebiti-sospesi.service';

@Module({
  controllers: [AddebitivSospesoController],
  providers:   [AddebitivSospesoService],
  exports:     [AddebitivSospesoService],
})
export class AddebitivSospesoModule {}
