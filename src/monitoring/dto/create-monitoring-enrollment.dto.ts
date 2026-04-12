import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateMonitoringEnrollmentDto {
  @ApiProperty({ example: 'CALEN-ABCD-1234' })
  @IsString()
  @Matches(/^CALEN-[A-F0-9]{4}-[A-F0-9]{4}$/i, {
    message: 'calenId must be a valid CALEN ID',
  })
  calenId: string;
}
