import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmploymentProfileDto {
  @ApiPropertyOptional({ example: 'Calen Labs' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  employerName?: string;

  @ApiPropertyOptional({ example: 'Product Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'full_time' })
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  yearsEmployed?: number;

  @ApiPropertyOptional({ example: 350000 })
  @IsOptional()
  @IsNumber()
  monthlyIncome?: number;

  @ApiPropertyOptional({ example: 'Employment salary' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceOfFunds?: string;
}
