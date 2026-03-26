import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['65f1e8f2d0d84ef18a7a1e11'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
