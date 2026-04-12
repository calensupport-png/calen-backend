import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokePassportGrantDto {
  @ApiPropertyOptional({ example: 'Organisation review completed.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
