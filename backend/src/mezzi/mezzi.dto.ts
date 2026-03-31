import { IsString, IsOptional, IsNumber, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
export class CreateMezzoDto {
  @ApiProperty() @IsString() targa: string;
  @ApiProperty() @IsString() marca: string;
  @ApiProperty() @IsString() modello: string;
 
  @ApiPropertyOptional() @IsOptional() @IsString() tipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alimentazione?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoria?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() annoImmatricolazione?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() telaio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() colore?: string;
 
  // Possesso
  @ApiPropertyOptional({ enum: ['PROPRIETA', 'NOLEGGIO'] })
  @IsOptional() @IsIn(['PROPRIETA', 'NOLEGGIO'])
  tipoPossesso?: string;
 
  // Noleggio — locatore
  @ApiPropertyOptional() @IsOptional() @IsString() societaNoleggio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pIvaLocatore?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefonoLocatore?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emailLocatore?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() riferimentoContratto?: string;
 
  // Noleggio — rate
  @ApiPropertyOptional({ description: 'Rata che paghiamo al locatore (€/mese)' })
  @IsOptional() @IsNumber() rataNoleggio?: number;
 
  @ApiPropertyOptional({ description: 'Canone addebitato al PDA (€/mese)' })
  @IsOptional() @IsNumber() canoneNoleggio?: number;
 
  @ApiPropertyOptional() @IsOptional() @IsDateString() inizioNoleggio?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fineNoleggio?: string;
 
  // KM
  @ApiPropertyOptional() @IsOptional() @IsNumber() kmAttuali?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() kmLimite?: number;
 
  // Scadenze
  @ApiPropertyOptional() @IsOptional() @IsDateString() scadenzaAssicurazione?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scadenzaRevisione?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scadenzaBollo?: string;
 
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
 
export class UpdateMezzoDto extends CreateMezzoDto {}