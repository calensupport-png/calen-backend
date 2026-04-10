import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUnderwritingCaseNotesDto {
  @ApiPropertyOptional({ example: 'Cash flow looks stable across the latest observed months.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
