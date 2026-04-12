import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateMonitoringEnrollmentDto } from './dto/create-monitoring-enrollment.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('org/me/monitoring')
  @ApiOperation({ summary: 'Get organisation monitoring portfolio data' })
  @ApiOkResponse()
  getPortfolio(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.getPortfolio(req.user);
  }

  @Post('org/me/monitoring/refresh')
  @ApiOperation({ summary: 'Refresh organisation monitoring snapshots and alerts' })
  @ApiOkResponse()
  refreshPortfolio(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.refreshPortfolio(req.user);
  }

  @Post('org/me/monitoring/enrollments')
  @ApiOperation({ summary: 'Enroll a CALEN profile into monitoring' })
  @ApiBody({ type: CreateMonitoringEnrollmentDto })
  @ApiOkResponse()
  createEnrollment(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMonitoringEnrollmentDto,
  ) {
    return this.monitoringService.createEnrollment(req.user, dto.calenId);
  }
}
