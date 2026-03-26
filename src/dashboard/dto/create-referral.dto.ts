import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReferralDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  inviteeEmail: string;

  @ApiPropertyOptional({ example: 'profile_share' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @ApiPropertyOptional({ example: 'Warm lead from lending waitlist' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  note?: string;
}
