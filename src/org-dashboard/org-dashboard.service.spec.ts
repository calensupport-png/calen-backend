import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import { Notification } from '../dashboard/schemas/notification.schema';
import { UserSettings } from '../dashboard/schemas/user-settings.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { OnboardingState } from '../onboarding/schemas/onboarding-state.schema';
import { TrustContact } from '../onboarding/schemas/trust-contact.schema';
import { OrganizationInvitation } from '../org-onboarding/schemas/organization-invitation.schema';
import { OrganizationVerification } from '../org-onboarding/schemas/organization-verification.schema';
import { PassportAccessService } from '../passport/passport-access.service';
import { ScoresService } from '../scores/scores.service';
import { MonitoringWebhookDelivery } from '../monitoring/schemas/monitoring-webhook-delivery.schema';
import { OrgDashboardService } from './org-dashboard.service';
import { OrganizationPipelineApplicant } from './schemas/organization-pipeline-applicant.schema';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
}

describe('OrgDashboardService', () => {
  let service: OrgDashboardService;

  const notificationModel = createModelMock();
  const userSettingsModel = createModelMock();
  const invitationModel = createModelMock();
  const verificationModel = createModelMock();
  const pipelineApplicantModel = createModelMock();
  const onboardingStateModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const trustContactModel = createModelMock();
  const monitoringWebhookDeliveryModel = createModelMock();
  const organizationsService = {
    findByIdOrThrow: jest.fn(),
    updateOrganizationProfile: jest.fn(),
    updateOnboardingData: jest.fn(),
  };
  const accountsService = {
    findUserByIdOrThrow: jest.fn(),
    listUsersByOrganization: jest.fn(),
    findIndividualByShareId: jest.fn(),
  };
  const scoresService = {
    getLatestScore: jest.fn(),
  };
  const passportAccessService = {
    findAccessibleIndividualByShareId: jest.fn(),
  };

  const orgUser: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'ops@calen.example',
    roles: [],
    accountType: AccountType.ORGANISATION,
    sessionId: 'session-id',
    organizationId: '507f1f77bcf86cd799439099',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    accountsService.findUserByIdOrThrow.mockResolvedValue({
      _id: orgUser.id,
      email: orgUser.email,
      displayName: 'Phoebe Ops',
      status: 'active',
    });
    accountsService.listUsersByOrganization.mockResolvedValue([
      {
        _id: orgUser.id,
        email: orgUser.email,
        displayName: 'Phoebe Ops',
        status: 'active',
        lastLoginAt: new Date('2026-03-28T09:00:00.000Z'),
      },
      {
        _id: '507f1f77bcf86cd799439012',
        email: 'risk@calen.example',
        displayName: 'Risk User',
        status: 'active',
      },
    ]);
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Capital',
      slug: 'calen-capital',
      status: 'pending_verification',
      industry: 'Financial Services',
      companySize: '11-50',
      country: 'GB',
      website: 'https://calen.example',
      jurisdiction: 'FCA',
      primaryAdminUserId: orgUser.id,
      onboardingData: {
        integrationPreferences: {
          environment: 'sandbox',
          enableApiAccess: true,
          enableWebhooks: false,
          enabledProducts: ['score', 'profile_share'],
        },
        riskPolicy: {
          minimumScore: 650,
          maxExposureAmount: 25000,
          defaultDecisionMode: 'manual_review',
        },
      },
    });
    invitationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          {
            _id: 'invite-1',
            email: 'analyst@calen.example',
            role: 'risk_analyst',
            status: 'pending',
            expiresAt: new Date('2026-04-04T00:00:00.000Z'),
            createdAt: new Date('2026-03-28T10:00:00.000Z'),
          },
        ]),
      }),
    });
    verificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        _id: 'verification-1',
        status: 'pending_review',
        provider: 'mock-kyb-provider',
        documentType: 'certificate_of_incorporation',
        referenceNumber: 'COI-100',
        submittedAt: new Date('2026-03-27T10:00:00.000Z'),
      }),
    });
    monitoringWebhookDeliveryModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([]),
      }),
    });
    notificationModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: 'notification-1',
          category: 'org_setup',
          title: 'Workspace ready',
          body: 'Welcome',
          readAt: null,
          createdAt: new Date('2026-03-28T10:30:00.000Z'),
        },
      ]),
    });
    pipelineApplicantModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    onboardingStateModel.findOne.mockResolvedValue({
      personalProfile: {
        city: 'Lagos',
        country: 'NG',
      },
      employmentProfile: {
        employerName: 'Calen Labs',
        jobTitle: 'Product Manager',
        monthlyIncome: 350000,
      },
      financialProfile: {
        monthlyIncome: 320000,
      },
      completedSteps: ['personal_profile', 'employment_profile', 'financial_profile'],
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          status: 'connected',
        },
      ]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          fullName: 'Bola Ade',
          relationship: 'Employer',
          status: 'endorsed',
          responseTrustLevel: 5,
          respondedAt: new Date('2026-03-20T09:00:00.000Z'),
        },
        {
          fullName: 'Tunde Cole',
          relationship: 'Accountant',
          status: 'request_sent',
          requestedAt: new Date('2026-03-18T09:00:00.000Z'),
        },
      ]),
    });
    scoresService.getLatestScore.mockResolvedValue({
      id: 'score-run-1',
      score: 742,
      composite: 74.2,
      band: 'strong',
      bandKey: 'strong',
      orgLabel: 'Strong',
      userLabel: 'Strong',
      status: 'completed',
      provider: 'calen-v1',
      engineVersion: 'v1.phase1',
      confidence: {
        score: 82,
        level: 'high',
      },
      reasonCodes: [],
      explanations: [],
      factors: [],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 78, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 74, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 71, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'spending_discipline', label: 'Spending Discipline', score: 69, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 68, weight: 0.1, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 28, weight: 0.1, metrics: {}, reasons: [] },
      ],
      inputWindow: {
        startDate: new Date('2025-12-01T00:00:00.000Z'),
        endDate: new Date('2026-03-31T00:00:00.000Z'),
        observedDays: 120,
        observedMonths: 4,
        transactionCount: 160,
        connectionCount: 1,
      },
      generatedAt: new Date('2026-03-31T00:00:00.000Z'),
    });
    const accessibleAccount = {
      _id: '507f1f77bcf86cd799439021',
      displayName: 'Amina Yusuf',
      emailVerifiedAt: new Date('2026-03-01T10:00:00.000Z'),
      country: 'NG',
      jobTitle: 'Product Manager',
      profileId: {
        shareId: 'CALEN-ABCD-1234',
        onboardingStatus: 'completed',
      },
    };
    accountsService.findIndividualByShareId.mockResolvedValue(accessibleAccount);
    passportAccessService.findAccessibleIndividualByShareId.mockResolvedValue(
      accessibleAccount,
    );
    userSettingsModel.findOneAndUpdate.mockResolvedValue({
      marketingEmails: true,
      productUpdates: true,
      securityAlerts: true,
      pushNotifications: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrgDashboardService,
        {
          provide: AccountsService,
          useValue: accountsService,
        },
        {
          provide: OrganizationsService,
          useValue: organizationsService,
        },
        {
          provide: PassportAccessService,
          useValue: passportAccessService,
        },
        {
          provide: ScoresService,
          useValue: scoresService,
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
          provide: getModelToken(OrganizationInvitation.name),
          useValue: invitationModel,
        },
        {
          provide: getModelToken(OrganizationVerification.name),
          useValue: verificationModel,
        },
        {
          provide: getModelToken(OrganizationPipelineApplicant.name),
          useValue: pipelineApplicantModel,
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
          provide: getModelToken(MonitoringWebhookDelivery.name),
          useValue: monitoringWebhookDeliveryModel,
        },
      ],
    }).compile();

    service = moduleRef.get(OrgDashboardService);
  });

  it('returns organization dashboard summary data', async () => {
    const result = await service.getDashboard(orgUser);

    expect(result.dashboard.organization.name).toBe('Calen Capital');
    expect(result.dashboard.summary.pendingInvitations).toBe(1);
    expect(result.dashboard.summary.enabledProducts).toBe(2);
    expect(result.dashboard.policy.minimumScore).toBe(650);
    expect(result.dashboard.recentActivity).toHaveLength(3);
  });

  it('returns organization settings composed from org data and user preferences', async () => {
    const result = await service.getSettings(orgUser);

    expect(result.settings.organization.name).toBe('Calen Capital');
    expect(result.settings.riskPolicy.maxExposureAmount).toBe(25000);
    expect(result.settings.notifications.securityAlerts).toBe(true);
  });

  it('returns real CALEN profile search data for the organization', async () => {
    const result = await service.getProfileSearch(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });

    expect(result.search.resultCount).toBe(1);
    expect(result.search.profiles).toHaveLength(1);
    expect(result.search.profiles[0]).toMatchObject({
      id: 'CALEN-ABCD-1234',
      name: 'Amina Yusuf',
      country: 'NG',
      city: 'Lagos',
      employerName: 'Calen Labs',
    });
    expect(result.search.appliedFilters).toEqual({
      calenId: 'CALEN-ABCD-1234',
    });
  });

  it('returns API integration data for the organization', async () => {
    const result = await service.getApiIntegrations(orgUser);

    expect(Array.isArray(result.apiIntegrations.apiKeys)).toBe(true);
    expect(Array.isArray(result.apiIntegrations.recentLogs)).toBe(true);
    expect(Array.isArray(result.apiIntegrations.webhooks.recentDeliveries)).toBe(
      true,
    );
  });

  it('returns real CALEN risk analysis data for the organization', async () => {
    const result = await service.getRiskAnalysis(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });

    expect(result.riskAnalysis.profile).toMatchObject({
      id: 'CALEN-ABCD-1234',
      name: 'Amina Yusuf',
      score: 742,
      riskLevel: 'Low',
      assessment: {
        affordabilityScore: 80,
        confidenceLevel: 'high',
      },
      recommendationPreview: {
        outcome: 'approve',
      },
      profileSummary: {
        country: 'NG',
        city: 'Lagos',
        connectedBanks: 1,
        endorsedTrustContacts: 1,
      },
    });
    expect(result.riskAnalysis.profile?.trustEndorsements).toHaveLength(2);
    expect(result.riskAnalysis.appliedFilters).toEqual({
      calenId: 'CALEN-ABCD-1234',
    });
  });

  it('returns decision engine data with a real CALEN simulation', async () => {
    const result = await service.getDecisionEngine(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });

    expect(result.decisionEngine.workflowSteps).toHaveLength(4);
    expect(result.decisionEngine.simulationResults[0]).toMatchObject({
      name: 'Amina Yusuf',
      score: 742,
      affordabilityScore: 80,
      confidenceLevel: 'high',
      result: 'Approved',
    });
    expect(result.decisionEngine.availableFields).toHaveLength(6);
    expect(result.decisionEngine.simulationProfile).toMatchObject({
      recommendation: 'approve',
      confidenceLevel: 'high',
    });
    expect(result.decisionEngine.appliedFilters).toEqual({
      calenId: 'CALEN-ABCD-1234',
    });
  });

  it('hides applicant details when no active Passport grant exists', async () => {
    passportAccessService.findAccessibleIndividualByShareId.mockResolvedValue(
      null,
    );

    const search = await service.getProfileSearch(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });
    const riskAnalysis = await service.getRiskAnalysis(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });
    const decisionEngine = await service.getDecisionEngine(orgUser, {
      calenId: 'CALEN-ABCD-1234',
    });

    expect(search.search.resultCount).toBe(0);
    expect(search.search.profiles).toHaveLength(0);
    expect(riskAnalysis.riskAnalysis.profile).toBeNull();
    expect(decisionEngine.decisionEngine.simulationResults).toHaveLength(0);
  });

  it('returns trust signal analytics from real pipeline applicants only', async () => {
    pipelineApplicantModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          applicantId: 'APP-REAL-1',
          calenId: 'CALEN-REAL-0001',
          name: 'Ngozi Okafor',
          score: 721,
          annualIncome: 4800000,
          income: 78,
          savings: 61,
          debt: 26,
          trust: 82,
          location: 'Lagos',
          industry: 'Technology',
          verified: true,
          product: 'Working Capital',
          stage: 'review',
          riskLevel: 'Low',
          trustEndorsements: [
            {
              type: 'Employer',
              source: 'Northstar Labs',
              status: 'Verified',
              date: '2026-02-10',
              strength: 90,
            },
            {
              type: 'Accountant',
              source: 'Adeyemi & Co',
              status: 'Verified',
              date: '2026-03-20',
              strength: 84,
            },
            {
              type: 'Professional',
              source: 'PM Guild',
              status: 'Pending',
              date: '2026-03-05',
              strength: 0,
            },
          ],
          scoreFactors: [],
          indicators: [],
        },
      ]),
    });

    const result = await service.getTrustSignals(orgUser);

    expect(result.trustSignals.metrics).toEqual([
      { label: 'Verified Signals', value: '2' },
      { label: 'Pending Signals', value: '1' },
      { label: 'Avg Verification Strength', value: '87%' },
      { label: 'Profiles With Signals', value: '1' },
    ]);
    expect(result.trustSignals.endorsementTypes).toEqual([
      { name: 'Employer', value: 1, color: 'hsl(var(--primary))' },
      { name: 'Landlord', value: 0, color: 'hsl(var(--green-trust))' },
      { name: 'Accountant', value: 1, color: 'hsl(var(--gold))' },
      { name: 'Professional', value: 1, color: 'hsl(var(--blue-bright))' },
    ]);
    expect(result.trustSignals.reliabilityData).toEqual([
      { month: 'Feb 2026', reliability: 90 },
      { month: 'Mar 2026', reliability: 84 },
    ]);
    expect(result.trustSignals.recentSignals[0]).toMatchObject({
      type: 'Accountant',
      source: 'Adeyemi & Co',
      subject: 'Ngozi Okafor',
      status: 'Verified',
      strength: 84,
      date: '2026-03-20',
    });
  });

  it('updates organization settings across profile and onboarding data', async () => {
    organizationsService.updateOrganizationProfile.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Capital Labs',
      slug: 'calen-capital',
      status: 'pending_verification',
      industry: 'Financial Services',
      companySize: '11-50',
      country: 'GB',
      website: 'https://labs.calen.example',
      jurisdiction: 'FCA',
      onboardingData: {
        integrationPreferences: {
          environment: 'sandbox',
          enableApiAccess: true,
          enableWebhooks: false,
          enabledProducts: ['score'],
        },
        riskPolicy: {
          minimumScore: 650,
        },
      },
    });
    organizationsService.updateOnboardingData.mockResolvedValue({
      _id: orgUser.organizationId,
      name: 'Calen Capital Labs',
      slug: 'calen-capital',
      status: 'pending_verification',
      industry: 'Financial Services',
      companySize: '11-50',
      country: 'GB',
      website: 'https://labs.calen.example',
      jurisdiction: 'FCA',
      onboardingData: {
        integrationPreferences: {
          environment: 'production',
          enableApiAccess: true,
          enableWebhooks: true,
          enabledProducts: ['score', 'profile_share'],
        },
        riskPolicy: {
          minimumScore: 680,
          maxExposureAmount: 50000,
          defaultDecisionMode: 'manual_review',
        },
        securityControls: {
          mfaRequired: true,
          sessionTimeoutMinutes: 45,
        },
      },
    });

    const result = await service.updateSettings(orgUser, {
      organization: {
        name: 'Calen Capital Labs',
        website: 'https://labs.calen.example',
      },
      riskPolicy: {
        minimumScore: 680,
        maxExposureAmount: 50000,
      },
      integrationPreferences: {
        environment: 'production',
        enableWebhooks: true,
        enabledProducts: ['score', 'profile_share'],
      },
      notifications: {
        securityAlerts: false,
      },
      security: {
        sessionTimeoutMinutes: 45,
      },
    });

    expect(organizationsService.updateOrganizationProfile).toHaveBeenCalled();
    expect(organizationsService.updateOnboardingData).toHaveBeenCalled();
    expect(userSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      { userId: expect.any(Types.ObjectId) },
      { securityAlerts: false },
      { new: true },
    );
    expect(result.settings.organization.name).toBe('Calen Capital Labs');
    expect(result.settings.integrationPreferences.enableWebhooks).toBe(true);
  });

  it('rejects non-organization users', async () => {
    await expect(
      service.getDashboard({
        ...orgUser,
        accountType: AccountType.INDIVIDUAL,
        organizationId: undefined,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
