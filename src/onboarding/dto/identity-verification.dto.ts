import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitIdentityVerificationDto {
  @ApiPropertyOptional({ example: 'passport' })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ example: 'selfie_pending' })
  @IsOptional()
  @IsString()
  livenessStatus?: string;
}
