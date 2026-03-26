import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RespondTrustRequestDto {
  @ApiProperty({ enum: ['endorsed', 'declined'] })
  @IsString()
  @IsIn(['endorsed', 'declined'])
  action: 'endorsed' | 'declined';

  @ApiPropertyOptional({ example: 'Former manager' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  relationship?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsKnown?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  trustLevel?: number;

  @ApiPropertyOptional({ example: 'Joshua has consistently handled rent and salary obligations responsibly.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
