import { IsString, IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { StatoPalmare } from '@prisma/client';

export class CreatePalmareDto {
  @IsString() codice: string;
  @IsString() @IsOptional() marca?: string;
  @IsString() @IsOptional() modello?: string;
  @IsString() @IsOptional() imei?: string;
  @IsString() @IsOptional() simNumero?: string;
  @IsNumber() @IsOptional() @Type(() => Number) tariffaMensile?: number;
  @IsEnum(StatoPalmare) @IsOptional() stato?: StatoPalmare;
  @IsString() @IsOptional() note?: string;
}

export class UpdatePalmareDto extends CreatePalmareDto {}

export class CreateAssegnazionePalmareDto {
  @IsString() padroncinoId: string;
  @IsDateString() dataInizio: string;
  @IsDateString() @IsOptional() dataFine?: string;
  @IsString() @IsOptional() note?: string;
}
