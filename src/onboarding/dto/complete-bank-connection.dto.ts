import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CompleteBankConnectionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(600)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  state: string;
}
