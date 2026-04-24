import { ApiProperty } from '@nestjs/swagger';
import { WaitlistAudience } from '../waitlist-audience.enum';

class AdminWaitlistRequestMetadataDto {
  @ApiProperty({ required: false, nullable: true })
  requestId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  ipAddress?: string | null;

  @ApiProperty({ required: false, nullable: true })
  userAgent?: string | null;

  @ApiProperty({ required: false, nullable: true })
  referer?: string | null;

  @ApiProperty({ required: false, nullable: true })
  origin?: string | null;
}

class AdminWaitlistFlagsDto {
  @ApiProperty()
  wantsBeta: boolean;

  @ApiProperty()
  wantsPilot: boolean;
}

class AdminWaitlistSubmissionDto {
  @ApiProperty()
  submissionId: string;

  @ApiProperty({ enum: WaitlistAudience })
  audience: WaitlistAudience;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false, nullable: true })
  country?: string | null;

  @ApiProperty({ required: false, nullable: true })
  phoneNumber?: string | null;

  @ApiProperty({ required: false, nullable: true })
  organizationName?: string | null;

  @ApiProperty({ required: false, nullable: true })
  organizationType?: string | null;

  @ApiProperty({ required: false, nullable: true })
  referralCode?: string | null;

  @ApiProperty({ required: false, nullable: true })
  submissionPath?: string | null;

  @ApiProperty()
  submissionCount: number;

  @ApiProperty()
  firstSubmittedAt: Date;

  @ApiProperty()
  lastSubmittedAt: Date;

  @ApiProperty({ required: false, nullable: true })
  createdAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  updatedAt?: Date | null;

  @ApiProperty({ type: AdminWaitlistFlagsDto })
  flags: AdminWaitlistFlagsDto;

  @ApiProperty({ type: AdminWaitlistRequestMetadataDto })
  requestMetadata: AdminWaitlistRequestMetadataDto;

  @ApiProperty({ type: Object })
  data: Record<string, unknown>;
}

class AdminWaitlistStatsDto {
  @ApiProperty()
  totalSubmissions: number;

  @ApiProperty()
  individualSubmissions: number;

  @ApiProperty()
  organisationSubmissions: number;

  @ApiProperty()
  submissionsToday: number;

  @ApiProperty()
  betaInterestedIndividuals: number;

  @ApiProperty()
  pilotReadyOrganizations: number;
}

class AdminWaitlistFiltersDto {
  @ApiProperty({ example: 'all' })
  audience: string;

  @ApiProperty({ example: '' })
  search: string;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 12 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  totalPages: number;

  @ApiProperty({ example: 12 })
  totalResults: number;
}

export class AdminWaitlistResponseDto {
  @ApiProperty({ type: AdminWaitlistStatsDto })
  stats: AdminWaitlistStatsDto;

  @ApiProperty({ type: AdminWaitlistFiltersDto })
  filters: AdminWaitlistFiltersDto;

  @ApiProperty({ type: [AdminWaitlistSubmissionDto] })
  submissions: AdminWaitlistSubmissionDto[];
}
