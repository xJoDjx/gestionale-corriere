import { IsString, IsOptional } from 'class-validator';

export class CreateDocumentoDto {
  @IsString()
  entityType: string;

  @IsString()
  entityId: string;

  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  scadenza?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateDocumentoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  scadenza?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
