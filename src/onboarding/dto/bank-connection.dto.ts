import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBankConnectionDto {
  @ApiProperty({ example: 'providus-ng' })
  @IsString()
  bankId: string;

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
