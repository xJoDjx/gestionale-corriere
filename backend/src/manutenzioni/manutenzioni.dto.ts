import { IsString, IsOptional, IsDateString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateManutenzioneDto {
  @IsString()
  mezzoId: string;

  @IsDateString()
  dataInizio: string;

  @IsOptional()
  @IsDateString()
  dataFine?: string;

  @IsString()
  descrizione: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costo?: number;

  @IsOptional()
  @IsString()
  fornitore?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateManutenzioneDto {
  @IsOptional()
  @IsDateString()
  dataInizio?: string;

  @IsOptional()
  @IsDateString()
  dataFine?: string;

  @IsOptional()
  @IsString()
  descrizione?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costo?: number;

  @IsOptional()
  @IsString()
  fornitore?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
