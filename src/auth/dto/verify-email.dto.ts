import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'verify_1234567890abcdef' })
  @IsString()
  @MinLength(12)
  token: string;
}
