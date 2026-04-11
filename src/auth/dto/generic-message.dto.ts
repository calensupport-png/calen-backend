import { ApiProperty } from '@nestjs/swagger';

export class GenericMessageDto {
  @ApiProperty({
    example: 'If an account exists, we have emailed you instructions.',
  })
  message: string;

  @ApiProperty({
    required: false,
    example:
      'http://localhost:8080/forgot-password?token=reset_example&email=jay%40example.com',
  })
  resetUrl?: string;
}
