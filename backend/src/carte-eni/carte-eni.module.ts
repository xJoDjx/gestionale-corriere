import { Module } from '@nestjs/common';
import { CarteEniController } from './carte-eni.controller';
import { CarteEniService } from './carte-eni.service';

@Module({
  controllers: [CarteEniController],
  providers: [CarteEniService],
  exports: [CarteEniService],
})
export class CarteEniModule {}
