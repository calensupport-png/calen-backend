import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgLendingOfferDto {
  @ApiProperty({ example: 'Premier Personal Loan' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: 'Personal Loan' })
  @IsString()
  @MaxLength(120)
  type: string;

  @ApiProperty({ example: 5000 })
  @IsOptional()
  @IsNumber()
  minAmount?: number;

  @ApiProperty({ example: 25000 })
  @IsOptional()
  @IsNumber()
  maxAmount?: number;

  @ApiProperty({ example: 5.9 })
  @IsOptional()
  @IsNumber()
  minApr?: number;

  @ApiProperty({ example: 12.4 })
  @IsOptional()
  @IsNumber()
  maxApr?: number;

  @ApiProperty({ example: 700 })
  @IsOptional()
  @IsNumber()
  minScore?: number;
}
