import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { AcceptOrgInvitationDto } from './dto/accept-org-invitation.dto';
import { OrgOnboardingService } from './org-onboarding.service';

type PublicRequest = Request & { requestId?: string };

@ApiTags('Organization Invitations')
@Controller({ version: '1' })
export class PublicOrgInvitationController {
  constructor(private readonly orgOnboardingService: OrgOnboardingService) {}

  @Get('public/org-invitations/:token')
  @ApiOperation({ summary: 'Get a public organization invitation by token' })
  @ApiOkResponse()
  getInvitation(@Param('token') token: string) {
    return this.orgOnboardingService.getPublicInvitation(token);
  }

  @Post('public/org-invitations/:token/accept')
  @ApiOperation({ summary: 'Accept a public organization invitation' })
  @ApiBody({ type: AcceptOrgInvitationDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  acceptInvitation(
    @Param('token') token: string,
    @Body() dto: AcceptOrgInvitationDto,
    @Req() req: PublicRequest,
  ) {
    return this.orgOnboardingService.acceptInvitation(token, dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }
}
