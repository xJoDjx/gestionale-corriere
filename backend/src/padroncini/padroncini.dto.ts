import { IsString, IsOptional, IsDateString, IsBoolean } from 'class-validator';
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
}

export class UpdatePadroncinoDto extends CreatePadroncinoDto {}

export class QueryPadronciniDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) attivo?: boolean;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
}
