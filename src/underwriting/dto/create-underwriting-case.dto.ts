import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUnderwritingCaseDto {
  @ApiProperty({ example: 'CALEN-ABCD-1234' })
  @IsString()
  @Matches(/^CALEN-[A-F0-9]{4}-[A-F0-9]{4}$/i, {
    message: 'calenId must be a valid CALEN ID',
  })
  calenId: string;

  @ApiPropertyOptional({ example: 'Working Capital Advance' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productType?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  requestedAmount?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  requestedTermMonths?: number;

  @ApiPropertyOptional({ example: 1350 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyObligationAmount?: number;

  @ApiPropertyOptional({ example: 'working_capital' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productCategory?: string;

  @ApiPropertyOptional({ example: 'initial_underwriting_review' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  decisionPurpose?: string;
}
