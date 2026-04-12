import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PASSPORT_PURPOSES } from '../passport.constants';

export class GetOrgPassportDto {
  @ApiProperty({
    example: 'CALEN-ABCD-1234',
    description: 'Exact CALEN ID to retrieve through Passport.',
  })
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^CALEN-[A-F0-9]{4}-[A-F0-9]{4}$/i, {
    message: 'calenId must be a valid CALEN ID',
  })
  calenId: string;

  @ApiPropertyOptional({
    example: 'tenant_screening_review',
    description: 'Optional Passport purpose filter when multiple grants exist.',
    enum: PASSPORT_PURPOSES,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @IsIn(PASSPORT_PURPOSES)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  purpose?: string;
}
