import { Module } from '@nestjs/common';
import { AccontiController } from './acconti.controller';
import { AccontiService } from './acconti.service';
import { CodiciAutistaModule } from '../codici-autista/codici-autista.module';

@Module({
  imports: [CodiciAutistaModule],
  controllers: [AccontiController],
  providers: [AccontiService],
  exports: [AccontiService],
})
export class AccontiModule {}
