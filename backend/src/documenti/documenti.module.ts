import { Module } from '@nestjs/common';
import { DocumentiController } from './documenti.controller';
import { DocumentiService } from './documenti.service';

@Module({
  controllers: [DocumentiController],
  providers: [DocumentiService],
  exports: [DocumentiService],
})
export class DocumentiModule {}
