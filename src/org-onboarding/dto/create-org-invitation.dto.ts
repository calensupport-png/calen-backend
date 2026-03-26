import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgInvitationDto {
  @ApiProperty({ example: 'analyst@calen.example' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'risk_analyst' })
  @IsString()
  @MaxLength(80)
  role: string;

  @ApiPropertyOptional({ example: 'Risk Analyst' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
