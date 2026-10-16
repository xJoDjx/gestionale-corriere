import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Req,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ContaDoppiService,
  ApplicaRiga,
  ApplicaIngiustificatiRiga,
  ApplicaForzaMaggioreRiga,
  ApplicaControlloZonaRiga,
  SalvaRigaManualeDto,
} from './conta-doppi.service';

@Controller('conta-doppi')
export class ContaDoppiController {
  constructor(private readonly service: ContaDoppiService) {}

  /** Carica l'ultima analisi salvata nel DB (qualsiasi mese) */
  @Get('ultima-analisi')
  async getUltimaAnalisi() {
    return this.service.getUltimaAnalisi();
  }

  /** Carica l'analisi salvata per un mese specifico (null se assente) — usata dalla dashboard storica */
  @Get('analisi')
  async getAnalisiMese(@Query('mese') mese: string) {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.getAnalisi(mese);
  }

  /** Elimina l'analisi salvata per un mese (non tocca le trattenute già applicate ai conteggi) */
  @Delete('analisi')
  async eliminaAnalisi(@Query('mese') mese: string) {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.eliminaAnalisi(mese);
  }

  /** Upload unico → analisi combinata (doppie + ingiustificati), salvata nel DB per mese */
  @Post('analizza')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async analizza(
    @UploadedFile() file: Express.Multer.File,
    @Query('mese') mese: string,
  ) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const nome = file.originalname.toLowerCase();
    if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls'))
      throw new BadRequestException('Formato non supportato. Usa .xlsx o .xls');
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.analizza(file.buffer, mese);
  }

  /** Applica trattenuta Consegne Doppie ai conteggi del mese */
  @Post('applica')
  async applica(
    @Body() body: { mese: string; totali: ApplicaRiga[] },
    @Req() req: any,
  ) {
    return this.service.applicaAiConteggi(body.mese, body.totali, req.user?.id ?? 'system');
  }

  /** Applica trattenuta Malus Ingiustificati ai conteggi del mese */
  @Post('applica-ingiustificati')
  async applicaIngiustificati(
    @Body() body: { mese: string; totali: ApplicaIngiustificatiRiga[] },
    @Req() req: any,
  ) {
    return this.service.applicaIngiustificati(body.mese, body.totali, req.user?.id ?? 'system');
  }

  /** Applica trattenuta Forza Maggiore / 48-72h ai conteggi del mese */
  @Post('applica-forza-maggiore')
  async applicaForzaMaggiore(
    @Body() body: { mese: string; totali: ApplicaForzaMaggioreRiga[] },
    @Req() req: any,
  ) {
    return this.service.applicaForzaMaggiore(body.mese, body.totali, req.user?.id ?? 'system');
  }

  /** Applica trattenuta Controllo Consegne (per zona) ai conteggi del mese */
  @Post('applica-controllo-zona')
  async applicaControlloZona(
    @Body() body: { mese: string; totali: ApplicaControlloZonaRiga[] },
    @Req() req: any,
  ) {
    return this.service.applicaControlloZona(body.mese, body.totali, req.user?.id ?? 'system');
  }

  /** Salva le tariffe zona nel DB (es. { "Cosenza": 1.10, "Rende": 0.90 }) */
  @Patch('salva-tariffe')
  async salvaTariffe(@Body() body: { mese: string; tariffe: Record<string, number> }) {
    if (!body.mese || !body.tariffe) throw new BadRequestException('mese e tariffe obbligatori');
    await this.service.salvaTariffe(body.mese, body.tariffe);
    return { ok: true };
  }

  /** Importa il file "Statistica Margini Dist." del mese (Competenze Attive per codice) */
  @Post('margini/importa')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaMargini(
    @UploadedFile() file: Express.Multer.File,
    @Query('mese') mese: string,
  ) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const nome = file.originalname.toLowerCase();
    if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls'))
      throw new BadRequestException('Formato non supportato. Usa .xlsx o .xls');
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.importaStatisticaMargini(file.buffer, mese);
  }

  /** Importa la Fattura Proforma direttamente per il calcolo margini (indipendente dai conteggi) */
  @Post('margini/importa-fattura')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaFatturaMargini(
    @UploadedFile() file: Express.Multer.File,
    @Query('mese') mese: string,
  ) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const nome = file.originalname.toLowerCase();
    if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls'))
      throw new BadRequestException('Formato non supportato. Usa .xlsx o .xls');
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.importaFatturaProformaMargini(file.buffer, mese);
  }

  /** Importa il file "Statistica Consegne" del mese (% Non Consegnate per codice, con dettaglio per Esito) */
  @Post('margini/importa-consegne')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importaConsegneMargini(
    @UploadedFile() file: Express.Multer.File,
    @Query('mese') mese: string,
  ) {
    if (!file) throw new BadRequestException('File obbligatorio');
    const nome = file.originalname.toLowerCase();
    if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls'))
      throw new BadRequestException('Formato non supportato. Usa .xlsx o .xls');
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.importaStatisticaConsegne(file.buffer, mese);
  }

  /** Azzera tutte le statistiche COD (Margini + Fattura + Consegne + righe manuali) di un mese */
  @Delete('margini')
  async azzeraStatisticheCod(@Query('mese') mese: string, @Req() req: any) {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.azzeraStatisticheCod(mese, req.user?.id ?? 'system');
  }

  /** Salva Extra/Note manuali per un codice del mese (tab Margini) */
  @Patch('margini/riga')
  async salvaRigaManuale(@Body() body: SalvaRigaManualeDto) {
    return this.service.salvaRigaManualeMargini(body);
  }

  /** Margini per codice del mese: incrocia Fatturato + Competenze Attive (import diretti) + Extra/Note manuali */
  @Get('margini')
  async getMargini(@Query('mese') mese: string) {
    if (!mese || !/^\d{4}-\d{2}$/.test(mese))
      throw new BadRequestException('Parametro mese obbligatorio (YYYY-MM)');
    return this.service.getMargini(mese);
  }

  /** Applica tutte e quattro le trattenute in un unico colpo */
  @Post('applica-tutto')
  async applicaTutto(
    @Body() body: {
      mese: string;
      doppie: ApplicaRiga[];
      ingiustificati: ApplicaIngiustificatiRiga[];
      forzaMaggiore: ApplicaForzaMaggioreRiga[];
      zone: ApplicaControlloZonaRiga[];
    },
    @Req() req: any,
  ) {
    return this.service.applicaTutto(
      body.mese,
      body.doppie        ?? [],
      body.ingiustificati ?? [],
      body.forzaMaggiore  ?? [],
      body.zone           ?? [],
      req.user?.id ?? 'system',
    );
  }
}
