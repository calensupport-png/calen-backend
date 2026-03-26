import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset_1234567890abcdef' })
  @IsString()
  @MinLength(12)
  token: string;

  @ApiProperty({ example: 'SuperSecret123!' })
  @IsString()
  @MinLength(8)
  password: string;
}
