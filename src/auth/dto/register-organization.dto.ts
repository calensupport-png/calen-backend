import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterOrganizationDto {
  @ApiProperty({ example: 'Calen Inc' })
  @IsString()
  orgName: string;

  @ApiProperty({ example: 'ops@calen.example' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CorrectHorseBatteryStaple' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  contactName: string;

  @ApiProperty({ example: 'Operations Lead' })
  @IsString()
  jobTitle: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Scheduling' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: '11-50' })
  @IsOptional()
  @IsString()
  companySize?: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'https://calen.example' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'RC-1234567' })
  @IsOptional()
  @IsString()
  regNumber?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  jurisdiction?: string;
}
