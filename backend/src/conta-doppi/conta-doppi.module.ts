import { Module } from '@nestjs/common';
import { ContaDoppiController } from './conta-doppi.controller';
import { ContaDoppiService } from './conta-doppi.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ContaDoppiController],
  providers: [ContaDoppiService],
})
export class ContaDoppiModule {}
