import { IsString, IsOptional, IsEnum, IsNumber, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { StatoConteggio, Segno } from '@prisma/client';

export class CreateConteggioDto {
  @IsString() padroncinoId!: string;
  @IsString() mese!: string; // "2026-03"
  @IsString() @IsOptional() note?: string;
}

export class UpdateConteggioStatoDto {
  @IsEnum(StatoConteggio) stato!: StatoConteggio;
}

export class CreateRigaDto {
  @IsString() tipo!: string;
  @IsString() descrizione!: string;
  @IsNumber() @Type(() => Number) importo!: number;
  @IsEnum(Segno) segno!: Segno;
  @IsString() @IsOptional() categoria?: string;
  @IsString() @IsOptional() riferimentoTipo?: string;
  @IsString() @IsOptional() riferimentoId?: string;
  @IsInt() @IsOptional() @Type(() => Number) ordine?: number;
  @IsBoolean() @IsOptional() @Type(() => Boolean) modificaManuale?: boolean; // ← AGGIUNTO
  @IsString() @IsOptional() note?: string;
}

export class UpdateRigaDto {
  @IsString() @IsOptional() descrizione?: string;
  @IsNumber() @IsOptional() @Type(() => Number) importo?: number;
  @IsEnum(Segno) @IsOptional() segno?: Segno;
  @IsString() @IsOptional() categoria?: string;
  @IsInt() @IsOptional() @Type(() => Number) ordine?: number;
  @IsBoolean() @IsOptional() @Type(() => Boolean) modificaManuale?: boolean;
  @IsString() @IsOptional() note?: string;
}
