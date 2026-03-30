import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SaveOrgRiskNotesDto {
  @ApiProperty({ example: 'CALEN-ABCD-1234' })
  @IsString()
  @Matches(/^CALEN-[A-F0-9]{4}-[A-F0-9]{4}$/i, {
    message: 'calenId must be a valid CALEN ID',
  })
  calenId: string;

  @ApiProperty({ example: 'Escalate only if income verification changes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
