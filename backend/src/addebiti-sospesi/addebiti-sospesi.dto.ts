import { IsString, IsOptional, IsNumber, IsPositive, IsIn } from 'class-validator';

export class CreateAddebitoSospesoDto {
  @IsString()
  padroncinoId: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADDEBITO', 'MEMO'])
  tipo?: 'ADDEBITO' | 'MEMO';

  @IsString()
  descrizione: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  importo?: number;

  @IsOptional()
  @IsString()
  meseOrigine?: string; // "2026-03"

  @IsString()
  meseTarget: string; // "2026-04"

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateAddebitoSospesoDto {
  @IsOptional()
  @IsString()
  padroncinoId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADDEBITO', 'MEMO'])
  tipo?: 'ADDEBITO' | 'MEMO';

  @IsOptional()
  @IsString()
  descrizione?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  importo?: number;

  @IsOptional()
  @IsString()
  meseOrigine?: string;

  @IsOptional()
  @IsString()
  meseTarget?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
