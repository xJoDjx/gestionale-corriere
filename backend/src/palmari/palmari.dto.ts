import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum StatoPalmareEnum {
  DISPONIBILE = 'DISPONIBILE',
  ASSEGNATO = 'ASSEGNATO',
  GUASTO = 'GUASTO',
  DISMESSO = 'DISMESSO',
}

export class CreatePalmareDto {
  @IsString()
  codice: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modello?: string;

  @IsOptional()
  @IsString()
  imei?: string;

  @IsOptional()
  @IsString()
  simNumero?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tariffaMensile?: number;

  @IsOptional()
  @IsString()
  stato?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePalmareDto {
  @IsOptional()
  @IsString()
  codice?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modello?: string;

  @IsOptional()
  @IsString()
  imei?: string;

  @IsOptional()
  @IsString()
  simNumero?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tariffaMensile?: number;

  @IsOptional()
  @IsString()
  stato?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateAssegnazionePalmareDto {
  @IsString()
  padroncinoId: string;

  @IsString()
  dataInizio: string;

  @IsOptional()
  @IsString()
  dataFine?: string;
}
