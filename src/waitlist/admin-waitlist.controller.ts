import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccountRole } from '../common/enums/account-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminWaitlistQueryDto } from './dto/admin-waitlist-query.dto';
import { AdminWaitlistResponseDto } from './dto/admin-waitlist-response.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Waitlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
@Controller({ path: 'admin/waitlist', version: '1' })
export class AdminWaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get waitlist submissions for the admin dashboard' })
  @ApiOkResponse({ type: AdminWaitlistResponseDto })
  getWaitlist(@Query() query: AdminWaitlistQueryDto) {
    return this.waitlistService.getAdminWaitlist(query);
  }

  @Get(':submissionId')
  @ApiOperation({ summary: 'Get a single waitlist submission for the admin dashboard' })
  @ApiOkResponse()
  getWaitlistSubmission(@Param('submissionId') submissionId: string) {
    return this.waitlistService.getAdminWaitlistSubmission(submissionId);
  }
}
