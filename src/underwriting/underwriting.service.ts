import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import { OrganizationsService } from '../organizations/organizations.service';
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
import { ScoresService } from '../scores/scores.service';
import { CreateUnderwritingCaseDto } from './dto/create-underwriting-case.dto';
import { UpdateUnderwritingCaseNotesDto } from './dto/update-underwriting-case-notes.dto';
import { UpdateUnderwritingCaseStageDto } from './dto/update-underwriting-case-stage.dto';
import {
  UnderwritingCase,
  UnderwritingCaseDocument,
} from './schemas/underwriting-case.schema';

type OrganizationShape = {
  _id?: unknown;
  onboardingData?: Record<string, unknown>;
};

type UnderwritingOutcome =
  | 'approve'
  | 'approve_with_conditions'
  | 'review'
  | 'decline';

type UnderwritingScoreSnapshotShape = {
  score: number | null;
  composite: number | null;
  band: string | null;
  status: string;
  engineVersion: string | null;
  confidenceLevel: string | null;
  confidenceScore: number | null;
  explanations: string[];
  reasonCodes: string[];
  anomalyFlags: Array<{
    code: string;
    severity: string;
    detail?: string;
  }>;
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    metrics: Record<string, number | null>;
    reasons: string[];
  }>;
  generatedAt: Date | null;
};

type UnderwritingPolicySnapshotShape = {
  minimumScore: number | null;
  maxExposureAmount: number | null;
  defaultDecisionMode: string;
  triggeredRules: string[];
  decisionRules: UnderwritingDecisionRuleMatchShape[];
};

type UnderwritingObligationContextShape = {
  requestedAmount: number | null;
  requestedTermMonths: number | null;
  monthlyObligationAmount: number | null;
  productCategory: string | null;
  decisionPurpose: string | null;
};

type UnderwritingAssessmentShape = {
  affordabilityScore: number | null;
  incomeStabilityScore: number | null;
  resilienceScore: number | null;
  debtPressureIndicator: 'Low' | 'Medium' | 'High';
  surplusCashEstimate: number | null;
  volatilitySignal: 'Stable' | 'Moderate' | 'Volatile';
  strengths: string[];
  riskFactors: string[];
  generatedAt: Date;
};

type WorkspaceDecisionRuleShape = {
  id: number;
  field: string;
  operator: string;
  value: string;
  action: string;
};

type UnderwritingDecisionRuleMatchShape = WorkspaceDecisionRuleShape & {
  trigger: string;
};

type UserLike = Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;

