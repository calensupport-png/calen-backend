import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class OrgDecisionRuleDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  id: number;

  @ApiProperty({ example: 'CALEN Score' })
  @IsString()
  @MaxLength(120)
  field: string;

  @ApiProperty({ example: '>=' })
  @IsString()
  @MaxLength(16)
  operator: string;

  @ApiProperty({ example: '720' })
  @IsString()
  @MaxLength(80)
  value: string;

  @ApiProperty({ example: 'Approve' })
  @IsString()
  @MaxLength(80)
  action: string;
}

export class UpdateOrgDecisionRulesDto {
  @ApiProperty({ type: [OrgDecisionRuleDto] })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => OrgDecisionRuleDto)
  rules: OrgDecisionRuleDto[];
}
