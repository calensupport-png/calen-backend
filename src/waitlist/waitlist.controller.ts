import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SubmitWaitlistDto } from './dto/submit-waitlist.dto';
import { WaitlistSubmissionResponseDto } from './dto/waitlist-submission-response.dto';
import { WaitlistService } from './waitlist.service';

type PublicRequest = Request & { requestId?: string };

@ApiTags('Waitlist')
@Controller({ version: '1' })
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('public/waitlist')
  @ApiOperation({ summary: 'Create or update a public waitlist submission' })
  @ApiBody({ type: SubmitWaitlistDto })
  @ApiCreatedResponse({ type: WaitlistSubmissionResponseDto })
  submitWaitlist(
    @Body() dto: SubmitWaitlistDto,
    @Req() req: PublicRequest,
  ) {
    return this.waitlistService.submit(dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
      referer: req.header('referer') ?? undefined,
      origin: req.header('origin') ?? undefined,
    });
  }
}
