import { Module } from '@nestjs/common';
import { ConteggiController } from './conteggi.controller';
import { ConteggiService } from './conteggi.service';
import { RegistroMezziModule } from '../registro-mezzi/registro-mezzi.module';

@Module({
  imports: [RegistroMezziModule],
  controllers: [ConteggiController],
  providers: [ConteggiService],
  exports: [ConteggiService],
})
export class ConteggiModule {}