@Injectable()
export class UnderwritingService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly organizationsService: OrganizationsService,
    private readonly scoresService: ScoresService,
    @InjectModel(UnderwritingCase.name)
    private readonly underwritingCaseModel: Model<UnderwritingCaseDocument>,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
    @InjectModel(TrustContact.name)
    private readonly trustContactModel: Model<TrustContactDocument>,
  ) {}

  async getPipeline(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const cases = await this.underwritingCaseModel
      .find({ organizationId })
      .sort({ createdAt: -1 });

    return {
      pipeline: {
        stages: [
          { key: 'new', label: 'New Applicants', color: 'border-t-primary' },
          {
            key: 'review',
            label: 'Under Review',
            color: 'border-t-blue-bright',
          },
          {
            key: 'analysis',
            label: 'Risk Analysis',
            color: 'border-t-gold',
          },
          {
            key: 'approved',
            label: 'Approved',
            color: 'border-t-trust-green',
          },
          {
            key: 'rejected',
            label: 'Rejected',
            color: 'border-t-destructive',
          },
        ],
        cases: cases.map((underwritingCase) =>
          this.serializeCaseSummary(underwritingCase),
        ),
      },
    };
  }

  async createCase(user: AuthenticatedUser, dto: CreateUnderwritingCaseDto) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const organizationId = this.toObjectId(user.organizationId!);
    const normalizedCalenId = dto.calenId.trim().toUpperCase();
    const existingCase = await this.underwritingCaseModel
      .findOne({
        organizationId,
        calenId: normalizedCalenId,
        stage: { $nin: ['approved', 'rejected'] },
      })
      .sort({ createdAt: -1 });

    if (existingCase) {
      if (!this.hasCaseContextInput(dto)) {
        return {
          underwritingCase: this.serializeCaseDetail(existingCase),
        };
      }

      return this.refreshExistingCaseContext(
        user,
        existingCase,
        dto,
        organization,
      );
    }

    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      throw new NotFoundException({
        code: 'UNDERWRITING_PROFILE_NOT_FOUND',
        message: 'No CALEN profile matched that identifier.',
      });
    }

    const subjectUserId = this.toObjectId(String(account._id));
    const [onboardingState, bankConnections, trustContacts, latestScore] =
      await Promise.all([
        this.onboardingStateModel.findOne({ userId: subjectUserId }),
        this.bankConnectionModel
          .find({ userId: subjectUserId, status: 'connected' })
          .sort({ createdAt: -1 }),
        this.trustContactModel.find({ userId: subjectUserId }).sort({
          createdAt: -1,
        }),
        this.scoresService.getLatestScore(String(account._id)),
      ]);

    const policySnapshot = this.buildPolicySnapshot(organization);
    const decisionRules = this.getOrganizationDecisionRules(organization);
    const applicantSummary = this.buildApplicantSummary(
      account,
      onboardingState,
      bankConnections,
      trustContacts,
    );
    const scoreSnapshot = this.buildScoreSnapshot(latestScore);
    const obligationContext = this.buildObligationContext(dto);
    const underwritingAssessment = this.buildUnderwritingAssessment(
      scoreSnapshot,
      onboardingState,
      obligationContext,
      applicantSummary,
    );
    const recommendation = this.buildRecommendation(
      scoreSnapshot,
      policySnapshot,
      underwritingAssessment,
      obligationContext,
      decisionRules,
    );
    const initialStage = this.getInitialStageFromRecommendation(
      recommendation.outcome,
      policySnapshot.defaultDecisionMode,
    );
    const createdCase = await this.underwritingCaseModel.create({
      organizationId,
      subjectUserId,
      createdByUserId: this.toObjectId(user.id),
      caseId: this.generateCaseId(),
      calenId: normalizedCalenId,
      applicantName: applicantSummary.name,
      productType: dto.productType?.trim() || 'General Review',
      requestedAmount:
        typeof dto.requestedAmount === 'number' ? dto.requestedAmount : null,
      stage: initialStage,
      riskLevel: this.getRiskLevelFromRecommendation(
        recommendation.outcome,
        scoreSnapshot.score,
      ),
      notes: '',
      applicantSummary,
      scoreSnapshot,
      policySnapshot,
      obligationContext,
      underwritingAssessment,
      recommendation,
      timeline: [
        {
          type: 'case_created',
          title: 'Underwriting case created',
          detail: `Created from profile ${normalizedCalenId}.`,
          actorId: user.id,
          createdAt: new Date(),
        },
        {
          type: 'score_attached',
          title:
            scoreSnapshot.score != null
              ? 'Latest CALEN score attached'
              : 'Case opened without a score',
          detail:
            scoreSnapshot.score != null
              ? `Attached score ${scoreSnapshot.score} (${scoreSnapshot.band ?? 'unbanded'}).`
              : 'A reviewer will need to assess the case with partial evidence.',
          actorId: user.id,
          createdAt: new Date(),
        },
        {
          type: 'policy_snapshot',
          title: 'Organisation policy snapshot saved',
          detail:
            recommendation.policyTriggers.join(', ') ||
            'No policy triggers recorded.',
          actorId: user.id,
          createdAt: new Date(),
        },
        ...(initialStage !== 'new'
          ? [
              {
                type: 'case_triaged',
                title: `Case routed to ${this.humanizeStage(initialStage)}`,
                detail: `Initial recommendation was ${recommendation.outcome}.`,
                actorId: user.id,
                createdAt: new Date(),
              },
            ]
          : []),
      ],
    });

    return {
      underwritingCase: this.serializeCaseDetail(createdCase),
    };
  }

  async getCase(user: AuthenticatedUser, caseId: string) {
    this.assertOrganization(user);
    const underwritingCase = await this.findCaseOrThrow(user.organizationId!, caseId);

    return {
      underwritingCase: this.serializeCaseDetail(underwritingCase),
    };
  }

  async exportCase(user: AuthenticatedUser, caseId: string) {
    this.assertOrganization(user);
    const underwritingCase = await this.findCaseOrThrow(
      user.organizationId!,
      caseId,
    );

    return {
      export: {
        exportedAt: new Date(),
        format: 'json',
        fileName: `${underwritingCase.caseId}-decision-record.json`,
        decisionRecord: {
          caseId: underwritingCase.caseId,
          calenId: underwritingCase.calenId,
          stage: underwritingCase.stage,
          riskLevel: underwritingCase.riskLevel,
          productType: underwritingCase.productType,
          createdAt: underwritingCase.createdAt ?? null,
          updatedAt: underwritingCase.updatedAt ?? null,
          applicantSummary: underwritingCase.applicantSummary,
          obligationContext: underwritingCase.obligationContext,
          scoreSnapshot: underwritingCase.scoreSnapshot,
          underwritingAssessment: underwritingCase.underwritingAssessment,
          policySnapshot: underwritingCase.policySnapshot,
          recommendation: underwritingCase.recommendation,
          reviewerNotes: underwritingCase.notes ?? '',
          timeline: Array.isArray(underwritingCase.timeline)
            ? underwritingCase.timeline
            : [],
        },
      },
    };
  }

  async updateCaseStage(
    user: AuthenticatedUser,
    caseId: string,
    dto: UpdateUnderwritingCaseStageDto,
  ) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const underwritingCase = await this.underwritingCaseModel.findOne({
      organizationId,
      caseId,
    });

    if (!underwritingCase) {
      throw new NotFoundException({
        code: 'UNDERWRITING_CASE_NOT_FOUND',
        message: 'That underwriting case was not found.',
      });
    }

    const overrideReason = dto.overrideReason?.trim() ?? '';
    const requiresApprovalOverride =
      dto.stage === 'approved' &&
      this.requiresApprovalOverride(underwritingCase);

    if (requiresApprovalOverride && overrideReason.length === 0) {
      throw new BadRequestException({
        code: 'APPROVAL_OVERRIDE_REASON_REQUIRED',
        message:
          'Approving this case requires an override reason because the recommendation still has open conditions or review signals.',
      });
    }

    const timelineEvents = [
      {
        type: 'stage_updated',
        title: `Case moved to ${this.humanizeStage(dto.stage)}`,
        detail: `Workflow stage updated to ${dto.stage}.`,
        actorId: user.id,
        createdAt: new Date(),
      },
      ...(requiresApprovalOverride
        ? [
            {
              type: 'approval_override',
              title: 'Approval override recorded',
              detail: overrideReason,
              actorId: user.id,
              createdAt: new Date(),
            },
          ]
        : []),
    ];
    const updatedCase = await this.underwritingCaseModel.findOneAndUpdate(
      { organizationId, caseId },
      {
        $set: {
          stage: dto.stage,
          riskLevel: this.getRiskLevelForStage(dto.stage),
        },
        $push: {
          timeline: { $each: timelineEvents },
        },
      },
      { new: true },
    );

    if (!updatedCase) {
      throw new NotFoundException({
        code: 'UNDERWRITING_CASE_NOT_FOUND',
        message: 'That underwriting case was not found.',
      });
    }

    return {
      underwritingCase: this.serializeCaseDetail(updatedCase),
    };
  }

  private requiresApprovalOverride(
    underwritingCase: UnderwritingCaseDocument,
  ) {
    const recommendation = underwritingCase.recommendation;

    return Boolean(
      recommendation?.outcome !== 'approve' ||
        recommendation?.conditions?.length ||
        recommendation?.manualReviewReasons?.length,
    );
  }

  async updateCaseNotes(
    user: AuthenticatedUser,
    caseId: string,
    dto: UpdateUnderwritingCaseNotesDto,
  ) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const notes = dto.notes?.trim() ?? '';
    const updatedCase = await this.underwritingCaseModel.findOneAndUpdate(
      { organizationId, caseId },
      {
        $set: {
          notes,
        },
        $push: {
          timeline: {
            type: 'notes_updated',
            title: 'Internal notes updated',
            detail: notes.length > 0 ? 'Reviewer notes were saved.' : 'Reviewer notes were cleared.',
            actorId: user.id,
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!updatedCase) {
      throw new NotFoundException({
        code: 'UNDERWRITING_CASE_NOT_FOUND',
        message: 'That underwriting case was not found.',
      });
    }

    return {
      underwritingCase: this.serializeCaseDetail(updatedCase),
    };
  }

  private async refreshExistingCaseContext(
    user: AuthenticatedUser,
    existingCase: UnderwritingCaseDocument,
    dto: CreateUnderwritingCaseDto,
    organization: OrganizationShape,
  ) {
    const onboardingState = await this.onboardingStateModel.findOne({
      userId: existingCase.subjectUserId,
    });
    const policySnapshot = this.buildPolicySnapshot(organization);
    const decisionRules = this.getOrganizationDecisionRules(organization);
    const obligationContext = this.mergeObligationContext(existingCase, dto);
    const applicantSummary = {
      name: existingCase.applicantSummary.name,
      verified: existingCase.applicantSummary.verified,
      location: existingCase.applicantSummary.location,
      employerName: existingCase.applicantSummary.employerName ?? null,
      jobTitle: existingCase.applicantSummary.jobTitle ?? null,
      monthlyIncome: existingCase.applicantSummary.monthlyIncome ?? null,
      connectedBanks: existingCase.applicantSummary.connectedBanks ?? 0,
      endorsedTrustContacts:
        existingCase.applicantSummary.endorsedTrustContacts ?? 0,
      trustEndorsements: Array.isArray(
        existingCase.applicantSummary.trustEndorsements,
      )
        ? existingCase.applicantSummary.trustEndorsements
        : [],
    };
    const underwritingAssessment = this.buildUnderwritingAssessment(
      existingCase.scoreSnapshot as UnderwritingScoreSnapshotShape,
      onboardingState,
      obligationContext,
      applicantSummary,
    );
    const recommendation = this.buildRecommendation(
      existingCase.scoreSnapshot as UnderwritingScoreSnapshotShape,
      policySnapshot,
      underwritingAssessment,
      obligationContext,
      decisionRules,
    );
    const nextStage = this.getInitialStageFromRecommendation(
      recommendation.outcome,
      policySnapshot.defaultDecisionMode,
    );
    const productType =
      dto.productType?.trim() || existingCase.productType || 'General Review';
    const updatedCase = await this.underwritingCaseModel.findOneAndUpdate(
      {
        _id: existingCase._id,
        organizationId: existingCase.organizationId,
      },
      {
        $set: {
          productType,
          requestedAmount: obligationContext.requestedAmount,
          stage: nextStage,
          riskLevel: this.getRiskLevelFromRecommendation(
            recommendation.outcome,
            existingCase.scoreSnapshot?.score,
          ),
          policySnapshot,
          obligationContext,
          underwritingAssessment,
          recommendation,
        },
        $push: {
          timeline: {
            type: 'case_context_updated',
            title: 'Case context updated',
            detail: `Underwriting context refreshed for ${productType}.`,
            actorId: user.id,
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!updatedCase) {
      throw new NotFoundException({
        code: 'UNDERWRITING_CASE_NOT_FOUND',
        message: 'That underwriting case was not found.',
      });
    }

    return {
      underwritingCase: this.serializeCaseDetail(updatedCase),
    };
  }

  private hasCaseContextInput(dto: CreateUnderwritingCaseDto) {
    return Boolean(
      dto.productType?.trim() ||
        typeof dto.requestedAmount === 'number' ||
        typeof dto.requestedTermMonths === 'number' ||
        typeof dto.monthlyObligationAmount === 'number' ||
        dto.productCategory?.trim() ||
        dto.decisionPurpose?.trim(),
    );
  }

  private mergeObligationContext(
    existingCase: UnderwritingCaseDocument,
    dto: CreateUnderwritingCaseDto,
  ): UnderwritingObligationContextShape {
    const currentContext = existingCase.obligationContext;

    return {
      requestedAmount:
        typeof dto.requestedAmount === 'number'
          ? dto.requestedAmount
          : (currentContext?.requestedAmount ??
            existingCase.requestedAmount ??
            null),
      requestedTermMonths:
        typeof dto.requestedTermMonths === 'number'
          ? dto.requestedTermMonths
          : (currentContext?.requestedTermMonths ?? null),
      monthlyObligationAmount:
        typeof dto.monthlyObligationAmount === 'number'
          ? dto.monthlyObligationAmount
          : (currentContext?.monthlyObligationAmount ?? null),
      productCategory:
        dto.productCategory?.trim() || currentContext?.productCategory || null,
      decisionPurpose:
        dto.decisionPurpose?.trim() || currentContext?.decisionPurpose || null,
    };
  }

  private async findCaseOrThrow(organizationId: string, caseId: string) {
    const underwritingCase = await this.underwritingCaseModel.findOne({
      organizationId: this.toObjectId(organizationId),
      caseId,
    });

    if (!underwritingCase) {
      throw new NotFoundException({
        code: 'UNDERWRITING_CASE_NOT_FOUND',
        message: 'That underwriting case was not found.',
      });
    }

    return underwritingCase;
  }

  private buildApplicantSummary(
    account: UserLike,
    onboardingState: OnboardingStateDocument | null,
    bankConnections: BankConnectionDocument[],
    trustContacts: TrustContactDocument[],
  ) {
    const personalProfile =
      (onboardingState?.personalProfile as
        | { country?: string; city?: string }
        | null
        | undefined) ?? null;
    const employmentProfile =
      (onboardingState?.employmentProfile as
        | {
            employerName?: string;
            jobTitle?: string;
            monthlyIncome?: number;
          }
        | null
        | undefined) ?? null;
    const financialProfile =
      (onboardingState?.financialProfile as
        | { monthlyIncome?: number }
        | null
        | undefined) ?? null;
    const endorsedContacts = trustContacts.filter(
      (contact) => contact.status === 'endorsed',
    );
    const pendingContacts = trustContacts.filter(
      (contact) => contact.status === 'request_sent',
    );

    return {
      name: account.displayName,
      verified: Boolean(account.emailVerifiedAt),
      location:
        [personalProfile?.city, personalProfile?.country]
          .filter(Boolean)
          .join(', ') || account.country || 'Unknown',
      employerName: employmentProfile?.employerName ?? null,
      jobTitle: employmentProfile?.jobTitle ?? account.jobTitle ?? null,
      monthlyIncome:
        employmentProfile?.monthlyIncome ??
        financialProfile?.monthlyIncome ??
        null,
      connectedBanks: bankConnections.length,
      endorsedTrustContacts: endorsedContacts.length,
      trustEndorsements: [
        ...endorsedContacts.map((contact) => ({
          type: contact.relationship,
          source: contact.fullName,
          status: 'Verified' as const,
          date: (contact.respondedAt ?? new Date()).toISOString().slice(0, 10),
          strength: (contact.responseTrustLevel ?? 0) * 20,
        })),
        ...pendingContacts.map((contact) => ({
          type: contact.relationship,
          source: contact.fullName,
          status: 'Pending' as const,
          date: (contact.requestedAt ?? new Date()).toISOString().slice(0, 10),
          strength: 40,
        })),
      ],
    };
  }

  private buildScoreSnapshot(
    latestScore: Awaited<ReturnType<ScoresService['getLatestScore']>>,
  ): UnderwritingScoreSnapshotShape {
    if (!latestScore) {
      return {
        score: null,
        composite: null,
        band: null,
        status: 'pending_generation',
        engineVersion: null,
        confidenceLevel: null,
        confidenceScore: null,
        explanations: [
          'No durable CALEN score was available when this underwriting case was opened.',
        ],
        reasonCodes: ['score_unavailable'],
        anomalyFlags: [],
        components: [],
        generatedAt: null,
      };
    }

    return {
      score: latestScore.score,
      composite: latestScore.composite,
      band: latestScore.bandKey,
      status: latestScore.status,
      engineVersion: latestScore.engineVersion,
      confidenceLevel: latestScore.confidence?.level ?? null,
      confidenceScore: latestScore.confidence?.score ?? null,
      explanations: Array.isArray(latestScore.explanations)
        ? latestScore.explanations
        : [],
      reasonCodes: Array.isArray(latestScore.reasonCodes)
        ? latestScore.reasonCodes
        : [],
      anomalyFlags: Array.isArray(latestScore.anomalyFlags)
        ? latestScore.anomalyFlags
        : [],
      components: Array.isArray(latestScore.components)
        ? latestScore.components.map((component) => ({
            key: component.key,
            label: component.label,
            score: component.score,
            weight: component.weight,
            metrics: component.metrics,
            reasons: component.reasons,
          }))
        : [],
      generatedAt: latestScore.generatedAt ?? null,
    };
  }

  private buildPolicySnapshot(
    organization: OrganizationShape,
  ): UnderwritingPolicySnapshotShape {
    const riskPolicy =
      (organization.onboardingData?.riskPolicy as Record<string, unknown>) ?? {};
    const minimumScore =
      typeof riskPolicy.minimumScore === 'number' ? riskPolicy.minimumScore : null;
    const maxExposureAmount =
      typeof riskPolicy.maxExposureAmount === 'number'
        ? riskPolicy.maxExposureAmount
        : null;
    const defaultDecisionMode =
      typeof riskPolicy.defaultDecisionMode === 'string'
        ? riskPolicy.defaultDecisionMode
        : 'manual_review';

    return {
      minimumScore,
      maxExposureAmount,
      defaultDecisionMode,
      triggeredRules: [] as string[],
      decisionRules: [] as UnderwritingDecisionRuleMatchShape[],
    };
  }

  private buildObligationContext(
    dto: CreateUnderwritingCaseDto,
  ): UnderwritingObligationContextShape {
    return {
      requestedAmount:
        typeof dto.requestedAmount === 'number' ? dto.requestedAmount : null,
      requestedTermMonths:
        typeof dto.requestedTermMonths === 'number'
          ? dto.requestedTermMonths
          : null,
      monthlyObligationAmount:
        typeof dto.monthlyObligationAmount === 'number'
          ? dto.monthlyObligationAmount
          : null,
      productCategory: dto.productCategory?.trim() || null,
      decisionPurpose: dto.decisionPurpose?.trim() || null,
    };
  }

  private buildUnderwritingAssessment(
    scoreSnapshot: UnderwritingScoreSnapshotShape,
    onboardingState: OnboardingStateDocument | null,
    obligationContext: UnderwritingObligationContextShape,
    applicantSummary: ReturnType<UnderwritingService['buildApplicantSummary']>,
  ): UnderwritingAssessmentShape {
    const employmentProfile =
      (onboardingState?.employmentProfile as
        | {
            monthlyIncome?: number;
          }
        | null
        | undefined) ?? null;
    const financialProfile =
      (onboardingState?.financialProfile as
        | {
            monthlyIncome?: number;
            monthlyExpenses?: number;
            housingCost?: number;
            loanCount?: number;
            outstandingLoanTotal?: number;
          }
        | null
        | undefined) ?? null;
    const monthlyIncome =
      applicantSummary.monthlyIncome ??
      employmentProfile?.monthlyIncome ??
      financialProfile?.monthlyIncome ??
      null;
    const baselineExpenses =
      typeof financialProfile?.monthlyExpenses === 'number'
        ? financialProfile.monthlyExpenses
        : typeof financialProfile?.housingCost === 'number'
          ? financialProfile.housingCost
          : null;
    const estimatedExistingDebtLoad =
      typeof financialProfile?.outstandingLoanTotal === 'number' &&
      financialProfile.outstandingLoanTotal > 0
        ? Math.round(
            Math.max(
              financialProfile.outstandingLoanTotal / 36,
              financialProfile.outstandingLoanTotal * 0.035,
            ),
          )
        : null;
    const monthlyObligationEstimate =
      obligationContext.monthlyObligationAmount ??
      (typeof obligationContext.requestedAmount === 'number' &&
      typeof obligationContext.requestedTermMonths === 'number' &&
      obligationContext.requestedTermMonths > 0
        ? Math.round(
            obligationContext.requestedAmount /
              obligationContext.requestedTermMonths,
          )
        : null);
    const totalCommittedOutgoings =
      baselineExpenses == null && estimatedExistingDebtLoad == null
        ? null
        : (baselineExpenses ?? 0) + (estimatedExistingDebtLoad ?? 0);
    const surplusCashEstimate =
      monthlyIncome == null
        ? null
        : Math.round(
            monthlyIncome -
              (totalCommittedOutgoings ?? 0) -
              (monthlyObligationEstimate ?? 0),
          );

    const incomeStabilityScore = this.getComponentScore(
      scoreSnapshot,
      'income_reliability',
    );
    const resilienceScore = this.getComponentScore(
      scoreSnapshot,
      'balance_resilience',
    );
    const cashFlowStabilityScore = this.getComponentScore(
      scoreSnapshot,
      'cash_flow_stability',
    );
    const spendingDisciplineScore = this.getComponentScore(
      scoreSnapshot,
      'spending_discipline',
    );
    const obligationConsistencyScore = this.getComponentScore(
      scoreSnapshot,
      'obligation_consistency',
    );
    const rawVolatilityScore = this.getComponentScore(
      scoreSnapshot,
      'financial_volatility',
    );
    const surplusScore =
      monthlyIncome == null || surplusCashEstimate == null
        ? null
        : this.getAffordabilityScoreFromSurplus(
            surplusCashEstimate,
            monthlyIncome,
          );
    const behaviouralAffordabilityBase = Math.round(
      ((cashFlowStabilityScore ?? 50) * 0.45) +
        ((spendingDisciplineScore ?? 50) * 0.25) +
        ((resilienceScore ?? 50) * 0.3),
    );
    const affordabilityScore =
      surplusScore == null
        ? behaviouralAffordabilityBase
        : this.clampScore(
            Math.round(
              behaviouralAffordabilityBase * 0.55 + surplusScore * 0.45,
            ),
          );
    const debtPressureRatio =
      monthlyIncome == null || monthlyIncome <= 0
        ? null
        : ((estimatedExistingDebtLoad ?? 0) + (monthlyObligationEstimate ?? 0)) /
          monthlyIncome;
    const debtPressureIndicator =
      obligationConsistencyScore != null && obligationConsistencyScore < 40
        ? 'High'
        : debtPressureRatio != null && debtPressureRatio >= 0.45
          ? 'High'
          : debtPressureRatio != null && debtPressureRatio >= 0.22
            ? 'Medium'
            : typeof financialProfile?.loanCount === 'number' &&
                financialProfile.loanCount > 2
              ? 'Medium'
              : 'Low';
    const volatilitySignal =
      rawVolatilityScore != null && rawVolatilityScore >= 65
        ? 'Volatile'
        : rawVolatilityScore != null && rawVolatilityScore >= 40
          ? 'Moderate'
          : 'Stable';
    const strengths: string[] = [];
    const riskFactors: string[] = [];

    if (affordabilityScore >= 72) {
      strengths.push('Estimated affordability remains comfortably within range.');
    }
    if ((incomeStabilityScore ?? 0) >= 70) {
      strengths.push('Income patterns appear stable across the observed period.');
    }
    if ((resilienceScore ?? 0) >= 70) {
      strengths.push('Balance behaviour suggests healthy financial headroom.');
    }
    if (scoreSnapshot.confidenceLevel === 'high') {
      strengths.push('Score confidence is high based on the available bank history.');
    }

    if (affordabilityScore < 55) {
      riskFactors.push(
        'Estimated affordability is tight for the proposed obligation.',
      );
    }
    if (debtPressureIndicator === 'High') {
      riskFactors.push('Debt pressure appears elevated relative to income.');
    }
    if (volatilitySignal === 'Volatile') {
      riskFactors.push('Cash-flow patterns are more volatile than ideal.');
    }
    if (scoreSnapshot.confidenceLevel === 'low') {
      riskFactors.push(
        'Score confidence is low and requires cautious interpretation.',
      );
    }
    if (
      scoreSnapshot.anomalyFlags.some((flag) => flag.severity === 'high')
    ) {
      riskFactors.push('High-severity anomalies were detected in the score evidence.');
    }

    if (strengths.length === 0) {
      strengths.push('Behavioural score evidence is available for review.');
    }
    if (riskFactors.length === 0) {
      riskFactors.push('No material behavioural risks were triggered automatically.');
    }

    return {
      affordabilityScore,
      incomeStabilityScore,
      resilienceScore,
      debtPressureIndicator,
      surplusCashEstimate,
      volatilitySignal,
      strengths: strengths.slice(0, 4),
      riskFactors: riskFactors.slice(0, 4),
      generatedAt: new Date(),
    };
  }

  private buildRecommendation(
    scoreSnapshot: UnderwritingScoreSnapshotShape,
    policySnapshot: UnderwritingPolicySnapshotShape,
    underwritingAssessment: UnderwritingAssessmentShape,
    obligationContext: UnderwritingObligationContextShape,
    decisionRules: WorkspaceDecisionRuleShape[] = [],
  ) {
    const strengths = [...underwritingAssessment.strengths];
    const riskFactors = [...underwritingAssessment.riskFactors];
    const manualReviewReasons: string[] = [];
    const conditions: string[] = [];
    const policyTriggers: string[] = [];
    let outcome: UnderwritingOutcome = 'approve';

    if (scoreSnapshot.score == null) {
      manualReviewReasons.push('No durable CALEN score is available yet.');
      policyTriggers.push('score_unavailable');
      outcome = 'review';
    } else {
      if (
        typeof policySnapshot.minimumScore === 'number' &&
        scoreSnapshot.score < policySnapshot.minimumScore
      ) {
        policyTriggers.push(`minimum_score_${policySnapshot.minimumScore}`);
        riskFactors.push(
          `Score is below the organisation minimum of ${policySnapshot.minimumScore}.`,
        );
        outcome =
          scoreSnapshot.score <= policySnapshot.minimumScore - 60
            ? 'decline'
            : this.maxOutcome(outcome, 'review');
      }

      if (scoreSnapshot.confidenceLevel === 'low') {
        manualReviewReasons.push(
          'Score confidence is low and should be reviewed manually.',
        );
        policyTriggers.push('low_confidence_score');
        outcome = this.maxOutcome(outcome, 'review');
      }

      if (
        scoreSnapshot.anomalyFlags.some((flag) => flag.severity === 'high')
      ) {
        manualReviewReasons.push(
          'High-severity anomalies were detected in the score evidence.',
        );
        policyTriggers.push('high_severity_anomaly');
        outcome = this.maxOutcome(outcome, 'review');
      }

      if (
        scoreSnapshot.status === 'flagged_for_review'
      ) {
        manualReviewReasons.push(
          'The score engine flagged this profile for manual review.',
        );
        policyTriggers.push('score_flagged_for_review');
        outcome = this.maxOutcome(outcome, 'review');
      }
    }

    if (
      underwritingAssessment.affordabilityScore != null &&
      underwritingAssessment.affordabilityScore < 40
    ) {
      policyTriggers.push('affordability_shortfall');
      riskFactors.push(
        'Estimated surplus cash does not comfortably support the proposed obligation.',
      );
      outcome = this.maxOutcome(outcome, 'decline');
    } else if (
      underwritingAssessment.affordabilityScore != null &&
      underwritingAssessment.affordabilityScore < 60
    ) {
      policyTriggers.push('affordability_watch');
      manualReviewReasons.push(
        'Affordability is marginal and should be reviewed before approval.',
      );
      outcome = this.maxOutcome(outcome, 'review');
    }

    if (underwritingAssessment.debtPressureIndicator === 'High') {
      policyTriggers.push('high_debt_pressure');
      manualReviewReasons.push(
        'Debt pressure is elevated relative to available income.',
      );
      outcome = this.maxOutcome(outcome, 'review');
    }

    if (underwritingAssessment.volatilitySignal === 'Volatile') {
      policyTriggers.push('volatile_cashflow');
      manualReviewReasons.push(
        'Cash-flow volatility is high for a clean automatic approval.',
      );
      outcome = this.maxOutcome(outcome, 'review');
    }

    if (
      typeof policySnapshot.maxExposureAmount === 'number' &&
      policySnapshot.maxExposureAmount > 0 &&
      typeof obligationContext.requestedAmount === 'number' &&
      obligationContext.requestedAmount > policySnapshot.maxExposureAmount
    ) {
      policyTriggers.push(
        `max_exposure_${policySnapshot.maxExposureAmount}`,
      );
      conditions.push(
        `Recommended adjustment: consider reducing the requested amount to ${policySnapshot.maxExposureAmount} or below to align with the current exposure policy.`,
      );
      outcome =
        outcome === 'approve'
          ? 'approve_with_conditions'
          : outcome === 'approve_with_conditions'
            ? outcome
            : outcome;
    }

    if (
      outcome === 'approve_with_conditions' &&
      manualReviewReasons.length > 0
    ) {
      outcome = 'review';
    }

    const matchedDecisionRules = this.evaluateDecisionRules(
      scoreSnapshot,
      underwritingAssessment,
      decisionRules,
    );

    matchedDecisionRules.forEach((rule) => {
      policyTriggers.push(rule.trigger);

      if (this.isRejectAction(rule.action)) {
        riskFactors.push(
          `Organisation decision rule requested rejection: ${this.formatRuleMatch(rule)}.`,
        );
        outcome = this.maxOutcome(outcome, 'decline');
        return;
      }

      if (this.isReviewAction(rule.action)) {
        manualReviewReasons.push(
          `Organisation decision rule requested manual review: ${this.formatRuleMatch(rule)}.`,
        );
        outcome = this.maxOutcome(outcome, 'review');
        return;
      }

      if (this.isApproveAction(rule.action)) {
        strengths.push(
          `Organisation approval rule matched: ${this.formatRuleMatch(rule)}.`,
        );
      }
    });

    const summary =
      outcome === 'decline'
        ? 'Decline based on affordability and/or policy mismatch.'
        : outcome === 'review'
          ? 'Manual review is recommended before a final decision is made.'
          : outcome === 'approve_with_conditions'
            ? 'Profile is approvable if the organisation conditions are met.'
            : 'Profile meets the current underwriting policy for approval.';

    const reasons = this.uniqueStrings([
      summary,
      ...manualReviewReasons,
      ...conditions,
      ...strengths.slice(0, 2),
      ...riskFactors.slice(0, 2),
    ]).slice(0, 6);

    policySnapshot.triggeredRules = policyTriggers;
    policySnapshot.decisionRules = matchedDecisionRules;

    return {
      outcome,
      summary,
      reasons:
        reasons.length > 0
          ? reasons
          : ['Organisation policy requires manual review by default.'],
      triggeredPolicies: policyTriggers,
      policyTriggers,
      strengths: this.uniqueStrings(strengths).slice(0, 4),
      riskFactors: this.uniqueStrings(riskFactors).slice(0, 4),
      manualReviewReasons: this.uniqueStrings(manualReviewReasons).slice(0, 4),
      conditions: this.uniqueStrings(conditions).slice(0, 4),
      decisionMode: policySnapshot.defaultDecisionMode,
      generatedAt: new Date(),
    };
  }

  private serializeCaseSummary(underwritingCase: UnderwritingCaseDocument) {
    const recommendation = underwritingCase.recommendation;
    const approvalGuidance = Array.isArray(recommendation?.conditions)
      ? recommendation.conditions
      : [];
    const manualReviewReasons = Array.isArray(
      recommendation?.manualReviewReasons,
    )
      ? recommendation.manualReviewReasons
      : [];
    const reasons = Array.isArray(recommendation?.reasons)
      ? recommendation.reasons
      : [];

    return {
      caseId: underwritingCase.caseId,
      calenId: underwritingCase.calenId,
      applicantName: underwritingCase.applicantName,
      score: underwritingCase.scoreSnapshot?.score ?? null,
      band: underwritingCase.scoreSnapshot?.band ?? null,
      stage: underwritingCase.stage,
      riskLevel: underwritingCase.riskLevel,
      recommendation: recommendation?.outcome ?? 'review',
      recommendationSummary: recommendation?.summary ?? null,
      primaryReason:
        approvalGuidance[0] ??
        manualReviewReasons[0] ??
        reasons[0] ??
        recommendation?.summary ??
        null,
      approvalGuidance,
      manualReviewReasons,
      affordabilityScore:
        underwritingCase.underwritingAssessment?.affordabilityScore ?? null,
      confidenceLevel:
        underwritingCase.scoreSnapshot?.confidenceLevel ?? null,
      location: underwritingCase.applicantSummary?.location ?? 'Unknown',
      monthlyIncome: underwritingCase.applicantSummary?.monthlyIncome ?? null,
      productType: underwritingCase.productType,
      requestedAmount: underwritingCase.requestedAmount ?? null,
      createdAt: underwritingCase.createdAt ?? null,
    };
  }

  private serializeCaseDetail(underwritingCase: UnderwritingCaseDocument) {
    return {
      caseId: underwritingCase.caseId,
      calenId: underwritingCase.calenId,
      applicantName: underwritingCase.applicantName,
      stage: underwritingCase.stage,
      riskLevel: underwritingCase.riskLevel,
      productType: underwritingCase.productType,
      requestedAmount: underwritingCase.requestedAmount ?? null,
      notes: underwritingCase.notes ?? '',
      applicantSummary: underwritingCase.applicantSummary,
      scoreSnapshot: underwritingCase.scoreSnapshot,
      policySnapshot: underwritingCase.policySnapshot,
      obligationContext: underwritingCase.obligationContext,
      underwritingAssessment: underwritingCase.underwritingAssessment,
      recommendation: underwritingCase.recommendation,
      timeline: Array.isArray(underwritingCase.timeline)
        ? underwritingCase.timeline
        : [],
      createdAt: underwritingCase.createdAt ?? null,
      updatedAt: underwritingCase.updatedAt ?? null,
    };
  }

  private assertOrganization(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_REQUIRED',
        message: 'This action is only available to organisation users.',
      });
    }
  }

  private getRiskLevelFromScore(score: number | null | undefined) {
    if (typeof score !== 'number') {
      return 'High';
    }

    if (score >= 720) {
      return 'Low';
    }

    if (score >= 620) {
      return 'Moderate';
    }

    return 'High';
  }

  private getRiskLevelFromRecommendation(
    outcome: UnderwritingOutcome,
    score: number | null | undefined,
  ) {
    if (outcome === 'decline') {
      return 'High';
    }

    if (outcome === 'review') {
      return this.getRiskLevelFromScore(score) === 'High' ? 'High' : 'Moderate';
    }

    if (outcome === 'approve_with_conditions') {
      return 'Moderate';
    }

    return this.getRiskLevelFromScore(score);
  }

  private getInitialStageFromRecommendation(
    outcome: UnderwritingOutcome,
    decisionMode: string,
  ): 'new' | 'review' | 'analysis' | 'approved' | 'rejected' {
    const autoDecisionEnabled =
      decisionMode === 'auto_decision' || decisionMode === 'auto_approve';

    if (outcome === 'decline') {
      return autoDecisionEnabled ? 'rejected' : 'review';
    }

    if (outcome === 'review') {
      return 'review';
    }

    if (outcome === 'approve_with_conditions') {
      return 'analysis';
    }

    return autoDecisionEnabled ? 'approved' : 'new';
  }

  private getRiskLevelForStage(
    stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected',
  ) {
    if (stage === 'approved') {
      return 'Low';
    }

    if (stage === 'rejected') {
      return 'High';
    }

    if (stage === 'analysis') {
      return 'Moderate';
    }

    return 'Moderate';
  }

  private humanizeStage(
    stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected',
  ) {
    if (stage === 'new') return 'New Applicants';
    if (stage === 'review') return 'Under Review';
    if (stage === 'analysis') return 'Risk Analysis';
    if (stage === 'approved') return 'Approved';
    return 'Rejected';
  }

  private generateCaseId() {
    return `UW-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private getComponentScore(
    scoreSnapshot: UnderwritingScoreSnapshotShape,
    key: string,
  ) {
    const component = scoreSnapshot.components.find(
      (entry) => entry.key === key,
    );

    return typeof component?.score === 'number' ? component.score : null;
  }

  private getAffordabilityScoreFromSurplus(
    surplusCashEstimate: number,
    monthlyIncome: number,
  ) {
    if (monthlyIncome <= 0) {
      return 0;
    }

    const surplusRatio = surplusCashEstimate / monthlyIncome;

    if (surplusRatio >= 0.35) return 92;
    if (surplusRatio >= 0.2) return 78;
    if (surplusRatio >= 0.1) return 64;
    if (surplusRatio >= 0) return 48;
    if (surplusRatio >= -0.1) return 28;
    return 12;
  }

  private getOrganizationDecisionRules(
    organization: OrganizationShape,
  ): WorkspaceDecisionRuleShape[] {
    const workspaceData =
      (organization.onboardingData?.workspaceData as
        | { decisionRules?: unknown }
        | undefined) ?? {};

    if (!Array.isArray(workspaceData.decisionRules)) {
      return [];
    }

    return workspaceData.decisionRules
      .map((rule) => {
        const candidate = rule as Partial<WorkspaceDecisionRuleShape>;

        if (
          typeof candidate.id !== 'number' ||
          typeof candidate.field !== 'string' ||
          typeof candidate.operator !== 'string' ||
          typeof candidate.value !== 'string' ||
          typeof candidate.action !== 'string'
        ) {
          return null;
        }

        return {
          id: candidate.id,
          field: candidate.field,
          operator: candidate.operator,
          value: candidate.value,
          action: candidate.action,
        };
      })
      .filter((rule): rule is WorkspaceDecisionRuleShape => rule != null);
  }

  private evaluateDecisionRules(
    scoreSnapshot: UnderwritingScoreSnapshotShape,
    underwritingAssessment: UnderwritingAssessmentShape,
    rules: WorkspaceDecisionRuleShape[],
  ): UnderwritingDecisionRuleMatchShape[] {
    return rules
      .filter((rule) =>
        this.evaluateDecisionRule(scoreSnapshot, underwritingAssessment, rule),
      )
      .map((rule) => ({
        ...rule,
        trigger: `decision_rule_${rule.id}_${this.slugifyRuleAction(rule.action)}`,
      }));
  }

  private evaluateDecisionRule(
    scoreSnapshot: UnderwritingScoreSnapshotShape,
    underwritingAssessment: UnderwritingAssessmentShape,
    rule: WorkspaceDecisionRuleShape,
  ) {
    const fieldMap: Record<string, number | null> = {
      'CALEN Score': scoreSnapshot.score,
      'Affordability Score': underwritingAssessment.affordabilityScore,
      'Income Stability': underwritingAssessment.incomeStabilityScore,
      'Income Reliability': underwritingAssessment.incomeStabilityScore,
      'Resilience Score': underwritingAssessment.resilienceScore,
      'Savings Stability': underwritingAssessment.resilienceScore,
      'Confidence Score': scoreSnapshot.confidenceScore,
      'Surplus Cash': underwritingAssessment.surplusCashEstimate,
    };
    const left = fieldMap[rule.field];
    const right = Number(String(rule.value).replace(/[^0-9.-]/g, ''));

    if (left == null || Number.isNaN(left) || Number.isNaN(right)) {
      return false;
    }

    if (rule.operator === '≥' || rule.operator === '>=') return left >= right;
    if (rule.operator === '>') return left > right;
    if (rule.operator === '<') return left < right;
    if (rule.operator === '≤' || rule.operator === '<=') return left <= right;
    return left === right;
  }

  private formatRuleMatch(rule: WorkspaceDecisionRuleShape) {
    return `${rule.field} ${rule.operator} ${rule.value}`;
  }

  private isApproveAction(action: string) {
    return action.toLowerCase() === 'approve';
  }

  private isReviewAction(action: string) {
    return action.toLowerCase() === 'flag for review';
  }

  private isRejectAction(action: string) {
    return action.toLowerCase() === 'reject';
  }

  private slugifyRuleAction(action: string) {
    return action.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  private maxOutcome(
    current: UnderwritingOutcome,
    next: UnderwritingOutcome,
  ): UnderwritingOutcome {
    const severity: Record<UnderwritingOutcome, number> = {
      approve: 0,
      approve_with_conditions: 1,
      review: 2,
      decline: 3,
    };

    return severity[next] > severity[current] ? next : current;
  }

  private uniqueStrings(values: string[]) {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private clampScore(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
