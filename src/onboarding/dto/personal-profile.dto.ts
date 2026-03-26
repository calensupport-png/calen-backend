import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePersonalProfileDto {
  @ApiPropertyOptional({ example: 'Amina Yusuf' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '1994-08-19' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '+44 7700 900000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: '12 Admiralty Way, Lekki' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  addressLine1?: string;

  @ApiPropertyOptional({ example: 'Flat 4' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'W8 4PT' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  postcode?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ example: 'British' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @ApiPropertyOptional({ example: 'United Kingdom' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxCountry?: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}
