import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrgProfileDto {
  @ApiPropertyOptional({ example: 'Calen Inc' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Fintech' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ example: '11-50' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  companySize?: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ example: 'https://calen.example' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({ example: 'RC-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jurisdiction?: string;
}
