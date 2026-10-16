import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCartaEniDto {
  @IsString() numeroCarta: string;
  @IsString() @IsOptional() utilizzatore?: string;
  @IsString() @IsOptional() padroncinoId?: string;
  @IsString() @IsOptional() targaAbituale?: string;
  @IsBoolean() @IsOptional() attiva?: boolean;
  @IsString() @IsOptional() note?: string;
}

export class UpdateCartaEniDto {
  @IsString() @IsOptional() utilizzatore?: string;
  @IsString() @IsOptional() padroncinoId?: string;
  @IsString() @IsOptional() targaAbituale?: string;
  @IsBoolean() @IsOptional() attiva?: boolean;
  @IsString() @IsOptional() note?: string;
}

export class AggiornaPrezzoGiornoDto {
  @IsNumber() @Type(() => Number) prezzoUnitario: number;
}

export class UpdateStazioneEniDto {
  @IsString() @IsOptional() localita?: string;
  @IsBoolean() @IsOptional() agevolata?: boolean;
  @IsString() @IsOptional() note?: string;
}

export class CreateStazioneEniDto {
  @IsString() codiceImpianto: string;
  @IsString() @IsOptional() localita?: string;
  @IsBoolean() @IsOptional() agevolata?: boolean;
  @IsString() @IsOptional() note?: string;
}
