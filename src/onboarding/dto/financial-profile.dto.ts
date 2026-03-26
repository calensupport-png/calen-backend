import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateFinancialProfileDto {
  @ApiPropertyOptional({ example: 450000 })
  @IsOptional()
  @IsNumber()
  monthlyIncome?: number;

  @ApiPropertyOptional({ example: 120000 })
  @IsOptional()
  @IsNumber()
  monthlyExpenses?: number;

  @ApiPropertyOptional({ example: 900000 })
  @IsOptional()
  @IsNumber()
  savingsBalance?: number;

  @ApiPropertyOptional({
    example: ['build-emergency-fund', 'improve-trust-score'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  financialGoals?: string[];

  @ApiPropertyOptional({ example: 'Low risk with moderate liquidity needs' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  riskAppetite?: string;

  @ApiPropertyOptional({ example: 'Rent' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  housingStatus?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsNumber()
  housingCost?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  loanCount?: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  outstandingLoanTotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  creditCardCount?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  dependents?: number;
}
