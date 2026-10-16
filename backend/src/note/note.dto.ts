import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateNotaDto {
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  contenuto!: string;
}
