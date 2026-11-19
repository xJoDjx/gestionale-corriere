import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export const TIPI_REGISTRO = ['VERBALE', 'FRANCHIGIA', 'RIFATTURAZIONE', 'ALTRO'] as const;
export const STATI_REGISTRO = ['APERTO', 'PAGATO', 'CONTESTATO', 'ANNULLATO'] as const;

export class CreateRegistroMezzoDto {
  @IsString() targa!: string;
  @IsOptional() @IsIn(TIPI_REGISTRO as any) tipo?: string;
  @IsOptional() @IsString() numero?: string | null;
  @IsOptional() @IsString() dataEvento?: string | null;
  @IsString() descrizione!: string;
  @Type(() => Number) @IsNumber() importo!: number;
  @IsOptional() @Type(() => Number) @IsNumber() percIva?: number | null;
  @IsOptional() @IsString() mese?: string | null;
  @IsOptional() @IsString() padroncinoId?: string | null;
  @IsOptional() @IsIn(STATI_REGISTRO as any) stato?: string;
  @IsOptional() @IsString() note?: string | null;
}

/** Sulle voci nate dai conteggi importo, descrizione, mese e padroncino non sono modificabili. */
export class UpdateRegistroMezzoDto {
  @IsOptional() @IsString() targa?: string;
  @IsOptional() @IsIn(TIPI_REGISTRO as any) tipo?: string;
  @IsOptional() @IsString() numero?: string | null;
  @IsOptional() @IsString() dataEvento?: string | null;
  @IsOptional() @IsIn(STATI_REGISTRO as any) stato?: string;
  @IsOptional() @IsString() note?: string | null;
  // solo voci manuali
  @IsOptional() @IsString() descrizione?: string;
  @IsOptional() @Type(() => Number) @IsNumber() importo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() percIva?: number | null;
  @IsOptional() @IsString() mese?: string | null;
  @IsOptional() @IsString() padroncinoId?: string | null;
  @IsOptional() @IsBoolean() ripristinaRiconoscimento?: boolean;
}
