import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PASSPORT_PURPOSES } from '../passport.constants';
import { PassportScope } from '../schemas/passport-grant.schema';

export class CreatePassportGrantDto {
  @ApiProperty({
    example: 'acme-financial-ltd',
    description: 'Organisation ID or slug to grant access to.',
  })
  @IsString()
  @MaxLength(120)
  organizationKey: string;

  @ApiProperty({
    example: 'tenant_screening_review',
    enum: PASSPORT_PURPOSES,
  })
  @IsString()
  @MaxLength(120)
  @IsIn(PASSPORT_PURPOSES)
  purpose: string;

  @ApiProperty({
    example: ['score', 'verify'],
    isArray: true,
    enum: ['score', 'verify', 'underwrite_summary', 'full_profile'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @IsIn(['score', 'verify', 'underwrite_summary', 'full_profile'], {
    each: true,
  })
  scopes: PassportScope[];

  @ApiPropertyOptional({
    example: '90d',
    description: 'Optional expiry window. Defaults to 90d.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  expiresIn?: string;
}
