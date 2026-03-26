import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RespondTrustRequestDto } from './dto/respond-trust-request.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Public Trust Requests')
@Controller({ version: '1' })
export class PublicTrustRequestController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('public/trust-requests/:token')
  @ApiOperation({ summary: 'Get a public trust request by token' })
  @ApiOkResponse()
  getPublicTrustRequest(@Param('token') token: string) {
    return this.onboardingService.getPublicTrustRequest(token);
  }

  @Post('public/trust-requests/:token/respond')
  @ApiOperation({ summary: 'Respond to a public trust request' })
  @ApiBody({ type: RespondTrustRequestDto })
  @ApiCreatedResponse()
  respondToTrustRequest(
    @Param('token') token: string,
    @Body() dto: RespondTrustRequestDto,
  ) {
    return this.onboardingService.respondToTrustRequest(token, dto);
  }
}
