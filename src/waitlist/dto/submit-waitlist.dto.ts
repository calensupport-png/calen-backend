import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { WaitlistAudience } from '../waitlist-audience.enum';

class IndividualWaitlistDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'United Kingdom' })
  @IsString()
  countryOfResidence: string;

  @ApiPropertyOptional({ example: '+447700900000' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Self-employed' })
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional({ example: 'Improve credit access' })
  @IsOptional()
  @IsString()
  mainReason?: string;

  @ApiPropertyOptional({ example: 'Yes' })
  @IsOptional()
  @IsString()
  hasBeenDeclined?: string;

  @ApiPropertyOptional({ example: 'No' })
  @IsOptional()
  @IsString()
  hasTraditionalCreditHistory?: string;

  @ApiPropertyOptional({ example: 'Maybe' })
  @IsOptional()
  @IsString()
  bankConnectionComfort?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  wantsBeta?: boolean;

  @ApiPropertyOptional({ example: 'LinkedIn' })
  @IsOptional()
  @IsString()
  referralSource?: string;

  @ApiPropertyOptional({ example: '25-34' })
  @IsOptional()
  @IsString()
  ageBand?: string;

  @ApiPropertyOptional({ example: 'United Kingdom' })
  @IsOptional()
  @IsString()
  currentCountry?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @ApiPropertyOptional({ example: 'Currently renting' })
  @IsOptional()
  @IsString()
  rentingStatus?: string;

  @ApiPropertyOptional({ example: 'Yes' })
  @IsOptional()
  @IsString()
  wantsLenderRecommendations?: string;

  @ApiPropertyOptional({
    example: 'I want a better way to prove affordability as a freelancer.',
  })
  @IsOptional()
  @IsString()
  financialProblem?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  consentUpdates: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  consentPrivacy: boolean;
}

class OrganisationWaitlistDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'jane@company.com' })
  @IsEmail()
  workEmail: string;

  @ApiProperty({ example: 'Head of Credit' })
  @IsString()
  jobTitle: string;

  @ApiProperty({ example: 'Acme Financial' })
  @IsString()
  organisationName: string;

  @ApiProperty({ example: 'Lender' })
  @IsString()
  organisationType: string;

  @ApiProperty({ example: 'United Kingdom' })
  @IsString()
  countryMarket: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  consentContact: boolean;

  @ApiPropertyOptional({ example: '51-200' })
  @IsOptional()
  @IsString()
  companySize?: string;

  @ApiPropertyOptional({
    example: ['Underwriting support', 'API integration'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ example: 'Internal scoring' })
  @IsOptional()
  @IsString()
  currentProcess?: string;

  @ApiPropertyOptional({ example: 'Thin-file applicants' })
  @IsOptional()
  @IsString()
  biggestChallenge?: string;

  @ApiPropertyOptional({ example: '3 months' })
  @IsOptional()
  @IsString()
  implementationTimeline?: string;

  @ApiPropertyOptional({ example: 'Yes' })
  @IsOptional()
  @IsString()
  wouldJoinPilot?: string;

  @ApiPropertyOptional({ example: '1500 applications / month' })
  @IsOptional()
  @IsString()
  monthlyVolume?: string;

  @ApiPropertyOptional({ example: 'Both' })
  @IsOptional()
  @IsString()
  accessNeeds?: string;

  @ApiPropertyOptional({ example: 'https://company.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/jane' })
  @IsOptional()
  @IsString()
  linkedinProfile?: string;

  @ApiPropertyOptional({ example: 'Decision-maker' })
  @IsOptional()
  @IsString()
  decisionMakerStatus?: string;

  @ApiPropertyOptional({ example: 'Experian, TrueLayer, Salesforce' })
  @IsOptional()
  @IsString()
  existingTools?: string;

  @ApiPropertyOptional({ example: ['UK', 'EU'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operatingMarkets?: string[];

  @ApiPropertyOptional({
    example: 'We want better affordability visibility for self-employed applicants.',
  })
  @IsOptional()
  @IsString()
  useCase?: string;
}

export class SubmitWaitlistDto {
  @ApiProperty({ enum: WaitlistAudience, example: WaitlistAudience.INDIVIDUAL })
  @IsEnum(WaitlistAudience)
  audience: WaitlistAudience;

  @ApiPropertyOptional({ type: () => IndividualWaitlistDto })
  @ValidateIf((dto: SubmitWaitlistDto) => dto.audience === WaitlistAudience.INDIVIDUAL)
  @IsDefined()
  @ValidateNested()
  @Type(() => IndividualWaitlistDto)
  individual?: IndividualWaitlistDto;

  @ApiPropertyOptional({ type: () => OrganisationWaitlistDto })
  @ValidateIf((dto: SubmitWaitlistDto) => dto.audience === WaitlistAudience.ORGANISATION)
  @IsDefined()
  @ValidateNested()
  @Type(() => OrganisationWaitlistDto)
  organisation?: OrganisationWaitlistDto;

  @ApiPropertyOptional({ example: 'invite-abc123' })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ example: '/waitlist?audience=individual' })
  @IsOptional()
  @IsString()
  submissionPath?: string;
}

export { IndividualWaitlistDto, OrganisationWaitlistDto };
