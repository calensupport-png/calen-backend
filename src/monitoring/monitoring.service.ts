import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import { NotificationsService } from '../dashboard/notifications.service';
import {
  BankConnection,
  BankConnectionDocument,
} from '../onboarding/schemas/bank-connection.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { PassportPurpose } from '../passport/passport.constants';
import {
  PassportGrant,
  PassportGrantDocument,
} from '../passport/schemas/passport-grant.schema';
import { ScoresService } from '../scores/scores.service';
import {
  buildUnderwritingScoreSnapshot,
  getUnderwritingComponentScore,
} from '../underwriting/underwriting-shared';
import {
  UnderwritingCase,
  UnderwritingCaseDocument,
} from '../underwriting/schemas/underwriting-case.schema';
import {
  MonitoringAlert,
  MonitoringAlertDocument,
} from './schemas/monitoring-alert.schema';
import {
  MonitoringEnrollment,
  MonitoringEnrollmentDocument,
} from './schemas/monitoring-enrollment.schema';
import {
  MonitoringSnapshot,
  MonitoringSnapshotDocument,
} from './schemas/monitoring-snapshot.schema';
import {
  MonitoringWebhookDelivery,
  MonitoringWebhookDeliveryDocument,
} from './schemas/monitoring-webhook-delivery.schema';

type CanonicalTransaction = {
  bookedAt: Date;
  amount: number;
};

type MonitoringMetrics = {
  score: number | null;
  riskLevel: string | null;
  affordabilityScore: number | null;
  resilienceScore: number | null;
  confidenceLevel: string | null;
  debtPressureIndicator: string | null;
  volatilitySignal: string | null;
  recommendationOutcome: string | null;
  averageMonthlyInflow: number | null;
  incomeReliabilityScore: number | null;
  obligationConsistencyScore: number | null;
  balanceResilienceScore: number | null;
};

type MonitoringComparisonSource = Partial<MonitoringMetrics>;

type MonitoringScoreHistoryPoint = {
  month: string;
  avg: number;
  min: number;
  max: number;
  profiles: number;
};

type MonitoringBehaviourTrendPoint = {
  month: string;
  income: number;
  payments: number;
  resilience: number;
  affordability: number;
  monthlyInflow: number;
};

type MonitoringTrendSummary = {
  refreshedProfiles: number;
  improvingProfiles: number;
  decliningProfiles: number;
  stableProfiles: number;
  currentAverageScore: number | null;
  previousAverageScore: number | null;
  scoreDelta: number | null;
  averageAffordability: number | null;
  averageResilience: number | null;
  averageMonthlyInflow: number | null;
  alertCoverageCount: number;
  highSeverityAlerts: number;
  mediumSeverityAlerts: number;
  lastRefreshedAt: Date | null;
  riskDistribution: Array<{ level: string; count: number }>;
  alertBreakdown: Array<{ type: string; label: string; count: number }>;
};

type MonitoringWebhookEventType =
  | 'monitoring_alert_triggered'
  | 'monitoring_alert_resolved';

type MonitoringWebhookConfig = {
  enabled: boolean;
  url: string | null;
  secret: string | null;
  subscriptions: MonitoringWebhookEventType[];
};

const PORTFOLIO_MONITORING_PURPOSE: PassportPurpose =
  'portfolio_monitoring_review';
