import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { NotificationsService } from '../dashboard/notifications.service';
import { EmailService } from '../email/email.service';
import { ScoresService } from '../scores/scores.service';
import { OnboardingService } from './onboarding.service';
import { BankConnection } from './schemas/bank-connection.schema';
import { IdentityVerificationCase } from './schemas/identity-verification-case.schema';
import { OnboardingState } from './schemas/onboarding-state.schema';
import { TrustContact } from './schemas/trust-contact.schema';
import { UploadedDocument } from './schemas/uploaded-document.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    insertMany: jest.fn(),
  };
}

describe('OnboardingService', () => {
  let service: OnboardingService;
  const onboardingStateModel = createModelMock();
  const identityVerificationCaseModel = createModelMock();
  const uploadedDocumentModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const trustContactModel = createModelMock();
  const notificationsService = {
    createNotification: jest.fn(),
  };
  const emailService = {
    sendWelcomeEmail: jest.fn(),
  };
  const configService = {};
  const scoresService = {
    generateScore: jest.fn(),
  };
  const accountsService = {
    updateProfileOnboardingState: jest.fn(),
    findUserByIdOrThrow: jest.fn(),
  };

  const user = {
    id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    accountType: AccountType.INDIVIDUAL,
    roles: [],
    sessionId: 'session-id',
  };
  const userObjectId = new Types.ObjectId(user.id);

  beforeEach(async () => {
    jest.clearAllMocks();
    scoresService.generateScore.mockResolvedValue({
      id: 'score-run-1',
      score: 724,
      band: 'strong',
      status: 'ready',
      provider: 'calen-v1',
      generatedAt: new Date('2026-03-26T00:00:00.000Z'),
      factors: ['Income patterns have been consistent across most observed months.'],
    });
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      _id: user.id,
      email: user.email,
      firstName: 'Amina',
      emailVerifiedAt: new Date('2026-03-26T00:00:00.000Z'),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: AccountsService,
          useValue: accountsService,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: ScoresService,
          useValue: scoresService,
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
          provide: getModelToken(UploadedDocument.name),
          useValue: uploadedDocumentModel,
        },
        {
          provide: getModelToken(BankConnection.name),
          useValue: bankConnectionModel,
        },
        {
          provide: getModelToken(TrustContact.name),
          useValue: trustContactModel,
        },
      ],
    }).compile();

    service = moduleRef.get(OnboardingService);
  });

  it('creates a default onboarding state when one does not exist', async () => {
    const createdState = {
      userId: user.id,
      completedSteps: [],
      currentStep: 'personal_profile',
      identityVerificationStatus: 'not_started',
      scoreStatus: 'not_started',
    };

    onboardingStateModel.findOneAndUpdate.mockResolvedValueOnce(createdState);
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    uploadedDocumentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getOnboarding(user);

    expect(onboardingStateModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: userObjectId },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          userId: userObjectId,
          currentStep: 'personal_profile',
          identityVerificationStatus: 'not_started',
          scoreStatus: 'not_started',
        }),
      }),
      expect.objectContaining({ new: true, upsert: true }),
    );
    expect(result.onboarding.currentStep).toBe('personal_profile');
    expect(result.onboarding.completion).toEqual({ completed: 0, total: 7 });
  });

  it('falls back to the existing onboarding state when a duplicate-key race occurs', async () => {
    const existingState = {
      userId: user.id,
      completedSteps: ['personal_profile'],
      currentStep: 'identity_verification',
      personalProfile: { fullName: 'Amina Yusuf' },
      employmentProfile: null,
      financialProfile: null,
      identityVerificationStatus: 'not_started',
      scoreStatus: 'not_started',
      scoreRequestedAt: undefined,
      onboardingCompletedAt: undefined,
    };

    onboardingStateModel.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
    onboardingStateModel.findOne.mockResolvedValueOnce(existingState);
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    uploadedDocumentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getOnboarding(user);

    expect(onboardingStateModel.findOne).toHaveBeenCalledWith({
      userId: userObjectId,
    });
    expect(result.onboarding.currentStep).toBe('identity_verification');
  });

  it('updates personal profile and marks onboarding as in progress', async () => {
    const existingState = {
      completedSteps: [],
      currentStep: 'personal_profile',
    };
    const updatedState = {
      completedSteps: ['personal_profile'],
      currentStep: 'identity_verification',
      personalProfile: { fullName: 'Amina Yusuf' },
      employmentProfile: null,
      financialProfile: null,
      identityVerificationStatus: 'not_started',
      scoreStatus: 'not_started',
      scoreRequestedAt: undefined,
      onboardingCompletedAt: undefined,
    };

    onboardingStateModel.findOne.mockResolvedValueOnce(updatedState);
    onboardingStateModel.findOneAndUpdate
      .mockResolvedValueOnce(existingState)
      .mockResolvedValueOnce(updatedState)
      .mockResolvedValueOnce(updatedState);
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    uploadedDocumentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const result = await service.updatePersonalProfile(user, {
      fullName: 'Amina Yusuf',
    });

    expect(onboardingStateModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: userObjectId },
      expect.objectContaining({
        currentStep: 'identity_verification',
        completedSteps: ['personal_profile'],
      }),
      expect.objectContaining({ new: true, upsert: true }),
    );
    expect(accountsService.updateProfileOnboardingState).toHaveBeenCalledWith(
      user.id,
      {
        onboardingStatus: 'in_progress',
        onboardingCompletedAt: null,
      },
    );
    expect(result.personalProfile).toEqual({ fullName: 'Amina Yusuf' });
  });

  it('rejects onboarding endpoints for non-individual accounts', async () => {
    await expect(
      service.getOnboarding({
        ...user,
        accountType: AccountType.ORGANISATION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects onboarding endpoints for unverified individual accounts', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValueOnce({
      _id: user.id,
      email: user.email,
      emailVerifiedAt: null,
    });

    await expect(service.getOnboarding(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws when sending a trust request for a missing contact', async () => {
    trustContactModel.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(
      service.sendTrustRequest(user, 'missing-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a notification when score generation completes', async () => {
    const existingState = {
      completedSteps: ['personal_profile'],
      currentStep: 'generate_score',
    };
    const queuedState = {
      completedSteps: ['personal_profile', 'score_requested'],
      scoreStatus: 'queued',
      scoreRequestedAt: new Date('2026-03-26T00:00:00.000Z'),
      currentStep: 'generate_score',
      personalProfile: null,
      employmentProfile: null,
      financialProfile: null,
      identityVerificationStatus: 'pending_review',
      onboardingCompletedAt: undefined,
    };
    const readyState = {
      ...queuedState,
      scoreStatus: 'ready',
    };

    onboardingStateModel.findOne.mockResolvedValueOnce(readyState);
    onboardingStateModel.findOneAndUpdate
      .mockResolvedValueOnce(existingState)
      .mockResolvedValueOnce(queuedState)
      .mockResolvedValueOnce(queuedState)
      .mockResolvedValueOnce(readyState)
      .mockResolvedValueOnce(readyState);
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    uploadedDocumentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    await service.generateScore(user);

    expect(scoresService.generateScore).toHaveBeenCalledWith(
      user.id,
      new Date('2026-03-26T00:00:00.000Z'),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        category: 'score',
        title: 'Your CALEN score is ready',
      }),
    );
  });

  it('sends the welcome email once when onboarding becomes complete', async () => {
    const completedState = {
      completedSteps: [
        'personal_profile',
        'identity_verification',
        'employment_profile',
        'financial_profile',
        'bank_connection',
        'trust_contact',
      ],
      currentStep: 'generate_score',
      onboardingCompletedAt: undefined,
      welcomeEmailSentAt: undefined,
    };
    const queuedState = {
      ...completedState,
      completedSteps: [...completedState.completedSteps, 'score_requested'],
      scoreStatus: 'queued',
      scoreRequestedAt: new Date('2026-03-26T00:00:00.000Z'),
      onboardingCompletedAt: new Date('2026-03-26T00:00:00.000Z'),
      welcomeEmailSentAt: new Date('2026-03-26T00:00:00.000Z'),
      personalProfile: null,
      employmentProfile: null,
      financialProfile: null,
      identityVerificationStatus: 'pending_review',
    };
    const readyState = {
      ...queuedState,
      scoreStatus: 'ready',
    };

    onboardingStateModel.findOne.mockResolvedValueOnce(readyState);
    onboardingStateModel.findOneAndUpdate
      .mockResolvedValueOnce(completedState)
      .mockResolvedValueOnce(queuedState)
      .mockResolvedValueOnce(queuedState)
      .mockResolvedValueOnce(readyState)
      .mockResolvedValueOnce(readyState);
    identityVerificationCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    uploadedDocumentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    await service.generateScore(user);

    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith({
      to: user.email,
      firstName: 'Amina',
      accountType: 'individual',
    });
  });
});
