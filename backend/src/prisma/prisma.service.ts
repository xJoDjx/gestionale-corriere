import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Applica soft delete filter di default
   */
  softDeleteFilter() {
    return { deletedAt: null };
  }

  /**
   * Trova assegnazione attiva per una data specifica
   */
  activeAssignmentFilter(date: Date = new Date()) {
    return {
      deletedAt: null,
      dataInizio: { lte: date },
      OR: [{ dataFine: null }, { dataFine: { gte: date } }],
    };
  }
}
