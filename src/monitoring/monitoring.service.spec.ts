import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { NotificationsService } from '../dashboard/notifications.service';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { PassportGrant } from '../passport/schemas/passport-grant.schema';
import { ScoresService } from '../scores/scores.service';
import { UnderwritingCase } from '../underwriting/schemas/underwriting-case.schema';
import { MonitoringAlert } from './schemas/monitoring-alert.schema';
import { MonitoringService } from './monitoring.service';
import { MonitoringEnrollment } from './schemas/monitoring-enrollment.schema';
import { MonitoringSnapshot } from './schemas/monitoring-snapshot.schema';
import { MonitoringWebhookDelivery } from './schemas/monitoring-webhook-delivery.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
}

describe('MonitoringService', () => {
  let service: MonitoringService;
  const monitoringEnrollmentModel = createModelMock();
  const monitoringSnapshotModel = createModelMock();
  const monitoringAlertModel = createModelMock();
  const monitoringWebhookDeliveryModel = createModelMock();
  const underwritingCaseModel = createModelMock();
  const passportGrantModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const accountsService = {
    findIndividualByShareId: jest.fn(),
    listUsersByOrganization: jest.fn(),
  };
  const notificationsService = {
    createNotification: jest.fn(),
  };
  const organizationsService = {
    findByIdOrThrow: jest.fn(),
  };
  const scoresService = {
    getLatestScore: jest.fn(),
  };
  const user = {
    id: '507f1f77bcf86cd799439011',
    accountType: AccountType.ORGANISATION,
    organizationId: '507f1f77bcf86cd799439099',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: AccountsService, useValue: accountsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: ScoresService, useValue: scoresService },
        {
          provide: getModelToken(MonitoringEnrollment.name),
          useValue: monitoringEnrollmentModel,
        },
        {
          provide: getModelToken(MonitoringSnapshot.name),
          useValue: monitoringSnapshotModel,
        },
        {
          provide: getModelToken(MonitoringAlert.name),
          useValue: monitoringAlertModel,
        },
        {
          provide: getModelToken(MonitoringWebhookDelivery.name),
          useValue: monitoringWebhookDeliveryModel,
        },
        {
          provide: getModelToken(UnderwritingCase.name),
          useValue: underwritingCaseModel,
        },
        {
          provide: getModelToken(PassportGrant.name),
          useValue: passportGrantModel,
        },
        {
          provide: getModelToken(BankConnection.name),
          useValue: bankConnectionModel,
        },
      ],
    }).compile();

    service = moduleRef.get(MonitoringService);
    monitoringEnrollmentModel.findOne.mockResolvedValue(null);
    monitoringEnrollmentModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    monitoringSnapshotModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    monitoringSnapshotModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    monitoringSnapshotModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439051'),
      ...payload,
      createdAt: new Date('2026-04-11T12:30:00.000Z'),
      updatedAt: new Date('2026-04-11T12:30:00.000Z'),
    }));
    monitoringAlertModel.find.mockResolvedValue([]);
    monitoringAlertModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439091'),
      ...payload,
    }));
    monitoringAlertModel.updateMany.mockResolvedValue({});
    monitoringWebhookDeliveryModel.create.mockResolvedValue({});
    monitoringEnrollmentModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439041'),
      ...payload,
      createdAt: new Date('2026-04-11T12:00:00.000Z'),
      updatedAt: new Date('2026-04-11T12:00:00.000Z'),
    }));
    underwritingCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    passportGrantModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    accountsService.listUsersByOrganization.mockResolvedValue([
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439021'),
        status: 'active',
      },
    ]);
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      slug: 'calen-capital',
      name: 'Calen Capital',
      onboardingData: {
        integrationPreferences: {
          enableWebhooks: false,
          webhookSubscriptions: ['monitoring_alert_triggered'],
        },
      },
    });
    notificationsService.createNotification.mockResolvedValue({});
    scoresService.getLatestScore.mockResolvedValue({
      score: 724,
      composite: 72.4,
      bandKey: 'strong',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'high', score: 84 },
      reasonCodes: ['income_consistency_strong'],
      explanations: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 82, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 74, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 68, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 22, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-11T12:00:00.000Z'),
    });
    global.fetch = jest.fn() as any;
  });

  it('enrolls a monitored profile from an approved underwriting case', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      displayName: 'Ada Lovelace',
    });
    underwritingCaseModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        caseId: 'UW-ABCD1234',
        applicantName: 'Ada Lovelace',
        stage: 'approved',
        riskLevel: 'Low',
        scoreSnapshot: {
          score: 724,
          confidenceLevel: 'high',
        },
        underwritingAssessment: {
          affordabilityScore: 82,
          resilienceScore: 74,
        },
        recommendation: {
          outcome: 'approve',
        },
      }),
    });

    const result = await service.createEnrollment(
      user as any,
      'CALEN-ABCD-1234',
    );

    expect(result.enrollment.source).toBe('underwriting_approval');
    expect(result.enrollment.underwritingLinkage?.caseId).toBe('UW-ABCD1234');
    expect(result.enrollment.baseline.score).toBe(724);
    expect(monitoringSnapshotModel.create).toHaveBeenCalled();
  });

  it('enrolls a monitored profile from explicit Passport consent', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      displayName: 'Ada Lovelace',
    });
    passportGrantModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        grantId: 'PSG-ABCD1234',
        subjectName: 'Ada Lovelace',
        purpose: 'portfolio_monitoring_review',
        expiresAt: new Date('2026-07-10T12:00:00.000Z'),
      }),
    });

    const result = await service.createEnrollment(
      user as any,
      'CALEN-ABCD-1234',
    );

    expect(result.enrollment.source).toBe('passport_consent');
    expect(result.enrollment.consentLinkage?.grantId).toBe('PSG-ABCD1234');
  });

  it('rejects enrollment when no approved case or explicit consent exists', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      displayName: 'Ada Lovelace',
    });

    await expect(
      service.createEnrollment(user as any, 'CALEN-ABCD-1234'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects duplicate active monitoring enrollments', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      displayName: 'Ada Lovelace',
    });
    monitoringEnrollmentModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
    });

    await expect(
      service.createEnrollment(user as any, 'CALEN-ABCD-1234'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws when the CALEN profile cannot be found', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue(null);

    await expect(
      service.createEnrollment(user as any, 'CALEN-FFFF-0000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds live portfolio trend metrics and history from monitoring snapshots', async () => {
    const enrollmentOneId = new Types.ObjectId('507f1f77bcf86cd799439071');
    const enrollmentTwoId = new Types.ObjectId('507f1f77bcf86cd799439072');
    const organizationId = new Types.ObjectId(user.organizationId);

    monitoringEnrollmentModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          _id: enrollmentOneId,
          organizationId,
          status: 'active',
          source: 'underwriting_approval',
          enrollmentId: 'MON-1111AAAA',
          calenId: 'CALEN-ABCD-1234',
          subjectName: 'Ada Lovelace',
          baseline: {
            score: 690,
            riskLevel: 'Moderate',
            underwritingOutcome: 'approve',
            affordabilityScore: 66,
            resilienceScore: 58,
            confidenceLevel: 'moderate',
          },
          enrolledAt: new Date('2026-03-01T10:00:00.000Z'),
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          updatedAt: new Date('2026-04-11T10:00:00.000Z'),
        },
        {
          _id: enrollmentTwoId,
          organizationId,
          status: 'active',
          source: 'passport_consent',
          enrollmentId: 'MON-2222BBBB',
          calenId: 'CALEN-EFGH-5678',
          subjectName: 'Grace Hopper',
          baseline: {
            score: 705,
            riskLevel: 'Low',
            underwritingOutcome: 'approve_with_conditions',
            affordabilityScore: 71,
            resilienceScore: 69,
            confidenceLevel: 'high',
          },
          enrolledAt: new Date('2026-03-06T10:00:00.000Z'),
          createdAt: new Date('2026-03-06T10:00:00.000Z'),
          updatedAt: new Date('2026-04-11T10:00:00.000Z'),
        },
      ]),
    });
    monitoringSnapshotModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          enrollmentId: enrollmentOneId,
          generatedAt: new Date('2026-03-11T10:00:00.000Z'),
          score: 700,
          riskLevel: 'Moderate',
          affordabilityScore: 68,
          resilienceScore: 60,
          confidenceLevel: 'moderate',
          recommendationOutcome: 'approve',
          averageMonthlyInflow: 8000,
          incomeReliabilityScore: 72,
          obligationConsistencyScore: 64,
          balanceResilienceScore: 60,
        },
        {
          enrollmentId: enrollmentTwoId,
          generatedAt: new Date('2026-03-11T10:00:00.000Z'),
          score: 710,
          riskLevel: 'Low',
          affordabilityScore: 74,
          resilienceScore: 70,
          confidenceLevel: 'high',
          recommendationOutcome: 'approve_with_conditions',
          averageMonthlyInflow: 9500,
          incomeReliabilityScore: 80,
          obligationConsistencyScore: 78,
          balanceResilienceScore: 70,
        },
        {
          enrollmentId: enrollmentOneId,
          generatedAt: new Date('2026-04-11T10:00:00.000Z'),
          score: 732,
          riskLevel: 'Low',
          affordabilityScore: 79,
          resilienceScore: 76,
          confidenceLevel: 'high',
          recommendationOutcome: 'approve',
          averageMonthlyInflow: 9900,
          incomeReliabilityScore: 84,
          obligationConsistencyScore: 76,
          balanceResilienceScore: 76,
        },
        {
          enrollmentId: enrollmentTwoId,
          generatedAt: new Date('2026-04-11T10:00:00.000Z'),
          score: 688,
          riskLevel: 'Moderate',
          affordabilityScore: 59,
          resilienceScore: 57,
          confidenceLevel: 'moderate',
          recommendationOutcome: 'review',
          averageMonthlyInflow: 7300,
          incomeReliabilityScore: 65,
          obligationConsistencyScore: 54,
          balanceResilienceScore: 57,
        },
      ]),
    });
    monitoringAlertModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          enrollmentId: enrollmentTwoId,
          subjectName: 'Grace Hopper',
          calenId: 'CALEN-EFGH-5678',
          alertType: 'obligation_stress',
          title: 'Obligation stress detected',
          detail: 'Latest underwriting recommendation moved to review.',
          severity: 'High',
          triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      ]),
    });

    const result = await service.getPortfolio(user as any);

    expect(result.portfolio.metrics[1]).toEqual(
      expect.objectContaining({
        label: 'Portfolio Trend',
        value: '1',
      }),
    );
    expect(result.portfolio.summary.improvingProfiles).toBe(1);
    expect(result.portfolio.summary.decliningProfiles).toBe(1);
    expect(result.portfolio.summary.scoreDelta).toBe(5);
    expect(result.portfolio.summary.alertCoverageCount).toBe(1);
    expect(result.portfolio.scoreHistory).toEqual([
      { month: '2026-03', avg: 705, min: 700, max: 710, profiles: 2 },
      { month: '2026-04', avg: 710, min: 688, max: 732, profiles: 2 },
    ]);
    expect(result.portfolio.behaviourTrends).toEqual([
      {
        month: '2026-03',
        income: 76,
        payments: 71,
        resilience: 65,
        affordability: 71,
        monthlyInflow: 8750,
      },
      {
        month: '2026-04',
        income: 75,
        payments: 65,
        resilience: 67,
        affordability: 69,
        monthlyInflow: 8600,
      },
    ]);
    expect(result.portfolio.riskAlerts[0]).toEqual(
      expect.objectContaining({
        borrower: 'Grace Hopper',
        title: 'Obligation stress detected',
        type: 'obligation_stress',
        severity: 'High',
      }),
    );
  });

  it('delivers monitoring alerts to org notifications and webhook logs when configured', async () => {
    const enrollmentId = new Types.ObjectId('507f1f77bcf86cd799439081');
    monitoringEnrollmentModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          _id: enrollmentId,
          organizationId: new Types.ObjectId(user.organizationId),
          subjectUserId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          calenId: 'CALEN-ABCD-1234',
          subjectName: 'Ada Lovelace',
          status: 'active',
          source: 'underwriting_approval',
          enrollmentId: 'MON-ABCD1234',
          baseline: {
            score: 760,
            affordabilityScore: 82,
            resilienceScore: 80,
            confidenceLevel: 'high',
          },
          enrolledAt: new Date('2026-04-11T10:00:00.000Z'),
        },
      ]),
    });
    underwritingCaseModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        riskLevel: 'Moderate',
        underwritingAssessment: {
          affordabilityScore: 49,
          resilienceScore: 55,
          debtPressureIndicator: 'High',
          volatilitySignal: 'Volatile',
        },
        recommendation: {
          outcome: 'review',
        },
      }),
    });
    monitoringSnapshotModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        averageMonthlyInflow: 10000,
        resilienceScore: 80,
        volatilitySignal: 'Stable',
        debtPressureIndicator: 'Low',
        affordabilityScore: 82,
      }),
    });
    scoresService.getLatestScore.mockResolvedValueOnce({
      score: 640,
      composite: 56.4,
      bandKey: 'fair',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'moderate', score: 62 },
      reasonCodes: [],
      explanations: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 58, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 55, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 32, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 71, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-12T12:00:00.000Z'),
    });
    bankConnectionModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          dataSnapshot: {
            transactions: [
              { timestamp: '2026-03-02T00:00:00.000Z', amount: 4000 },
              { timestamp: '2026-04-02T00:00:00.000Z', amount: 3000 },
            ],
          },
        },
      ]),
    });
    organizationsService.findByIdOrThrow.mockResolvedValueOnce({
      _id: new Types.ObjectId(user.organizationId),
      slug: 'calen-capital',
      name: 'Calen Capital',
      onboardingData: {
        integrationPreferences: {
          enableWebhooks: true,
          webhookUrl: 'https://example.com/calen/webhooks',
          webhookSecret: 'whsec_test',
          webhookSubscriptions: ['monitoring_alert_triggered'],
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 202,
    });

    const result = await service.refreshPortfolio(user as any);

    expect(result.refresh.alertsCreated).toBeGreaterThan(0);
    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/calen/webhooks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-calen-event': 'monitoring_alert_triggered',
          'x-calen-signature': expect.any(String),
        }),
      }),
    );
    expect(monitoringWebhookDeliveryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'monitoring_alert_triggered',
        status: 'success',
        responseStatus: 202,
      }),
    );
  });

  it('refreshes monitoring snapshots and generates alerts from stored comparisons', async () => {
    const enrollmentId = new Types.ObjectId('507f1f77bcf86cd799439061');
    monitoringEnrollmentModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          _id: enrollmentId,
          organizationId: new Types.ObjectId(user.organizationId),
          subjectUserId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          calenId: 'CALEN-ABCD-1234',
          subjectName: 'Ada Lovelace',
          status: 'active',
          source: 'underwriting_approval',
          baseline: {
            score: 760,
            affordabilityScore: 82,
            resilienceScore: 80,
            confidenceLevel: 'high',
          },
          enrolledAt: new Date('2026-04-11T10:00:00.000Z'),
        },
      ]),
    });
    underwritingCaseModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        riskLevel: 'Moderate',
        underwritingAssessment: {
          affordabilityScore: 49,
          resilienceScore: 55,
          debtPressureIndicator: 'High',
          volatilitySignal: 'Volatile',
        },
        recommendation: {
          outcome: 'review',
        },
      }),
    });
    monitoringSnapshotModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue({
        averageMonthlyInflow: 10000,
        resilienceScore: 80,
        volatilitySignal: 'Stable',
        debtPressureIndicator: 'Low',
        affordabilityScore: 82,
      }),
    });
    scoresService.getLatestScore.mockResolvedValueOnce({
      score: 640,
      composite: 56.4,
      bandKey: 'fair',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'moderate', score: 62 },
      reasonCodes: [],
      explanations: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 58, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 55, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 32, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 71, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-12T12:00:00.000Z'),
    });
    bankConnectionModel.find.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue([
        {
          dataSnapshot: {
            transactions: [
              { timestamp: '2026-03-02T00:00:00.000Z', amount: 4000 },
              { timestamp: '2026-04-02T00:00:00.000Z', amount: 3000 },
            ],
          },
        },
      ]),
    });

    const result = await service.refreshPortfolio(user as any);

    expect(result.refresh.refreshedCount).toBe(1);
    expect(result.refresh.alertsCreated).toBeGreaterThan(0);
    expect(monitoringAlertModel.create).toHaveBeenCalled();
  });
});
