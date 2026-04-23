import { ApiProperty } from '@nestjs/swagger';
import { WaitlistAudience } from '../waitlist-audience.enum';

export class WaitlistSubmissionResponseDto {
  @ApiProperty({ example: 'WL-7A1F2C9D' })
  submissionId: string;

  @ApiProperty({ enum: WaitlistAudience, example: WaitlistAudience.INDIVIDUAL })
  audience: WaitlistAudience;

  @ApiProperty({ example: 'created', enum: ['created', 'updated'] })
  status: 'created' | 'updated';

  @ApiProperty({ example: '/thank-you' })
  thankYouPath: string;

  @ApiProperty({
    example: 'Waitlist submission received successfully.',
  })
  message: string;
}
