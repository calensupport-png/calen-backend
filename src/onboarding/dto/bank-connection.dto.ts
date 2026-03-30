import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBankConnectionDto {
  @ApiProperty({ example: 'ob-monzo' })
  @IsString()
  bankId: string;

  @ApiPropertyOptional({ example: '/onboarding' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnPath?: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  accountMask?: string;

  @ApiPropertyOptional({ example: 'checking' })
  @IsOptional()
  @IsString()
  accountType?: string;
}
