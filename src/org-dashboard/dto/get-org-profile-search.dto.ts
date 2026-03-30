import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GetOrgProfileSearchDto {
  @ApiPropertyOptional({
    example: 'CALEN-ABCD-1234',
    description: 'Exact CALEN ID to search for.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^CALEN-[A-F0-9]{4}-[A-F0-9]{4}$/i, {
    message: 'calenId must be a valid CALEN ID',
  })
  calenId?: string;
}
