import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class UpdateOrgDashboardProfileDto {
  @ApiPropertyOptional({ example: 'Calen Capital Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Financial Services' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ example: '11-50' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  companySize?: string;

  @ApiPropertyOptional({ example: 'GB' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ example: 'https://calen.example' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({ example: 'RC-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'FCA' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jurisdiction?: string;
}

class UpdateOrgDashboardRiskPolicyDto {
  @ApiPropertyOptional({ example: 650 })
  @IsOptional()
  @IsNumber()
  minimumScore?: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  maxExposureAmount?: number;

  @ApiPropertyOptional({ example: 'manual_review' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultDecisionMode?: string;

  @ApiPropertyOptional({
    example: 'Escalate higher-risk applicants for manual review.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

class UpdateOrgDashboardIntegrationPreferencesDto {
  @ApiPropertyOptional({ example: 'sandbox' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  environment?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableApiAccess?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableWebhooks?: boolean;

  @ApiPropertyOptional({ example: 'https://org.example.com/calen/webhooks' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  webhookUrl?: string;

  @ApiPropertyOptional({ example: 'whsec_monitoring_123' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  webhookSecret?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['monitoring_alert_triggered', 'monitoring_alert_resolved'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  webhookSubscriptions?: string[];

  @ApiPropertyOptional({ type: [String], example: ['score', 'profile_share'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledProducts?: string[];
}

class UpdateOrgDashboardNotificationPreferencesDto {
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
}

class UpdateOrgDashboardSecurityControlsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  ipRestrictionsEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  auditLoggingEnabled?: boolean;
}

export class UpdateOrgDashboardSettingsDto {
  @ApiPropertyOptional({ type: UpdateOrgDashboardProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrgDashboardProfileDto)
  organization?: UpdateOrgDashboardProfileDto;

  @ApiPropertyOptional({ type: UpdateOrgDashboardRiskPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrgDashboardRiskPolicyDto)
  riskPolicy?: UpdateOrgDashboardRiskPolicyDto;

  @ApiPropertyOptional({ type: UpdateOrgDashboardIntegrationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrgDashboardIntegrationPreferencesDto)
  integrationPreferences?: UpdateOrgDashboardIntegrationPreferencesDto;

  @ApiPropertyOptional({ type: UpdateOrgDashboardNotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrgDashboardNotificationPreferencesDto)
  notifications?: UpdateOrgDashboardNotificationPreferencesDto;

  @ApiPropertyOptional({ type: UpdateOrgDashboardSecurityControlsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrgDashboardSecurityControlsDto)
  security?: UpdateOrgDashboardSecurityControlsDto;
}
