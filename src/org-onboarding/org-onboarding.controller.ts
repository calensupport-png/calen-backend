import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateOrgInvitationDto } from './dto/create-org-invitation.dto';
import { UpdateOrgIntegrationPreferencesDto } from './dto/org-integration-preferences.dto';
import { UpdateOrgProfileDto } from './dto/org-profile.dto';
import { UpdateOrgRiskPolicyDto } from './dto/org-risk-policy.dto';
import { SubmitOrgVerificationDto } from './dto/org-verification.dto';
import { OrgOnboardingService } from './org-onboarding.service';

@ApiTags('Organization Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class OrgOnboardingController {
  constructor(private readonly orgOnboardingService: OrgOnboardingService) {}

  @Get('org/me')
  @ApiOperation({ summary: 'Get the current organization profile' })
  @ApiOkResponse()
  getOrganization(@Req() req: AuthenticatedRequest) {
    return this.orgOnboardingService.getOrganization(req.user);
  }

  @Patch('org/me/profile')
  @ApiOperation({ summary: 'Update the current organization profile' })
  @ApiBody({ type: UpdateOrgProfileDto })
  @ApiOkResponse()
  updateOrganizationProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOrgProfileDto,
  ) {
    return this.orgOnboardingService.updateOrganizationProfile(req.user, dto);
  }

  @Post('org/me/verification')
  @ApiOperation({ summary: 'Submit organization verification data' })
  @ApiBody({ type: SubmitOrgVerificationDto })
  @ApiCreatedResponse()
  submitVerification(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitOrgVerificationDto,
  ) {
    return this.orgOnboardingService.submitVerification(req.user, dto);
  }

  @Patch('org/me/integration-preferences')
  @ApiOperation({ summary: 'Update organization integration preferences' })
  @ApiBody({ type: UpdateOrgIntegrationPreferencesDto })
  @ApiOkResponse()
  updateIntegrationPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOrgIntegrationPreferencesDto,
  ) {
    return this.orgOnboardingService.updateIntegrationPreferences(
      req.user,
      dto,
    );
  }

  @Post('org/me/invitations')
  @ApiOperation({ summary: 'Create an organization team invitation' })
  @ApiBody({ type: CreateOrgInvitationDto })
  @ApiCreatedResponse()
  createInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOrgInvitationDto,
  ) {
    return this.orgOnboardingService.createInvitation(req.user, dto);
  }

  @Delete('org/me/invitations/:invitationId')
  @ApiOperation({ summary: 'Delete a pending organization team invitation' })
  @ApiOkResponse()
  deleteInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
  ) {
    return this.orgOnboardingService.deleteInvitation(
      req.user,
      invitationId,
    );
  }

  @Get('org/me/team')
  @ApiOperation({ summary: 'Get organization team members and invitations' })
  @ApiOkResponse()
  getTeam(@Req() req: AuthenticatedRequest) {
    return this.orgOnboardingService.getTeam(req.user);
  }

  @Patch('org/me/risk-policy')
  @ApiOperation({ summary: 'Update organization risk policy' })
  @ApiBody({ type: UpdateOrgRiskPolicyDto })
  @ApiOkResponse()
  updateRiskPolicy(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOrgRiskPolicyDto,
  ) {
    return this.orgOnboardingService.updateRiskPolicy(req.user, dto);
  }

  @Get('org/me/onboarding')
  @ApiOperation({ summary: 'Get organization onboarding state' })
  @ApiOkResponse()
  getOnboarding(@Req() req: AuthenticatedRequest) {
    return this.orgOnboardingService.getOnboarding(req.user);
  }
}
