import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'Jay' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'jay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CorrectHorseBatteryStaple' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;
}
