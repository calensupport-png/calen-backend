import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrgRiskPolicyDto {
  @ApiPropertyOptional({ example: 620 })
  @IsOptional()
  @IsNumber()
  minimumScore?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  maxExposureAmount?: number;

  @ApiPropertyOptional({ example: 'manual_review' })
  @IsOptional()
  @IsString()
  defaultDecisionMode?: string;

  @ApiPropertyOptional({
    example: 'Require manual review for thin-file applicants',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}
