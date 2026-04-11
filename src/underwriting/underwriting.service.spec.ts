import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { BankConnection } from '../onboarding/schemas/bank-connection.schema';
import { OnboardingState } from '../onboarding/schemas/onboarding-state.schema';
import { TrustContact } from '../onboarding/schemas/trust-contact.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { ScoresService } from '../scores/scores.service';
import { UnderwritingCase } from './schemas/underwriting-case.schema';
import { UnderwritingService } from './underwriting.service';

function createModelMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
}

describe('UnderwritingService', () => {
  let service: UnderwritingService;
  const underwritingCaseModel = createModelMock();
  const onboardingStateModel = createModelMock();
  const bankConnectionModel = createModelMock();
  const trustContactModel = createModelMock();
  const accountsService = {
    findIndividualByShareId: jest.fn(),
    findUserByIdOrThrow: jest.fn(),
  };
  const organizationsService = {
    findByIdOrThrow: jest.fn(),
  };
  const scoresService = {
    getLatestScore: jest.fn(),
  };
  const user = {
    id: '507f1f77bcf86cd799439011',
    accountType: 'organisation',
    organizationId: '507f1f77bcf86cd799439099',
  } as const;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        UnderwritingService,
        { provide: AccountsService, useValue: accountsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: ScoresService, useValue: scoresService },
        {
          provide: getModelToken(UnderwritingCase.name),
          useValue: underwritingCaseModel,
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
      ],
    }).compile();

    service = moduleRef.get(UnderwritingService);
    underwritingCaseModel.create.mockImplementation(async (payload) => payload);
    underwritingCaseModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439021'),
          status: 'connected',
        },
      ]),
    });
    trustContactModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
  });

  it('creates an underwriting assessment snapshot and approves with conditions when exposure exceeds policy', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      displayName: 'Ada Lovelace',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
      country: 'United Kingdom',
      jobTitle: 'Founder',
    });
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      onboardingData: {
        riskPolicy: {
          minimumScore: 650,
          maxExposureAmount: 25000,
          defaultDecisionMode: 'manual_review',
        },
      },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      personalProfile: {
        city: 'London',
        country: 'United Kingdom',
      },
      employmentProfile: {
        employerName: 'Analytical Engines Ltd',
        jobTitle: 'Founder',
        monthlyIncome: 5000,
      },
      financialProfile: {
        monthlyIncome: 5000,
        monthlyExpenses: 1800,
        loanCount: 1,
        outstandingLoanTotal: 6000,
      },
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 760,
      composite: 76.3,
      bandKey: 'strong',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'high', score: 83 },
      explanations: ['Income patterns have been consistent across most observed months.'],
      reasonCodes: ['income_consistency_strong'],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 82, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 78, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 74, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 70, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'spending_discipline', label: 'Spending Discipline', score: 72, weight: 0.1, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 28, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-10T12:00:00.000Z'),
    });

    const result = await service.createCase(user as any, {
      calenId: 'CALEN-ABCD-1234',
      productType: 'Working Capital Advance',
      requestedAmount: 30000,
      requestedTermMonths: 24,
      monthlyObligationAmount: 1500,
      productCategory: 'working_capital',
      decisionPurpose: 'initial_underwriting_review',
    });

    expect(result.underwritingCase.obligationContext.requestedTermMonths).toBe(24);
    expect(result.underwritingCase.underwritingAssessment.affordabilityScore).toBeGreaterThanOrEqual(70);
    expect(result.underwritingCase.underwritingAssessment.debtPressureIndicator).toBe('Medium');
    expect(result.underwritingCase.recommendation.outcome).toBe('approve_with_conditions');
    expect(result.underwritingCase.recommendation.policyTriggers).toContain('max_exposure_25000');
    expect(result.underwritingCase.recommendation.conditions[0]).toContain('25000');
  });

  it('refreshes an existing open case when new obligation context is supplied', async () => {
    const existingCase = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
      organizationId: new Types.ObjectId(user.organizationId),
      subjectUserId: new Types.ObjectId('507f1f77bcf86cd799439032'),
      caseId: 'UW-EXISTING',
      calenId: 'CALEN-ABCD-1234',
      applicantName: 'Ada Lovelace',
      productType: 'General Review',
      requestedAmount: null,
      stage: 'new',
      riskLevel: 'Moderate',
      notes: '',
      applicantSummary: {
        name: 'Ada Lovelace',
        verified: true,
        location: 'London, United Kingdom',
        employerName: 'Analytical Engines Ltd',
        jobTitle: 'Founder',
        monthlyIncome: 6250,
        connectedBanks: 1,
        endorsedTrustContacts: 0,
        trustEndorsements: [],
      },
      scoreSnapshot: {
        score: 718,
        composite: 71.8,
        band: 'strong',
        status: 'ready',
        engineVersion: 'v1.phase1',
        confidenceLevel: 'moderate',
        confidenceScore: 72,
        explanations: [],
        reasonCodes: [],
        anomalyFlags: [],
        components: [
          { key: 'income_reliability', label: 'Income Reliability', score: 80, weight: 0.25, metrics: {}, reasons: [] },
          { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 90, weight: 0.2, metrics: {}, reasons: [] },
          { key: 'balance_resilience', label: 'Balance Resilience', score: 70, weight: 0.2, metrics: {}, reasons: [] },
          { key: 'spending_discipline', label: 'Spending Discipline', score: 75, weight: 0.1, metrics: {}, reasons: [] },
          { key: 'financial_volatility', label: 'Financial Volatility', score: 20, weight: 0.1, metrics: {}, reasons: [] },
        ],
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
      policySnapshot: {
        minimumScore: 650,
        maxExposureAmount: null,
        defaultDecisionMode: 'manual_review',
        triggeredRules: [],
        decisionRules: [],
      },
      obligationContext: {
        requestedAmount: null,
        requestedTermMonths: null,
        monthlyObligationAmount: null,
        productCategory: null,
        decisionPurpose: null,
      },
      underwritingAssessment: {
        affordabilityScore: null,
        incomeStabilityScore: null,
        resilienceScore: null,
        debtPressureIndicator: 'Medium',
        surplusCashEstimate: null,
        volatilitySignal: 'Moderate',
        strengths: [],
        riskFactors: [],
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
      recommendation: {
        outcome: 'review',
        summary: null,
        reasons: [],
        triggeredPolicies: [],
        policyTriggers: [],
        strengths: [],
        riskFactors: [],
        manualReviewReasons: [],
        conditions: [],
        decisionMode: 'manual_review',
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
      timeline: [],
      createdAt: new Date('2026-04-10T12:00:00.000Z'),
      updatedAt: new Date('2026-04-10T12:00:00.000Z'),
    };

    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      onboardingData: {
        riskPolicy: {
          minimumScore: 650,
          defaultDecisionMode: 'manual_review',
        },
      },
    });
    underwritingCaseModel.findOne.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValue(existingCase),
    });
    onboardingStateModel.findOne.mockResolvedValue({
      financialProfile: {
        monthlyIncome: 6250,
        monthlyExpenses: 1200,
      },
    });
    underwritingCaseModel.findOneAndUpdate.mockImplementation(
      async (_query, update) => ({
        ...existingCase,
        ...update.$set,
        timeline: [update.$push.timeline],
      }),
    );

    const result = await service.createCase(user as any, {
      calenId: 'CALEN-ABCD-1234',
      productType: 'Business Loan',
      requestedAmount: 20000,
      requestedTermMonths: 12,
      monthlyObligationAmount: 4000,
    });

    expect(accountsService.findIndividualByShareId).not.toHaveBeenCalled();
    expect(result.underwritingCase.caseId).toBe('UW-EXISTING');
    expect(result.underwritingCase.productType).toBe('Business Loan');
    expect(result.underwritingCase.requestedAmount).toBe(20000);
    expect(result.underwritingCase.obligationContext).toMatchObject({
      requestedAmount: 20000,
      requestedTermMonths: 12,
      monthlyObligationAmount: 4000,
    });
    expect(result.underwritingCase.underwritingAssessment.surplusCashEstimate).toBe(1050);
    expect(result.underwritingCase.timeline[0].type).toBe('case_context_updated');
  });

  it('requires an override reason before approving a conditional case', async () => {
    underwritingCaseModel.findOne.mockResolvedValueOnce({
      recommendation: {
        outcome: 'approve_with_conditions',
        conditions: ['Reduce requested amount to 20000 or below.'],
        manualReviewReasons: [],
      },
    });

    await expect(
      service.updateCaseStage(user as any, 'UW-EXISTING', {
        stage: 'approved',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'APPROVAL_OVERRIDE_REASON_REQUIRED',
      },
    });

    expect(underwritingCaseModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('records an audit event when approval override reason is supplied', async () => {
    const existingCase = {
      organizationId: new Types.ObjectId(user.organizationId),
      caseId: 'UW-EXISTING',
      calenId: 'CALEN-ABCD-1234',
      applicantName: 'Ada Lovelace',
      stage: 'analysis',
      riskLevel: 'Moderate',
      productType: 'Personal Loan',
      requestedAmount: 25000,
      notes: '',
      applicantSummary: {
        name: 'Ada Lovelace',
        verified: true,
        location: 'London, United Kingdom',
        employerName: 'Analytical Engines Ltd',
        jobTitle: 'Founder',
        monthlyIncome: 6250,
        connectedBanks: 1,
        endorsedTrustContacts: 0,
        trustEndorsements: [],
      },
      scoreSnapshot: { score: 718, band: 'strong' },
      policySnapshot: {
        minimumScore: 650,
        maxExposureAmount: 20000,
        defaultDecisionMode: 'manual_review',
        triggeredRules: ['max_exposure_20000'],
        decisionRules: [],
      },
      obligationContext: {
        requestedAmount: 25000,
        requestedTermMonths: 24,
        monthlyObligationAmount: 2000,
        productCategory: null,
        decisionPurpose: null,
      },
      underwritingAssessment: {
        affordabilityScore: 63,
        incomeStabilityScore: 80,
        resilienceScore: 7,
        debtPressureIndicator: 'Medium',
        surplusCashEstimate: 1062,
        volatilitySignal: 'Stable',
        strengths: [],
        riskFactors: [],
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
      recommendation: {
        outcome: 'approve_with_conditions',
        summary: 'Profile is approvable if the organisation conditions are met.',
        reasons: [],
        triggeredPolicies: ['max_exposure_20000'],
        policyTriggers: ['max_exposure_20000'],
        strengths: [],
        riskFactors: [],
        manualReviewReasons: [],
        conditions: ['Reduce requested amount to 20000 or below.'],
        decisionMode: 'manual_review',
        generatedAt: new Date('2026-04-10T12:00:00.000Z'),
      },
      timeline: [],
      createdAt: new Date('2026-04-10T12:00:00.000Z'),
      updatedAt: new Date('2026-04-10T12:00:00.000Z'),
    };

    underwritingCaseModel.findOne.mockResolvedValueOnce(existingCase);
    underwritingCaseModel.findOneAndUpdate.mockImplementation(
      async (_query, update) => ({
        ...existingCase,
        ...update.$set,
        timeline: update.$push.timeline.$each,
      }),
    );

    const result = await service.updateCaseStage(user as any, 'UW-EXISTING', {
      stage: 'approved',
      overrideReason: 'Approved above cap because senior risk accepted the exposure.',
    });

    expect(result.underwritingCase.stage).toBe('approved');
    expect(result.underwritingCase.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'approval_override' }),
      ]),
    );
    expect(result.underwritingCase.timeline[1].detail).toContain(
      'senior risk accepted',
    );
  });

  it('declines a case when affordability is materially short and score is below policy', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      displayName: 'Grace Hopper',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
      country: 'United Kingdom',
      jobTitle: 'Consultant',
    });
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      onboardingData: {
        riskPolicy: {
          minimumScore: 700,
          maxExposureAmount: 50000,
          defaultDecisionMode: 'manual_review',
        },
      },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      personalProfile: {
        city: 'Manchester',
        country: 'United Kingdom',
      },
      employmentProfile: {
        employerName: 'Compiler House',
        jobTitle: 'Consultant',
        monthlyIncome: 3000,
      },
      financialProfile: {
        monthlyIncome: 3000,
        monthlyExpenses: 1700,
        loanCount: 3,
        outstandingLoanTotal: 18000,
      },
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 620,
      composite: 53.4,
      bandKey: 'fair',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'moderate', score: 61 },
      explanations: ['Several observed months show tighter outflow pressure than we would like.'],
      reasonCodes: ['cashflow_pattern_unstable'],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 58, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 44, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 41, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 36, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'spending_discipline', label: 'Spending Discipline', score: 40, weight: 0.1, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 58, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-10T12:00:00.000Z'),
    });

    const result = await service.createCase(user as any, {
      calenId: 'CALEN-DCBA-4321',
      productType: 'Personal Loan',
      requestedAmount: 24000,
      requestedTermMonths: 12,
      monthlyObligationAmount: 2200,
    });

    expect(result.underwritingCase.underwritingAssessment.affordabilityScore).toBeLessThan(40);
    expect(result.underwritingCase.underwritingAssessment.surplusCashEstimate).toBeLessThan(0);
    expect(result.underwritingCase.recommendation.outcome).toBe('decline');
    expect(result.underwritingCase.recommendation.policyTriggers).toEqual(
      expect.arrayContaining(['minimum_score_700', 'affordability_shortfall']),
    );
  });

  it('applies saved organisation decision rules to live case triage', async () => {
    accountsService.findIndividualByShareId.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
      displayName: 'Katherine Johnson',
      emailVerifiedAt: new Date('2026-04-01T10:00:00.000Z'),
      country: 'United Kingdom',
      jobTitle: 'Analyst',
    });
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      onboardingData: {
        riskPolicy: {
          minimumScore: 650,
          maxExposureAmount: 50000,
          defaultDecisionMode: 'manual_review',
        },
        workspaceData: {
          decisionRules: [
            {
              id: 77,
              field: 'Affordability Score',
              operator: '<',
              value: '90',
              action: 'Flag for Review',
            },
          ],
        },
      },
    });
    onboardingStateModel.findOne.mockResolvedValue({
      personalProfile: {
        city: 'London',
        country: 'United Kingdom',
      },
      employmentProfile: {
        employerName: 'Orbital Analytics',
        jobTitle: 'Analyst',
        monthlyIncome: 5000,
      },
      financialProfile: {
        monthlyIncome: 5000,
        monthlyExpenses: 1800,
        loanCount: 1,
        outstandingLoanTotal: 6000,
      },
    });
    scoresService.getLatestScore.mockResolvedValue({
      score: 760,
      composite: 76.3,
      bandKey: 'strong',
      status: 'ready',
      engineVersion: 'v1.phase1',
      confidence: { level: 'high', score: 83 },
      explanations: ['Income patterns have been consistent across most observed months.'],
      reasonCodes: ['income_consistency_strong'],
      anomalyFlags: [],
      components: [
        { key: 'income_reliability', label: 'Income Reliability', score: 82, weight: 0.25, metrics: {}, reasons: [] },
        { key: 'cash_flow_stability', label: 'Cash Flow Stability', score: 78, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'balance_resilience', label: 'Balance Resilience', score: 74, weight: 0.2, metrics: {}, reasons: [] },
        { key: 'obligation_consistency', label: 'Obligation Consistency', score: 70, weight: 0.15, metrics: {}, reasons: [] },
        { key: 'spending_discipline', label: 'Spending Discipline', score: 72, weight: 0.1, metrics: {}, reasons: [] },
        { key: 'financial_volatility', label: 'Financial Volatility', score: 28, weight: 0.1, metrics: {}, reasons: [] },
      ],
      generatedAt: new Date('2026-04-10T12:00:00.000Z'),
    });

    const result = await service.createCase(user as any, {
      calenId: 'CALEN-RULE-1234',
      productType: 'Working Capital Advance',
      requestedAmount: 10000,
      requestedTermMonths: 24,
      monthlyObligationAmount: 500,
    });

    expect(result.underwritingCase.stage).toBe('review');
    expect(result.underwritingCase.recommendation.outcome).toBe('review');
    expect(result.underwritingCase.policySnapshot.decisionRules).toEqual([
      {
        id: 77,
        field: 'Affordability Score',
        operator: '<',
        value: '90',
        action: 'Flag for Review',
        trigger: 'decision_rule_77_flag_for_review',
      },
    ]);
    expect(result.underwritingCase.recommendation.policyTriggers).toContain(
      'decision_rule_77_flag_for_review',
    );
    expect(result.underwritingCase.recommendation.manualReviewReasons[0]).toContain(
      'Organisation decision rule requested manual review',
    );
    expect(result.underwritingCase.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'case_triaged',
          title: 'Case routed to Under Review',
        }),
      ]),
    );
  });

  it('throws when a CALEN profile cannot be found', async () => {
    organizationsService.findByIdOrThrow.mockResolvedValue({
      _id: new Types.ObjectId(user.organizationId),
      onboardingData: {},
    });
    accountsService.findIndividualByShareId.mockResolvedValue(null);

    await expect(
      service.createCase(user as any, {
        calenId: 'CALEN-FFFF-0000',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exports a stored decision record from the underwriting snapshot', async () => {
    const storedCase = {
      caseId: 'UW-ABCD1234',
      calenId: 'CALEN-ABCD-1234',
      stage: 'analysis',
      riskLevel: 'Moderate',
      productType: 'Working Capital Advance',
      createdAt: new Date('2026-04-11T10:00:00.000Z'),
      updatedAt: new Date('2026-04-11T12:00:00.000Z'),
      notes: 'Needs final reviewer sign-off.',
      applicantSummary: {
        name: 'Ada Lovelace',
        verified: true,
        location: 'London, United Kingdom',
        employerName: 'Analytical Engines Ltd',
        jobTitle: 'Founder',
        monthlyIncome: 5000,
        connectedBanks: 2,
        endorsedTrustContacts: 1,
        trustEndorsements: [],
      },
      obligationContext: {
        requestedAmount: 30000,
        requestedTermMonths: 24,
        monthlyObligationAmount: 1500,
        productCategory: 'working_capital',
        decisionPurpose: 'initial_underwriting_review',
      },
      scoreSnapshot: {
        score: 760,
        band: 'strong',
        status: 'ready',
        confidenceLevel: 'high',
      },
      underwritingAssessment: {
        affordabilityScore: 81,
        incomeStabilityScore: 82,
        resilienceScore: 74,
        debtPressureIndicator: 'Medium',
        surplusCashEstimate: 1490,
        volatilitySignal: 'Stable',
        strengths: ['Income patterns appear stable across the observed period.'],
        riskFactors: ['Requested exposure exceeds current automatic approval range.'],
        generatedAt: new Date('2026-04-11T10:01:00.000Z'),
      },
      policySnapshot: {
        minimumScore: 650,
        maxExposureAmount: 25000,
        defaultDecisionMode: 'manual_review',
        triggeredRules: ['max_exposure_25000'],
      },
      recommendation: {
        outcome: 'approve_with_conditions',
        summary: 'Profile is approvable if the organisation conditions are met.',
        reasons: ['Reduce requested amount to 25000 or below to fit current exposure policy.'],
        triggeredPolicies: ['max_exposure_25000'],
        policyTriggers: ['max_exposure_25000'],
        strengths: ['Income patterns appear stable across the observed period.'],
        riskFactors: ['Requested exposure exceeds current automatic approval range.'],
        manualReviewReasons: [],
        conditions: ['Reduce requested amount to 25000 or below to fit current exposure policy.'],
        decisionMode: 'manual_review',
        generatedAt: new Date('2026-04-11T10:01:30.000Z'),
      },
      timeline: [
        {
          type: 'case_created',
          title: 'Underwriting case created',
          detail: 'Created from profile CALEN-ABCD-1234.',
          actorId: user.id,
          createdAt: new Date('2026-04-11T10:00:00.000Z'),
        },
      ],
    };
    underwritingCaseModel.findOne.mockResolvedValueOnce(storedCase);

    const result = await service.exportCase(user as any, 'UW-ABCD1234');

    expect(result.export.format).toBe('json');
    expect(result.export.fileName).toBe('UW-ABCD1234-decision-record.json');
    expect(result.export.decisionRecord.caseId).toBe('UW-ABCD1234');
    expect(result.export.decisionRecord.underwritingAssessment.affordabilityScore).toBe(81);
    expect(result.export.decisionRecord.recommendation.outcome).toBe('approve_with_conditions');
    expect(result.export.decisionRecord.reviewerNotes).toBe('Needs final reviewer sign-off.');
  });
});
