import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  testo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codiceAutista?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  palmare?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  padroncino?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsBoolean()
  completata?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  testo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codiceAutista?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  palmare?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  padroncino?: string;
}
