import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WaitlistAudience } from '../waitlist-audience.enum';

export const ADMIN_WAITLIST_AUDIENCE_VALUES = [
  'all',
  ...Object.values(WaitlistAudience),
] as const;

export type AdminWaitlistAudienceFilter =
  (typeof ADMIN_WAITLIST_AUDIENCE_VALUES)[number];

export class AdminWaitlistQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_WAITLIST_AUDIENCE_VALUES,
    default: 'all',
  })
  @IsOptional()
  @IsIn(ADMIN_WAITLIST_AUDIENCE_VALUES)
  audience: AdminWaitlistAudienceFilter = 'all';

  @ApiPropertyOptional({
    example: 'lagos',
    description:
      'Search by submission ID, name, email, organization name, or country.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().slice(0, 100) : value,
  )
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 12, default: 12, maximum: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 12;
}
