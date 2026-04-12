import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { IdentityVerificationCase } from '../onboarding/schemas/identity-verification-case.schema';
import { OnboardingState } from '../onboarding/schemas/onboarding-state.schema';
import { ScoresService } from '../scores/scores.service';
import { VerificationSnapshot } from './schemas/verification-snapshot.schema';
import { VerifyService } from './verify.service';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
  };
}

describe('VerifyService', () => {
  let service: VerifyService;

  const verificationSnapshotModel = createModelMock();
  const onboardingStateModel = createModelMock();
  const identityVerificationCaseModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const accountsService = {
    findUserByIdOrThrow: jest.fn(),
    findIndividualByShareId: jest.fn(),
  };
  const scoresService = {
    getLatestScore: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        VerifyService,
        {
          provide: AccountsService,
          useValue: accountsService,
        },
        {
          provide: ScoresService,
          useValue: scoresService,
        },
        {
          provide: getModelToken(VerificationSnapshot.name),
          useValue: verificationSnapshotModel,
        },
        {
          provide: getModelToken(OnboardingState.name),
          useValue: onboardingStateModel,
        },
        {
          provide: getModelToken(IdentityVerificationCase.name),
          useValue: identityVerificationCaseModel,
        },
        {
          provide: getModelToken(BankConnection.name),
          useValue: bankConnectionModel,
        },
      ],
    }).compile();

    service = moduleRef.get(VerifyService);
  });

  it('creates a strong verification snapshot for a verified and active profile', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439021'),
      displayName: 'Ada Lovelace',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
      profileId: {
        shareId: 'CALEN-ABCD-1234',
      },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      completedSteps: ['personal_profile', 'identity_verification', 'employment_profile', 'financial_profile', 'bank_connection'],
      identityVerificationStatus: 'approved',
    });
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        status: 'approved',
      }),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          status: 'connected',
          provider: 'truelayer',
          providerAccountId: 'acct_123',
          accountMask: '1234',
          connectedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ]),
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 760,
      composite: 76,
      status: 'ready',
      bandKey: 'strong',
      engineVersion: 'v1.phase1',
      confidence: {
        score: 83,
        level: 'high',
      },
      explanations: [],
      reasonCodes: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 82, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 78, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 22, weight: 0.1, metrics: {}, reasons: [] },
      ],
      inputWindow: {
        observedMonths: 4,
        transactionCount: 160,
      },
      generatedAt: new Date('2026-04-10T00:00:00.000Z'),
    });
    verificationSnapshotModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
      ...payload,
      createdAt: payload.generatedAt,
      updatedAt: payload.generatedAt,
    }));

    const result = await service.generateSnapshotForUser(
      '507f1f77bcf86cd799439021',
    );

    expect(result.verificationSnapshot.calenId).toBe('CALEN-ABCD-1234');
    expect(result.verificationSnapshot.accountAuthenticityStatus).toBe(
      'verified',
    );
    expect(result.verificationSnapshot.ownershipConfidence).toBe('high');
    expect(result.verificationSnapshot.activeAccountStatus).toBe('active');
    expect(result.verificationSnapshot.incomePatternConfirmation).toBe(
      'confirmed',
    );
    expect(result.verificationSnapshot.dataQuality).toBe('high');
    expect(result.verificationSnapshot.verificationOutcome).toBe('verified');
  });

  it('creates a cautious verification snapshot when signals exist but identity is still under review', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439022'),
      displayName: 'Grace Hopper',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
    });
    onboardingStateModel.findOne.mockResolvedValue({
      completedSteps: ['personal_profile', 'identity_verification', 'bank_connection'],
      identityVerificationStatus: 'pending_review',
    });
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        status: 'pending_review',
      }),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          status: 'connected',
          provider: 'truelayer',
          providerAccountId: 'acct_456',
          connectedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ]),
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 690,
      composite: 65,
      status: 'flagged_for_review',
      bandKey: 'good',
      engineVersion: 'v1.phase1',
      confidence: {
        score: 61,
        level: 'moderate',
      },
      explanations: [],
      reasonCodes: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 58, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 56, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 48, weight: 0.1, metrics: {}, reasons: [] },
      ],
      inputWindow: {
        observedMonths: 2,
        transactionCount: 38,
      },
      generatedAt: new Date('2026-04-10T00:00:00.000Z'),
    });
    verificationSnapshotModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439032'),
      ...payload,
      createdAt: payload.generatedAt,
      updatedAt: payload.generatedAt,
    }));

    const result = await service.generateSnapshotForCalenId(
      'calen-abcd-9999',
    );

    expect(accountsService.findIndividualByShareId).toHaveBeenCalledWith(
      'CALEN-ABCD-9999',
    );
    expect(result.verificationSnapshot.accountAuthenticityStatus).toBe(
      'likely_verified',
    );
    expect(result.verificationSnapshot.verificationOutcome).toBe(
      'verified_with_caution',
    );
    expect(result.verificationSnapshot.dataQuality).toBe('moderate');
  });

  it('returns unable_to_verify when no profile or bank evidence is available', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439023'),
      displayName: 'Alan Turing',
      emailVerifiedAt: null,
      profileId: {
        shareId: 'CALEN-EMPTY-0001',
      },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      completedSteps: [],
      identityVerificationStatus: 'not_started',
    });
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    scoresService.getLatestScore.mockResolvedValue(null);
    verificationSnapshotModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439033'),
      ...payload,
      createdAt: payload.generatedAt,
      updatedAt: payload.generatedAt,
    }));

    const result = await service.generateSnapshotForUser(
      '507f1f77bcf86cd799439023',
    );

    expect(result.verificationSnapshot.verificationOutcome).toBe(
      'unable_to_verify',
    );
    expect(result.verificationSnapshot.dataQuality).toBe('low');
    expect(result.verificationSnapshot.accountAuthenticityStatus).toBe(
      'unverified',
    );
  });

  it('throws when no CALEN profile matches the requested identifier', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue(null);

    await expect(
      service.generateSnapshotForCalenId('CALEN-MISSING-0001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
