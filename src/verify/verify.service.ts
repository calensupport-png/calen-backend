import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import {
  BankConnection,
  BankConnectionDocument,
} from '../onboarding/schemas/bank-connection.schema';
import {
  IdentityVerificationCase,
  IdentityVerificationCaseDocument,
} from '../onboarding/schemas/identity-verification-case.schema';
import {
  OnboardingState,
  OnboardingStateDocument,
} from '../onboarding/schemas/onboarding-state.schema';
import { ScoresService } from '../scores/scores.service';
import {
  buildUnderwritingScoreSnapshot,
  getUnderwritingComponentScore,
} from '../underwriting/underwriting-shared';
import {
  VerificationSnapshot,
  VerificationSnapshotDocument,
} from './schemas/verification-snapshot.schema';

type LatestScorePayload = Awaited<ReturnType<ScoresService['getLatestScore']>>;
export type VerificationSnapshotView = {
  snapshotId: string;
  calenId: string;
  subjectName: string;
  engineVersion: string;
  accountAuthenticityStatus: 'verified' | 'likely_verified' | 'unverified';
  ownershipConfidence: 'high' | 'moderate' | 'low';
  ownershipConfidenceScore: number;
  activeAccountStatus: 'active' | 'limited_activity' | 'inactive';
  incomePatternConfirmation:
    | 'confirmed'
    | 'partially_confirmed'
    | 'not_confirmed';
  cashflowConsistencyIndicator: 'consistent' | 'mixed' | 'inconsistent';
  dataQuality: 'high' | 'moderate' | 'low';
  confidenceLevel: 'high' | 'moderate' | 'low';
  confidenceScore: number | null;
  verificationOutcome:
    | 'verified'
    | 'verified_with_caution'
    | 'unable_to_verify';
  summary: string | null;
  strengths: string[];
  cautionFlags: string[];
  evidence: {
    identityVerificationStatus: string;
    completedStepCount: number;
    connectedAccountCount: number;
    activeAccountCount: number;
    mostRecentBankSyncAt: Date | null;
    observedMonths: number;
    transactionCount: number;
    bankProviders: string[];
  };
  generatedAt: Date;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const ACTIVE_BANK_SYNC_WINDOW_DAYS = 45;
const VERIFY_ENGINE_VERSION = 'v1.phase2';
const APPROVED_IDENTITY_STATUSES = new Set([
  'approved',
  'verified',
  'completed',
]);
const REVIEWING_IDENTITY_STATUSES = new Set([
  'pending_review',
  'submitted',
  'in_review',
  'pending',
]);

@Injectable()
export class VerifyService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly scoresService: ScoresService,
    @InjectModel(VerificationSnapshot.name)
    private readonly verificationSnapshotModel: Model<VerificationSnapshotDocument>,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(IdentityVerificationCase.name)
    private readonly identityVerificationCaseModel: Model<IdentityVerificationCaseDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
  ) {}

  async generateSnapshotForUser(userId: string) {
    const account = await this.accountsService.findUserByIdOrThrow(userId);
    const profile = account.profileId as
      | {
          shareId?: string;
        }
      | undefined;

    if (!profile?.shareId) {
      throw new NotFoundException({
        code: 'VERIFY_PROFILE_NOT_FOUND',
        message: 'A CALEN profile is required before verification can run.',
      });
    }

    return this.createSnapshotFromAccount(account, profile.shareId);
  }

  async generateSnapshotForCalenId(calenId: string) {
    const normalizedCalenId = calenId.trim().toUpperCase();
    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      throw new NotFoundException({
        code: 'VERIFY_PROFILE_NOT_FOUND',
        message: 'No CALEN profile matched that identifier.',
      });
    }

    return this.createSnapshotFromAccount(account, normalizedCalenId);
  }

  async getLatestSnapshotForUser(userId: string) {
    const snapshot = await this.verificationSnapshotModel
      .findOne({ userId: this.toObjectId(userId) })
      .sort({ generatedAt: -1 });

    return snapshot
      ? { verificationSnapshot: this.serializeSnapshot(snapshot) }
      : null;
  }

  private async createSnapshotFromAccount(
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>,
    calenId: string,
  ) {
    const userId = String(account._id);
    const [onboardingState, identityVerificationCase, bankConnections, latestScore] =
      await Promise.all([
        this.onboardingStateModel.findOne({ userId: this.toObjectId(userId) }),
        this.identityVerificationCaseModel
          .findOne({ userId: this.toObjectId(userId) })
          .sort({ createdAt: -1 }),
        this.bankConnectionModel
          .find({ userId: this.toObjectId(userId) })
          .sort({ createdAt: -1 }),
        this.scoresService.getLatestScore(userId),
      ]);

    const generatedAt = new Date();
    const snapshotInput = this.buildSnapshotInput({
      account,
      calenId,
      onboardingState,
      identityVerificationCase,
      bankConnections,
      latestScore,
      generatedAt,
    });

    const createdSnapshot = await this.verificationSnapshotModel.create(
      snapshotInput,
    );

    return {
      verificationSnapshot: this.serializeSnapshot(createdSnapshot),
    };
  }

  private buildSnapshotInput(input: {
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;
    calenId: string;
    onboardingState: OnboardingStateDocument | null;
    identityVerificationCase: IdentityVerificationCaseDocument | null;
    bankConnections: BankConnectionDocument[];
    latestScore: LatestScorePayload;
    generatedAt: Date;
  }) {
    const connectedAccounts = input.bankConnections.filter(
      (connection) => connection.status === 'connected',
    );
    const activeAccounts = connectedAccounts.filter((connection) =>
      this.isRecentlySynced(connection.lastSyncedAt ?? connection.connectedAt),
    );
    const scoreSnapshot = buildUnderwritingScoreSnapshot(input.latestScore);
    const incomeReliabilityScore = getUnderwritingComponentScore(
      scoreSnapshot,
      'income_reliability',
    );
    const cashFlowStabilityScore = getUnderwritingComponentScore(
      scoreSnapshot,
      'cash_flow_stability',
    );
    const rawVolatilityScore = getUnderwritingComponentScore(
      scoreSnapshot,
      'financial_volatility',
    );
    const identityVerificationStatus =
      input.identityVerificationCase?.status ??
      input.onboardingState?.identityVerificationStatus ??
      'not_started';
    const observedMonths =
      input.latestScore?.inputWindow?.observedMonths ?? 0;
    const transactionCount =
      input.latestScore?.inputWindow?.transactionCount ?? 0;
    const completedStepCount =
      input.onboardingState?.completedSteps.length ?? 0;
    const ownershipConfidenceScore = this.getOwnershipConfidenceScore({
      account: input.account,
      identityVerificationStatus,
      connectedAccounts,
      activeAccounts,
    });
    const ownershipConfidence =
      ownershipConfidenceScore >= 75
        ? 'high'
        : ownershipConfidenceScore >= 45
          ? 'moderate'
          : 'low';
    const activeAccountStatus =
      activeAccounts.length > 0
        ? 'active'
        : connectedAccounts.length > 0
          ? 'limited_activity'
          : 'inactive';
    const accountAuthenticityStatus =
      APPROVED_IDENTITY_STATUSES.has(identityVerificationStatus) &&
      activeAccounts.length > 0
        ? 'verified'
        : (REVIEWING_IDENTITY_STATUSES.has(identityVerificationStatus) &&
              connectedAccounts.length > 0) ||
            activeAccounts.length > 0 ||
            ownershipConfidenceScore >= 45
          ? 'likely_verified'
          : 'unverified';
    const incomePatternConfirmation =
      incomeReliabilityScore != null &&
      incomeReliabilityScore >= 70 &&
      observedMonths >= 3
        ? 'confirmed'
        : incomeReliabilityScore != null &&
            (incomeReliabilityScore >= 50 || connectedAccounts.length > 0)
          ? 'partially_confirmed'
          : 'not_confirmed';
    const cashflowConsistencyIndicator =
      cashFlowStabilityScore != null &&
      cashFlowStabilityScore >= 70 &&
      (rawVolatilityScore == null || rawVolatilityScore < 40)
        ? 'consistent'
        : cashFlowStabilityScore != null &&
            (cashFlowStabilityScore >= 50 || connectedAccounts.length > 0)
          ? 'mixed'
          : 'inconsistent';
    const dataQuality =
      scoreSnapshot.confidenceLevel === 'high' &&
      activeAccounts.length > 0 &&
      observedMonths >= 3 &&
      transactionCount >= 50
        ? 'high'
        : connectedAccounts.length > 0 &&
            (observedMonths >= 2 || transactionCount >= 25)
          ? 'moderate'
          : 'low';
    const confidenceLevel =
      scoreSnapshot.confidenceLevel === 'high' ||
      scoreSnapshot.confidenceLevel === 'moderate' ||
      scoreSnapshot.confidenceLevel === 'low'
        ? scoreSnapshot.confidenceLevel
        : dataQuality === 'high'
          ? 'high'
          : dataQuality === 'moderate'
            ? 'moderate'
            : 'low';
    const confidenceScore =
      typeof scoreSnapshot.confidenceScore === 'number'
        ? scoreSnapshot.confidenceScore
        : confidenceLevel === 'high'
          ? 82
          : confidenceLevel === 'moderate'
            ? 61
            : 34;
    const verificationOutcome =
      accountAuthenticityStatus === 'verified' &&
      ownershipConfidence === 'high' &&
      activeAccountStatus === 'active' &&
      incomePatternConfirmation === 'confirmed' &&
      dataQuality !== 'low'
        ? 'verified'
        : activeAccountStatus !== 'inactive' &&
            (accountAuthenticityStatus !== 'unverified' ||
              incomePatternConfirmation !== 'not_confirmed' ||
              dataQuality !== 'low')
          ? 'verified_with_caution'
          : 'unable_to_verify';

    const strengths = this.uniqueStrings([
      accountAuthenticityStatus === 'verified'
        ? 'Identity verification and active bank connectivity support account authenticity.'
        : null,
      ownershipConfidence === 'high'
        ? 'Ownership confidence is high based on identity and bank-link evidence.'
        : null,
      activeAccountStatus === 'active'
        ? 'At least one connected account shows recent activity.'
        : null,
      incomePatternConfirmation === 'confirmed'
        ? 'Income patterns are visible across the observed bank history.'
        : null,
      cashflowConsistencyIndicator === 'consistent'
        ? 'Cash-flow behaviour appears consistent across the observed period.'
        : null,
      dataQuality === 'high'
        ? 'Data depth and confidence are strong enough for a durable verification snapshot.'
        : null,
    ]).slice(0, 4);

    const cautionFlags = this.uniqueStrings([
      accountAuthenticityStatus === 'unverified'
        ? 'Account authenticity could not be established from the available signals.'
        : null,
      ownershipConfidence === 'low'
        ? 'Ownership confidence is limited and should be treated cautiously.'
        : null,
      activeAccountStatus !== 'active'
        ? 'No recently active connected account was available at verification time.'
        : null,
      incomePatternConfirmation === 'not_confirmed'
        ? 'Income patterns could not be confirmed from the available bank history.'
        : null,
      cashflowConsistencyIndicator === 'inconsistent'
        ? 'Cash-flow consistency remains too uneven for a clean verification.'
        : null,
      dataQuality === 'low'
        ? 'Data quality is low because the observed history or connectivity is limited.'
        : null,
    ]).slice(0, 4);

    return {
      userId: this.toObjectId(String(input.account._id)),
      calenId: input.calenId,
      subjectName: input.account.displayName,
      engineVersion: VERIFY_ENGINE_VERSION,
      accountAuthenticityStatus,
      ownershipConfidence,
      ownershipConfidenceScore,
      activeAccountStatus,
      incomePatternConfirmation,
      cashflowConsistencyIndicator,
      dataQuality,
      confidenceLevel,
      confidenceScore,
      verificationOutcome,
      summary: this.buildSummary(verificationOutcome),
      strengths,
      cautionFlags,
      evidence: {
        identityVerificationStatus,
        completedStepCount,
        connectedAccountCount: connectedAccounts.length,
        activeAccountCount: activeAccounts.length,
        mostRecentBankSyncAt: connectedAccounts.reduce<Date | null>(
          (latest, connection) => {
            const candidate = connection.lastSyncedAt ?? connection.connectedAt;
            if (!candidate) return latest;
            return latest == null || candidate > latest ? candidate : latest;
          },
          null,
        ),
        observedMonths,
        transactionCount,
        bankProviders: Array.from(
          new Set(
            connectedAccounts
              .map((connection) => connection.provider?.trim())
              .filter(Boolean),
          ),
        ),
      },
      generatedAt: input.generatedAt,
    };
  }

  private getOwnershipConfidenceScore(input: {
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;
    identityVerificationStatus: string;
    connectedAccounts: BankConnectionDocument[];
    activeAccounts: BankConnectionDocument[];
  }) {
    const hasBankIdentitySignals = input.connectedAccounts.some(
      (connection) =>
        Boolean(connection.providerAccountId?.trim()) ||
        Boolean(connection.accountMask?.trim()),
    );

    return this.clampScore(
      20 +
        (APPROVED_IDENTITY_STATUSES.has(input.identityVerificationStatus)
          ? 40
          : REVIEWING_IDENTITY_STATUSES.has(input.identityVerificationStatus)
            ? 20
            : 0) +
        (input.activeAccounts.length > 0 ? 20 : input.connectedAccounts.length > 0 ? 10 : 0) +
        (hasBankIdentitySignals ? 10 : 0) +
        (input.account.emailVerifiedAt ? 10 : 0),
    );
  }

  private isRecentlySynced(candidate: Date | undefined) {
    if (!candidate) {
      return false;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ACTIVE_BANK_SYNC_WINDOW_DAYS);
    return candidate >= cutoff;
  }

  private buildSummary(
    verificationOutcome:
      | 'verified'
      | 'verified_with_caution'
      | 'unable_to_verify',
  ) {
    if (verificationOutcome === 'verified') {
      return 'Verification signals are strong enough to treat the profile as verified.';
    }

    if (verificationOutcome === 'verified_with_caution') {
      return 'Verification signals are present, but some caution remains before relying on this profile alone.';
    }

    return 'The available signals are not strong enough to verify this profile confidently.';
  }

  private serializeSnapshot(
    snapshot: VerificationSnapshotDocument,
  ): VerificationSnapshotView {
    return {
      snapshotId: String(snapshot._id),
      calenId: snapshot.calenId,
      subjectName: snapshot.subjectName,
      engineVersion: snapshot.engineVersion,
      accountAuthenticityStatus: snapshot.accountAuthenticityStatus,
      ownershipConfidence: snapshot.ownershipConfidence,
      ownershipConfidenceScore: snapshot.ownershipConfidenceScore,
      activeAccountStatus: snapshot.activeAccountStatus,
      incomePatternConfirmation: snapshot.incomePatternConfirmation,
      cashflowConsistencyIndicator: snapshot.cashflowConsistencyIndicator,
      dataQuality: snapshot.dataQuality,
      confidenceLevel: snapshot.confidenceLevel,
      confidenceScore: snapshot.confidenceScore ?? null,
      verificationOutcome: snapshot.verificationOutcome,
      summary: snapshot.summary ?? null,
      strengths: Array.isArray(snapshot.strengths) ? snapshot.strengths : [],
      cautionFlags: Array.isArray(snapshot.cautionFlags)
        ? snapshot.cautionFlags
        : [],
      evidence: {
        identityVerificationStatus:
          snapshot.evidence?.identityVerificationStatus ?? 'not_started',
        completedStepCount: snapshot.evidence?.completedStepCount ?? 0,
        connectedAccountCount: snapshot.evidence?.connectedAccountCount ?? 0,
        activeAccountCount: snapshot.evidence?.activeAccountCount ?? 0,
        mostRecentBankSyncAt: snapshot.evidence?.mostRecentBankSyncAt ?? null,
        observedMonths: snapshot.evidence?.observedMonths ?? 0,
        transactionCount: snapshot.evidence?.transactionCount ?? 0,
        bankProviders: Array.isArray(snapshot.evidence?.bankProviders)
          ? snapshot.evidence.bankProviders
          : [],
      },
      generatedAt: snapshot.generatedAt,
      createdAt: snapshot.createdAt ?? null,
      updatedAt: snapshot.updatedAt ?? null,
    };
  }

  private uniqueStrings(values: Array<string | null>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  }

  private clampScore(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
