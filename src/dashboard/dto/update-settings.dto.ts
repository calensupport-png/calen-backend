import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  securityAlerts?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional({ example: 'trusted_parties_only' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  profileVisibility?: string;

  @ApiPropertyOptional({ example: 'private' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shareDefaultAccess?: string;
}
