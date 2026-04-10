import {
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
      return {
        underwritingCase: this.serializeCaseDetail(existingCase),
      };
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
    const applicantSummary = this.buildApplicantSummary(
      account,
      onboardingState,
      bankConnections,
      trustContacts,
    );
    const scoreSnapshot = this.buildScoreSnapshot(latestScore);
    const recommendation = this.buildRecommendation(
      scoreSnapshot,
      policySnapshot,
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
      stage: 'new',
      riskLevel: this.getRiskLevelFromScore(scoreSnapshot.score),
      notes: '',
      applicantSummary,
      scoreSnapshot,
      policySnapshot,
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
          detail: recommendation.triggeredPolicies.join(', ') || 'No policy triggers recorded.',
          actorId: user.id,
          createdAt: new Date(),
        },
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

  async updateCaseStage(
    user: AuthenticatedUser,
    caseId: string,
    dto: UpdateUnderwritingCaseStageDto,
  ) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const updatedCase = await this.underwritingCaseModel.findOneAndUpdate(
      { organizationId, caseId },
      {
        $set: {
          stage: dto.stage,
          riskLevel: this.getRiskLevelForStage(dto.stage),
        },
        $push: {
          timeline: {
            type: 'stage_updated',
            title: `Case moved to ${this.humanizeStage(dto.stage)}`,
            detail: `Workflow stage updated to ${dto.stage}.`,
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
  ) {
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

  private buildPolicySnapshot(organization: OrganizationShape) {
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
    };
  }

  private buildRecommendation(
    scoreSnapshot: ReturnType<UnderwritingService['buildScoreSnapshot']>,
    policySnapshot: ReturnType<UnderwritingService['buildPolicySnapshot']>,
  ) {
    const reasons: string[] = [];
    const triggeredPolicies: string[] = [];
    let outcome: 'approve' | 'review' | 'decline' = 'review';

    if (scoreSnapshot.score == null) {
      reasons.push('No durable CALEN score is available yet.');
      triggeredPolicies.push('score_unavailable');
      outcome = 'review';
    } else {
      reasons.push(`Latest CALEN score is ${scoreSnapshot.score}.`);

      if (
        typeof policySnapshot.minimumScore === 'number' &&
        scoreSnapshot.score < policySnapshot.minimumScore
      ) {
        reasons.push(
          `Score is below the organisation minimum of ${policySnapshot.minimumScore}.`,
        );
        triggeredPolicies.push(`minimum_score_${policySnapshot.minimumScore}`);
        outcome = 'review';
      }

      if (scoreSnapshot.confidenceLevel === 'low') {
        reasons.push('Score confidence is low and should be reviewed manually.');
        triggeredPolicies.push('low_confidence_score');
        outcome = 'review';
      }

      if (
        scoreSnapshot.anomalyFlags.some((flag) => flag.severity === 'high')
      ) {
        reasons.push('High-severity anomalies were detected in the score evidence.');
        triggeredPolicies.push('high_severity_anomaly');
        outcome = 'review';
      }

      if (
        outcome === 'review' &&
        triggeredPolicies.length === 0 &&
        scoreSnapshot.status === 'ready'
      ) {
        outcome = 'approve';
      }

      if (
        outcome !== 'approve' &&
        scoreSnapshot.status === 'flagged_for_review'
      ) {
        reasons.push('The score engine flagged this profile for manual review.');
        triggeredPolicies.push('score_flagged_for_review');
      }
    }

    if (
      typeof policySnapshot.maxExposureAmount === 'number' &&
      policySnapshot.maxExposureAmount > 0
    ) {
      triggeredPolicies.push(
        `max_exposure_${policySnapshot.maxExposureAmount}`,
      );
    }

    policySnapshot.triggeredRules = triggeredPolicies;

    return {
      outcome,
      reasons:
        reasons.length > 0
          ? reasons
          : ['Organisation policy requires manual review by default.'],
      triggeredPolicies,
      decisionMode: policySnapshot.defaultDecisionMode,
      generatedAt: new Date(),
    };
  }

  private serializeCaseSummary(underwritingCase: UnderwritingCaseDocument) {
    return {
      caseId: underwritingCase.caseId,
      calenId: underwritingCase.calenId,
      applicantName: underwritingCase.applicantName,
      score: underwritingCase.scoreSnapshot?.score ?? null,
      band: underwritingCase.scoreSnapshot?.band ?? null,
      stage: underwritingCase.stage,
      riskLevel: underwritingCase.riskLevel,
      recommendation: underwritingCase.recommendation?.outcome ?? 'review',
      location: underwritingCase.applicantSummary?.location ?? 'Unknown',
      monthlyIncome: underwritingCase.applicantSummary?.monthlyIncome ?? null,
      productType: underwritingCase.productType,
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

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
