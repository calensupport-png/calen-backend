import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Session, SessionDocument } from '../auth/schemas/session.schema';
import { EmailService } from '../email/email.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import {
  BankConnection,
  BankConnectionDocument,
} from '../onboarding/schemas/bank-connection.schema';
import {
  OnboardingState,
  OnboardingStateDocument,
} from '../onboarding/schemas/onboarding-state.schema';
import {
  TrustContact,
  TrustContactDocument,
} from '../onboarding/schemas/trust-contact.schema';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import {
  ReferralEvent,
  ReferralEventDocument,
} from './schemas/referral-event.schema';
import {
  ShareAccessLog,
  ShareAccessLogDocument,
} from './schemas/share-access-log.schema';
import { ShareLink, ShareLinkDocument } from './schemas/share-link.schema';
import { ScoresService } from '../scores/scores.service';
import {
  UserSettings,
  UserSettingsDocument,
} from './schemas/user-settings.schema';

const ACTIVE_BANK_CONNECTION_FILTER = {
  provider: { $ne: 'mock-open-banking' },
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly scoresService: ScoresService,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
    @InjectModel(TrustContact.name)
    private readonly trustContactModel: Model<TrustContactDocument>,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(UserSettings.name)
    private readonly userSettingsModel: Model<UserSettingsDocument>,
    @InjectModel(ShareLink.name)
    private readonly shareLinkModel: Model<ShareLinkDocument>,
    @InjectModel(ShareAccessLog.name)
    private readonly shareAccessLogModel: Model<ShareAccessLogDocument>,
    @InjectModel(ReferralEvent.name)
    private readonly referralEventModel: Model<ReferralEventDocument>,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const [
      onboardingState,
      bankConnections,
      trustContacts,
      notifications,
      settings,
      score,
      shareLinks,
      referrals,
    ] = await Promise.all([
      this.onboardingStateModel.findOne({ userId: userObjectId }),
      this.bankConnectionModel.find({
        userId: userObjectId,
        ...ACTIVE_BANK_CONNECTION_FILTER,
      }),
      this.trustContactModel.find({ userId: userObjectId }),
      this.ensureNotifications(user.id),
      this.ensureSettings(user.id),
      this.scoresService.getLatestScore(user.id),
      this.shareLinkModel.find({ userId: userObjectId, status: 'active' }),
      this.referralEventModel.find({ userId: userObjectId }),
    ]);

    const profile = account.profileId as
      | { shareId?: string; onboardingStatus?: string }
      | undefined;
    const unreadCount = notifications.filter((item) => !item.readAt).length;
    const connectedTrustCount = trustContacts.filter(
      (contact) => contact.status === 'request_sent',
    ).length;
    const connectedBankCount = this.countDistinctBankConnections(bankConnections);

    return {
      dashboard: {
        summary: {
          displayName: account.displayName,
          onboardingStatus: profile?.onboardingStatus ?? 'not_started',
          score: score?.score ?? null,
          scoreBand: score?.band ?? null,
          connectedBanks: connectedBankCount,
          trustedContacts: trustContacts.length,
          trustRequestsSent: connectedTrustCount,
          unreadNotifications: unreadCount,
          activeShareLinks: shareLinks.length,
          referralCount: referrals.length,
        },
        profileCompletion: {
          currentStep: onboardingState?.currentStep ?? 'personal_profile',
          completedSteps: onboardingState?.completedSteps ?? [],
          completedAt: onboardingState?.onboardingCompletedAt ?? null,
        },
        settings: this.serializeSettings(settings),
        shareId: profile?.shareId ?? null,
      },
    };
  }

  async getProfile(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const userObjectId = this.toObjectId(user.id);
    const onboardingState = await this.onboardingStateModel.findOne({
      userId: userObjectId,
    });
    const profile = account.profileId as
      | {
          shareId?: string;
          onboardingStatus?: string;
          onboardingCompletedAt?: Date;
        }
      | undefined;

    return {
      profile: {
        id: account.id,
        shareId: profile?.shareId ?? null,
        onboardingStatus: profile?.onboardingStatus ?? 'not_started',
        onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
        account: {
          email: account.email,
          displayName: account.displayName,
          firstName: account.firstName,
          lastName: account.lastName,
          phone: account.phone,
          country: account.country,
          jobTitle: account.jobTitle,
        },
        personalProfile: onboardingState?.personalProfile ?? null,
        employmentProfile: onboardingState?.employmentProfile ?? null,
        financialProfile: onboardingState?.financialProfile ?? null,
      },
    };
  }

  async getScore(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const score = await this.scoresService.getLatestScore(user.id);

    return {
      score: score
        ? score
        : {
            score: null,
            band: 'unavailable',
            status: 'pending_generation',
            factors: [],
            provider: 'calen-v1',
            generatedAt: null,
          },
    };
  }

  async getScoreHistory(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const history = await this.scoresService.getScoreHistory(user.id);

    return {
      history,
    };
  }

  async getTrustActivity(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    const trustContacts = await this.trustContactModel
      .find({ userId: userObjectId })
      .sort({ updatedAt: -1 });

    return {
      activity: trustContacts.map((contact) => ({
        id: String(contact._id),
        type: 'trust_contact',
        fullName: contact.fullName,
        relationship: contact.relationship,
        status: contact.status,
        requestedAt: contact.respondedAt ?? contact.requestedAt ?? null,
      })),
    };
  }

  async getInsights(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    const onboardingState = await this.onboardingStateModel.findOne({
      userId: userObjectId,
    });
    const bankConnections = await this.getActiveBankConnectionCount(userObjectId);
    const score = await this.scoresService.getLatestScore(user.id);

    const insights = [
      {
        id: 'insight-onboarding',
        title: 'Complete onboarding to strengthen your profile',
        type: 'readiness',
        status:
          onboardingState?.onboardingCompletedAt != null
            ? 'done'
            : 'action_needed',
      },
      {
        id: 'insight-banks',
        title:
          bankConnections > 0
            ? 'Your bank connection is active'
            : 'Connect a bank account to unlock richer score signals',
        type: 'banking',
        status: bankConnections > 0 ? 'healthy' : 'action_needed',
      },
      {
        id: 'insight-score',
        title: score
          ? `Your latest trust score is ${score.score}`
          : 'Generate your first trust score',
        type: 'score',
        status: score ? 'healthy' : 'action_needed',
      },
    ];

    return { insights };
  }

  async getLendingOffers(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const score = await this.scoresService.getLatestScore(user.id);
    const settings = await this.ensureSettings(user.id);

    if (!score || score.score == null || score.score < 500) {
      return {
        offers: [],
        eligibility: {
          status: 'limited',
          message:
            'Generate a stronger score to unlock matched lending offers.',
        },
      };
    }

    return {
      offers: [
        {
          id: 'starter-line',
          lenderName: 'Calen Capital Partners',
          amountRange: '$500 - $2,500',
          aprRange: '12% - 18%',
          repaymentTerm: '3 to 6 months',
          status: 'matched',
          visibility: settings.profileVisibility,
        },
      ],
      eligibility: {
        status: 'matched',
        message: 'You currently meet the baseline criteria for starter offers.',
      },
    };
  }

  async getNotifications(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const notifications = await this.ensureNotifications(user.id);

    return {
      notifications: notifications.map((notification) =>
        this.serializeNotification(notification),
      ),
    };
  }

  async markNotificationsRead(
    user: AuthenticatedUser,
    dto: MarkNotificationsReadDto,
  ) {
    this.assertIndividual(user);
    const now = new Date();
    const filter =
      dto.ids && dto.ids.length > 0
        ? { userId: user.id, _id: { $in: dto.ids } }
        : { userId: user.id, readAt: null };

    await this.notificationModel.updateMany(filter, {
      readAt: now,
    });

    return this.getNotifications(user);
  }

  async getSecurityLogins(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const sessions = await this.sessionModel
      .find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(10);

    return {
      logins: sessions.map((session) => ({
        id: session.sessionId,
        ipAddress: session.ipAddress ?? null,
        userAgent: session.userAgent ?? null,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt ?? null,
        revokedAt: session.revokedAt ?? null,
        expiresAt: session.expiresAt,
        status: session.revokedAt ? 'revoked' : 'active',
      })),
    };
  }

  async getSettings(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const settings = await this.ensureSettings(user.id);

    return {
      settings: this.serializeSettings(settings),
    };
  }

  async updateSettings(user: AuthenticatedUser, dto: UpdateSettingsDto) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    await this.ensureSettings(user.id);
    const settings = await this.userSettingsModel.findOneAndUpdate(
      { userId: userObjectId },
      dto,
      {
        new: true,
      },
    );

    return {
      settings: this.serializeSettings(settings),
    };
  }

  async createShareLink(user: AuthenticatedUser, dto: CreateShareLinkDto) {
    this.assertIndividual(user);
    const settings = await this.ensureSettings(user.id);
    const shareLink = await this.shareLinkModel.create({
      userId: new Types.ObjectId(user.id),
      token: this.generateShareToken(),
      label: dto.label,
      purpose: dto.purpose ?? settings.shareDefaultAccess,
      status: 'active',
      expiresAt: this.resolveExpiryDate(dto.expiresIn),
      accessCount: 0,
    });

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'share_link',
      title: 'Share link created',
      body: 'Your profile share link is active and ready to use.',
      metadata: {
        shareLinkId: String(shareLink._id),
      },
    });

    return {
      shareLink: this.serializeShareLink(shareLink),
    };
  }

  async getShareLinks(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    const shareLinks = await this.shareLinkModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    return {
      shareLinks: shareLinks.map((shareLink) =>
        this.serializeShareLink(shareLink),
      ),
    };
  }

  async revokeShareLink(user: AuthenticatedUser, shareLinkId: string) {
    this.assertIndividual(user);
    const userObjectId = this.toObjectId(user.id);
    const shareLink = await this.shareLinkModel.findOneAndUpdate(
      {
        _id: shareLinkId,
        userId: userObjectId,
      },
      {
        status: 'revoked',
        revokedAt: new Date(),
      },
      { new: true },
    );

    if (!shareLink) {
      throw new NotFoundException({
        code: 'SHARE_LINK_NOT_FOUND',
        message: 'Share link was not found for this user',
      });
    }

    return {
      shareLink: this.serializeShareLink(shareLink),
    };
  }

  async getShareAccessLog(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const accessLogs = await this.shareAccessLogModel
      .find({ ownerUserId: user.id })
      .sort({ accessedAt: -1 })
      .limit(50);

    return {
      accessLog: accessLogs.map((log) => ({
        id: String(log._id),
        shareLinkId: String(log.shareLinkId),
        ipAddress: log.ipAddress ?? null,
        userAgent: log.userAgent ?? null,
        accessedAt: log.accessedAt,
      })),
    };
  }

  async getReferrals(user: AuthenticatedUser) {
    this.assertIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const userObjectId = this.toObjectId(user.id);
    const profile = account.profileId as { shareId?: string } | undefined;
    const referrals = await this.referralEventModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    return {
      referrals: {
        code: this.buildReferralCode(profile?.shareId),
        stats: {
          total: referrals.length,
          converted: referrals.filter(
            (referral) => referral.status === 'converted',
          ).length,
        },
        events: referrals.map((referral) => ({
          id: String(referral._id),
          inviteeEmail: referral.inviteeEmail ?? null,
          status: referral.status,
          rewardStatus: referral.rewardStatus,
          source: referral.source ?? null,
          createdAt: referral.createdAt,
        })),
      },
    };
  }

  async createReferral(user: AuthenticatedUser, dto: CreateReferralDto) {
    this.assertIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const profile = account.profileId as { shareId?: string } | undefined;
    const referralCode = this.buildReferralCode(profile?.shareId);

    if (!referralCode) {
      throw new NotFoundException({
        code: 'REFERRAL_CODE_UNAVAILABLE',
        message: 'Referral code is not available for this account',
      });
    }

    const referral = await this.referralEventModel.create({
      userId: new Types.ObjectId(user.id),
      referralCode,
      inviteeEmail: dto.inviteeEmail.trim().toLowerCase(),
      source: dto.source ?? 'manual_invite',
      status: 'pending',
      rewardStatus: 'not_earned',
      note: dto.note,
    });

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'referral',
      title: 'Referral invite created',
      body: `We created a referral invite for ${referral.inviteeEmail}.`,
      metadata: {
        referralId: String(referral._id),
        referralCode,
      },
    });

    await this.emailService.sendReferralInviteEmail({
      to: referral.inviteeEmail ?? dto.inviteeEmail.trim().toLowerCase(),
      inviterName: account.displayName,
      referralCode,
    });

    return {
      referral: {
        id: String(referral._id),
        referralCode,
        inviteeEmail: referral.inviteeEmail ?? null,
        status: referral.status,
        rewardStatus: referral.rewardStatus,
        source: referral.source ?? null,
        createdAt: referral.createdAt ?? null,
      },
    };
  }

  async getSharedProfile(
    token: string,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const shareLink = await this.shareLinkModel.findOne({
      token,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (!shareLink) {
      throw new NotFoundException({
        code: 'SHARE_LINK_NOT_FOUND',
        message: 'Share link was not found or is no longer active',
      });
    }

    await this.recordShareLinkAccess(shareLink, requestMetadata);

    const ownerUserId = this.toObjectId(String(shareLink.userId));
    const owner = await this.accountsService.findUserByIdOrThrow(
      String(ownerUserId),
    );
    const onboardingState = await this.onboardingStateModel.findOne({
      userId: ownerUserId,
    });
    const score = await this.scoresService.getLatestScore(String(ownerUserId));

    const profile = owner.profileId as
      | { shareId?: string; onboardingStatus?: string }
      | undefined;

    return {
      sharedProfile: {
        owner: {
          displayName: owner.displayName,
          country: owner.country,
          jobTitle: owner.jobTitle,
        },
        share: {
          id: String(shareLink._id),
          label: shareLink.label ?? null,
          purpose: shareLink.purpose ?? null,
          token: shareLink.token,
          accessedAt: new Date(),
        },
        profile: {
          shareId: profile?.shareId ?? null,
          onboardingStatus: profile?.onboardingStatus ?? 'not_started',
          personalProfile: onboardingState?.personalProfile ?? null,
          employmentProfile: onboardingState?.employmentProfile ?? null,
          financialProfile: onboardingState?.financialProfile ?? null,
        },
        score: score ?? null,
      },
    };
  }

  private assertIndividual(user: AuthenticatedUser): void {
    if (user.accountType !== AccountType.INDIVIDUAL) {
      throw new ForbiddenException({
        code: 'INDIVIDUAL_ACCOUNT_REQUIRED',
        message: 'This endpoint is only available to individual accounts',
      });
    }
  }

  private async ensureNotifications(userId: string) {
    const userObjectId = this.toObjectId(userId);
    let notifications = await this.notificationModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    if (notifications.length > 0) {
      return notifications;
    }

    await this.notificationModel.create([
      {
        userId: new Types.ObjectId(userId),
        category: 'welcome',
        title: 'Your dashboard is ready',
        body: 'Finish onboarding to unlock your score, insights, and share links.',
      },
    ]);

    notifications = await this.notificationModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    return notifications;
  }

  private async recordShareLinkAccess(
    shareLink: ShareLinkDocument,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    await this.shareAccessLogModel.create({
      shareLinkId: shareLink._id as Types.ObjectId,
      ownerUserId: shareLink.userId as Types.ObjectId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      accessedAt: new Date(),
    });

    await this.shareLinkModel.findByIdAndUpdate(shareLink._id, {
      $inc: { accessCount: 1 },
      lastAccessedAt: new Date(),
    });

    if ((shareLink.accessCount ?? 0) === 0) {
      await this.notificationsService.createNotification({
        userId: String(shareLink.userId),
        category: 'share_link',
        title: 'Your share link was viewed',
        body: 'Someone opened your profile share link for the first time.',
        metadata: {
          shareLinkId: String(shareLink._id),
        },
      });
    }
  }

  private async ensureSettings(userId: string) {
    const userObjectId = this.toObjectId(userId);

    try {
      return await this.userSettingsModel.findOneAndUpdate(
        { userId: userObjectId },
        {
          $setOnInsert: {
            userId: userObjectId,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const existingSettings = await this.userSettingsModel.findOne({
          userId: userObjectId,
        });

        if (existingSettings) {
          return existingSettings;
        }
      }

      throw error;
    }
  }

  private async getActiveBankConnectionCount(userObjectId: Types.ObjectId) {
    const bankConnections = await this.bankConnectionModel
      .find({
        userId: userObjectId,
        ...ACTIVE_BANK_CONNECTION_FILTER,
      })
      .select('bankId bankName provider');

    return this.countDistinctBankConnections(bankConnections);
  }

  private countDistinctBankConnections(
    bankConnections: Array<{
      bankId?: string | null;
      bankName?: string | null;
      provider?: string | null;
    }>,
  ) {
    const uniqueConnections = new Set<string>();

    for (const bankConnection of bankConnections) {
      const provider = bankConnection.provider?.trim() || 'open-banking';
      const bankId = bankConnection.bankId?.trim();
      const bankName = bankConnection.bankName?.trim().toLowerCase();
      uniqueConnections.add(
        `${provider}::${bankId || bankName || 'connected-bank'}`,
      );
    }

    return uniqueConnections.size;
  }

  private serializeNotification(notification: NotificationDocument) {
    return {
      id: String(notification._id),
      category: notification.category,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata ?? null,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    };
  }

  private serializeSettings(settings: UserSettingsDocument | null) {
    return {
      marketingEmails: settings?.marketingEmails ?? true,
      productUpdates: settings?.productUpdates ?? true,
      securityAlerts: settings?.securityAlerts ?? true,
      pushNotifications: settings?.pushNotifications ?? false,
      profileVisibility: settings?.profileVisibility ?? 'trusted_parties_only',
      shareDefaultAccess: settings?.shareDefaultAccess ?? 'private',
    };
  }

  private serializeShareLink(shareLink: ShareLinkDocument) {
    return {
      id: String(shareLink._id),
      token: shareLink.token,
      label: shareLink.label ?? null,
      purpose: shareLink.purpose ?? null,
      status: shareLink.status,
      expiresAt: shareLink.expiresAt ?? null,
      revokedAt: shareLink.revokedAt ?? null,
      accessCount: shareLink.accessCount,
      lastAccessedAt: shareLink.lastAccessedAt ?? null,
      createdAt: shareLink.createdAt,
    };
  }

  private generateShareToken(): string {
    return `share_${randomBytes(8).toString('hex')}`;
  }

  private resolveExpiryDate(expiresIn?: string): Date | undefined {
    if (!expiresIn) {
      return undefined;
    }

    const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());

    if (!match) {
      return undefined;
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private buildReferralCode(shareId?: string): string | null {
    if (!shareId) {
      return null;
    }

    return shareId.replace('CALEN-', 'REF-');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private toObjectId(value: string): Types.ObjectId {
    return new Types.ObjectId(value);
  }
}
