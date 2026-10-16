import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum CategoriaVoceConteggioEnum {
  ADDEBITO = 'ADDEBITO',
  FATTURATO = 'FATTURATO',
  COMPENSAZIONE = 'COMPENSAZIONE',
}

export class CreateVoceConteggioDto {
  @IsString()
  descrizione: string;

  @IsOptional() @IsString()
  contoVoce?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  percIva?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  valoreDefault?: number;

  @IsEnum(CategoriaVoceConteggioEnum)
  categoria: CategoriaVoceConteggioEnum;

  @IsOptional() @IsBoolean()
  attivo?: boolean;
}

export class UpdateVoceConteggioDto {
  @IsOptional() @IsString()
  descrizione?: string;

  @IsOptional() @IsString()
  contoVoce?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  percIva?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  valoreDefault?: number;

  @IsOptional() @IsEnum(CategoriaVoceConteggioEnum)
  categoria?: CategoriaVoceConteggioEnum;

  @IsOptional() @IsBoolean()
  attivo?: boolean;
}
