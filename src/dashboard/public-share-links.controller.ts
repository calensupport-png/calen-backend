import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { DashboardService } from './dashboard.service';

@ApiTags('Public Share Links')
@Controller({ path: 'public/share-links', version: '1' })
export class PublicShareLinksController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get a shared profile by share link token' })
  @ApiOkResponse()
  getSharedProfile(@Param('token') token: string, @Req() req: Request) {
    return this.dashboardService.getSharedProfile(token, {
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }
}
