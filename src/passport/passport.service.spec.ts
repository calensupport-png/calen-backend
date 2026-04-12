import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { OnboardingState } from '../onboarding/schemas/onboarding-state.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { ScoresService } from '../scores/scores.service';
import { UnderwritingCase } from '../underwriting/schemas/underwriting-case.schema';
import { VerifyService } from '../verify/verify.service';
import { PassportService } from './passport.service';
import { PassportGrant } from './schemas/passport-grant.schema';
import { PassportGrantEvent } from './schemas/passport-grant-event.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };
}

describe('PassportService', () => {
  let service: PassportService;
  const passportGrantModel = createModelMock();
  const passportGrantEventModel = createModelMock();
  const onboardingStateModel = createModelMock();
  const underwritingCaseModel = createModelMock();
  const accountsService = {
    findUserByIdOrThrow: jest.fn(),
    findIndividualByShareId: jest.fn(),
  };
  const organizationsService = {
    findByIdOrSlugOrThrow: jest.fn(),
    findByIdOrThrow: jest.fn(),
  };
  const scoresService = {
    getLatestScore: jest.fn(),
  };
  const verifyService = {
    getLatestSnapshotForUser: jest.fn(),
  };
  const user = {
    id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    accountType: AccountType.INDIVIDUAL,
    roles: [],
    sessionId: 'session-id',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PassportService,
        { provide: AccountsService, useValue: accountsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: ScoresService, useValue: scoresService },
        { provide: VerifyService, useValue: verifyService },
        {
          provide: getModelToken(PassportGrant.name),
          useValue: passportGrantModel,
        },
        {
          provide: getModelToken(PassportGrantEvent.name),
          useValue: passportGrantEventModel,
        },
        {
          provide: getModelToken(OnboardingState.name),
          useValue: onboardingStateModel,
        },
        {
          provide: getModelToken(BankConnection.name),
          useValue: createModelMock(),
        },
        {
          provide: getModelToken(UnderwritingCase.name),
          useValue: underwritingCaseModel,
        },
      ],
    }).compile();

    service = moduleRef.get(PassportService);
    passportGrantModel.findOne.mockResolvedValue(null);
    passportGrantModel.findByIdAndUpdate.mockResolvedValue({});
    passportGrantModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
      ...payload,
      createdAt: new Date('2026-04-11T12:00:00.000Z'),
      updatedAt: new Date('2026-04-11T12:00:00.000Z'),
    }));
    passportGrantEventModel.create.mockResolvedValue({});
    onboardingStateModel.findOne.mockResolvedValue(null);
    underwritingCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    scoresService.getLatestScore.mockResolvedValue(null);
    verifyService.getLatestSnapshotForUser.mockResolvedValue(null);
  });

  it('creates an organisation-scoped Passport grant and records an audit event', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      displayName: 'Ada Lovelace',
      profileId: { shareId: 'CALEN-ABCD-1234' },
    });
    organizationsService.findByIdOrSlugOrThrow.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      name: 'Acme Financial',
      slug: 'acme-financial',
    });

    const result = await service.createGrant(user as any, {
      organizationKey: 'acme-financial',
      purpose: 'tenant_screening_review',
      scopes: ['verify', 'score'],
      expiresIn: '30d',
    });

    expect(passportGrantModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        calenId: 'CALEN-ABCD-1234',
        subjectName: 'Ada Lovelace',
        organizationName: 'Acme Financial',
        purpose: 'tenant_screening_review',
        scopes: ['score', 'verify'],
        status: 'active',
      }),
    );
    expect(passportGrantEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'grant_created',
        actorType: 'individual',
        organizationName: 'Acme Financial',
        purpose: 'tenant_screening_review',
      }),
    );
    expect(result.passportGrant.organization.name).toBe('Acme Financial');
    expect(result.passportGrant.scopes).toEqual(['score', 'verify']);
  });

  it('rejects duplicate active grants for the same organisation and purpose', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      displayName: 'Ada Lovelace',
      profileId: { shareId: 'CALEN-ABCD-1234' },
    });
    organizationsService.findByIdOrSlugOrThrow.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      name: 'Acme Financial',
      slug: 'acme-financial',
    });
    passportGrantModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId('507f1f77bcf86cd799439032'),
    });

    await expect(
      service.createGrant(user as any, {
        organizationKey: 'acme-financial',
        purpose: 'tenant_screening_review',
        scopes: ['score'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes a grant and records a revocation audit event', async () => {
    passportGrantModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
      organizationId: new Types.ObjectId('507f1f77bcf86cd799439099'),
      grantId: 'PSG-ABCD1234',
      organizationName: 'Acme Financial',
      organizationSlug: 'acme-financial',
      calenId: 'CALEN-ABCD-1234',
      subjectName: 'Ada Lovelace',
      purpose: 'tenant_screening_review',
      scopes: ['score', 'verify'],
      status: 'revoked',
      revokedAt: new Date('2026-04-11T13:00:00.000Z'),
      revocationReason: 'Organisation review completed.',
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: new Date('2026-04-11T12:00:00.000Z'),
      updatedAt: new Date('2026-04-11T13:00:00.000Z'),
    });

    const result = await service.revokeGrant(user as any, 'grant-1', {
      reason: 'Organisation review completed.',
    });

    expect(passportGrantEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'grant_revoked',
        detail: 'Organisation review completed.',
      }),
    );
    expect(result.passportGrant.status).toBe('revoked');
    expect(result.passportGrant.revocationReason).toBe(
      'Organisation review completed.',
    );
  });

  it('returns Passport audit events for the current user', async () => {
    passportGrantEventModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId('507f1f77bcf86cd799439041'),
            grantId: 'PSG-ABCD1234',
            eventType: 'grant_created',
            actorType: 'individual',
            actorId: user.id,
            organizationName: 'Acme Financial',
            purpose: 'tenant_screening_review',
            scopes: ['score', 'verify'],
            detail: 'Passport access granted for tenant_screening_review.',
            occurredAt: new Date('2026-04-11T12:00:00.000Z'),
          },
        ]),
      }),
    });

    const result = await service.getAuditLog(user as any);

    expect(result.auditLog).toHaveLength(1);
    expect(result.auditLog[0]).toMatchObject({
      eventType: 'grant_created',
      organizationName: 'Acme Financial',
    });
  });

  it('returns a scoped Passport package for an organisation with an active grant', async () => {
    const ownerId = new Types.ObjectId('507f1f77bcf86cd799439071');
    const organizationId = new Types.ObjectId('507f1f77bcf86cd799439099');
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: ownerId,
      displayName: 'Ada Lovelace',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
      country: 'United Kingdom',
      jobTitle: 'Founder',
      profileId: {
        shareId: 'CALEN-ABCD-1234',
        onboardingStatus: 'completed',
      },
    });
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: organizationId,
      name: 'Acme Financial',
      slug: 'acme-financial',
    });
    passportGrantModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
        ownerUserId: ownerId,
        organizationId,
        grantId: 'PSG-ABCD1234',
        calenId: 'CALEN-ABCD-1234',
        subjectName: 'Ada Lovelace',
        organizationName: 'Acme Financial',
        organizationSlug: 'acme-financial',
        purpose: 'tenant_screening_review',
        scopes: ['score', 'verify'],
        status: 'active',
        expiresAt: new Date('2026-07-10T12:00:00.000Z'),
        accessCount: 2,
        lastAccessedAt: null,
        createdAt: new Date('2026-04-11T12:00:00.000Z'),
        updatedAt: new Date('2026-04-11T12:00:00.000Z'),
      }),
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 724,
      composite: 72.4,
      bandKey: 'strong',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'high', score: 82 },
      explanations: ['Income patterns have been consistent across most observed months.'],
      reasonCodes: ['income_consistency_strong'],
      anomalyFlags: [],
      components: [],
      generatedAt: new Date('2026-04-10T12:00:00.000Z'),
    });
    verifyService.getLatestSnapshotForUser.mockResolvedValue({
      verificationSnapshot: {
        snapshotId: 'verify-1',
        calenId: 'CALEN-ABCD-1234',
        subjectName: 'Ada Lovelace',
        engineVersion: 'v1.phase2',
        accountAuthenticityStatus: 'verified',
        ownershipConfidence: 'high',
        ownershipConfidenceScore: 88,
        activeAccountStatus: 'active',
        incomePatternConfirmation: 'confirmed',
        cashflowConsistencyIndicator: 'consistent',
        dataQuality: 'high',
        confidenceLevel: 'high',
        confidenceScore: 84,
        verificationOutcome: 'verified',
        summary: 'Verification signals are strong enough to treat the profile as verified.',
        strengths: [],
        cautionFlags: [],
        evidence: {
          identityVerificationStatus: 'approved',
          completedStepCount: 5,
          connectedAccountCount: 2,
          activeAccountCount: 1,
          mostRecentBankSyncAt: new Date('2026-04-10T10:00:00.000Z'),
          observedMonths: 6,
          transactionCount: 95,
          bankProviders: ['mono'],
        },
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
        createdAt: new Date('2026-04-10T12:00:00.000Z'),
        updatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
    });

    const result = await service.getOrganizationPassport(
      {
        id: '507f1f77bcf86cd799439088',
        accountType: AccountType.ORGANISATION,
        organizationId: String(organizationId),
      } as any,
      {
        calenId: 'CALEN-ABCD-1234',
      },
    );

    expect(result.passport.grant.organization.name).toBe('Acme Financial');
    expect(result.passport.package.scoreSnapshot?.score).toBe(724);
    expect(result.passport.package.verificationSnapshot?.verificationOutcome).toBe('verified');
    expect(result.passport.package.underwritingSummary).toBeNull();
    expect(passportGrantModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(passportGrantEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'grant_accessed',
        actorType: 'organisation',
      }),
    );
  });

  it('requires an individual account', async () => {
    await expect(
      service.getGrants({
        ...user,
        accountType: AccountType.ORGANISATION,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when the user has no CALEN profile yet', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      displayName: 'Ada Lovelace',
      profileId: {},
    });

    await expect(
      service.createGrant(user as any, {
        organizationKey: 'acme-financial',
        purpose: 'tenant_screening_review',
        scopes: ['score'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unsupported Passport purposes', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      displayName: 'Ada Lovelace',
      profileId: { shareId: 'CALEN-ABCD-1234' },
    });
    organizationsService.findByIdOrSlugOrThrow.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      name: 'Acme Financial',
      slug: 'acme-financial',
    });

    await expect(
      service.createGrant(user as any, {
        organizationKey: 'acme-financial',
        purpose: 'custom_freeform_story',
        scopes: ['score'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
