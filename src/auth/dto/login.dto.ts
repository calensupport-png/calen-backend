import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'jay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CorrectHorseBatteryStaple' })
  @IsString()
  @MinLength(8)
  password: string;
}
