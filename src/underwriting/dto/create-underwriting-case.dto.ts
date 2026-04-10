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
}