const MONITORING_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight = false;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly notificationsService: NotificationsService,
    private readonly organizationsService: OrganizationsService,
    private readonly scoresService: ScoresService,
    @InjectModel(MonitoringEnrollment.name)
    private readonly monitoringEnrollmentModel: Model<MonitoringEnrollmentDocument>,
    @InjectModel(MonitoringSnapshot.name)
    private readonly monitoringSnapshotModel: Model<MonitoringSnapshotDocument>,
    @InjectModel(MonitoringAlert.name)
    private readonly monitoringAlertModel: Model<MonitoringAlertDocument>,
    @InjectModel(MonitoringWebhookDelivery.name)
    private readonly monitoringWebhookDeliveryModel: Model<MonitoringWebhookDeliveryDocument>,
    @InjectModel(UnderwritingCase.name)
    private readonly underwritingCaseModel: Model<UnderwritingCaseDocument>,
    @InjectModel(PassportGrant.name)
    private readonly passportGrantModel: Model<PassportGrantDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.runScheduledRefresh();
    }, MONITORING_REFRESH_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async getPortfolio(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const [enrollments, snapshots, alerts] = await Promise.all([
      this.monitoringEnrollmentModel
        .find({
          organizationId,
          status: { $ne: 'ended' },
        })
        .sort({ enrolledAt: -1 }),
      this.monitoringSnapshotModel
        .find({ organizationId })
        .sort({ generatedAt: 1 }),
      this.monitoringAlertModel
        .find({
          organizationId,
          status: 'active',
        })
        .sort({ triggeredAt: -1 }),
    ]);

    const snapshotsByEnrollment = this.groupSnapshotsByEnrollment(snapshots);
    const latestSnapshots = new Map<string, MonitoringSnapshotDocument>();
    for (const [enrollmentId, enrollmentSnapshots] of snapshotsByEnrollment) {
      const latestSnapshot = enrollmentSnapshots[enrollmentSnapshots.length - 1];
      if (latestSnapshot) {
        latestSnapshots.set(enrollmentId, latestSnapshot);
      }
    }

    const activeEnrollments = enrollments.filter(
      (enrollment) => enrollment.status === 'active',
    );
    const activeEnrollmentIds = new Set(
      activeEnrollments.map((enrollment) => String(enrollment._id)),
    );
    const consentBacked = enrollments.filter(
      (enrollment) => enrollment.source === 'passport_consent',
    );
    const approvedBacked = enrollments.filter(
      (enrollment) => enrollment.source === 'underwriting_approval',
    );
    const activeAlerts = alerts.filter((alert) =>
      activeEnrollmentIds.has(String(alert.enrollmentId)),
    );
    const currentSnapshots = activeEnrollments
      .map((enrollment) => latestSnapshots.get(String(enrollment._id)))
      .filter((snapshot): snapshot is MonitoringSnapshotDocument => snapshot != null);
    const summary = this.buildTrendSummary(
      activeEnrollments,
      currentSnapshots,
      snapshotsByEnrollment,
      activeAlerts,
    );
    const scoreHistory = this.buildScoreHistory(snapshots);
    const behaviourTrends = this.buildBehaviourTrends(snapshots);

    return {
      portfolio: {
        metrics: [
          {
            label: 'Monitored Profiles',
            value: String(activeEnrollments.length),
            change: `${approvedBacked.length} approval-backed / ${consentBacked.length} consent-backed`,
            up: true,
          },
          {
            label: 'Portfolio Trend',
            value: String(summary.improvingProfiles),
            change: `${summary.decliningProfiles} declining, ${summary.stableProfiles} stable`,
            up: summary.decliningProfiles <= summary.improvingProfiles,
          },
          {
            label: 'Avg Current Score',
            value:
              summary.currentAverageScore != null
                ? String(summary.currentAverageScore)
                : '—',
            change:
              summary.scoreDelta == null
                ? `${summary.refreshedProfiles} live snapshot${summary.refreshedProfiles === 1 ? '' : 's'}`
                : `${summary.scoreDelta >= 0 ? '+' : ''}${summary.scoreDelta} vs prior baseline`,
            up:
              summary.currentAverageScore == null ||
              summary.scoreDelta == null ||
              summary.scoreDelta >= 0,
          },
          {
            label: 'Risk Alerts',
            value: String(activeAlerts.length),
            change: `${summary.highSeverityAlerts} high / ${summary.mediumSeverityAlerts} medium`,
            up: activeAlerts.length === 0 || summary.highSeverityAlerts === 0,
          },
        ],
        scoreHistory,
        behaviourTrends,
        summary: {
          refreshedProfiles: summary.refreshedProfiles,
          improvingProfiles: summary.improvingProfiles,
          decliningProfiles: summary.decliningProfiles,
          stableProfiles: summary.stableProfiles,
          currentAverageScore: summary.currentAverageScore,
          previousAverageScore: summary.previousAverageScore,
          scoreDelta: summary.scoreDelta,
          averageAffordability: summary.averageAffordability,
          averageResilience: summary.averageResilience,
          averageMonthlyInflow: summary.averageMonthlyInflow,
          alertCoverageCount: summary.alertCoverageCount,
          highSeverityAlerts: summary.highSeverityAlerts,
          mediumSeverityAlerts: summary.mediumSeverityAlerts,
          lastRefreshedAt: summary.lastRefreshedAt,
          riskDistribution: summary.riskDistribution,
          alertBreakdown: summary.alertBreakdown,
        },
        riskAlerts: activeAlerts.slice(0, 8).map((alert) => ({
          borrower: alert.subjectName,
          id: alert.calenId,
          title: alert.title,
          alert: alert.detail,
          type: alert.alertType,
          severity: alert.severity,
          time: this.describeAlertTime(alert.triggeredAt),
        })),
        enrollments: enrollments.map((enrollment) =>
          this.serializeEnrollment(
            enrollment,
            latestSnapshots.get(String(enrollment._id)) ?? null,
          ),
        ),
      },
    };
  }

  async createEnrollment(user: AuthenticatedUser, calenId: string) {
    this.assertOrganization(user);
    const normalizedCalenId = calenId.trim().toUpperCase();
    const organizationId = this.toObjectId(user.organizationId!);
    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      throw new NotFoundException({
        code: 'MONITORING_PROFILE_NOT_FOUND',
        message: 'No CALEN profile matched that identifier.',
      });
    }

    const subjectUserId = this.toObjectId(String(account._id));
    const existingEnrollment = await this.monitoringEnrollmentModel.findOne({
      organizationId,
      subjectUserId,
      status: { $ne: 'ended' },
    });

    if (existingEnrollment) {
      throw new ConflictException({
        code: 'MONITORING_ENROLLMENT_EXISTS',
        message:
          'That profile is already enrolled for monitoring in this organisation.',
      });
    }

    const [approvedCase, consentGrant] = await Promise.all([
      this.underwritingCaseModel
        .findOne({
          organizationId,
          subjectUserId,
          stage: 'approved',
        })
        .sort({ updatedAt: -1, createdAt: -1 }),
      this.passportGrantModel
        .findOne({
          ownerUserId: subjectUserId,
          organizationId,
          purpose: PORTFOLIO_MONITORING_PURPOSE,
          status: 'active',
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        })
        .sort({ createdAt: -1 }),
    ]);

    if (!approvedCase && !consentGrant) {
      throw new ForbiddenException({
        code: 'MONITORING_ENROLLMENT_NOT_ELIGIBLE',
        message:
          'Monitoring enrollment requires either an approved underwriting case or an active Passport consent for portfolio monitoring.',
      });
    }

    const source = approvedCase ? 'underwriting_approval' : 'passport_consent';
    const createdEnrollment = await this.monitoringEnrollmentModel.create({
      organizationId,
      subjectUserId,
      enrolledByUserId: this.toObjectId(user.id),
      enrollmentId: this.generateEnrollmentId(),
      calenId: normalizedCalenId,
      subjectName:
        approvedCase?.applicantName ||
        consentGrant?.subjectName ||
        account.displayName,
      status: 'active',
      source,
      consentLinkage: consentGrant
        ? {
            grantId: consentGrant.grantId,
            purpose: consentGrant.purpose,
            expiresAt: consentGrant.expiresAt ?? null,
          }
        : null,
      underwritingLinkage: approvedCase
        ? {
            caseId: approvedCase.caseId,
            recommendationOutcome:
              approvedCase.recommendation?.outcome ?? null,
            stage: approvedCase.stage,
          }
        : null,
      baseline: {
        score: approvedCase?.scoreSnapshot?.score ?? null,
        riskLevel: approvedCase?.riskLevel ?? null,
        underwritingOutcome: approvedCase?.recommendation?.outcome ?? null,
        affordabilityScore:
          approvedCase?.underwritingAssessment?.affordabilityScore ?? null,
        resilienceScore:
          approvedCase?.underwritingAssessment?.resilienceScore ?? null,
        confidenceLevel: approvedCase?.scoreSnapshot?.confidenceLevel ?? null,
      },
      enrolledAt: new Date(),
    });

    const refresh = await this.refreshEnrollment(createdEnrollment);

    return {
      enrollment: this.serializeEnrollment(
        createdEnrollment,
        refresh.snapshot ?? null,
      ),
    };
  }

  async refreshPortfolio(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const enrollments = await this.monitoringEnrollmentModel
      .find({
        organizationId: this.toObjectId(user.organizationId!),
        status: 'active',
      })
      .sort({ enrolledAt: -1 });

    const refreshResult = await this.refreshEnrollments(enrollments);

    return {
      refresh: {
        refreshedCount: refreshResult.refreshedCount,
        alertsCreated: refreshResult.alertsCreated,
        refreshedAt: new Date(),
      },
    };
  }

  private async runScheduledRefresh() {
    if (this.refreshInFlight) {
      return;
    }

    this.refreshInFlight = true;

    try {
      const enrollments = await this.monitoringEnrollmentModel
        .find({ status: 'active' })
        .sort({ enrolledAt: -1 });
      await this.refreshEnrollments(enrollments);
    } finally {
      this.refreshInFlight = false;
    }
  }

  private async refreshEnrollments(enrollments: MonitoringEnrollmentDocument[]) {
    let refreshedCount = 0;
    let alertsCreated = 0;

    for (const enrollment of enrollments) {
      const result = await this.refreshEnrollment(enrollment);
      refreshedCount += 1;
      alertsCreated += result.alertsCreated;
    }

    return { refreshedCount, alertsCreated };
  }

  private async refreshEnrollment(enrollment: MonitoringEnrollmentDocument) {
    const subjectUserId = String(enrollment.subjectUserId);
    const [latestScore, latestCase, bankConnections, previousSnapshot] =
      await Promise.all([
        this.scoresService.getLatestScore(subjectUserId),
        this.underwritingCaseModel
          .findOne({
            organizationId: enrollment.organizationId,
            subjectUserId: enrollment.subjectUserId,
          })
          .sort({ updatedAt: -1, createdAt: -1 }),
        this.bankConnectionModel
          .find({
            userId: enrollment.subjectUserId,
            status: 'connected',
          })
          .sort({ createdAt: -1 }),
        this.monitoringSnapshotModel
          .findOne({ enrollmentId: enrollment._id })
          .sort({ generatedAt: -1 }),
      ]);

    const metrics = this.buildMonitoringMetrics(
      latestScore,
      latestCase,
      bankConnections,
    );
    const snapshot = await this.monitoringSnapshotModel.create({
      organizationId: enrollment.organizationId,
      enrollmentId: enrollment._id as Types.ObjectId,
      subjectUserId: enrollment.subjectUserId,
      calenId: enrollment.calenId,
      subjectName: enrollment.subjectName,
      ...metrics,
      generatedAt: new Date(),
    });
    const alertsCreated = await this.syncAlerts(
      enrollment,
      previousSnapshot,
      snapshot,
    );

    return { snapshot, alertsCreated };
  }

  private buildMonitoringMetrics(
    latestScore: Awaited<ReturnType<ScoresService['getLatestScore']>>,
    latestCase: UnderwritingCaseDocument | null,
    bankConnections: BankConnectionDocument[],
  ): MonitoringMetrics {
    const scoreSnapshot = buildUnderwritingScoreSnapshot(latestScore);
    const riskLevel = latestCase?.riskLevel ?? null;
    const averageMonthlyInflow = this.computeAverageMonthlyInflow(bankConnections);
    const balanceResilienceScore =
      getUnderwritingComponentScore(scoreSnapshot, 'balance_resilience');

    return {
      score: scoreSnapshot.score,
      riskLevel,
      affordabilityScore:
        latestCase?.underwritingAssessment?.affordabilityScore ?? null,
      resilienceScore:
        latestCase?.underwritingAssessment?.resilienceScore ??
        balanceResilienceScore,
      confidenceLevel: scoreSnapshot.confidenceLevel,
      debtPressureIndicator:
        latestCase?.underwritingAssessment?.debtPressureIndicator ?? null,
      volatilitySignal:
        latestCase?.underwritingAssessment?.volatilitySignal ??
        this.deriveVolatilitySignal(scoreSnapshot),
      recommendationOutcome: latestCase?.recommendation?.outcome ?? null,
      averageMonthlyInflow,
      incomeReliabilityScore: getUnderwritingComponentScore(
        scoreSnapshot,
        'income_reliability',
      ),
      obligationConsistencyScore: getUnderwritingComponentScore(
        scoreSnapshot,
        'obligation_consistency',
      ),
      balanceResilienceScore,
    };
  }

  private async syncAlerts(
    enrollment: MonitoringEnrollmentDocument,
    previousSnapshot: MonitoringSnapshotDocument | null,
    currentSnapshot: MonitoringSnapshotDocument,
  ) {
    const comparisonSource =
      previousSnapshot ?? this.buildComparisonSourceFromEnrollment(enrollment);
    const activeAlerts = await this.monitoringAlertModel.find({
      enrollmentId: enrollment._id,
      status: 'active',
    });
    let alertsCreated = 0;

    for (const rule of this.buildAlertEvaluations(
      enrollment,
      comparisonSource,
      currentSnapshot,
    )) {
      const existingAlert = activeAlerts.find(
        (alert) => alert.alertType === rule.alertType,
      );

      if (rule.triggered) {
        if (!existingAlert) {
          const createdAlert = await this.monitoringAlertModel.create({
            organizationId: enrollment.organizationId,
            enrollmentId: enrollment._id as Types.ObjectId,
            subjectUserId: enrollment.subjectUserId,
            calenId: enrollment.calenId,
            subjectName: enrollment.subjectName,
            alertType: rule.alertType,
            severity: rule.severity,
            title: rule.title,
            detail: rule.detail,
            status: 'active',
            previousValue: rule.previousValue ?? null,
            currentValue: rule.currentValue ?? null,
            triggeredAt: new Date(),
          });
          await this.emitAlertDelivery(
            enrollment,
            createdAlert,
            'monitoring_alert_triggered',
          );
          alertsCreated += 1;
        }
      } else if (existingAlert) {
        await this.monitoringAlertModel.updateMany(
          {
            enrollmentId: enrollment._id,
            alertType: rule.alertType,
            status: 'active',
          },
          {
            $set: {
              status: 'resolved',
              resolvedAt: new Date(),
            },
          },
        );
        await this.emitAlertDelivery(
          enrollment,
          existingAlert,
          'monitoring_alert_resolved',
        );
      }
    }

    return alertsCreated;
  }

  private buildAlertEvaluations(
    enrollment: MonitoringEnrollmentDocument,
    previous: MonitoringComparisonSource,
    current: MonitoringSnapshotDocument,
  ) {
    const previousInflow = previous.averageMonthlyInflow ?? null;
    const currentInflow = current.averageMonthlyInflow ?? null;
    const inflowDropRatio =
      previousInflow != null && previousInflow > 0 && currentInflow != null
        ? currentInflow / previousInflow
        : null;
    const resilienceDrop =
      previous.resilienceScore != null && current.resilienceScore != null
        ? previous.resilienceScore - current.resilienceScore
        : null;
    const previousVolatility = this.volatilityRank(previous.volatilitySignal);
    const currentVolatility = this.volatilityRank(current.volatilitySignal);
    const previousDebtPressure = this.debtPressureRank(
      previous.debtPressureIndicator,
    );
    const currentDebtPressure = this.debtPressureRank(
      current.debtPressureIndicator,
    );
    const affordabilityStress =
      current.affordabilityScore != null && current.affordabilityScore < 55;
    const outcomeStress =
      current.recommendationOutcome === 'review' ||
      current.recommendationOutcome === 'decline';

    return [
      {
        alertType: 'income_decline' as const,
        triggered:
          inflowDropRatio != null && inflowDropRatio <= 0.8,
        severity:
          inflowDropRatio != null && inflowDropRatio <= 0.6 ? 'High' : 'Medium',
        title: 'Income decline detected',
        detail:
          previousInflow != null && currentInflow != null
            ? `Average monthly inflow fell from ${Math.round(previousInflow)} to ${Math.round(currentInflow)}.`
            : 'Recent inflow patterns have weakened against the last monitoring baseline.',
        previousValue:
          previousInflow != null ? String(Math.round(previousInflow)) : null,
        currentValue:
          currentInflow != null ? String(Math.round(currentInflow)) : null,
      },
      {
        alertType: 'resilience_decline' as const,
        triggered: resilienceDrop != null && resilienceDrop >= 15,
        severity:
          resilienceDrop != null && resilienceDrop >= 25 ? 'High' : 'Medium',
        title: 'Resilience declined',
        detail:
          previous.resilienceScore != null && current.resilienceScore != null
            ? `Resilience dropped from ${previous.resilienceScore} to ${current.resilienceScore}.`
            : 'Balance resilience weakened versus the last monitoring baseline.',
        previousValue:
          previous.resilienceScore != null ? String(previous.resilienceScore) : null,
        currentValue:
          current.resilienceScore != null ? String(current.resilienceScore) : null,
      },
      {
        alertType: 'volatility_rise' as const,
        triggered:
          currentVolatility > previousVolatility && currentVolatility > 0,
        severity: current.volatilitySignal === 'Volatile' ? 'High' : 'Medium',
        title: 'Cash-flow volatility rose',
        detail: `Volatility moved from ${previous.volatilitySignal ?? 'unknown'} to ${current.volatilitySignal ?? 'unknown'}.`,
        previousValue: previous.volatilitySignal ?? null,
        currentValue: current.volatilitySignal ?? null,
      },
      {
        alertType: 'debt_pressure_increase' as const,
        triggered: currentDebtPressure > previousDebtPressure && currentDebtPressure > 0,
        severity:
          current.debtPressureIndicator === 'High' ? 'High' : 'Medium',
        title: 'Debt pressure increased',
        detail: `Debt pressure moved from ${previous.debtPressureIndicator ?? 'unknown'} to ${current.debtPressureIndicator ?? 'unknown'}.`,
        previousValue: previous.debtPressureIndicator ?? null,
        currentValue: current.debtPressureIndicator ?? null,
      },
      {
        alertType: 'obligation_stress' as const,
        triggered: affordabilityStress || outcomeStress,
        severity:
          current.recommendationOutcome === 'decline' ||
          (current.affordabilityScore ?? 100) < 40
            ? 'High'
            : 'Medium',
        title: 'Obligation stress detected',
        detail: outcomeStress
          ? `Latest underwriting recommendation moved to ${current.recommendationOutcome}.`
          : `Affordability fell to ${current.affordabilityScore}.`,
        previousValue:
          previous.affordabilityScore != null
            ? String(previous.affordabilityScore)
            : null,
        currentValue:
          current.affordabilityScore != null
            ? String(current.affordabilityScore)
            : current.recommendationOutcome ?? null,
      },
    ];
  }

  private buildComparisonSourceFromEnrollment(
    enrollment: MonitoringEnrollmentDocument,
  ): MonitoringComparisonSource {
    return {
      score: enrollment.baseline?.score ?? null,
      riskLevel: enrollment.baseline?.riskLevel ?? null,
      affordabilityScore: enrollment.baseline?.affordabilityScore ?? null,
      resilienceScore: enrollment.baseline?.resilienceScore ?? null,
      confidenceLevel: enrollment.baseline?.confidenceLevel ?? null,
      recommendationOutcome: enrollment.baseline?.underwritingOutcome ?? null,
    };
  }

  private groupSnapshotsByEnrollment(snapshots: MonitoringSnapshotDocument[]) {
    const grouped = new Map<string, MonitoringSnapshotDocument[]>();

    for (const snapshot of snapshots) {
      const enrollmentId = String(snapshot.enrollmentId);
      const bucket = grouped.get(enrollmentId) ?? [];
      bucket.push(snapshot);
      grouped.set(enrollmentId, bucket);
    }

    for (const bucket of grouped.values()) {
      bucket.sort(
        (left, right) => left.generatedAt.getTime() - right.generatedAt.getTime(),
      );
    }

    return grouped;
  }

  private buildScoreHistory(
    snapshots: MonitoringSnapshotDocument[],
  ): MonitoringScoreHistoryPoint[] {
    const buckets = new Map<
      string,
      { month: string; total: number; count: number; min: number; max: number }
    >();

    for (const snapshot of snapshots) {
      if (snapshot.score == null) {
        continue;
      }

      const month = snapshot.generatedAt.toISOString().slice(0, 7);
      const bucket = buckets.get(month) ?? {
        month,
        total: 0,
        count: 0,
        min: snapshot.score,
        max: snapshot.score,
      };
      bucket.total += snapshot.score;
      bucket.count += 1;
      bucket.min = Math.min(bucket.min, snapshot.score);
      bucket.max = Math.max(bucket.max, snapshot.score);
      buckets.set(month, bucket);
    }

    return Array.from(buckets.values())
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((bucket) => ({
        month: bucket.month,
        avg: Math.round(bucket.total / bucket.count),
        min: bucket.min,
        max: bucket.max,
        profiles: bucket.count,
      }));
  }

  private buildBehaviourTrends(
    snapshots: MonitoringSnapshotDocument[],
  ): MonitoringBehaviourTrendPoint[] {
    const buckets = new Map<
      string,
      {
        month: string;
        incomeTotal: number;
        incomeCount: number;
        commitmentsTotal: number;
        commitmentsCount: number;
        resilienceTotal: number;
        resilienceCount: number;
        affordabilityTotal: number;
        affordabilityCount: number;
        inflowTotal: number;
        inflowCount: number;
      }
    >();

    for (const snapshot of snapshots) {
      const month = snapshot.generatedAt.toISOString().slice(0, 7);
      const bucket = buckets.get(month) ?? {
        month,
        incomeTotal: 0,
        incomeCount: 0,
        commitmentsTotal: 0,
        commitmentsCount: 0,
        resilienceTotal: 0,
        resilienceCount: 0,
        affordabilityTotal: 0,
        affordabilityCount: 0,
        inflowTotal: 0,
        inflowCount: 0,
      };

      if (snapshot.incomeReliabilityScore != null) {
        bucket.incomeTotal += snapshot.incomeReliabilityScore;
        bucket.incomeCount += 1;
      }
      if (snapshot.obligationConsistencyScore != null) {
        bucket.commitmentsTotal += snapshot.obligationConsistencyScore;
        bucket.commitmentsCount += 1;
      }
      if (snapshot.balanceResilienceScore != null) {
        bucket.resilienceTotal += snapshot.balanceResilienceScore;
        bucket.resilienceCount += 1;
      }
      if (snapshot.affordabilityScore != null) {
        bucket.affordabilityTotal += snapshot.affordabilityScore;
        bucket.affordabilityCount += 1;
      }
      if (snapshot.averageMonthlyInflow != null) {
        bucket.inflowTotal += snapshot.averageMonthlyInflow;
        bucket.inflowCount += 1;
      }

      buckets.set(month, bucket);
    }

    return Array.from(buckets.values())
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((bucket) => ({
        month: bucket.month,
        income:
          bucket.incomeCount > 0
            ? Math.round(bucket.incomeTotal / bucket.incomeCount)
            : 0,
        payments:
          bucket.commitmentsCount > 0
            ? Math.round(bucket.commitmentsTotal / bucket.commitmentsCount)
            : 0,
        resilience:
          bucket.resilienceCount > 0
            ? Math.round(bucket.resilienceTotal / bucket.resilienceCount)
            : 0,
        affordability:
          bucket.affordabilityCount > 0
            ? Math.round(bucket.affordabilityTotal / bucket.affordabilityCount)
            : 0,
        monthlyInflow:
          bucket.inflowCount > 0
            ? Math.round(bucket.inflowTotal / bucket.inflowCount)
            : 0,
      }));
  }

  private buildTrendSummary(
    activeEnrollments: MonitoringEnrollmentDocument[],
    currentSnapshots: MonitoringSnapshotDocument[],
    snapshotsByEnrollment: Map<string, MonitoringSnapshotDocument[]>,
    alerts: MonitoringAlertDocument[],
  ): MonitoringTrendSummary {
    const alertsByEnrollment = new Map<string, MonitoringAlertDocument[]>();
    for (const alert of alerts) {
      const enrollmentId = String(alert.enrollmentId);
      const bucket = alertsByEnrollment.get(enrollmentId) ?? [];
      bucket.push(alert);
      alertsByEnrollment.set(enrollmentId, bucket);
    }

    let improvingProfiles = 0;
    let decliningProfiles = 0;
    let stableProfiles = 0;
    let currentScoreTotal = 0;
    let currentScoreCount = 0;
    let previousScoreTotal = 0;
    let previousScoreCount = 0;
    let affordabilityTotal = 0;
    let affordabilityCount = 0;
    let resilienceTotal = 0;
    let resilienceCount = 0;
    let inflowTotal = 0;
    let inflowCount = 0;

    for (const enrollment of activeEnrollments) {
      const enrollmentSnapshots =
        snapshotsByEnrollment.get(String(enrollment._id)) ?? [];
      const latestSnapshot = enrollmentSnapshots[enrollmentSnapshots.length - 1];
      if (!latestSnapshot) {
        continue;
      }

      const comparisonSnapshot =
        enrollmentSnapshots.length > 1
          ? enrollmentSnapshots[enrollmentSnapshots.length - 2]
          : null;
      const comparisonSource =
        comparisonSnapshot ??
        this.buildComparisonSourceFromEnrollment(enrollment);
      const trendState = this.classifyEnrollmentTrend(
        comparisonSource,
        latestSnapshot,
        alertsByEnrollment.get(String(enrollment._id)) ?? [],
      );

      if (trendState === 'improving') {
        improvingProfiles += 1;
      } else if (trendState === 'declining') {
        decliningProfiles += 1;
      } else {
        stableProfiles += 1;
      }

      if (latestSnapshot.score != null) {
        currentScoreTotal += latestSnapshot.score;
        currentScoreCount += 1;
      }
      if (comparisonSource.score != null) {
        previousScoreTotal += comparisonSource.score;
        previousScoreCount += 1;
      }
      if (latestSnapshot.affordabilityScore != null) {
        affordabilityTotal += latestSnapshot.affordabilityScore;
        affordabilityCount += 1;
      }
      if (latestSnapshot.resilienceScore != null) {
        resilienceTotal += latestSnapshot.resilienceScore;
        resilienceCount += 1;
      }
      if (latestSnapshot.averageMonthlyInflow != null) {
        inflowTotal += latestSnapshot.averageMonthlyInflow;
        inflowCount += 1;
      }
    }

    const currentAverageScore =
      currentScoreCount > 0 ? Math.round(currentScoreTotal / currentScoreCount) : null;
    const previousAverageScore =
      previousScoreCount > 0
        ? Math.round(previousScoreTotal / previousScoreCount)
        : null;
    const scoreDelta =
      currentAverageScore != null && previousAverageScore != null
        ? currentAverageScore - previousAverageScore
        : null;

    const riskCounts = new Map<string, number>();
    for (const snapshot of currentSnapshots) {
      const label = snapshot.riskLevel?.trim() || 'Unclassified';
      riskCounts.set(label, (riskCounts.get(label) ?? 0) + 1);
    }

    const alertCounts = new Map<string, number>();
    for (const alert of alerts) {
      alertCounts.set(alert.alertType, (alertCounts.get(alert.alertType) ?? 0) + 1);
    }

    const lastRefreshedAt =
      currentSnapshots.length > 0
        ? currentSnapshots.reduce<Date | null>((latest, snapshot) => {
            if (latest == null || snapshot.generatedAt > latest) {
              return snapshot.generatedAt;
            }

            return latest;
          }, null)
        : null;

    return {
      refreshedProfiles: currentSnapshots.length,
      improvingProfiles,
      decliningProfiles,
      stableProfiles,
      currentAverageScore,
      previousAverageScore,
      scoreDelta,
      averageAffordability:
        affordabilityCount > 0 ? Math.round(affordabilityTotal / affordabilityCount) : null,
      averageResilience:
        resilienceCount > 0 ? Math.round(resilienceTotal / resilienceCount) : null,
      averageMonthlyInflow:
        inflowCount > 0 ? Math.round(inflowTotal / inflowCount) : null,
      alertCoverageCount: alertsByEnrollment.size,
      highSeverityAlerts: alerts.filter((alert) => alert.severity === 'High').length,
      mediumSeverityAlerts: alerts.filter((alert) => alert.severity === 'Medium').length,
      lastRefreshedAt,
      riskDistribution: Array.from(riskCounts.entries())
        .map(([level, count]) => ({ level, count }))
        .sort((left, right) => right.count - left.count),
      alertBreakdown: Array.from(alertCounts.entries())
        .map(([type, count]) => ({
          type,
          label: this.humanizeAlertType(type),
          count,
        }))
        .sort((left, right) => right.count - left.count),
    };
  }

  private classifyEnrollmentTrend(
    previous: MonitoringComparisonSource,
    current: MonitoringSnapshotDocument,
    alerts: MonitoringAlertDocument[],
  ) {
    const scoreDelta =
      previous.score != null && current.score != null
        ? current.score - previous.score
        : 0;
    const resilienceDelta =
      previous.resilienceScore != null && current.resilienceScore != null
        ? current.resilienceScore - previous.resilienceScore
        : 0;
    const affordabilityDelta =
      previous.affordabilityScore != null && current.affordabilityScore != null
        ? current.affordabilityScore - previous.affordabilityScore
        : 0;
    const hasHighSeverityAlert = alerts.some((alert) => alert.severity === 'High');
    const hasAnyAlert = alerts.length > 0;

    if (
      hasHighSeverityAlert ||
      scoreDelta <= -20 ||
      resilienceDelta <= -12 ||
      affordabilityDelta <= -12
    ) {
      return 'declining';
    }

    if (
      !hasAnyAlert &&
      (scoreDelta >= 20 || resilienceDelta >= 12 || affordabilityDelta >= 12)
    ) {
      return 'improving';
    }

    return 'stable';
  }

  private serializeEnrollment(
    enrollment: MonitoringEnrollmentDocument,
    latestSnapshot: MonitoringSnapshotDocument | null,
  ) {
    return {
      id: String(enrollment._id),
      enrollmentId: enrollment.enrollmentId,
      calenId: enrollment.calenId,
      subjectName: enrollment.subjectName,
      status: enrollment.status,
      source: enrollment.source,
      consentLinkage: enrollment.consentLinkage
        ? {
            grantId: enrollment.consentLinkage.grantId ?? null,
            purpose: enrollment.consentLinkage.purpose ?? null,
            expiresAt: enrollment.consentLinkage.expiresAt ?? null,
          }
        : null,
      underwritingLinkage: enrollment.underwritingLinkage
        ? {
            caseId: enrollment.underwritingLinkage.caseId ?? null,
            recommendationOutcome:
              enrollment.underwritingLinkage.recommendationOutcome ?? null,
            stage: enrollment.underwritingLinkage.stage ?? null,
          }
        : null,
      baseline: {
        score: latestSnapshot?.score ?? enrollment.baseline?.score ?? null,
        riskLevel:
          latestSnapshot?.riskLevel ?? enrollment.baseline?.riskLevel ?? null,
        underwritingOutcome:
          latestSnapshot?.recommendationOutcome ??
          enrollment.baseline?.underwritingOutcome ??
          null,
        affordabilityScore:
          latestSnapshot?.affordabilityScore ??
          enrollment.baseline?.affordabilityScore ??
          null,
        resilienceScore:
          latestSnapshot?.resilienceScore ??
          enrollment.baseline?.resilienceScore ??
          null,
        confidenceLevel:
          latestSnapshot?.confidenceLevel ??
          enrollment.baseline?.confidenceLevel ??
          null,
      },
      enrolledAt: enrollment.enrolledAt,
      createdAt: enrollment.createdAt ?? null,
      updatedAt: enrollment.updatedAt ?? null,
    };
  }

  private deriveVolatilitySignal(
    scoreSnapshot: ReturnType<typeof buildUnderwritingScoreSnapshot>,
  ) {
    const rawVolatilityScore = getUnderwritingComponentScore(
      scoreSnapshot,
      'financial_volatility',
    );

    if (rawVolatilityScore != null && rawVolatilityScore >= 65) {
      return 'Volatile';
    }
    if (rawVolatilityScore != null && rawVolatilityScore >= 40) {
      return 'Moderate';
    }

    return rawVolatilityScore == null ? null : 'Stable';
  }

  private computeAverageMonthlyInflow(bankConnections: BankConnectionDocument[]) {
    const transactions = bankConnections
      .flatMap((connection) => this.readTransactions(connection))
      .sort((left, right) => left.bookedAt.getTime() - right.bookedAt.getTime());

    if (transactions.length === 0) {
      return null;
    }

    const monthTotals = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.amount <= 0) {
        continue;
      }

      const month = transaction.bookedAt.toISOString().slice(0, 7);
      monthTotals.set(month, (monthTotals.get(month) ?? 0) + transaction.amount);
    }

    if (monthTotals.size === 0) {
      return null;
    }

    return Array.from(monthTotals.values()).reduce((sum, value) => sum + value, 0) /
      monthTotals.size;
  }

  private readTransactions(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};
    const transactions: CanonicalTransaction[] = [];

    for (const entry of this.readRecordArray(snapshot.transactions)) {
      const bookedAtValue =
        this.readString(entry.timestamp) ??
        this.readString(entry.booking_date) ??
        this.readString(entry.update_timestamp);
      const bookedAt = bookedAtValue ? new Date(bookedAtValue) : null;
      const amount = this.readNumber(entry.amount);

      if (!bookedAt || Number.isNaN(bookedAt.getTime()) || amount == null) {
        continue;
      }

      transactions.push({ bookedAt, amount });
    }

    return transactions;
  }

  private readRecord(value: unknown) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readRecordArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null && !Array.isArray(entry),
        )
      : [];
  }

  private readStringArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.trim().length > 0,
        )
      : [];
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : undefined;
  }

  private volatilityRank(value?: string | null) {
    if (value === 'Volatile') return 2;
    if (value === 'Moderate') return 1;
    return 0;
  }

  private debtPressureRank(value?: string | null) {
    if (value === 'High') return 2;
    if (value === 'Medium') return 1;
    return 0;
  }

  private describeAlertTime(triggeredAt: Date) {
    const diffMs = Date.now() - triggeredAt.getTime();
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));

    if (diffHours < 24) {
      return `${Math.max(diffHours, 1)}h ago`;
    }

    return `${Math.round(diffHours / 24)}d ago`;
  }

  private humanizeAlertType(value: string) {
    return value
      .split('_')
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private async emitAlertDelivery(
    enrollment: MonitoringEnrollmentDocument,
    alert: MonitoringAlertDocument,
    eventType: MonitoringWebhookEventType,
  ) {
    const organizationId = String(enrollment.organizationId);
    const [organization, members] = await Promise.all([
      this.organizationsService.findByIdOrThrow(organizationId),
      this.accountsService.listUsersByOrganization(organizationId),
    ]);

    await this.createOrganizationNotifications(
      members,
      enrollment,
      alert,
      eventType,
    );
    await this.deliverWebhookEvent(organization, enrollment, alert, eventType);
  }

  private async createOrganizationNotifications(
    members: Array<{ _id?: unknown; status?: string }>,
    enrollment: MonitoringEnrollmentDocument,
    alert: MonitoringAlertDocument,
    eventType: MonitoringWebhookEventType,
  ) {
    const activeMembers = members.filter(
      (member) => String(member.status ?? 'active') === 'active',
    );
    const recipientIds = Array.from(
      new Set(
        (activeMembers.length > 0 ? activeMembers : members)
          .map((member) => String(member._id ?? ''))
          .filter((value) => value.length > 0),
      ),
    );

    if (recipientIds.length === 0) {
      return;
    }

    const notification = this.buildAlertNotification(enrollment, alert, eventType);
    await Promise.all(
      recipientIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          category: 'monitoring',
          title: notification.title,
          body: notification.body,
          metadata: notification.metadata,
        }),
      ),
    );
  }

  private buildAlertNotification(
    enrollment: MonitoringEnrollmentDocument,
    alert: MonitoringAlertDocument,
    eventType: MonitoringWebhookEventType,
  ) {
    const resolved = eventType === 'monitoring_alert_resolved';
    const title = resolved
      ? `${alert.title} resolved`
      : `${alert.title} for ${enrollment.subjectName}`;
    const body = resolved
      ? `${enrollment.subjectName} no longer matches the ${this.humanizeAlertType(alert.alertType).toLowerCase()} trigger.`
      : `${enrollment.subjectName} triggered a ${this.humanizeAlertType(alert.alertType).toLowerCase()} alert. ${alert.detail}`;

    return {
      title,
      body,
      metadata: {
        monitoring: {
          eventType,
          alertType: alert.alertType,
          severity: alert.severity,
          calenId: enrollment.calenId,
          enrollmentId: enrollment.enrollmentId,
        },
      },
    };
  }

  private async deliverWebhookEvent(
    organization: {
      _id?: unknown;
      slug?: string;
      name?: string;
      onboardingData?: Record<string, unknown>;
    },
    enrollment: MonitoringEnrollmentDocument,
    alert: MonitoringAlertDocument,
    eventType: MonitoringWebhookEventType,
  ) {
    const config = this.getWebhookConfig(organization);
    if (
      !config.enabled ||
      !config.url ||
      !config.subscriptions.includes(eventType)
    ) {
      return;
    }

    const targetUrl = this.normalizeWebhookUrl(config.url);
    const payload = this.buildWebhookPayload(
      organization,
      enrollment,
      alert,
      eventType,
    );
    const deliveryId = `mwd_${randomBytes(6).toString('hex')}`;
    const attemptedAt = new Date();
    let status: 'success' | 'failed' = 'failed';
    let responseStatus: number | null = null;
    let errorMessage: string | null = null;
    let deliveredAt: Date | null = null;

    if (targetUrl) {
      try {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-calen-event': eventType,
          'x-calen-delivery-id': deliveryId,
        };

        if (config.secret) {
          headers['x-calen-signature'] = createHmac('sha256', config.secret)
            .update(body)
            .digest('hex');
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body,
        });
        responseStatus = response.status;
        status = response.ok ? 'success' : 'failed';
        deliveredAt = response.ok ? new Date() : null;
        errorMessage = response.ok
          ? null
          : `Webhook responded with status ${response.status}.`;
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : 'Webhook delivery failed.';
      }
    } else {
      errorMessage = 'Webhook URL is invalid.';
    }

    await this.monitoringWebhookDeliveryModel.create({
      organizationId: enrollment.organizationId,
      enrollmentId: enrollment._id as Types.ObjectId,
      alertId: (alert._id as Types.ObjectId | undefined) ?? null,
      deliveryId,
      eventType,
      targetUrl: config.url,
      status,
      responseStatus,
      errorMessage,
      attemptedAt,
      deliveredAt,
    });
  }

  private buildWebhookPayload(
    organization: {
      _id?: unknown;
      slug?: string;
      name?: string;
    },
    enrollment: MonitoringEnrollmentDocument,
    alert: MonitoringAlertDocument,
    eventType: MonitoringWebhookEventType,
  ) {
    return {
      event: eventType,
      occurredAt:
        eventType === 'monitoring_alert_triggered'
          ? alert.triggeredAt
          : new Date(),
      organization: {
        id: String(organization._id ?? ''),
        slug: organization.slug ?? null,
        name: organization.name ?? null,
      },
      monitoring: {
        enrollmentId: enrollment.enrollmentId,
        calenId: enrollment.calenId,
        subjectName: enrollment.subjectName,
        source: enrollment.source,
      },
      alert: {
        id: String(alert._id ?? ''),
        type: alert.alertType,
        title: alert.title,
        detail: alert.detail,
        severity: alert.severity,
        status:
          eventType === 'monitoring_alert_triggered' ? 'active' : 'resolved',
        previousValue: alert.previousValue ?? null,
        currentValue: alert.currentValue ?? null,
        triggeredAt: alert.triggeredAt,
      },
    };
  }

  private getWebhookConfig(organization: {
    onboardingData?: Record<string, unknown>;
  }): MonitoringWebhookConfig {
    const integrationPreferences = this.readRecord(
      organization.onboardingData?.integrationPreferences,
    );
    const subscriptions = this.readStringArray(
      integrationPreferences?.webhookSubscriptions,
    ).filter((value): value is MonitoringWebhookEventType =>
      value === 'monitoring_alert_triggered' ||
      value === 'monitoring_alert_resolved',
    );

    return {
      enabled: Boolean(integrationPreferences?.enableWebhooks),
      url: this.readString(integrationPreferences?.webhookUrl) ?? null,
      secret: this.readString(integrationPreferences?.webhookSecret) ?? null,
      subscriptions:
        subscriptions.length > 0
          ? subscriptions
          : ['monitoring_alert_triggered'],
    };
  }

  private normalizeWebhookUrl(value: string) {
    try {
      return new URL(value).toString();
    } catch {
      return null;
    }
  }

  private assertOrganization(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_REQUIRED',
        message: 'Monitoring is only available to organisation accounts.',
      });
    }
  }

  private generateEnrollmentId() {
    return `MON-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
