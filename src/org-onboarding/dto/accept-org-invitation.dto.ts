import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptOrgInvitationDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'CorrectHorseBatteryStaple' })
  @IsString()
  @MinLength(8)
  password: string;
}
