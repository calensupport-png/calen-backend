import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateShareLinkDto {
  @ApiPropertyOptional({ example: 'Mortgage pre-screen share' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ example: 'lender_review' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  purpose?: string;

  @ApiPropertyOptional({ example: '7d' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  expiresIn?: string;
}
