import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateOrgIntegrationPreferencesDto {
  @ApiPropertyOptional({ example: 'sandbox' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableApiAccess?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableWebhooks?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['score', 'profile_share'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledProducts?: string[];
}
