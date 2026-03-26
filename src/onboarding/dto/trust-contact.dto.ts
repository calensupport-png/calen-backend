import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTrustContactDto {
  @ApiProperty({ example: 'Chinonso Eze' })
  @IsString()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'chinonso@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: 'colleague' })
  @IsString()
  @MaxLength(80)
  relationship: string;
}
