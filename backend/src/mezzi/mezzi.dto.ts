import {
  IsString, IsOptional, IsEnum, IsInt, IsNumber, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoMezzo, Alimentazione, CategoriaMezzo, StatoMezzo } from '@prisma/client';

export class CreateMezzoDto {
  @IsString() targa: string;
  @IsString() marca: string;
  @IsString() modello: string;
  @IsEnum(TipoMezzo) @IsOptional() tipo?: TipoMezzo;
  @IsEnum(Alimentazione) @IsOptional() alimentazione?: Alimentazione;
  @IsEnum(CategoriaMezzo) @IsOptional() categoria?: CategoriaMezzo;
  @IsEnum(StatoMezzo) @IsOptional() stato?: StatoMezzo;
  @IsInt() @IsOptional() annoImmatricolazione?: number;

  @IsString() @IsOptional() societaNoleggio?: string;
  @IsNumber() @IsOptional() @Type(() => Number) rataNoleggio?: number;
  @IsNumber() @IsOptional() @Type(() => Number) canoneNoleggio?: number;
  @IsDateString() @IsOptional() inizioNoleggio?: string;
  @IsDateString() @IsOptional() fineNoleggio?: string;

  @IsInt() @IsOptional() kmAttuali?: number;
  @IsInt() @IsOptional() kmLimite?: number;

  @IsDateString() @IsOptional() scadenzaAssicurazione?: string;
  @IsDateString() @IsOptional() scadenzaRevisione?: string;
  @IsDateString() @IsOptional() scadenzaBollo?: string;
  @IsDateString() @IsOptional() scadenzaTagliando?: string;

  @IsString() @IsOptional() note?: string;
}

export class UpdateMezzoDto extends CreateMezzoDto {
  // Tutti opzionali tramite ereditarietà parziale
}

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
