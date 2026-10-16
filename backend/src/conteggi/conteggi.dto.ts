import { IsString, IsOptional, IsEnum, IsNumber, IsInt, IsBoolean, ValidateNested, IsArray } from 'class-validator';
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

export class DuplicaConteggioDto {
  @IsString() padroncinoId!: string;
  @IsString() meseSorgente!: string;     // "2026-03"
  @IsString() meseDestinazione!: string; // "2026-04"
}

export class DuplicaBulkDto {
  @IsString() meseSorgente!: string;     // "2026-03"
  @IsString() meseDestinazione!: string; // "2026-04"
}

export class UpdateNettoDto {
  @IsNumber() @Type(() => Number) netto!: number;
}

export class UpdateNoteConteggioDto {
  @IsString() @IsOptional() note?: string;
}

export class CreateRigaDto {
  @IsString() @IsOptional() id?: string;   // DB id esistente → UPSERT; assente o "new-*" → INSERT
  @IsString() tipo!: string;
  @IsString() descrizione!: string;
  @IsNumber() @Type(() => Number) importo!: number;
  @IsEnum(Segno) segno!: Segno;
  @IsString() @IsOptional() categoria?: string;
  @IsString() @IsOptional() riferimentoTipo?: string;
  @IsString() @IsOptional() riferimentoId?: string;
  @IsInt() @IsOptional() @Type(() => Number) ordine?: number;
  @IsBoolean() @IsOptional() @Type(() => Boolean) modificaManuale?: boolean; // ← AGGIUNTO
  @IsString() @IsOptional() contoVoce?: string;
  @IsNumber() @IsOptional() @Type(() => Number) percIva?: number;
  @IsString() @IsOptional() note?: string;
}

export class ReplaceRigheDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRigaDto)
  righe!: CreateRigaDto[];

  @IsNumber() @IsOptional() @Type(() => Number) netto?: number;
}

export class UpdateRigaDto {
  @IsString() @IsOptional() descrizione?: string;
  @IsNumber() @IsOptional() @Type(() => Number) importo?: number;
  @IsEnum(Segno) @IsOptional() segno?: Segno;
  @IsString() @IsOptional() categoria?: string;
  @IsInt() @IsOptional() @Type(() => Number) ordine?: number;
  @IsBoolean() @IsOptional() @Type(() => Boolean) modificaManuale?: boolean;
  @IsString() @IsOptional() contoVoce?: string;
  @IsNumber() @IsOptional() @Type(() => Number) percIva?: number;
  @IsString() @IsOptional() note?: string;
}
