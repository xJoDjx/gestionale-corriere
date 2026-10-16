import { Body, Controller, Post, Get, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { DbAdminService, ResetSection, EntityRestoreType } from './db-admin.service';
import { Public } from '../auth/public.decorator';

/**
 * Controller per operazioni privilegiate sul DB (backup / reset).
 * Usa autenticazione propria (email+password nel body) invece del JWT,
 * quindi è marcato @Public() per bypassare il guard globale.
 */
@Public()
@Controller('db-admin')
export class DbAdminController {
  constructor(private service: DbAdminService) {}

  @Post('backup')
  @HttpCode(200)
  async backup(
    @Body() body: { email: string; password: string },
    @Res() res: Response,
  ) {
    const dump = await this.service.backup(body.email, body.password);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="backup-gestionale-${ts}.json"`,
    );
    res.send(JSON.stringify(dump, null, 2));
  }

  @Post('reset')
  @HttpCode(200)
  reset(@Body() body: { email: string; password: string; section: ResetSection }) {
    return this.service.reset(body.email, body.password, body.section);
  }

  @Get('log-stats')
  logStats() {
    return this.service.logStats();
  }

  @Post('cleanup-logs')
  @HttpCode(200)
  cleanupLogs(@Body() body: { email: string; password: string; giorni: number }) {
    return this.service.cleanupLogs(body.email, body.password, body.giorni);
  }

  /**
   * Ripristino Emergenza — elenca i record eliminati (soft-delete) di un tipo,
   * per permettere a un admin di recuperarli dopo una cancellazione per errore.
   * POST invece di GET perché richiede credenziali admin (come le altre rotte).
   */
  @Post('deleted')
  @HttpCode(200)
  listDeleted(@Body() body: { email: string; password: string; entityType: EntityRestoreType }) {
    return this.service.listDeleted(body.email, body.password, body.entityType);
  }

  /** Ripristino Emergenza — annulla la cancellazione di un singolo record. */
  @Post('restore')
  @HttpCode(200)
  restore(
    @Body() body: { email: string; password: string; entityType: EntityRestoreType; entityId: string },
  ) {
    return this.service.restoreEntity(body.email, body.password, body.entityType, body.entityId);
  }
}
