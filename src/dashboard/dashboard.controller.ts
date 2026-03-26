import {
  Body,
  Controller,
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
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('me/dashboard')
  @ApiOperation({ summary: 'Get the current user dashboard summary' })
  @ApiOkResponse()
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getDashboard(req.user);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get the current user profile details' })
  @ApiOkResponse()
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getProfile(req.user);
  }

  @Get('me/score')
  @ApiOperation({
    summary: 'Get the latest score snapshot for the current user',
  })
  @ApiOkResponse()
  getScore(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getScore(req.user);
  }

  @Get('me/score/history')
  @ApiOperation({ summary: 'Get score history for the current user' })
  @ApiOkResponse()
  getScoreHistory(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getScoreHistory(req.user);
  }

  @Get('me/trust-activity')
  @ApiOperation({ summary: 'Get current user trust network activity' })
  @ApiOkResponse()
  getTrustActivity(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getTrustActivity(req.user);
  }

  @Get('me/insights')
  @ApiOperation({ summary: 'Get current user insights' })
  @ApiOkResponse()
  getInsights(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getInsights(req.user);
  }

  @Get('me/lending-offers')
  @ApiOperation({ summary: 'Get current user matched lending offers' })
  @ApiOkResponse()
  getLendingOffers(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getLendingOffers(req.user);
  }

  @Get('me/notifications')
  @ApiOperation({ summary: 'Get current user notifications' })
  @ApiOkResponse()
  getNotifications(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getNotifications(req.user);
  }

  @Patch('me/notifications/read')
  @ApiOperation({ summary: 'Mark current user notifications as read' })
  @ApiBody({ type: MarkNotificationsReadDto })
  @ApiOkResponse()
  markNotificationsRead(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.dashboardService.markNotificationsRead(req.user, dto);
  }

  @Get('me/security/logins')
  @ApiOperation({ summary: 'Get recent login activity for the current user' })
  @ApiOkResponse()
  getSecurityLogins(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getSecurityLogins(req.user);
  }

  @Get('me/settings')
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiOkResponse()
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getSettings(req.user);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update current user settings' })
  @ApiBody({ type: UpdateSettingsDto })
  @ApiOkResponse()
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.dashboardService.updateSettings(req.user, dto);
  }

  @Post('me/share-links')
  @ApiOperation({ summary: 'Create a share link for the current user profile' })
  @ApiBody({ type: CreateShareLinkDto })
  @ApiCreatedResponse()
  createShareLink(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.dashboardService.createShareLink(req.user, dto);
  }

  @Get('me/share-links')
  @ApiOperation({ summary: 'List current user share links' })
  @ApiOkResponse()
  getShareLinks(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getShareLinks(req.user);
  }

  @Patch('me/share-links/:id/revoke')
  @ApiOperation({ summary: 'Revoke a current user share link' })
  @ApiOkResponse()
  revokeShareLink(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.dashboardService.revokeShareLink(req.user, id);
  }

  @Get('me/share-access-log')
  @ApiOperation({ summary: 'Get current user share access log summary' })
  @ApiOkResponse()
  getShareAccessLog(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getShareAccessLog(req.user);
  }

  @Get('me/referrals')
  @ApiOperation({ summary: 'Get current user referral data' })
  @ApiOkResponse()
  getReferrals(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getReferrals(req.user);
  }

  @Post('me/referrals')
  @ApiOperation({ summary: 'Create a referral invite for the current user' })
  @ApiBody({ type: CreateReferralDto })
  @ApiCreatedResponse()
  createReferral(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateReferralDto,
  ) {
    return this.dashboardService.createReferral(req.user, dto);
  }
}
