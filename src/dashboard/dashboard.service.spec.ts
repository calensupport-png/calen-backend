import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { Session } from '../auth/schemas/session.schema';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { OnboardingState } from '../onboarding/schemas/onboarding-state.schema';
import { TrustContact } from '../onboarding/schemas/trust-contact.schema';
import { DashboardService } from './dashboard.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';
import { Notification } from './schemas/notification.schema';
import { ReferralEvent } from './schemas/referral-event.schema';
import { ScoreSnapshot } from './schemas/score-snapshot.schema';
import { ShareAccessLog } from './schemas/share-access-log.schema';
import { ShareLink } from './schemas/share-link.schema';
import { UserSettings } from './schemas/user-settings.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  const onboardingStateModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const trustContactModel = createModelMock();
  const sessionModel = createModelMock();
  const notificationModel = createModelMock();
  const userSettingsModel = createModelMock();
  const shareLinkModel = createModelMock();
  const shareAccessLogModel = createModelMock();
  const referralEventModel = createModelMock();
  const scoreSnapshotModel = createModelMock();
  const notificationsService = {
    createNotification: jest.fn(),
  };
  const emailService = {
    sendReferralInviteEmail: jest.fn(),
  };
  const accountsService = {
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
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
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
          provide: getModelToken(OnboardingState.name),
          useValue: onboardingStateModel,
        },
        {
          provide: getModelToken(BankConnection.name),
          useValue: bankConnectionModel,
        },
        {
          provide: getModelToken(TrustContact.name),
          useValue: trustContactModel,
        },
        {
          provide: getModelToken(Session.name),
          useValue: sessionModel,
        },
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
        {
          provide: getModelToken(UserSettings.name),
          useValue: userSettingsModel,
        },
        {
          provide: getModelToken(ShareLink.name),
          useValue: shareLinkModel,
        },
        {
          provide: getModelToken(ShareAccessLog.name),
          useValue: shareAccessLogModel,
        },
        {
          provide: getModelToken(ReferralEvent.name),
          useValue: referralEventModel,
        },
        {
          provide: getModelToken(ScoreSnapshot.name),
          useValue: scoreSnapshotModel,
        },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('creates default settings when none exist', async () => {
    userSettingsModel.findOneAndUpdate.mockResolvedValueOnce({
      marketingEmails: true,
      productUpdates: true,
      securityAlerts: true,
      pushNotifications: false,
      profileVisibility: 'trusted_parties_only',
      shareDefaultAccess: 'private',
    });

    const result = await service.getSettings(user);

    expect(userSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: userObjectId },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          userId: userObjectId,
        }),
      }),
      expect.objectContaining({ new: true, upsert: true }),
    );
    expect(result.settings.profileVisibility).toBe('trusted_parties_only');
  });

  it('falls back to existing settings when a duplicate-key race occurs', async () => {
    userSettingsModel.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
    userSettingsModel.findOne.mockResolvedValueOnce({
      marketingEmails: true,
      productUpdates: true,
      securityAlerts: true,
      pushNotifications: false,
      profileVisibility: 'trusted_parties_only',
      shareDefaultAccess: 'private',
    });

    const result = await service.getSettings(user);

    expect(userSettingsModel.findOne).toHaveBeenCalledWith({
      userId: userObjectId,
    });
    expect(result.settings.shareDefaultAccess).toBe('private');
  });

  it('creates a score snapshot from onboarding data when score generation was requested', async () => {
    scoreSnapshotModel.findOne
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        sort: jest.fn().mockResolvedValue({
          _id: 'score-1',
          score: 565,
          band: 'building',
          factors: ['factor'],
          status: 'ready',
          provider: 'mock-score-engine',
          generatedAt: new Date('2026-03-26T00:00:00.000Z'),
        }),
      });
    onboardingStateModel.findOne.mockResolvedValue({
      scoreRequestedAt: new Date('2026-03-26T00:00:00.000Z'),
      completedSteps: ['personal_profile', 'financial_profile'],
      onboardingCompletedAt: null,
    });
    bankConnectionModel.countDocuments.mockResolvedValue(1);
    trustContactModel.countDocuments.mockResolvedValue(1);
    scoreSnapshotModel.create.mockResolvedValue({
      _id: 'score-1',
      score: 565,
      band: 'building',
      factors: ['factor'],
      status: 'ready',
      provider: 'mock-score-engine',
      generatedAt: new Date('2026-03-26T00:00:00.000Z'),
    });

    const result = await service.getScore(user);

    expect(scoreSnapshotModel.create).toHaveBeenCalled();
    expect(result.score.score).toBe(565);
  });

  it('rejects dashboard endpoints for non-individual accounts', async () => {
    await expect(
      service.getDashboard({
        ...user,
        accountType: AccountType.ORGANISATION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when revoking a missing share link', async () => {
    shareLinkModel.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(
      service.revokeShareLink(user, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads share links using the user ObjectId filter', async () => {
    shareLinkModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: 'share-1',
          token: 'share_token',
          label: 'Full Profile',
          purpose: 'full_profile',
          status: 'active',
          expiresAt: new Date('2026-04-25T12:18:11.578Z'),
          revokedAt: null,
          accessCount: 0,
          lastAccessedAt: null,
          createdAt: new Date('2026-03-26T12:18:11.578Z'),
        },
      ]),
    });

    const result = await service.getShareLinks(user);

    expect(shareLinkModel.find).toHaveBeenCalledWith({ userId: userObjectId });
    expect(result.shareLinks).toHaveLength(1);
    expect(result.shareLinks[0].token).toBe('share_token');
  });

  it('creates a referral invite and notification', async () => {
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      profileId: { shareId: 'CALEN-ABCD-1234' },
    });
    referralEventModel.create.mockResolvedValue({
      _id: 'ref-1',
      inviteeEmail: 'friend@example.com',
      status: 'pending',
      rewardStatus: 'not_earned',
      source: 'manual_invite',
      createdAt: new Date('2026-03-26T00:00:00.000Z'),
    });

    const result = await service.createReferral(user, {
      inviteeEmail: 'friend@example.com',
    });

    expect(referralEventModel.create).toHaveBeenCalled();
    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(emailService.sendReferralInviteEmail).toHaveBeenCalledWith({
      to: 'friend@example.com',
      inviterName: undefined,
      referralCode: 'REF-ABCD-1234',
    });
    expect(result.referral.referralCode).toBe('REF-ABCD-1234');
  });

  it('records share link access and returns shared profile data', async () => {
    shareLinkModel.findOne.mockResolvedValue({
      _id: 'share-1',
      userId: '507f1f77bcf86cd799439099',
      label: 'Primary share',
      purpose: 'lender_review',
      token: 'share_token',
      accessCount: 0,
      status: 'active',
    });
    shareAccessLogModel.create.mockResolvedValue({});
    shareLinkModel.findByIdAndUpdate.mockResolvedValue({});
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      displayName: 'Amina Yusuf',
      country: 'NG',
      jobTitle: 'Analyst',
      profileId: { shareId: 'CALEN-ABCD-1234', onboardingStatus: 'completed' },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      personalProfile: { fullName: 'Amina Yusuf' },
      employmentProfile: { employerName: 'Calen', monthlyIncome: 3200 },
      financialProfile: { monthlyExpenses: 1200 },
    });
    scoreSnapshotModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        _id: 'score-1',
        score: 710,
        band: 'strong',
        factors: ['Completed onboarding'],
        status: 'ready',
        provider: 'mock-score-engine',
        generatedAt: new Date('2026-03-26T00:00:00.000Z'),
      }),
    });

    const result = await service.getSharedProfile('share_token', {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(shareAccessLogModel.create).toHaveBeenCalled();
    expect(shareLinkModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(onboardingStateModel.findOne).toHaveBeenCalledWith({
      userId: new Types.ObjectId('507f1f77bcf86cd799439099'),
    });
    expect(scoreSnapshotModel.findOne).toHaveBeenCalledWith({
      userId: new Types.ObjectId('507f1f77bcf86cd799439099'),
    });
    expect(result.sharedProfile.owner.displayName).toBe('Amina Yusuf');
    expect(result.sharedProfile.profile.personalProfile).toEqual({
      fullName: 'Amina Yusuf',
    });
    expect(result.sharedProfile.profile.employmentProfile).toEqual({
      employerName: 'Calen',
      monthlyIncome: 3200,
    });
    expect(result.sharedProfile.profile.financialProfile).toEqual({
      monthlyExpenses: 1200,
    });
    expect(result.sharedProfile.score?.score).toBe(710);
  });
});
