import { ApiProperty } from '@nestjs/swagger';

export class GenericMessageDto {
  @ApiProperty({ example: 'If an account exists, we have emailed you instructions.' })
  message: string;
}
