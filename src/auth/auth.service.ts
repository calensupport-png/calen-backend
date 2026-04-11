import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { UserDocument } from '../accounts/schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountRole } from '../common/enums/account-role.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { EmailService } from '../email/email.service';
import { mongooseRefId } from '../common/utils/mongoose-ref.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { PasswordService } from './password.service';
import {
  AuthToken,
  AuthTokenDocument,
  AuthTokenType,
} from './schemas/auth-token.schema';
import { Session, SessionDocument } from './schemas/session.schema';

interface RequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  accountType: AccountType;
  roles: AccountRole[];
  organizationId?: string;
  sid: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly organizationsService: OrganizationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(AuthToken.name)
    private readonly authTokenModel: Model<AuthTokenDocument>,
  ) {}

  async register(dto: RegisterUserDto, requestMetadata: RequestMetadata) {
    await this.accountsService.assertEmailAvailable(dto.email);

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.accountsService.createUser({
      email: dto.email,
      passwordHash,
      displayName: `${dto.firstName} ${dto.lastName}`.trim(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      country: dto.country,
      roles: [AccountRole.INDIVIDUAL],
      accountType: AccountType.INDIVIDUAL,
    });

    await this.auditLogsService.record({
      action: 'auth.register',
      actorType: 'user',
      actorId: String(user._id),
      targetType: 'user',
      targetId: String(user._id),
      requestId: requestMetadata.requestId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        accountType: AccountType.INDIVIDUAL,
      },
    });

    await this.sendEmailVerification(user, dto.firstName);

    return this.buildAuthResponse(user, requestMetadata);
  }

  async registerOrganization(
    dto: RegisterOrganizationDto,
    requestMetadata: RequestMetadata,
  ) {
    await this.accountsService.assertEmailAvailable(dto.email);

    const organization = await this.organizationsService.createOrganization({
      name: dto.orgName,
      industry: dto.industry,
      companySize: dto.companySize,
      country: dto.country,
      website: dto.website,
      registrationNumber: dto.regNumber,
      jurisdiction: dto.jurisdiction,
    });

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.accountsService.createUser({
      email: dto.email,
      passwordHash,
      displayName: dto.contactName,
      firstName: dto.contactName,
      phone: dto.phone,
      country: dto.country,
      jobTitle: dto.jobTitle,
      roles: [AccountRole.ORGANISATION],
      accountType: AccountType.ORGANISATION,
      organizationId: organization._id,
    });

    await this.organizationsService.assignPrimaryAdmin(
      organization._id,
      user._id,
    );

    await this.auditLogsService.record({
      action: 'auth.register_org',
      actorType: 'user',
      actorId: String(user._id),
      targetType: 'organization',
      targetId: String(organization._id),
      requestId: requestMetadata.requestId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        accountType: AccountType.ORGANISATION,
      },
    });

    await this.sendEmailVerification(user, dto.contactName);

    return this.buildAuthResponse(user, requestMetadata);
  }

  async login(
    dto: LoginDto,
    accountType: AccountType,
    requestMetadata: RequestMetadata,
  ) {
    const user = await this.accountsService.findUserByEmailForLogin(dto.email);

    if (!user || user.accountType !== accountType) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    await this.accountsService.markLastLogin(String(user._id));

    await this.auditLogsService.record({
      action: 'auth.login',
      actorType: 'user',
      actorId: String(user._id),
      targetType: 'user',
      targetId: String(user._id),
      requestId: requestMetadata.requestId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        accountType,
      },
    });

    const hydratedUser = await this.accountsService.findUserByIdOrThrow(
      String(user._id),
    );

    return this.buildAuthResponse(hydratedUser, requestMetadata);
  }

  async me(authenticatedUser: AuthenticatedUser) {
    const user = await this.accountsService.findUserByIdOrThrow(
      authenticatedUser.id,
    );

    return {
      user: this.serializeUser(user),
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const authToken = await this.findValidToken(
      dto.token,
      'email_verification',
    );

    if (!authToken) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TOKEN',
        message: 'This email verification link is invalid or has expired',
      });
    }

    const user = await this.accountsService.findUserByIdOrThrow(
      String(authToken.userId),
    );

    if (!user.emailVerifiedAt) {
      await this.accountsService.markEmailVerified(String(user._id));
    }

    await this.authTokenModel.updateMany(
      {
        userId: authToken.userId,
        type: 'email_verification',
        consumedAt: null,
      },
      {
        consumedAt: new Date(),
      },
    );

    const hydratedUser = await this.accountsService.findUserByIdOrThrow(
      String(user._id),
    );

    return {
      message: 'Your email has been verified successfully.',
      user: this.serializeUser(hydratedUser),
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.accountsService.findUserByEmail(dto.email);

    if (!user || (dto.accountType && user.accountType !== dto.accountType)) {
      return {
        message:
          'If an account exists for that email, a fresh verification link has been sent.',
      };
    }

    if (user.emailVerifiedAt) {
      return {
        message: 'This email address is already verified.',
      };
    }

    await this.sendEmailVerification(user, dto.firstName ?? user.firstName);

    return {
      message:
        'If an account exists for that email, a fresh verification link has been sent.',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.accountsService.findUserByEmail(email);
    let resetUrl: string | undefined;

    if (user) {
      const token = await this.issueAuthToken(user, 'password_reset', 60 * 60);
      resetUrl = `${this.getAppBaseUrl()}/forgot-password?token=${encodeURIComponent(
        token,
      )}&email=${encodeURIComponent(user.email)}`;
      await this.emailService.sendPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        resetUrl,
      });
    }

    return {
      message:
        'If an account exists for that email, password reset instructions have been sent.',
      ...(this.shouldExposeAuthLinksInResponse() && resetUrl
        ? { resetUrl }
        : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const authToken = await this.findValidToken(dto.token, 'password_reset');

    if (!authToken) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'This password reset link is invalid or has expired',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    await this.accountsService.updatePassword(
      String(authToken.userId),
      passwordHash,
    );

    await this.authTokenModel.updateMany(
      {
        userId: authToken.userId,
        type: 'password_reset',
        consumedAt: null,
      },
      {
        consumedAt: new Date(),
      },
    );

    return {
      message: 'Your password has been reset successfully.',
    };
  }

  async createAuthenticatedSession(
    user: UserDocument,
    requestMetadata: {
      requestId?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ) {
    return this.buildAuthResponse(user, requestMetadata);
  }

  private async buildAuthResponse(
    user: UserDocument,
    requestMetadata: RequestMetadata,
  ) {
    const sessionId = new Types.ObjectId().toString();
    const expiresIn = this.configService.getOrThrow<string>('JWT_EXPIRES_IN');
    const expiresAt = this.resolveExpiryDate(expiresIn);

    await this.sessionModel.create({
      userId: user._id,
      sessionId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      lastActivityAt: new Date(),
      expiresAt,
    });

    const payload: JwtPayload = {
      sub: String(user._id),
      email: user.email,
      accountType: user.accountType,
      roles: user.roles,
      organizationId: mongooseRefId(user.organizationId),
      sid: sessionId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: this.serializeUser(user),
    };
  }

  private serializeUser(user: UserDocument) {
    const populatedOrganization = user.organizationId as
      | {
          _id?: Types.ObjectId;
          name?: string;
          primaryAdminUserId?: Types.ObjectId;
        }
      | undefined;
    const organization =
      populatedOrganization && populatedOrganization.name
        ? {
            id: String(populatedOrganization._id),
            name: populatedOrganization.name,
            primaryAdminUserId: populatedOrganization.primaryAdminUserId
              ? String(populatedOrganization.primaryAdminUserId)
              : null,
          }
        : undefined;

    return {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      country: user.country,
      jobTitle: user.jobTitle,
      roles: user.roles,
      accountType: user.accountType,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      profileId: mongooseRefId(user.profileId),
      organization,
    };
  }

  private async sendEmailVerification(
    user: UserDocument,
    firstName?: string,
  ): Promise<void> {
    const token = await this.issueAuthToken(
      user,
      'email_verification',
      24 * 60 * 60,
    );
    await this.emailService.sendEmailVerificationEmail({
      to: user.email,
      firstName: firstName ?? user.firstName,
      verificationUrl: `${this.getAppBaseUrl()}/verify-email?token=${encodeURIComponent(
        token,
      )}&email=${encodeURIComponent(user.email)}&accountType=${encodeURIComponent(
        user.accountType,
      )}`,
    });
  }

  private async issueAuthToken(
    user: UserDocument,
    type: AuthTokenType,
    expiresInSeconds: number,
  ): Promise<string> {
    const rawToken = `${type === 'email_verification' ? 'verify' : 'reset'}_${randomBytes(16).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);

    await this.authTokenModel.updateMany(
      {
        userId: user._id,
        type,
        consumedAt: null,
      },
      {
        consumedAt: new Date(),
      },
    );

    await this.authTokenModel.create({
      userId: user._id,
      type,
      tokenHash,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });

    return rawToken;
  }

  private async findValidToken(
    rawToken: string,
    type: AuthTokenType,
  ): Promise<AuthTokenDocument | null> {
    return this.authTokenModel.findOne({
      tokenHash: this.hashToken(rawToken),
      type,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private getAppBaseUrl(): string {
    return (
      this.configService.get<string>('APP_BASE_URL')?.trim() ||
      'http://localhost:8080'
    );
  }

  private shouldExposeAuthLinksInResponse(): boolean {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  private resolveExpiryDate(expiresIn: string): Date {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());

    if (!match) {
      return new Date(now + 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(now + value * multipliers[unit]);
  }
}
