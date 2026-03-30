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
import { CreateBankConnectionDto } from './dto/bank-connection.dto';
import { CompleteBankConnectionDto } from './dto/complete-bank-connection.dto';
import { UpdateEmploymentProfileDto } from './dto/employment-profile.dto';
import { UpdateFinancialProfileDto } from './dto/financial-profile.dto';
import { UploadIdentityDocumentsDto } from './dto/identity-documents.dto';
import { SubmitIdentityVerificationDto } from './dto/identity-verification.dto';
import { UpdatePersonalProfileDto } from './dto/personal-profile.dto';
import { CreateTrustContactDto } from './dto/trust-contact.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('me/onboarding')
  @ApiOperation({ summary: 'Get the current user onboarding state' })
  @ApiOkResponse()
  getOnboarding(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.getOnboarding(req.user);
  }

  @Patch('me/onboarding/personal-profile')
  @ApiOperation({
    summary: 'Create or update personal profile onboarding data',
  })
  @ApiBody({ type: UpdatePersonalProfileDto })
  @ApiOkResponse()
  updatePersonalProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePersonalProfileDto,
  ) {
    return this.onboardingService.updatePersonalProfile(req.user, dto);
  }

  @Post('me/onboarding/identity-verification')
  @ApiOperation({ summary: 'Submit an identity verification request' })
  @ApiBody({ type: SubmitIdentityVerificationDto })
  @ApiCreatedResponse()
  submitIdentityVerification(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitIdentityVerificationDto,
  ) {
    return this.onboardingService.submitIdentityVerification(req.user, dto);
  }

  @Post('me/onboarding/identity-documents')
  @ApiOperation({ summary: 'Record uploaded identity documents' })
  @ApiBody({ type: UploadIdentityDocumentsDto })
  @ApiCreatedResponse()
  uploadIdentityDocuments(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UploadIdentityDocumentsDto,
  ) {
    return this.onboardingService.uploadIdentityDocuments(req.user, dto);
  }

  @Patch('me/onboarding/employment')
  @ApiOperation({ summary: 'Create or update employment onboarding data' })
  @ApiBody({ type: UpdateEmploymentProfileDto })
  @ApiOkResponse()
  updateEmployment(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateEmploymentProfileDto,
  ) {
    return this.onboardingService.updateEmploymentProfile(req.user, dto);
  }

  @Patch('me/onboarding/financial-profile')
  @ApiOperation({ summary: 'Create or update financial onboarding data' })
  @ApiBody({ type: UpdateFinancialProfileDto })
  @ApiOkResponse()
  updateFinancialProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateFinancialProfileDto,
  ) {
    return this.onboardingService.updateFinancialProfile(req.user, dto);
  }

  @Get('banks')
  @ApiOperation({ summary: 'List supported bank providers' })
  @ApiOkResponse()
  getBanks() {
    return this.onboardingService.getBanks();
  }

  @Post('me/bank-connections')
  @ApiOperation({ summary: 'Create a TrueLayer bank auth link' })
  @ApiBody({ type: CreateBankConnectionDto })
  @ApiCreatedResponse()
  createBankConnection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBankConnectionDto,
  ) {
    return this.onboardingService.createBankConnection(req.user, dto);
  }

  @Post('me/bank-connections/exchange')
  @ApiOperation({ summary: 'Exchange a TrueLayer auth code and save bank connections' })
  @ApiBody({ type: CompleteBankConnectionDto })
  @ApiCreatedResponse()
  completeBankConnection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CompleteBankConnectionDto,
  ) {
    return this.onboardingService.completeBankConnection(req.user, dto);
  }

  @Get('me/bank-connections')
  @ApiOperation({ summary: 'List current user bank connections' })
  @ApiOkResponse()
  getBankConnections(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.getBankConnections(req.user);
  }

  @Get('me/bank-connections/:id/details')
  @ApiOperation({ summary: 'Get detailed TrueLayer data for one bank connection resource' })
  @ApiOkResponse()
  getBankConnectionDetails(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.onboardingService.getBankConnectionDetails(req.user, id);
  }

  @Post('me/trust-contacts')
  @ApiOperation({ summary: 'Create a trust network contact' })
  @ApiBody({ type: CreateTrustContactDto })
  @ApiCreatedResponse()
  createTrustContact(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTrustContactDto,
  ) {
    return this.onboardingService.createTrustContact(req.user, dto);
  }

  @Get('me/trust-contacts')
  @ApiOperation({ summary: 'List current user trust contacts' })
  @ApiOkResponse()
  getTrustContacts(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.getTrustContacts(req.user);
  }

  @Post('me/trust-contacts/:id/send-request')
  @ApiOperation({ summary: 'Send a trust endorsement request' })
  @ApiCreatedResponse()
  sendTrustRequest(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.onboardingService.sendTrustRequest(req.user, id);
  }

  @Post('me/score/generate')
  @ApiOperation({ summary: 'Queue score generation for the current user' })
  @ApiCreatedResponse()
  generateScore(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.generateScore(req.user);
  }
}
