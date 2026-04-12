import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import {
  OnboardingState,
  OnboardingStateDocument,
} from '../onboarding/schemas/onboarding-state.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { ScoresService } from '../scores/scores.service';
import {
  UnderwritingCase,
  UnderwritingCaseDocument,
} from '../underwriting/schemas/underwriting-case.schema';
import { buildUnderwritingScoreSnapshot } from '../underwriting/underwriting-shared';
import {
  VerificationSnapshotView,
  VerifyService,
} from '../verify/verify.service';
import { CreatePassportGrantDto } from './dto/create-passport-grant.dto';
import { PASSPORT_PURPOSES, PassportPurpose } from './passport.constants';
import { RevokePassportGrantDto } from './dto/revoke-passport-grant.dto';
import {
  PassportGrant,
  PassportGrantDocument,
  PassportScope,
} from './schemas/passport-grant.schema';
import {
  PassportGrantEvent,
  PassportGrantEventDocument,
} from './schemas/passport-grant-event.schema';

const DEFAULT_GRANT_EXPIRY = '90d';

@Injectable()
export class PassportService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly organizationsService: OrganizationsService,
    private readonly scoresService: ScoresService,
    private readonly verifyService: VerifyService,
    @InjectModel(PassportGrant.name)
    private readonly passportGrantModel: Model<PassportGrantDocument>,
    @InjectModel(PassportGrantEvent.name)
    private readonly passportGrantEventModel: Model<PassportGrantEventDocument>,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(UnderwritingCase.name)
    private readonly underwritingCaseModel: Model<UnderwritingCaseDocument>,
  ) {}

  async createGrant(user: AuthenticatedUser, dto: CreatePassportGrantDto) {
    this.assertIndividual(user);

    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const profile = account.profileId as { shareId?: string } | undefined;

    if (!profile?.shareId) {
      throw new NotFoundException({
        code: 'PASSPORT_PROFILE_NOT_READY',
        message:
          'A CALEN profile is required before Passport access can be granted.',
      });
    }

    const organization = await this.organizationsService.findByIdOrSlugOrThrow(
      dto.organizationKey,
    );
    const normalizedPurpose = this.normalizePurpose(dto.purpose);
    const scopes = this.normalizeScopes(dto.scopes);
    const ownerUserId = this.toObjectId(user.id);
    const organizationId = this.toObjectId(String(organization._id));
    const activeGrant = await this.passportGrantModel.findOne({
      ownerUserId,
      organizationId,
      purpose: normalizedPurpose,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (activeGrant) {
      throw new ConflictException({
        code: 'PASSPORT_GRANT_ALREADY_ACTIVE',
        message:
          'An active Passport grant already exists for that organisation and purpose.',
      });
    }

    const createdGrant = await this.passportGrantModel.create({
      ownerUserId,
      organizationId,
      grantId: this.generateGrantId(),
      calenId: profile.shareId,
      subjectName: account.displayName,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      purpose: normalizedPurpose,
      scopes,
      status: 'active',
      expiresAt: this.resolveExpiryDate(dto.expiresIn ?? DEFAULT_GRANT_EXPIRY),
      accessCount: 0,
    });

    await this.passportGrantEventModel.create({
      passportGrantId: createdGrant._id as Types.ObjectId,
      ownerUserId,
      organizationId,
      grantId: createdGrant.grantId,
      eventType: 'grant_created',
      actorType: 'individual',
      actorId: user.id,
      organizationName: organization.name,
      purpose: normalizedPurpose,
      scopes,
      detail: `Passport access granted for ${normalizedPurpose}.`,
      occurredAt: new Date(),
    });

    return {
      passportGrant: this.serializeGrant(createdGrant),
    };
  }

  async getGrants(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const grants = await this.passportGrantModel
      .find({ ownerUserId: this.toObjectId(user.id) })
      .sort({ createdAt: -1 });

    return {
      passportGrants: grants.map((grant) => this.serializeGrant(grant)),
    };
  }

  async revokeGrant(
    user: AuthenticatedUser,
    grantId: string,
    dto: RevokePassportGrantDto,
  ) {
    this.assertIndividual(user);
    const ownerUserId = this.toObjectId(user.id);
    const revokedAt = new Date();
    const reason = dto.reason?.trim() || null;
    const grant = await this.passportGrantModel.findOneAndUpdate(
      {
        _id: grantId,
        ownerUserId,
        status: 'active',
      },
      {
        $set: {
          status: 'revoked',
          revokedAt,
          revocationReason: reason,
        },
      },
      { new: true },
    );

    if (!grant) {
      throw new NotFoundException({
        code: 'PASSPORT_GRANT_NOT_FOUND',
        message: 'Passport grant was not found for this user.',
      });
    }

    await this.passportGrantEventModel.create({
      passportGrantId: grant._id as Types.ObjectId,
      ownerUserId,
      organizationId: grant.organizationId as Types.ObjectId,
      grantId: grant.grantId,
      eventType: 'grant_revoked',
      actorType: 'individual',
      actorId: user.id,
      organizationName: grant.organizationName,
      purpose: grant.purpose,
      scopes: Array.isArray(grant.scopes) ? grant.scopes : [],
      detail: reason ?? 'Passport grant revoked by the profile owner.',
      occurredAt: revokedAt,
    });

    return {
      passportGrant: this.serializeGrant(grant),
    };
  }

  async getAuditLog(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const events = await this.passportGrantEventModel
      .find({ ownerUserId: this.toObjectId(user.id) })
      .sort({ occurredAt: -1 })
      .limit(100);

    return {
      auditLog: events.map((event) => ({
        id: String(event._id),
        grantId: event.grantId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId ?? null,
        organizationName: event.organizationName,
        purpose: event.purpose,
        scopes: Array.isArray(event.scopes) ? event.scopes : [],
        detail: event.detail ?? null,
        occurredAt: event.occurredAt,
      })),
    };
  }

  async getSummary(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const profile = account.profileId as
      | { shareId?: string; onboardingStatus?: string }
      | undefined;
    const grants = await this.passportGrantModel
      .find({ ownerUserId: this.toObjectId(user.id) })
      .sort({ createdAt: -1 });
    const activeGrants = grants.filter(
      (grant) => this.getGrantStatus(grant) === 'active',
    );

    return {
      passport: {
        calenId: profile?.shareId ?? null,
        subjectName: account.displayName,
        onboardingStatus: profile?.onboardingStatus ?? 'not_started',
        activeGrantCount: activeGrants.length,
        totalGrantCount: grants.length,
        availableScopes: [
          'score',
          'verify',
          'underwrite_summary',
          'full_profile',
        ] as PassportScope[],
        recentGrants: grants
          .slice(0, 5)
          .map((grant) => this.serializeGrant(grant)),
      },
    };
  }

  async getOrganizationPassport(
    user: AuthenticatedUser,
    input: { calenId: string; purpose?: string },
  ) {
    this.assertOrganization(user);
    const normalizedCalenId = input.calenId.trim().toUpperCase();
    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      throw new NotFoundException({
        code: 'PASSPORT_PROFILE_NOT_FOUND',
        message: 'No CALEN profile matched that Passport request.',
      });
    }

    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const ownerUserId = this.toObjectId(String(account._id));
    const organizationId = this.toObjectId(String(organization._id));
    const grantQuery: Record<string, unknown> = {
      ownerUserId,
      organizationId,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };

    if (input.purpose?.trim()) {
      grantQuery.purpose = this.normalizePurpose(input.purpose);
    }

    const grant = await this.passportGrantModel
      .findOne(grantQuery)
      .sort({ createdAt: -1 });

    if (!grant) {
      throw new NotFoundException({
        code: 'PASSPORT_GRANT_NOT_FOUND',
        message:
          'No active Passport grant exists for that CALEN profile and organisation.',
      });
    }

    const [onboardingState, latestScore, latestVerifySnapshot, latestUnderwritingCase] =
      await Promise.all([
        this.onboardingStateModel.findOne({ userId: ownerUserId }),
        this.scoresService.getLatestScore(String(account._id)),
        this.verifyService.getLatestSnapshotForUser(String(account._id)),
        this.underwritingCaseModel
          .findOne({
            organizationId,
            subjectUserId: ownerUserId,
          })
          .sort({ createdAt: -1 }),
      ]);

    const accessedAt = new Date();
    await this.passportGrantModel.findByIdAndUpdate(grant._id, {
      $inc: { accessCount: 1 },
      $set: { lastAccessedAt: accessedAt },
    });
    await this.passportGrantEventModel.create({
      passportGrantId: grant._id as Types.ObjectId,
      ownerUserId,
      organizationId,
      grantId: grant.grantId,
      eventType: 'grant_accessed',
      actorType: 'organisation',
      actorId: user.id,
      organizationName: grant.organizationName,
      purpose: grant.purpose,
      scopes: Array.isArray(grant.scopes) ? grant.scopes : [],
      detail: `Passport package retrieved by ${grant.organizationName}.`,
      occurredAt: accessedAt,
    });

    return {
      passport: {
        grant: {
          ...this.serializeGrant(grant),
          accessCount: (grant.accessCount ?? 0) + 1,
          lastAccessedAt: accessedAt,
        },
        package: this.buildPassportPackage({
          account,
          onboardingState,
          grant,
          scoreSnapshot: buildUnderwritingScoreSnapshot(latestScore),
          verificationSnapshot:
            latestVerifySnapshot?.verificationSnapshot ?? null,
          underwritingCase: latestUnderwritingCase,
          generatedAt: accessedAt,
        }),
      },
    };
  }

  private assertIndividual(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.INDIVIDUAL) {
      throw new ForbiddenException({
        code: 'INDIVIDUAL_ACCOUNT_REQUIRED',
        message: 'Passport grants are only available to individual accounts.',
      });
    }
  }

  private assertOrganization(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_REQUIRED',
        message: 'Passport retrieval is only available to organisation users.',
      });
    }
  }

  private buildPassportPackage(input: {
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;
    onboardingState: OnboardingStateDocument | null;
    grant: PassportGrantDocument;
    scoreSnapshot: ReturnType<typeof buildUnderwritingScoreSnapshot>;
    verificationSnapshot: VerificationSnapshotView | null;
    underwritingCase: UnderwritingCaseDocument | null;
    generatedAt: Date;
  }) {
    const scopes = Array.isArray(input.grant.scopes) ? input.grant.scopes : [];
    const includesFullProfile = scopes.includes('full_profile');
    const includesScore = includesFullProfile || scopes.includes('score');
    const includesVerify = includesFullProfile || scopes.includes('verify');
    const includesUnderwrite =
      includesFullProfile || scopes.includes('underwrite_summary');
    const profile = input.account.profileId as
      | { shareId?: string; onboardingStatus?: string }
      | undefined;
    const personalProfile =
      (input.onboardingState?.personalProfile as Record<string, unknown> | null) ??
      null;
    const employmentProfile =
      (input.onboardingState?.employmentProfile as Record<string, unknown> | null) ??
      null;
    const financialProfile =
      (input.onboardingState?.financialProfile as Record<string, unknown> | null) ??
      null;

    return {
      packageVersion: 'v1.phase3',
      calenId: input.grant.calenId,
      subjectName: input.grant.subjectName,
      purpose: input.grant.purpose,
      scopes,
      generatedAt: input.generatedAt,
      ownerSummary: {
        displayName: input.account.displayName,
        verified: Boolean(input.account.emailVerifiedAt),
        country: input.account.country ?? null,
        jobTitle: input.account.jobTitle ?? null,
        onboardingStatus: profile?.onboardingStatus ?? 'not_started',
      },
      profilePackage: includesFullProfile
        ? {
            shareId: profile?.shareId ?? null,
            personalProfile,
            employmentProfile,
            financialProfile,
          }
        : null,
      scoreSnapshot: includesScore ? input.scoreSnapshot : null,
      verificationSnapshot: includesVerify ? input.verificationSnapshot : null,
      underwritingSummary: includesUnderwrite
        ? this.serializeUnderwritingSummary(input.underwritingCase)
        : null,
    };
  }

  private serializeUnderwritingSummary(
    underwritingCase: UnderwritingCaseDocument | null,
  ) {
    if (!underwritingCase) {
      return null;
    }

    return {
      caseId: underwritingCase.caseId,
      stage: underwritingCase.stage,
      riskLevel: underwritingCase.riskLevel,
      productType: underwritingCase.productType,
      requestedAmount: underwritingCase.requestedAmount ?? null,
      obligationContext: underwritingCase.obligationContext ?? null,
      assessment: underwritingCase.underwritingAssessment ?? null,
      recommendation: underwritingCase.recommendation ?? null,
      generatedAt:
        underwritingCase.recommendation?.generatedAt ??
        underwritingCase.updatedAt ??
        underwritingCase.createdAt ??
        null,
    };
  }

  private normalizeScopes(scopes: PassportScope[]) {
    const uniqueScopes = Array.from(
      new Set(
        scopes
          .filter((scope): scope is PassportScope => typeof scope === 'string')
          .map((scope) => scope.trim() as PassportScope),
      ),
    );

    if (uniqueScopes.includes('full_profile')) {
      return ['full_profile'] as PassportScope[];
    }

    return uniqueScopes.sort((left, right) => left.localeCompare(right));
  }

  private normalizePurpose(purpose: string): PassportPurpose {
    const normalizedPurpose = purpose.trim().toLowerCase() as PassportPurpose;

    if (!PASSPORT_PURPOSES.includes(normalizedPurpose)) {
      throw new BadRequestException({
        code: 'PASSPORT_PURPOSE_INVALID',
        message:
          'Passport purpose must be one of the supported organisation access purposes.',
      });
    }

    return normalizedPurpose;
  }

  private serializeGrant(grant: PassportGrantDocument) {
    return {
      id: String(grant._id),
      grantId: grant.grantId,
      calenId: grant.calenId,
      subjectName: grant.subjectName,
      organization: {
        id: String(grant.organizationId),
        name: grant.organizationName,
        slug: grant.organizationSlug,
      },
      purpose: grant.purpose,
      scopes: Array.isArray(grant.scopes) ? grant.scopes : [],
      status: this.getGrantStatus(grant),
      expiresAt: grant.expiresAt ?? null,
      revokedAt: grant.revokedAt ?? null,
      revocationReason: grant.revocationReason ?? null,
      accessCount: grant.accessCount ?? 0,
      lastAccessedAt: grant.lastAccessedAt ?? null,
      createdAt: grant.createdAt ?? null,
      updatedAt: grant.updatedAt ?? null,
    };
  }

  private getGrantStatus(grant: PassportGrantDocument) {
    if (grant.status === 'revoked' || grant.revokedAt) {
      return 'revoked';
    }

    if (grant.expiresAt && grant.expiresAt <= new Date()) {
      return 'expired';
    }

    return 'active';
  }

  private generateGrantId() {
    return `PSG-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private resolveExpiryDate(expiresIn?: string): Date | null {
    if (!expiresIn) {
      return this.resolveExpiryDate(DEFAULT_GRANT_EXPIRY);
    }

    const match = /^(\d+)([smhd])$/i.exec(expiresIn.trim());

    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
