import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateOrgApiKeyDto {
  @ApiProperty({ example: 'Production Key' })
  @IsString()
  @MaxLength(120)
  name: string;
}
