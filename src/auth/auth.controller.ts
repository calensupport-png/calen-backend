import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccountType } from '../common/enums/account-type.enum';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GenericMessageDto } from './dto/generic-message.dto';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register an individual user' })
  @ApiBody({ type: RegisterUserDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterUserDto, @Req() req: AuthenticatedRequest) {
    return this.authService.register(dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }

  @Post('register-org')
  @ApiOperation({ summary: 'Register an organization account' })
  @ApiBody({ type: RegisterOrganizationDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  registerOrganization(
    @Body() dto: RegisterOrganizationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.authService.registerOrganization(dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }

  @Post('login')
  @ApiOperation({ summary: 'Login (individual account)' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto, AccountType.INDIVIDUAL, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }

  @Post('login-org')
  @ApiOperation({ summary: 'Login (organization account)' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  loginOrganization(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto, AccountType.ORGANISATION, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }

  @Post('login-admin')
  @ApiOperation({ summary: 'Login (admin account)' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  loginAdmin(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto, AccountType.ADMIN, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify a user email address' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse()
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend an email verification link' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiOkResponse({ type: GenericMessageDto })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset instructions' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ type: GenericMessageDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset a password with a valid token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: GenericMessageDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user);
  }
}
