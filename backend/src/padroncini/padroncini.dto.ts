import { IsString, IsOptional, IsDateString, IsBoolean, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePadroncinoDto {
  @IsString() ragioneSociale: string;
  @IsString() @IsOptional() partitaIva?: string;
  @IsString() @IsOptional() codiceFiscale?: string;
  @IsString() @IsOptional() indirizzo?: string;
  @IsString() @IsOptional() telefono?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() pec?: string;
  @IsString() @IsOptional() iban?: string;
  @IsDateString() @IsOptional() scadenzaDurc?: string;
  @IsDateString() @IsOptional() scadenzaDvr?: string;
  @IsString() @IsOptional() note?: string;
  @IsBoolean() @IsOptional() attivo?: boolean;
  @IsBoolean() @IsOptional() dvrEsente?: boolean;

  // Rappresentante legale
  @IsString() @IsOptional() rappresentanteNome?: string;
  @IsString() @IsOptional() rappresentanteCognome?: string;
  @IsString() @IsOptional() cfRappresentante?: string;
  @IsString() @IsOptional() qualificaRappresentante?: string;
}

export class UpdatePadroncinoDto extends CreatePadroncinoDto {}

export class UpdateDocumentoDto {
  @IsString() @IsOptional() nome?: string;
  @IsString() @IsOptional() tipo?: string;
  // Non @IsDateString(): il form può inviare '' per azzerare la scadenza,
  // e il servizio converte la stringa in Date (o null) manualmente.
  @IsString() @IsOptional() scadenza?: string;
  @IsString() @IsOptional() note?: string;
}

export class GeneraContrattoPalmareDto {
  @IsString() @IsOptional() nomeRapp?: string;
  @IsString() @IsOptional() cognomeRapp?: string;
  @IsString() @IsOptional() cfRapp?: string;
  @IsString() @IsOptional() qualificaRapp?: string;
  @IsString() @IsOptional() dataFirma?: string;
  // Se omesso, vengono inclusi tutti i palmari attualmente assegnati al padroncino
  @IsArray() @IsOptional() @IsString({ each: true }) palmareIds?: string[];
}

export class GeneraContrattoCodiciDto {
  @IsString() @IsOptional() dataContratto?: string;
  // Se omesso, vengono inclusi tutti i codici autista attualmente assegnati al padroncino
  @IsArray() @IsOptional() @IsString({ each: true }) codiceAutistaIds?: string[];
}

export class GeneraContrattoMezziDto {
  @IsString() @IsOptional() nomeRapp?: string;
  @IsString() @IsOptional() cognomeRapp?: string;
  @IsString() @IsOptional() cfRapp?: string;
  @IsString() @IsOptional() qualificaRapp?: string;
  @IsString() @IsOptional() dataFirma?: string;
  // Se omesso, vengono inclusi tutti i mezzi attualmente assegnati al padroncino
  @IsArray() @IsOptional() @IsString({ each: true }) mezzoIds?: string[];
  @IsOptional() eccedenzaKm?: number;
}

export class QueryPadronciniDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) attivo?: boolean;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() include?: string;
}
