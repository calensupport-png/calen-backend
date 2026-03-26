import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { AccountType } from '../../common/enums/account-type.enum';

export class ResendVerificationDto {
  @ApiProperty({ example: 'jay@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: [AccountType.INDIVIDUAL, AccountType.ORGANISATION] })
  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;

  @ApiPropertyOptional({ example: 'Jay' })
  @IsOptional()
  @IsString()
  firstName?: string;
}
