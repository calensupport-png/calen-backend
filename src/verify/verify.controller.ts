import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountType } from '../common/enums/account-type.enum';
import { GetOrgProfileSearchDto } from '../org-dashboard/dto/get-org-profile-search.dto';
import { PassportAccessService } from '../passport/passport-access.service';
import { VerifyService } from './verify.service';

@ApiTags('Verify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class VerifyController {
  constructor(
    private readonly verifyService: VerifyService,
    private readonly passportAccessService: PassportAccessService,
  ) {}

  @Get('org/me/verify')
  @ApiOperation({ summary: 'Run CALEN Verify for a profile by CALEN ID' })
  @ApiOkResponse()
  getOrganizationVerification(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrgProfileSearchDto,
  ) {
    if (req.user.accountType !== AccountType.ORGANISATION) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_REQUIRED',
        message: 'This route is only available to organization accounts.',
      });
    }

    return this.passportAccessService
      .assertAccessibleIndividualByShareId(req.user, query.calenId ?? '', [
        'verify',
      ])
      .then(() => this.verifyService.generateSnapshotForCalenId(query.calenId ?? ''))
      .then((result) => ({
        verify: result,
      }));
  }
}
