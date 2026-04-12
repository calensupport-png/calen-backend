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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreatePassportGrantDto } from './dto/create-passport-grant.dto';
import { GetOrgPassportDto } from './dto/get-org-passport.dto';
import { RevokePassportGrantDto } from './dto/revoke-passport-grant.dto';
import { PassportService } from './passport.service';

@ApiTags('Passport')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class PassportController {
  constructor(private readonly passportService: PassportService) {}

  @Post('me/passport/grants')
  @ApiOperation({ summary: 'Create an organisation-scoped Passport grant' })
  @ApiBody({ type: CreatePassportGrantDto })
  @ApiCreatedResponse()
  createGrant(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePassportGrantDto,
  ) {
    return this.passportService.createGrant(req.user, dto);
  }

  @Get('me/passport/grants')
  @ApiOperation({ summary: 'List current user Passport grants' })
  @ApiOkResponse()
  getGrants(@Req() req: AuthenticatedRequest) {
    return this.passportService.getGrants(req.user);
  }

  @Get('me/passport/summary')
  @ApiOperation({ summary: 'Get the current user Passport summary' })
  @ApiOkResponse()
  getSummary(@Req() req: AuthenticatedRequest) {
    return this.passportService.getSummary(req.user);
  }

  @Patch('me/passport/grants/:id/revoke')
  @ApiOperation({ summary: 'Revoke a Passport grant for the current user' })
  @ApiBody({ type: RevokePassportGrantDto })
  @ApiOkResponse()
  revokeGrant(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RevokePassportGrantDto,
  ) {
    return this.passportService.revokeGrant(req.user, id, dto);
  }

  @Get('me/passport/grants/audit-log')
  @ApiOperation({ summary: 'List Passport grant audit events for the current user' })
  @ApiOkResponse()
  getAuditLog(@Req() req: AuthenticatedRequest) {
    return this.passportService.getAuditLog(req.user);
  }

  @Get('org/me/passport')
  @ApiOperation({ summary: 'Retrieve a Passport package for an organisation with an active grant' })
  @ApiOkResponse()
  getOrganizationPassport(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrgPassportDto,
  ) {
    return this.passportService.getOrganizationPassport(req.user, query);
  }
}
