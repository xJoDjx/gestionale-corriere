import {
  IsString, IsOptional, IsEnum, IsInt, IsNumber, IsDateString, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoMezzo, Alimentazione, CategoriaMezzo, StatoMezzo } from '@prisma/client';

export class CreateMezzoDto {
  // ── Identificativi ──────────────────────────────────
  @IsString() targa: string;
  @IsString() marca: string;
  @IsString() modello: string;
  @IsEnum(TipoMezzo)      @IsOptional() tipo?: TipoMezzo;
  @IsEnum(Alimentazione)  @IsOptional() alimentazione?: Alimentazione;
  @IsEnum(CategoriaMezzo) @IsOptional() categoria?: CategoriaMezzo;
  @IsEnum(StatoMezzo)     @IsOptional() stato?: StatoMezzo;
  @IsInt()  @IsOptional() @Type(() => Number) annoImmatricolazione?: number;
  @IsString() @IsOptional() telaio?: string;
  @IsString() @IsOptional() colore?: string;
  @IsInt()  @IsOptional() @Type(() => Number) portata?: number;
  @IsNumber() @IsOptional() @Type(() => Number) volume?: number;
  @IsString() @IsOptional() tipoCassone?: string;
  @IsString() @IsOptional() targaRimorchio?: string;

  // ── Possesso ────────────────────────────────────────
  @IsString() @IsOptional() tipoPossesso?: string; // 'PROPRIETA' | 'NOLEGGIO'

  // ── Noleggio — dati locatore ─────────────────────────
  // accetta sia "societaNoleggio" (nome reale schema) sia "proprietario" (alias frontend)
  @IsString() @IsOptional() societaNoleggio?: string;
  @IsString() @IsOptional() proprietario?: string;        // alias → viene mappato in service
  @IsString() @IsOptional() pIvaLocatore?: string;
  @IsString() @IsOptional() telefonoLocatore?: string;
  @IsString() @IsOptional() emailLocatore?: string;
  @IsString() @IsOptional() riferimentoContratto?: string;
  @IsString() @IsOptional() nContratto?: string;          // alias → viene mappato in service

  // ── Noleggio — finanziario ───────────────────────────
  @IsNumber() @IsOptional() @Type(() => Number) rataNoleggio?: number;
  @IsNumber() @IsOptional() @Type(() => Number) canoneNoleggio?: number;
  @IsDateString() @IsOptional() inizioNoleggio?: string;
  @IsDateString() @IsOptional() fineNoleggio?: string;

  // ── Km ──────────────────────────────────────────────
  @IsInt() @IsOptional() @Type(() => Number) kmAttuali?: number;
  @IsInt() @IsOptional() @Type(() => Number) kmLimite?: number;

  // ── Scadenze ────────────────────────────────────────
  @IsDateString() @IsOptional() scadenzaAssicurazione?: string;
  @IsDateString() @IsOptional() scadenzaRevisione?: string;
  @IsDateString() @IsOptional() scadenzaBollo?: string;
  @IsDateString() @IsOptional() scadenzaTagliando?: string;
  @IsDateString() @IsOptional() scadenzaTachigrafo?: string;

  // ── Contatori / extra ───────────────────────────────
  @IsNumber() @IsOptional() @Type(() => Number) maggiorazioneRicarica?: number;

  // ── Note ────────────────────────────────────────────
  @IsString() @IsOptional() note?: string;
}

export class UpdateMezzoDto extends CreateMezzoDto {}

export class QueryMezziDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(StatoMezzo) stato?: StatoMezzo;
  @IsOptional() @IsEnum(CategoriaMezzo) categoria?: CategoriaMezzo;
  @IsOptional() @IsEnum(TipoMezzo) tipo?: TipoMezzo;
  @IsOptional() @IsEnum(Alimentazione) alimentazione?: Alimentazione;
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
}

export class CreateAssegnazioneMezzoDto {
  @IsString() padroncinoId: string;
  @IsDateString() dataInizio: string;
  @IsDateString() @IsOptional() dataFine?: string;
  @IsString() @IsOptional() note?: string;
}
