import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { MarkNotificationsReadDto } from '../dashboard/dto/mark-notifications-read.dto';
import { CreateOrgApiKeyDto } from './dto/create-org-api-key.dto';
import { CreateOrgLendingOfferDto } from './dto/create-org-lending-offer.dto';
import { GetOrgProfileSearchDto } from './dto/get-org-profile-search.dto';
import { SaveOrgRiskNotesDto } from './dto/save-org-risk-notes.dto';
import { UpdateOrgDecisionRulesDto } from './dto/update-org-decision-rules.dto';
import { UpdateOrgPipelineStageDto } from './dto/update-org-pipeline-stage.dto';
import { UpdateOrgDashboardSettingsDto } from './dto/update-org-dashboard-settings.dto';
import { UpdateOrgLendingOfferDto } from './dto/update-org-lending-offer.dto';
import { OrgDashboardService } from './org-dashboard.service';

@ApiTags('Organization Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class OrgDashboardController {
  constructor(private readonly orgDashboardService: OrgDashboardService) {}

  @Get('org/me/dashboard')
  @ApiOperation({ summary: 'Get the current organization dashboard summary' })
  @ApiOkResponse()
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getDashboard(req.user);
  }

  @Get('org/me/workspace')
  @ApiOperation({
    summary:
      'Get organization workspace data for the remaining org dashboard pages',
  })
  @ApiOkResponse()
  getWorkspace(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getWorkspace(req.user);
  }

  @Get('org/me/profile-search')
  @ApiOperation({ summary: 'Search organization applicant profiles' })
  @ApiOkResponse()
  getProfileSearch(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrgProfileSearchDto,
  ) {
    return this.orgDashboardService.getProfileSearch(req.user, query);
  }

  @Get('org/me/pipeline')
  @ApiOperation({ summary: 'Get organization applicant pipeline data' })
  @ApiOkResponse()
  getPipeline(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getPipeline(req.user);
  }

  @Get('org/me/notifications')
  @ApiOperation({ summary: 'Get current organization-user notifications' })
  @ApiOkResponse()
  getNotifications(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getNotifications(req.user);
  }

  @Patch('org/me/notifications/read')
  @ApiOperation({
    summary: 'Mark current organization-user notifications as read',
  })
  @ApiBody({ type: MarkNotificationsReadDto })
  @ApiOkResponse()
  markNotificationsRead(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.orgDashboardService.markNotificationsRead(req.user, dto);
  }

  @Get('org/me/settings')
  @ApiOperation({ summary: 'Get current organization dashboard settings' })
  @ApiOkResponse()
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getSettings(req.user);
  }

  @Patch('org/me/settings')
  @ApiOperation({ summary: 'Update current organization dashboard settings' })
  @ApiBody({ type: UpdateOrgDashboardSettingsDto })
  @ApiOkResponse()
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOrgDashboardSettingsDto,
  ) {
    return this.orgDashboardService.updateSettings(req.user, dto);
  }

  @Patch('org/me/pipeline/:applicantId/stage')
  @ApiOperation({
    summary: 'Update an applicant stage in the organization pipeline',
  })
  @ApiBody({ type: UpdateOrgPipelineStageDto })
  @ApiOkResponse()
  updatePipelineStage(
    @Req() req: AuthenticatedRequest,
    @Param('applicantId') applicantId: string,
    @Body() dto: UpdateOrgPipelineStageDto,
  ) {
    return this.orgDashboardService.updatePipelineStage(
      req.user,
      applicantId,
      dto,
    );
  }

  @Patch('org/me/risk-analysis/notes')
  @ApiOperation({
    summary: 'Save internal risk analysis notes for an applicant',
  })
  @ApiBody({ type: SaveOrgRiskNotesDto })
  @ApiOkResponse()
  saveRiskNotes(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveOrgRiskNotesDto,
  ) {
    return this.orgDashboardService.saveRiskNotes(req.user, dto);
  }

  @Get('org/me/risk-analysis')
  @ApiOperation({ summary: 'Get organization risk analysis for a CALEN profile' })
  @ApiOkResponse()
  getRiskAnalysis(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrgProfileSearchDto,
  ) {
    return this.orgDashboardService.getRiskAnalysis(req.user, query);
  }

  @Patch('org/me/decision-engine/rules')
  @ApiOperation({ summary: 'Replace organization decision engine rules' })
  @ApiBody({ type: UpdateOrgDecisionRulesDto })
  @ApiOkResponse()
  updateDecisionRules(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOrgDecisionRulesDto,
  ) {
    return this.orgDashboardService.updateDecisionRules(req.user, dto);
  }

  @Get('org/me/decision-engine')
  @ApiOperation({ summary: 'Get organization decision engine data' })
  @ApiOkResponse()
  getDecisionEngine(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrgProfileSearchDto,
  ) {
    return this.orgDashboardService.getDecisionEngine(req.user, query);
  }

  @Get('org/me/trust-signals')
  @ApiOperation({ summary: 'Get organization trust signal analytics' })
  @ApiOkResponse()
  getTrustSignals(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getTrustSignals(req.user);
  }

  @Get('org/me/reputation-graph')
  @ApiOperation({ summary: 'Get organization reputation graph analytics' })
  @ApiOkResponse()
  getReputationGraph(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getReputationGraph(req.user);
  }

  @Get('org/me/lending-offers')
  @ApiOperation({ summary: 'Get organization lending offers data' })
  @ApiOkResponse()
  getLendingOffers(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getLendingOffers(req.user);
  }

  @Post('org/me/lending-offers')
  @ApiOperation({ summary: 'Create an organization lending offer' })
  @ApiBody({ type: CreateOrgLendingOfferDto })
  @ApiOkResponse()
  createLendingOffer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOrgLendingOfferDto,
  ) {
    return this.orgDashboardService.createLendingOffer(req.user, dto);
  }

  @Patch('org/me/lending-offers/:offerId')
  @ApiOperation({ summary: 'Update an organization lending offer' })
  @ApiBody({ type: UpdateOrgLendingOfferDto })
  @ApiOkResponse()
  updateLendingOffer(
    @Req() req: AuthenticatedRequest,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOrgLendingOfferDto,
  ) {
    return this.orgDashboardService.updateLendingOffer(req.user, offerId, dto);
  }

  @Get('org/me/api-integrations')
  @ApiOperation({ summary: 'Get organization API integration data' })
  @ApiOkResponse()
  getApiIntegrations(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getApiIntegrations(req.user);
  }

  @Get('org/me/portfolio')
  @ApiOperation({ summary: 'Get organization portfolio monitoring data' })
  @ApiOkResponse()
  getPortfolio(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getPortfolio(req.user);
  }

  @Get('org/me/analytics')
  @ApiOperation({ summary: 'Get organization analytics data' })
  @ApiOkResponse()
  getAnalytics(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getAnalytics(req.user);
  }

  @Get('org/me/compliance')
  @ApiOperation({ summary: 'Get organization compliance data' })
  @ApiOkResponse()
  getCompliance(@Req() req: AuthenticatedRequest) {
    return this.orgDashboardService.getCompliance(req.user);
  }

  @Post('org/me/api-integrations/keys')
  @ApiOperation({ summary: 'Create an organization API key' })
  @ApiBody({ type: CreateOrgApiKeyDto })
  @ApiOkResponse()
  createApiKey(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOrgApiKeyDto,
  ) {
    return this.orgDashboardService.createApiKey(req.user, dto);
  }
}
