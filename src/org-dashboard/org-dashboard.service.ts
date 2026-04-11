import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import { MarkNotificationsReadDto } from '../dashboard/dto/mark-notifications-read.dto';
import {
  Notification,
  NotificationDocument,
} from '../dashboard/schemas/notification.schema';
import {
  UserSettings,
  UserSettingsDocument,
} from '../dashboard/schemas/user-settings.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  OrganizationInvitation,
  OrganizationInvitationDocument,
} from '../org-onboarding/schemas/organization-invitation.schema';
import {
  OrganizationVerification,
  OrganizationVerificationDocument,
} from '../org-onboarding/schemas/organization-verification.schema';
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
import { CreateOrgApiKeyDto } from './dto/create-org-api-key.dto';
import { CreateOrgLendingOfferDto } from './dto/create-org-lending-offer.dto';
import { GetOrgProfileSearchDto } from './dto/get-org-profile-search.dto';
import { SaveOrgRiskNotesDto } from './dto/save-org-risk-notes.dto';
import { ScoresService } from '../scores/scores.service';
import { UpdateOrgDecisionRulesDto } from './dto/update-org-decision-rules.dto';
import { UpdateOrgPipelineStageDto } from './dto/update-org-pipeline-stage.dto';
import { UpdateOrgDashboardSettingsDto } from './dto/update-org-dashboard-settings.dto';
import { UpdateOrgLendingOfferDto } from './dto/update-org-lending-offer.dto';
import {
  type OrgWorkspaceData,
  type WorkspaceApplicant,
  type WorkspaceDecisionRule,
} from './org-dashboard.types';
import {
  OrganizationPipelineApplicant,
  OrganizationPipelineApplicantDocument,
} from './schemas/organization-pipeline-applicant.schema';

type OrganizationSettingsShape = {
  name: string;
  slug: string;
  status: string;
  industry?: string;
  companySize?: string;
  country?: string;
  website?: string;
  registrationNumber?: string;
  jurisdiction?: string;
  primaryAdminUserId?: unknown;
  onboardingData?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  _id?: unknown;
};

type LatestScorePayload = Awaited<ReturnType<ScoresService['getLatestScore']>>;

type OrgAssessmentShape = {
  affordabilityScore: number | null;
  incomeStabilityScore: number | null;
  resilienceScore: number | null;
  cashFlowStabilityScore: number | null;
  spendingDisciplineScore: number | null;
  confidenceScore: number | null;
  confidenceLevel: string | null;
  debtPressureIndicator: 'Low' | 'Medium' | 'High';
  surplusCashEstimate: number | null;
  volatilitySignal: 'Stable' | 'Moderate' | 'Volatile';
  strengths: string[];
  riskFactors: string[];
  scoreStatus: string;
  anomalyFlags: Array<{
    code: string;
    severity: string;
    detail?: string;
  }>;
  generatedAt: Date;
};

type OrgDecisionSimulationCandidate = {
  id: string;
  calenId: string;
  name: string;
  score: number | null;
  riskLevel: 'Low' | 'Moderate' | 'High';
  affordabilityScore: number | null;
  incomeStabilityScore: number | null;
  resilienceScore: number | null;
  confidenceScore: number | null;
  confidenceLevel: string | null;
  surplusCashEstimate: number | null;
  volatilitySignal: 'Stable' | 'Moderate' | 'Volatile';
  scoreStatus: string;
  recommendation: 'approve' | 'review' | 'decline';
  strengths: string[];
  riskFactors: string[];
};

const ORG_DECISION_FIELDS = [
  {
    label: 'CALEN Score',
    description: 'Overall behavioural score from the latest scoring run.',
    unit: 'score',
  },
  {
    label: 'Affordability Score',
    description: 'Estimated capacity to carry additional obligations.',
    unit: 'score',
  },
  {
    label: 'Income Stability',
    description: 'Consistency of inflows across the observed period.',
    unit: 'score',
  },
  {
    label: 'Resilience Score',
    description: 'Balance and liquidity resilience from recent account history.',
    unit: 'score',
  },
  {
    label: 'Confidence Score',
    description: 'Confidence in the score based on data depth and quality.',
    unit: 'score',
  },
  {
    label: 'Surplus Cash',
    description: 'Estimated monthly headroom after core expenses.',
    unit: 'currency',
  },
] as const;

const EMPTY_WORKSPACE_DATA: OrgWorkspaceData = {
  applicants: [],
  decisionRules: [],
  lendingOffers: [],
  apiKeys: [],
  riskNotesByApplicant: {},
};

const SEEDED_OFFER_IDS = new Set(['LO-001', 'LO-002', 'LO-003', 'LO-004']);
const SEEDED_API_KEY_IDS = new Set(['key_prod', 'key_test']);
const SEEDED_PIPELINE_APPLICANT_IDS = new Set([
  'APP-48',
  'APP-4891',
  'APP-4890',
  'APP-4889',
  'APP-4888',
  'APP-4887',
  'APP-4886',
]);

@Injectable()
export class OrgDashboardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly organizationsService: OrganizationsService,
    private readonly scoresService: ScoresService,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(UserSettings.name)
    private readonly userSettingsModel: Model<UserSettingsDocument>,
    @InjectModel(OrganizationInvitation.name)
    private readonly invitationModel: Model<OrganizationInvitationDocument>,
    @InjectModel(OrganizationVerification.name)
    private readonly verificationModel: Model<OrganizationVerificationDocument>,
    @InjectModel(OrganizationPipelineApplicant.name)
    private readonly pipelineApplicantModel: Model<OrganizationPipelineApplicantDocument>,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
    @InjectModel(TrustContact.name)
    private readonly trustContactModel: Model<TrustContactDocument>,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );

    const [members, invitations, verification, notifications] =
      await Promise.all([
        this.accountsService.listUsersByOrganization(String(organization._id)),
        this.invitationModel
          .find({ organizationId: organization._id })
          .sort({ createdAt: -1 })
          .limit(10),
        this.verificationModel
          .findOne({ organizationId: organization._id })
          .sort({ createdAt: -1 }),
        this.ensureNotifications(user.id, organization),
      ]);

    const integrationPreferences = this.getIntegrationPreferences(organization);
    const riskPolicy = this.getRiskPolicy(organization);
    const progress = this.buildProgress(
      organization,
      verification != null,
      invitations.length,
      members.length,
      integrationPreferences,
      riskPolicy,
    );
    const pendingInvitations = invitations.filter(
      (invitation) => invitation.status === 'pending',
    ).length;
    const acceptedInvitations = invitations.filter(
      (invitation) => invitation.status === 'accepted',
    ).length;
    const enabledProducts = Array.isArray(
      integrationPreferences.enabledProducts,
    )
      ? integrationPreferences.enabledProducts.length
      : 0;
    const unreadNotifications = notifications.filter(
      (notification) => !notification.readAt,
    ).length;
    const primaryAdmin = members.find(
      (member) =>
        String(member._id) === String(organization.primaryAdminUserId ?? ''),
    );

    return {
      dashboard: {
        organization: this.serializeOrganization(organization),
        summary: {
          displayName: account.displayName,
          onboardingStatus: progress.isCompleted ? 'completed' : 'in_progress',
          verificationStatus: verification?.status ?? 'not_submitted',
          teamMembers: members.length,
          activeMembers: members.filter(
            (member) => String(member.status) === 'active',
          ).length,
          pendingInvitations,
          acceptedInvitations,
          unreadNotifications,
          enabledProducts,
          apiAccessEnabled: Boolean(integrationPreferences.enableApiAccess),
          webhooksEnabled: Boolean(integrationPreferences.enableWebhooks),
          minimumScore:
            typeof riskPolicy.minimumScore === 'number'
              ? riskPolicy.minimumScore
              : null,
          maxExposureAmount:
            typeof riskPolicy.maxExposureAmount === 'number'
              ? riskPolicy.maxExposureAmount
              : null,
          defaultDecisionMode:
            typeof riskPolicy.defaultDecisionMode === 'string'
              ? riskPolicy.defaultDecisionMode
              : 'manual_review',
          primaryAdminName: primaryAdmin?.displayName ?? null,
        },
        progress: {
          completedSteps: [
            progress.profileCompleted,
            progress.verificationSubmitted,
            progress.hasIntegrationPreferences,
            progress.hasTeamSetup,
            progress.hasRiskPolicy,
          ].filter(Boolean).length,
          totalSteps: 5,
          ...progress,
        },
        policy: {
          minimumScore:
            typeof riskPolicy.minimumScore === 'number'
              ? riskPolicy.minimumScore
              : null,
          maxExposureAmount:
            typeof riskPolicy.maxExposureAmount === 'number'
              ? riskPolicy.maxExposureAmount
              : null,
          defaultDecisionMode:
            typeof riskPolicy.defaultDecisionMode === 'string'
              ? riskPolicy.defaultDecisionMode
              : 'manual_review',
          notes: typeof riskPolicy.notes === 'string' ? riskPolicy.notes : null,
        },
        integrations: {
          environment:
            typeof integrationPreferences.environment === 'string'
              ? integrationPreferences.environment
              : 'sandbox',
          enableApiAccess: Boolean(integrationPreferences.enableApiAccess),
          enableWebhooks: Boolean(integrationPreferences.enableWebhooks),
          enabledProducts: Array.isArray(integrationPreferences.enabledProducts)
            ? integrationPreferences.enabledProducts
            : [],
        },
        recentActivity: this.buildRecentActivity({
          organization,
          verification,
          invitations,
          members,
        }),
      },
    };
  }

  async getWorkspace(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const workspace = this.getWorkspaceData(organization);
    const [applicants, team] = await Promise.all([
      this.getStoredPipelineApplicants(organization),
      this.buildTeamSummary(organization),
    ]);

    return {
      workspace: {
        pipeline: this.buildPipelinePayload(applicants),
        search: this.buildEmptyProfileSearchPayload(),
        riskAnalysis: this.buildRiskAnalysisPayload(workspace, applicants),
        decisionEngine: this.buildDecisionEnginePayload(workspace.decisionRules),
        trustSignals: this.buildTrustSignalsPayload(applicants),
        reputationGraph: this.buildReputationGraphPayload(applicants),
        lendingOffers: this.buildLendingOffersPayload(
          applicants,
          workspace.lendingOffers,
        ),
        portfolio: this.buildPortfolioPayload(applicants),
        analytics: this.buildAnalyticsPayload(applicants),
        apiIntegrations: this.buildApiIntegrationsPayload(workspace.apiKeys),
        team: {
          ...team,
          inviteRoles: [
            'admin',
            'risk_analyst',
            'underwriter',
            'portfolio_manager',
            'compliance_officer',
            'viewer',
          ],
        },
        compliance: this.buildCompliancePayload(
          { ...workspace, applicants },
          team.members,
        ),
        support: {
          resources: [
            {
              title: 'API Documentation',
              desc: 'Complete reference for the CALEN API',
              href: '#',
            },
            {
              title: 'Integration Guides',
              desc: 'Step-by-step setup for common workflows',
              href: '#',
            },
            {
              title: 'Decision Engine Guide',
              desc: 'How to configure automated underwriting',
              href: '#',
            },
            {
              title: 'Compliance Handbook',
              desc: `Operational guidance for ${organization.jurisdiction ?? 'your region'} and privacy controls.`,
              href: '#',
            },
          ],
          contactChannels: [
            {
              label: 'Enterprise Support',
              desc: 'Priority support for enterprise clients',
              action: '+44 20 7123 4567',
            },
            {
              label: 'Email Support',
              desc: 'Response within 4 business hours',
              action: 'support@joincalen.com',
            },
            {
              label: 'Live Chat',
              desc: 'Available Mon-Fri 9am-6pm GMT',
              action: 'Start Chat',
            },
          ],
        },
      },
    };
  }

  async getProfileSearch(
    user: AuthenticatedUser,
    query: GetOrgProfileSearchDto,
  ) {
    this.assertOrganization(user);
    const calenId = query.calenId?.trim().toUpperCase() ?? '';

    if (!calenId) {
      return {
        search: this.buildEmptyProfileSearchPayload(),
      };
    }

    const account = await this.accountsService.findIndividualByShareId(calenId);

    if (!account) {
      return {
        search: this.buildProfileSearchPayload([], calenId),
      };
    }

    const onboardingState = await this.onboardingStateModel.findOne({
      userId: this.toObjectId(String(account._id)),
    });

    return {
      search: this.buildProfileSearchPayload(
        [this.serializeLookupProfile(account, onboardingState)],
        calenId,
      ),
    };
  }

  async getPipeline(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      pipeline: this.buildPipelinePayload(applicants),
    };
  }

  async getNotifications(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const notifications = await this.ensureNotifications(user.id, organization);

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
    this.assertOrganization(user);
    const now = new Date();
    const filter =
      dto.ids && dto.ids.length > 0
        ? { userId: this.toObjectId(user.id), _id: { $in: dto.ids } }
        : { userId: this.toObjectId(user.id), readAt: null };

    await this.notificationModel.updateMany(filter, {
      readAt: now,
    });

    return this.getNotifications(user);
  }

  async getSettings(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const [organization, settings, verification] = await Promise.all([
      this.organizationsService.findByIdOrThrow(user.organizationId!),
      this.ensureSettings(user.id),
      this.verificationModel
        .findOne({ organizationId: this.toObjectId(user.organizationId!) })
        .sort({ createdAt: -1 }),
    ]);

    return {
      settings: this.serializeSettings(organization, settings, verification),
    };
  }

  async updateSettings(
    user: AuthenticatedUser,
    dto: UpdateOrgDashboardSettingsDto,
  ) {
    this.assertOrganization(user);
    let organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );

    if (dto.organization) {
      organization = await this.organizationsService.updateOrganizationProfile(
        String(organization._id),
        dto.organization,
      );
    }

    const onboardingUpdate: Record<string, unknown> = {};
    if (dto.riskPolicy) {
      onboardingUpdate.riskPolicy = {
        ...this.getRiskPolicy(organization),
        ...dto.riskPolicy,
      };
    }
    if (dto.integrationPreferences) {
      onboardingUpdate.integrationPreferences = {
        ...this.getIntegrationPreferences(organization),
        ...dto.integrationPreferences,
      };
    }
    if (dto.security) {
      onboardingUpdate.securityControls = {
        ...this.getSecurityControls(organization),
        ...dto.security,
      };
    }

    if (Object.keys(onboardingUpdate).length > 0) {
      organization = await this.organizationsService.updateOnboardingData(
        String(organization._id),
        onboardingUpdate,
      );
    }

    let settings: UserSettingsDocument | null = null;

    if (dto.notifications) {
      await this.ensureSettings(user.id);
      settings = await this.userSettingsModel.findOneAndUpdate(
        { userId: this.toObjectId(user.id) },
        dto.notifications,
        { new: true },
      );
    }

    const [resolvedSettings, verification] = await Promise.all([
      settings ?? this.ensureSettings(user.id),
      this.verificationModel
        .findOne({ organizationId: this.toObjectId(user.organizationId!) })
        .sort({ createdAt: -1 }),
    ]);

    return {
      settings: this.serializeSettings(
        organization,
        resolvedSettings,
        verification,
      ),
    };
  }

  async updatePipelineStage(
    user: AuthenticatedUser,
    applicantId: string,
    dto: UpdateOrgPipelineStageDto,
  ) {
    this.assertOrganization(user);
    const organizationId = this.toObjectId(user.organizationId!);
    const applicant = await this.pipelineApplicantModel.findOne({
      organizationId,
      applicantId,
    });

    if (!applicant) {
      throw new NotFoundException({
        code: 'ORG_APPLICANT_NOT_FOUND',
        message: 'That applicant was not found in the organisation pipeline.',
      });
    }

    await this.pipelineApplicantModel.findOneAndUpdate(
      { organizationId, applicantId },
      {
        stage: dto.stage,
        riskLevel: this.getRiskLevelForStage(dto.stage, applicant.score),
      },
      { new: true },
    );

    return this.getWorkspace(user);
  }

  async saveRiskNotes(user: AuthenticatedUser, dto: SaveOrgRiskNotesDto) {
    this.assertOrganization(user);
    const calenId = dto.calenId.trim().toUpperCase();

    await this.updateWorkspaceData(user.organizationId!, (workspace) => ({
      ...workspace,
      riskNotesByApplicant: {
        ...workspace.riskNotesByApplicant,
        [calenId]: dto.notes?.trim() ?? '',
      },
    }));

    return this.getRiskAnalysis(user, { calenId });
  }

  async getRiskAnalysis(
    user: AuthenticatedUser,
    query: GetOrgProfileSearchDto,
  ) {
    this.assertOrganization(user);
    const calenId = query.calenId?.trim().toUpperCase() ?? '';

    if (!calenId) {
      return {
        riskAnalysis: {
          profile: null,
          appliedFilters: {
            calenId: '',
          },
        },
      };
    }

    const [organization, account] = await Promise.all([
      this.organizationsService.findByIdOrThrow(user.organizationId!),
      this.accountsService.findIndividualByShareId(calenId),
    ]);

    if (!account) {
      return {
        riskAnalysis: {
          profile: null,
          appliedFilters: {
            calenId,
          },
        },
      };
    }

    const subjectUserId = this.toObjectId(String(account._id));
    const [onboardingState, bankConnections, trustContacts, latestScore] =
      await Promise.all([
        this.onboardingStateModel.findOne({ userId: subjectUserId }),
        this.bankConnectionModel
          .find({ userId: subjectUserId })
          .sort({ createdAt: -1 }),
        this.trustContactModel.find({ userId: subjectUserId }).sort({
          createdAt: -1,
        }),
        this.scoresService.getLatestScore(String(account._id)),
      ]);

    const workspace = this.getWorkspaceData(organization);

    return {
      riskAnalysis: {
        profile: this.buildOrgRiskAnalysisProfile({
          account,
          onboardingState,
          bankConnections,
          trustContacts,
          latestScore,
          notes: workspace.riskNotesByApplicant[calenId] ?? '',
        }),
        appliedFilters: {
          calenId,
        },
      },
    };
  }

  async updateDecisionRules(
    user: AuthenticatedUser,
    dto: UpdateOrgDecisionRulesDto,
  ) {
    this.assertOrganization(user);
    await this.updateWorkspaceData(user.organizationId!, (workspace) => ({
      ...workspace,
      decisionRules: dto.rules.map((rule) => ({
        id: rule.id,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        action: rule.action,
      })),
    }));

    return this.getDecisionEngine(user, {});
  }

  async getDecisionEngine(
    user: AuthenticatedUser,
    query: GetOrgProfileSearchDto,
  ) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const workspace = this.getWorkspaceData(organization);
    const calenId = query.calenId?.trim().toUpperCase() ?? '';

    if (!calenId) {
      return {
        decisionEngine: this.buildDecisionEnginePayload(workspace.decisionRules),
      };
    }

    const account = await this.accountsService.findIndividualByShareId(calenId);

    if (!account) {
      return {
        decisionEngine: this.buildDecisionEnginePayload(
          workspace.decisionRules,
          undefined,
          calenId,
        ),
      };
    }

    const subjectUserId = this.toObjectId(String(account._id));
    const [onboardingState, bankConnections, trustContacts, latestScore] =
      await Promise.all([
        this.onboardingStateModel.findOne({ userId: subjectUserId }),
        this.bankConnectionModel
          .find({ userId: subjectUserId })
          .sort({ createdAt: -1 }),
        this.trustContactModel.find({ userId: subjectUserId }).sort({
          createdAt: -1,
        }),
        this.scoresService.getLatestScore(String(account._id)),
      ]);

    const candidate = this.buildDecisionSimulationCandidate({
      account,
      onboardingState,
      bankConnections,
      trustContacts,
      latestScore,
    });

    return {
      decisionEngine: this.buildDecisionEnginePayload(
        workspace.decisionRules,
        candidate,
        calenId,
      ),
    };
  }

  async getTrustSignals(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      trustSignals: this.buildTrustSignalsPayload(applicants),
    };
  }

  async getReputationGraph(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      reputationGraph: this.buildReputationGraphPayload(applicants),
    };
  }

  async getLendingOffers(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);
    const lendingOffers = await this.getStoredLendingOffers(organization);

    return {
      lendingOffers: this.buildLendingOffersPayload(
        applicants,
        lendingOffers,
      ),
    };
  }

  async createLendingOffer(
    user: AuthenticatedUser,
    dto: CreateOrgLendingOfferDto,
  ) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const nextOfferId = this.getNextCustomOfferId(organization);

    await this.updateWorkspaceData(user.organizationId!, (workspace) => {
      workspace.lendingOffers.unshift({
        id: nextOfferId,
        ...this.buildStoredLendingOfferFields(dto),
        applicants: 0,
        views: 0,
        status: 'Active',
      });

      return workspace;
    });

    return this.getLendingOffers(user);
  }

  async updateLendingOffer(
    user: AuthenticatedUser,
    offerId: string,
    dto: UpdateOrgLendingOfferDto,
  ) {
    this.assertOrganization(user);
    await this.updateWorkspaceData(user.organizationId!, (workspace) => {
      const offerIndex = workspace.lendingOffers.findIndex(
        (offer) => offer.id === offerId,
      );

      if (offerIndex < 0) {
        throw new NotFoundException({
          code: 'ORG_LENDING_OFFER_NOT_FOUND',
          message: 'That lending offer was not found for this organisation.',
        });
      }

      const existingOffer = workspace.lendingOffers[offerIndex];
      workspace.lendingOffers[offerIndex] = {
        ...existingOffer,
        ...this.buildStoredLendingOfferFields(dto),
      };

      return workspace;
    });

    return this.getLendingOffers(user);
  }

  async getApiIntegrations(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const apiKeys = await this.getStoredApiKeys(organization);

    return {
      apiIntegrations: this.buildApiIntegrationsPayload(apiKeys),
    };
  }

  async getPortfolio(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      portfolio: this.buildPortfolioPayload(applicants),
    };
  }

  async getAnalytics(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      analytics: this.buildAnalyticsPayload(applicants),
    };
  }

  async getCompliance(user: AuthenticatedUser) {
    this.assertOrganization(user);
    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );
    const [workspace, team] = await Promise.all([
      Promise.resolve(this.getWorkspaceData(organization)),
      this.buildTeamSummary(organization),
    ]);
    const applicants = await this.getStoredPipelineApplicants(organization);

    return {
      compliance: this.buildCompliancePayload(
        { ...workspace, applicants },
        team.members,
      ),
    };
  }

  async createApiKey(user: AuthenticatedUser, dto: CreateOrgApiKeyDto) {
    this.assertOrganization(user);
    await this.updateWorkspaceData(user.organizationId!, (workspace) => {
      workspace.apiKeys.unshift({
        id: `key_${randomBytes(4).toString('hex')}`,
        name: dto.name.trim(),
        key: `sk_live_calen_${randomBytes(4).toString('hex')}_${randomBytes(4).toString('hex')}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        status: 'Active',
      });

      return workspace;
    });

    return this.getApiIntegrations(user);
  }

  private async ensureNotifications(
    userId: string,
    organization: OrganizationSettingsShape,
  ) {
    const userObjectId = this.toObjectId(userId);
    let notifications = await this.notificationModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    if (notifications.length > 0) {
      return notifications;
    }

    const riskPolicy = this.getRiskPolicy(organization);
    const integrationPreferences = this.getIntegrationPreferences(organization);
    await this.notificationModel.create([
      {
        userId: userObjectId,
        category: 'org_setup',
        title: 'Your organisation workspace is ready',
        body: `You can now manage ${organization.name} from the CALEN org dashboard.`,
      },
      {
        userId: userObjectId,
        category: 'verification',
        title: 'Verification review is in progress',
        body: 'Your KYB submission is queued for review and you can continue setup in parallel.',
      },
      {
        userId: userObjectId,
        category: 'risk_policy',
        title: 'Risk policy captured',
        body:
          typeof riskPolicy.minimumScore === 'number'
            ? `Your minimum internal score is set to ${riskPolicy.minimumScore}.`
            : 'Set a minimum internal score to guide manual and automated review.',
      },
      {
        userId: userObjectId,
        category: 'integrations',
        title: 'Integration preferences saved',
        body: integrationPreferences.enableApiAccess
          ? 'API access is enabled for your organisation.'
          : 'API access is still disabled for your organisation.',
      },
    ]);

    notifications = await this.notificationModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 });

    return notifications;
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

  private serializeSettings(
    organization: OrganizationSettingsShape,
    settings: UserSettingsDocument | null,
    verification: OrganizationVerificationDocument | null,
  ) {
    const riskPolicy = this.getRiskPolicy(organization);
    const integrationPreferences = this.getIntegrationPreferences(organization);
    const securityControls = this.getSecurityControls(organization);

    return {
      organization: {
        name: organization.name,
        industry: organization.industry ?? '',
        website: organization.website ?? '',
        jurisdiction: organization.jurisdiction ?? '',
        country: organization.country ?? '',
        companySize: organization.companySize ?? '',
        registrationNumber: organization.registrationNumber ?? '',
      },
      riskPolicy: {
        minimumScore:
          typeof riskPolicy.minimumScore === 'number'
            ? riskPolicy.minimumScore
            : null,
        maxExposureAmount:
          typeof riskPolicy.maxExposureAmount === 'number'
            ? riskPolicy.maxExposureAmount
            : null,
        defaultDecisionMode:
          typeof riskPolicy.defaultDecisionMode === 'string'
            ? riskPolicy.defaultDecisionMode
            : 'manual_review',
        notes: typeof riskPolicy.notes === 'string' ? riskPolicy.notes : '',
      },
      integrationPreferences: {
        environment:
          typeof integrationPreferences.environment === 'string'
            ? integrationPreferences.environment
            : 'sandbox',
        enableApiAccess: Boolean(integrationPreferences.enableApiAccess),
        enableWebhooks: Boolean(integrationPreferences.enableWebhooks),
        enabledProducts: Array.isArray(integrationPreferences.enabledProducts)
          ? integrationPreferences.enabledProducts
          : [],
      },
      notifications: {
        marketingEmails: settings?.marketingEmails ?? true,
        productUpdates: settings?.productUpdates ?? true,
        securityAlerts: settings?.securityAlerts ?? true,
        pushNotifications: settings?.pushNotifications ?? false,
      },
      security: {
        mfaRequired:
          typeof securityControls.mfaRequired === 'boolean'
            ? securityControls.mfaRequired
            : true,
        sessionTimeoutMinutes:
          typeof securityControls.sessionTimeoutMinutes === 'number'
            ? securityControls.sessionTimeoutMinutes
            : 30,
        ipRestrictionsEnabled:
          typeof securityControls.ipRestrictionsEnabled === 'boolean'
            ? securityControls.ipRestrictionsEnabled
            : false,
        auditLoggingEnabled:
          typeof securityControls.auditLoggingEnabled === 'boolean'
            ? securityControls.auditLoggingEnabled
            : true,
      },
      verification: verification
        ? {
            status: verification.status,
            provider: verification.provider,
            documentType: verification.documentType,
            referenceNumber: verification.referenceNumber,
            submittedAt: verification.submittedAt,
          }
        : null,
    };
  }

  private async buildTeamSummary(organization: OrganizationSettingsShape) {
    const organizationId = this.toObjectId(String(organization._id));
    const [members, invitations] = await Promise.all([
      this.accountsService.listUsersByOrganization(String(organizationId)),
      this.invitationModel.find({ organizationId }).sort({ createdAt: -1 }),
    ]);

    return {
      members: members.map((member) => ({
        id: String(member._id),
        name: member.displayName ?? member.email,
        email: member.email,
        role: member.jobTitle ?? 'Organisation Member',
        status: member.lastLoginAt
          ? 'Online'
          : String(member.status) === 'active'
            ? 'Offline'
            : this.humanizeValue(member.status ?? 'inactive'),
        lastLoginAt: member.lastLoginAt ?? null,
      })),
      invitations: invitations.map((invitation) => ({
        id: String(invitation._id),
        email: invitation.email,
        role: this.humanizeValue(invitation.role),
        status: invitation.status,
        createdAt: invitation.createdAt ?? null,
      })),
    };
  }

  private buildPipelinePayload(applicants: WorkspaceApplicant[]) {
    return {
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
      applicants: applicants.map((applicant) =>
        this.serializePipelineApplicant(applicant),
      ),
    };
  }

  private getWorkspaceData(
    organization: OrganizationSettingsShape,
  ): OrgWorkspaceData {
    const workspaceData = this.getStoredWorkspaceData(organization);

    return {
      applicants: [],
      decisionRules: Array.isArray(workspaceData.decisionRules)
        ? workspaceData.decisionRules
        : EMPTY_WORKSPACE_DATA.decisionRules,
      lendingOffers: Array.isArray(workspaceData.lendingOffers)
        ? workspaceData.lendingOffers
        : EMPTY_WORKSPACE_DATA.lendingOffers,
      apiKeys: Array.isArray(workspaceData.apiKeys)
        ? workspaceData.apiKeys
        : EMPTY_WORKSPACE_DATA.apiKeys,
      riskNotesByApplicant:
        workspaceData.riskNotesByApplicant ??
        EMPTY_WORKSPACE_DATA.riskNotesByApplicant,
    };
  }

  private getStoredWorkspaceData(
    organization: OrganizationSettingsShape,
  ): Partial<OrgWorkspaceData> {
    const workspaceData =
      (organization.onboardingData?.workspaceData as
        | Partial<OrgWorkspaceData>
        | undefined) ?? {};

    return {
      ...workspaceData,
      applicants: [],
      lendingOffers: Array.isArray(workspaceData.lendingOffers)
        ? workspaceData.lendingOffers.filter(
            (offer) => !this.isSeededOfferRecord(offer),
          )
        : [],
      apiKeys: Array.isArray(workspaceData.apiKeys)
        ? workspaceData.apiKeys.filter(
            (apiKey) => !this.isSeededApiKeyRecord(apiKey),
          )
        : [],
      riskNotesByApplicant:
        workspaceData.riskNotesByApplicant ??
        EMPTY_WORKSPACE_DATA.riskNotesByApplicant,
    };
  }

  private getRawWorkspaceData(
    organization: OrganizationSettingsShape,
  ): Partial<OrgWorkspaceData> {
    return (
      (organization.onboardingData?.workspaceData as
        | Partial<OrgWorkspaceData>
        | undefined) ?? {}
    );
  }

  private async getStoredLendingOffers(organization: OrganizationSettingsShape) {
    const workspaceData = this.getStoredWorkspaceData(organization);
    return Array.isArray(workspaceData.lendingOffers)
      ? workspaceData.lendingOffers
      : [];
  }

  private async getStoredApiKeys(organization: OrganizationSettingsShape) {
    const workspaceData = this.getStoredWorkspaceData(organization);
    return Array.isArray(workspaceData.apiKeys) ? workspaceData.apiKeys : [];
  }

  private async getStoredPipelineApplicants(
    organization: OrganizationSettingsShape,
  ) {
    const organizationId = this.toObjectId(String(organization._id));
    const storedApplicants = await this.pipelineApplicantModel
      .find({ organizationId })
      .sort({ createdAt: 1 });

    if (storedApplicants.length === 0) {
      return [];
    }

    const demoApplicants = storedApplicants.filter((applicant) =>
      this.isSeededPipelineApplicant(applicant),
    );
    if (demoApplicants.length === storedApplicants.length) {
      await this.pipelineApplicantModel.deleteMany({ organizationId });
      return [];
    }
    if (demoApplicants.length > 0) {
      await this.pipelineApplicantModel.deleteMany({
        organizationId,
        applicantId: {
          $in: demoApplicants.map((applicant) => applicant.applicantId),
        },
      });
    }

    return storedApplicants
      .filter((applicant) => !this.isSeededPipelineApplicant(applicant))
      .map((applicant) =>
        this.deserializePipelineApplicant(applicant),
      );
  }

  private async updateWorkspaceData(
    organizationId: string,
    updater: (workspace: OrgWorkspaceData) => OrgWorkspaceData,
  ) {
    const organization =
      await this.organizationsService.findByIdOrThrow(organizationId);
    const workspace = this.getStoredWorkspaceData(organization);
    const updatedWorkspace = updater({
      applicants: [],
      decisionRules: Array.isArray(workspace.decisionRules)
        ? [...workspace.decisionRules]
        : [],
      lendingOffers: Array.isArray(workspace.lendingOffers)
        ? [...workspace.lendingOffers]
        : [],
      apiKeys: Array.isArray(workspace.apiKeys) ? [...workspace.apiKeys] : [],
      riskNotesByApplicant: { ...workspace.riskNotesByApplicant },
    });

    await this.organizationsService.updateOnboardingData(organizationId, {
      workspaceData: updatedWorkspace,
    });
  }

  private serializePipelineApplicant(applicant: WorkspaceApplicant) {
    return {
      id: applicant.id,
      name: applicant.name,
      score: applicant.score,
      income: this.formatMoney(applicant.annualIncome),
      trust: applicant.trust,
      product: applicant.product,
      stage: applicant.stage,
    };
  }

  private deserializePipelineApplicant(
    applicant: OrganizationPipelineApplicantDocument,
  ): WorkspaceApplicant {
    return {
      id: applicant.applicantId,
      calenId: applicant.calenId,
      name: applicant.name,
      score: applicant.score,
      annualIncome: applicant.annualIncome,
      income: applicant.income,
      savings: applicant.savings,
      debt: applicant.debt,
      trust: applicant.trust,
      location: applicant.location,
      industry: applicant.industry,
      verified: applicant.verified,
      product: applicant.product,
      stage: applicant.stage,
      riskLevel: applicant.riskLevel,
      trustEndorsements: applicant.trustEndorsements.map((endorsement) => ({
        type: endorsement.type,
        source: endorsement.source,
        status: endorsement.status,
        date: endorsement.date,
        strength: endorsement.strength,
      })),
      scoreFactors: applicant.scoreFactors.map((factor) => ({
        subject: factor.subject,
        value: factor.value,
      })),
      indicators: applicant.indicators.map((indicator) => ({
        label: indicator.label,
        value: indicator.value,
        status: indicator.status,
      })),
      createdAt: applicant.createdAt,
      updatedAt: applicant.updatedAt,
    };
  }

  private serializeSearchProfile(applicant: WorkspaceApplicant) {
    return {
      id: applicant.calenId,
      name: applicant.name,
      score: applicant.score,
      income: applicant.income,
      savings: applicant.savings,
      debt: applicant.debt,
      trust: applicant.trust,
      location: applicant.location,
      industry: applicant.industry,
      verified: applicant.verified,
    };
  }

  private buildEmptyProfileSearchPayload() {
    return this.buildProfileSearchPayload([], '');
  }

  private buildProfileSearchPayload(
    profiles: Array<{
      id: string;
      name: string;
      verified: boolean;
      onboardingStatus: string;
      country: string | null;
      city: string | null;
      jobTitle: string | null;
      employerName: string | null;
      monthlyIncome: number | null;
    }>,
    calenId: string,
  ) {
    return {
      profiles,
      appliedFilters: {
        calenId,
      },
      resultCount: profiles.length,
    };
  }

  private serializeLookupProfile(
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>,
    onboardingState: OnboardingStateDocument | null,
  ) {
    const profile = account.profileId as
      | {
          shareId?: string;
          onboardingStatus?: string;
        }
      | undefined;
    const personalProfile =
      (onboardingState?.personalProfile as
        | { city?: string; country?: string }
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

    return {
      id: profile?.shareId ?? '',
      name: account.displayName,
      verified: Boolean(account.emailVerifiedAt),
      onboardingStatus: profile?.onboardingStatus ?? 'not_started',
      country: personalProfile?.country ?? account.country ?? null,
      city: personalProfile?.city ?? null,
      jobTitle: employmentProfile?.jobTitle ?? account.jobTitle ?? null,
      employerName: employmentProfile?.employerName ?? null,
      monthlyIncome:
        employmentProfile?.monthlyIncome ??
        financialProfile?.monthlyIncome ??
        null,
    };
  }

  private buildRiskAnalysisPayload(
    workspace: OrgWorkspaceData,
    applicants: WorkspaceApplicant[],
  ) {
    const profile = applicants[0];
    if (!profile) {
      return {
        profile: null,
      };
    }

    const initials = profile.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return {
      profile: {
        name: profile.name,
        id: profile.calenId,
        score: profile.score,
        initials,
        riskLevel: profile.riskLevel,
        factors: profile.scoreFactors.map((item) => ({
          subject: item.subject,
          A: item.value,
        })),
        indicators: profile.indicators,
        trustEndorsements: profile.trustEndorsements.map((endorsement) => ({
          type: endorsement.type,
          source: endorsement.source,
          status: endorsement.status,
          date: endorsement.date,
        })),
        notes: workspace.riskNotesByApplicant[profile.calenId] ?? '',
      },
    };
  }

  private buildOrgRiskAnalysisProfile(input: {
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;
    onboardingState: OnboardingStateDocument | null;
    bankConnections: BankConnectionDocument[];
    trustContacts: TrustContactDocument[];
    latestScore: LatestScorePayload | null;
    notes: string;
  }) {
    const { account, onboardingState, bankConnections, trustContacts, latestScore, notes } =
      input;
    const profile = account.profileId as
      | {
          shareId?: string;
          onboardingStatus?: string;
        }
      | undefined;
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
            employmentType?: string;
            yearsEmployed?: number;
            monthlyIncome?: number;
          }
        | null
        | undefined) ?? null;
    const financialProfile =
      (onboardingState?.financialProfile as
        | {
            monthlyIncome?: number;
            monthlyExpenses?: number;
            savingsBalance?: number;
            outstandingLoanTotal?: number;
            loanCount?: number;
          }
        | null
        | undefined) ?? null;
    const monthlyIncome =
      employmentProfile?.monthlyIncome ??
      financialProfile?.monthlyIncome ??
      0;
    const completedSteps = onboardingState?.completedSteps.length ?? 0;
    const connectedBanks = bankConnections.filter(
      (connection) => connection.status === 'connected',
    ).length;
    const endorsedContacts = trustContacts.filter(
      (contact) => contact.status === 'endorsed',
    );
    const pendingTrustContacts = trustContacts.filter(
      (contact) => contact.status === 'request_sent',
    );
    const assessment = this.buildOrgAssessment({
      onboardingState,
      latestScore,
    });
    const verificationDepth = this.clampPercentage(
      30 +
        (account.emailVerifiedAt ? 15 : 0) +
        completedSteps * 6 +
        connectedBanks * 12 +
        (profile?.onboardingStatus === 'completed' ? 15 : 0),
    );
    const trustStrength = this.clampPercentage(
      25 +
        endorsedContacts.length * 18 +
        pendingTrustContacts.length * 6 +
        (endorsedContacts.reduce(
          (sum, contact) => sum + (contact.responseTrustLevel ?? 0),
          0,
        ) /
          Math.max(endorsedContacts.length, 1)) *
          6,
    );
    const score = typeof latestScore?.score === 'number' ? latestScore.score : null;
    const factors = [
      { subject: 'Affordability', A: assessment.affordabilityScore ?? 0 },
      { subject: 'Income Stability', A: assessment.incomeStabilityScore ?? 0 },
      { subject: 'Resilience', A: assessment.resilienceScore ?? 0 },
      { subject: 'Confidence', A: assessment.confidenceScore ?? 0 },
      { subject: 'Verification Depth', A: verificationDepth },
      { subject: 'Trust Depth', A: trustStrength },
    ];
    const indicators = [
      {
        label: 'Affordability',
        value: assessment.affordabilityScore ?? 0,
        status: this.getIndicatorStatus(assessment.affordabilityScore ?? 0),
      },
      {
        label: 'Income Stability',
        value: assessment.incomeStabilityScore ?? 0,
        status: this.getIndicatorStatus(assessment.incomeStabilityScore ?? 0),
      },
      {
        label: 'Resilience',
        value: assessment.resilienceScore ?? 0,
        status: this.getIndicatorStatus(assessment.resilienceScore ?? 0),
      },
      {
        label: 'Confidence',
        value: assessment.confidenceScore ?? 0,
        status: this.getIndicatorStatus(assessment.confidenceScore ?? 0),
      },
      {
        label: 'Cash-Flow Stability',
        value: assessment.cashFlowStabilityScore ?? 0,
        status: this.getIndicatorStatus(assessment.cashFlowStabilityScore ?? 0),
      },
      {
        label: 'Spending Discipline',
        value: assessment.spendingDisciplineScore ?? 0,
        status: this.getIndicatorStatus(assessment.spendingDisciplineScore ?? 0),
      },
    ];
    const name = account.displayName;
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

    return {
      name,
      id: profile?.shareId ?? '',
      score,
      initials,
      riskLevel: this.getRiskLevelFromAssessment(score, assessment),
      scoreStatus: latestScore?.status ?? 'unavailable',
      factors,
      indicators,
      assessment: {
        affordabilityScore: assessment.affordabilityScore,
        incomeStabilityScore: assessment.incomeStabilityScore,
        resilienceScore: assessment.resilienceScore,
        confidenceScore: assessment.confidenceScore,
        confidenceLevel: assessment.confidenceLevel,
        debtPressureIndicator: assessment.debtPressureIndicator,
        surplusCashEstimate: assessment.surplusCashEstimate,
        volatilitySignal: assessment.volatilitySignal,
      },
      recommendationPreview: this.buildOrgRecommendationPreview(
        score,
        assessment,
      ),
      strengths: assessment.strengths,
      riskFactors: assessment.riskFactors,
      anomalyFlags: assessment.anomalyFlags,
      trustEndorsements: [
        ...endorsedContacts.map((contact) => ({
          type: contact.relationship,
          source: contact.fullName,
          status: 'Verified',
          date: (contact.respondedAt ?? new Date()).toISOString().slice(0, 10),
        })),
        ...pendingTrustContacts.map((contact) => ({
          type: contact.relationship,
          source: contact.fullName,
          status: 'Pending',
          date: (contact.requestedAt ?? new Date()).toISOString().slice(0, 10),
        })),
      ],
      notes,
      profileSummary: {
        country: personalProfile?.country ?? account.country ?? null,
        city: personalProfile?.city ?? null,
        employerName: employmentProfile?.employerName ?? null,
        jobTitle: employmentProfile?.jobTitle ?? account.jobTitle ?? null,
        monthlyIncome: monthlyIncome > 0 ? monthlyIncome : null,
        connectedBanks,
        endorsedTrustContacts: endorsedContacts.length,
      },
    };
  }

  private buildDecisionEnginePayload(
    rules: WorkspaceDecisionRule[],
    candidate?: OrgDecisionSimulationCandidate,
    calenId = '',
  ) {
    return {
      workflowSteps: [
        'Profile Retrieved',
        'Assessment Derived',
        'Rules Applied',
        'Decision Proposed',
      ],
      availableFields: ORG_DECISION_FIELDS,
      rules,
      simulationProfile: candidate
        ? {
            id: candidate.id,
            calenId: candidate.calenId,
            name: candidate.name,
            score: candidate.score,
            riskLevel: candidate.riskLevel,
            affordabilityScore: candidate.affordabilityScore,
            confidenceScore: candidate.confidenceScore,
            confidenceLevel: candidate.confidenceLevel,
            surplusCashEstimate: candidate.surplusCashEstimate,
            scoreStatus: candidate.scoreStatus,
            recommendation: candidate.recommendation,
            strengths: candidate.strengths,
            riskFactors: candidate.riskFactors,
          }
        : null,
      simulationResults: candidate
        ? this.simulateDecisionResults([candidate], rules)
        : [],
      appliedFilters: {
        calenId,
      },
    };
  }

  private buildDecisionSimulationCandidate(input: {
    account: Awaited<ReturnType<AccountsService['findUserByIdOrThrow']>>;
    onboardingState: OnboardingStateDocument | null;
    bankConnections: BankConnectionDocument[];
    trustContacts: TrustContactDocument[];
    latestScore: LatestScorePayload | null;
  }): OrgDecisionSimulationCandidate {
    const { account, onboardingState, trustContacts, latestScore } = input;
    const profile = account.profileId as
      | {
          shareId?: string;
        }
      | undefined;
    const endorsedContacts = trustContacts.filter(
      (contact) => contact.status === 'endorsed',
    );
    const assessment = this.buildOrgAssessment({
      onboardingState,
      latestScore,
    });
    const score = typeof latestScore?.score === 'number' ? latestScore.score : null;

    return {
      id: `SIM-${profile?.shareId ?? String(account._id)}`,
      calenId: profile?.shareId ?? '',
      name: account.displayName,
      score,
      riskLevel: this.getRiskLevelFromAssessment(score, assessment),
      affordabilityScore: assessment.affordabilityScore,
      incomeStabilityScore: assessment.incomeStabilityScore,
      resilienceScore: assessment.resilienceScore,
      confidenceScore: assessment.confidenceScore,
      confidenceLevel: assessment.confidenceLevel,
      surplusCashEstimate: assessment.surplusCashEstimate,
      volatilitySignal: assessment.volatilitySignal,
      scoreStatus: latestScore?.status ?? 'unavailable',
      recommendation: this.buildOrgRecommendationPreview(score, assessment).outcome,
      strengths: assessment.strengths,
      riskFactors:
        assessment.riskFactors.length > 0
          ? assessment.riskFactors
          : endorsedContacts.length === 0
            ? ['No trust endorsements have been verified yet.']
            : assessment.riskFactors,
    };
  }

  private clampPercentage(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private getIndicatorStatus(value: number) {
    if (value >= 80) {
      return 'excellent';
    }

    if (value >= 60) {
      return 'good';
    }

    return 'watch';
  }

  private getRiskLevelFromScore(score: number) {
    if (score >= 720) {
      return 'Low';
    }

    if (score >= 620) {
      return 'Moderate';
    }

    return 'High';
  }

  private simulateDecisionResults(
    applicants: OrgDecisionSimulationCandidate[],
    rules: WorkspaceDecisionRule[],
  ) {
    return applicants.slice(0, 4).map((applicant) => {
      const triggeredRule =
        rules.find((rule) => this.evaluateRule(applicant, rule)) ?? null;
      const result = triggeredRule
        ? this.getDecisionResultLabel(triggeredRule.action)
        : 'Approved';

      return {
        id: applicant.id,
        name: applicant.name,
        score: applicant.score,
        affordabilityScore: applicant.affordabilityScore,
        confidenceScore: applicant.confidenceScore,
        confidenceLevel: applicant.confidenceLevel,
        surplusCashEstimate: applicant.surplusCashEstimate,
        recommendation: applicant.recommendation,
        result,
        rule: triggeredRule
          ? `${triggeredRule.field} ${triggeredRule.operator} ${triggeredRule.value}`
          : 'No rule triggered',
      };
    });
  }

  private getDecisionResultLabel(action: string) {
    if (action === 'Approve') {
      return 'Approved';
    }

    if (action === 'Reject') {
      return 'Rejected';
    }

    if (action === 'Flag for Review') {
      return 'Flagged';
    }

    return action;
  }

  private evaluateRule(
    applicant: OrgDecisionSimulationCandidate,
    rule: WorkspaceDecisionRule,
  ) {
    const fieldMap: Record<string, number | null> = {
      'CALEN Score': applicant.score,
      'Affordability Score': applicant.affordabilityScore,
      'Income Stability': applicant.incomeStabilityScore,
      'Resilience Score': applicant.resilienceScore,
      'Confidence Score': applicant.confidenceScore,
      'Surplus Cash': applicant.surplusCashEstimate,
    };
    const left = fieldMap[rule.field];
    const right = Number(String(rule.value).replace(/[^0-9.-]/g, ''));

    if (left == null || Number.isNaN(left) || Number.isNaN(right)) {
      return false;
    }

    if (rule.operator === '≥') return left >= right;
    if (rule.operator === '>') return left > right;
    if (rule.operator === '<') return left < right;
    if (rule.operator === '≤') return left <= right;
    return left === right;
  }

  private buildOrgAssessment(input: {
    onboardingState: OnboardingStateDocument | null;
    latestScore: LatestScorePayload | null;
  }): OrgAssessmentShape {
    const financialProfile =
      (input.onboardingState?.financialProfile as
        | {
            monthlyIncome?: number;
            monthlyExpenses?: number;
            savingsBalance?: number;
            outstandingLoanTotal?: number;
            loanCount?: number;
          }
        | null
        | undefined) ?? null;
    const employmentProfile =
      (input.onboardingState?.employmentProfile as
        | {
            monthlyIncome?: number;
            yearsEmployed?: number;
            employmentType?: string;
          }
        | null
        | undefined) ?? null;
    const monthlyIncome =
      employmentProfile?.monthlyIncome ??
      financialProfile?.monthlyIncome ??
      null;
    const monthlyExpenses =
      typeof financialProfile?.monthlyExpenses === 'number'
        ? financialProfile.monthlyExpenses
        : null;
    const savingsBalance =
      typeof financialProfile?.savingsBalance === 'number'
        ? financialProfile.savingsBalance
        : null;
    const outstandingLoanTotal =
      typeof financialProfile?.outstandingLoanTotal === 'number'
        ? financialProfile.outstandingLoanTotal
        : null;
    const surplusCashEstimate =
      monthlyIncome == null
        ? null
        : Math.round(monthlyIncome - (monthlyExpenses ?? 0));
    const incomeStabilityScore =
      this.getScoreComponentScore(input.latestScore, 'income_reliability') ??
      this.clampPercentage(
        40 +
          Math.min((employmentProfile?.yearsEmployed ?? 0) * 10, 30) +
          (monthlyIncome != null && monthlyIncome >= 350000
            ? 20
            : monthlyIncome != null && monthlyIncome >= 150000
              ? 10
              : 0) +
          (employmentProfile?.employmentType === 'full_time' ? 10 : 0),
      );
    const resilienceScore =
      this.getScoreComponentScore(input.latestScore, 'balance_resilience') ??
      this.clampPercentage(
        monthlyExpenses != null && monthlyExpenses > 0
          ? ((savingsBalance ?? 0) / monthlyExpenses) * 25
          : (savingsBalance ?? 0) > 0
            ? 65
            : 20,
      );
    const cashFlowStabilityScore =
      this.getScoreComponentScore(input.latestScore, 'cash_flow_stability') ??
      this.clampPercentage(
        monthlyIncome != null && monthlyIncome > 0
          ? 50 + (((monthlyIncome - (monthlyExpenses ?? 0)) / monthlyIncome) * 50)
          : 30,
      );
    const spendingDisciplineScore =
      this.getScoreComponentScore(input.latestScore, 'spending_discipline') ??
      this.clampPercentage(
        monthlyIncome != null && monthlyIncome > 0 && monthlyExpenses != null
          ? 100 - Math.min(80, (monthlyExpenses / monthlyIncome) * 100)
          : 45,
      );
    const confidenceScore =
      typeof input.latestScore?.confidence?.score === 'number'
        ? input.latestScore.confidence.score
        : null;
    const confidenceLevel =
      typeof input.latestScore?.confidence?.level === 'string'
        ? input.latestScore.confidence.level
        : null;
    const behaviouralAffordabilityBase = this.clampPercentage(
      Math.round(
        ((cashFlowStabilityScore ?? 50) * 0.45) +
          ((spendingDisciplineScore ?? 50) * 0.25) +
          ((resilienceScore ?? 50) * 0.3),
      ),
    );
    const affordabilityScore =
      monthlyIncome == null || surplusCashEstimate == null
        ? behaviouralAffordabilityBase
        : this.clampPercentage(
            Math.round(
              behaviouralAffordabilityBase * 0.55 +
                this.getAffordabilityScoreFromSurplus(
                  surplusCashEstimate,
                  monthlyIncome,
                ) *
                  0.45,
            ),
          );
    const debtPressureRatio =
      monthlyIncome == null || monthlyIncome <= 0
        ? null
        : ((outstandingLoanTotal ?? 0) / 12) / monthlyIncome;
    const obligationConsistencyScore = this.getScoreComponentScore(
      input.latestScore,
      'obligation_consistency',
    );
    const rawVolatilityScore = this.getScoreComponentScore(
      input.latestScore,
      'financial_volatility',
    );
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
      strengths.push('Estimated monthly headroom remains comfortably positive.');
    }
    if ((incomeStabilityScore ?? 0) >= 70) {
      strengths.push('Income patterns appear stable across the observed period.');
    }
    if ((resilienceScore ?? 0) >= 70) {
      strengths.push('Balance behaviour suggests healthy financial resilience.');
    }
    if (confidenceLevel === 'high') {
      strengths.push('Score confidence is high based on the available bank history.');
    }

    if (affordabilityScore < 55) {
      riskFactors.push('Estimated monthly headroom is tight relative to expenses.');
    }
    if (debtPressureIndicator === 'High') {
      riskFactors.push('Debt pressure appears elevated relative to available income.');
    }
    if (volatilitySignal === 'Volatile') {
      riskFactors.push('Cash-flow patterns are more volatile than ideal.');
    }
    if (confidenceLevel === 'low') {
      riskFactors.push('Score confidence is low and should be treated cautiously.');
    }
    if (
      input.latestScore?.anomalyFlags.some((flag) => flag.severity === 'high')
    ) {
      riskFactors.push('High-severity anomalies were detected in the score evidence.');
    }

    return {
      affordabilityScore,
      incomeStabilityScore,
      resilienceScore,
      cashFlowStabilityScore,
      spendingDisciplineScore,
      confidenceScore,
      confidenceLevel,
      debtPressureIndicator,
      surplusCashEstimate,
      volatilitySignal,
      strengths:
        strengths.length > 0
          ? strengths.slice(0, 4)
          : ['Behavioural score evidence is available for review.'],
      riskFactors:
        riskFactors.length > 0
          ? riskFactors.slice(0, 4)
          : ['No material behavioural risks were triggered automatically.'],
      scoreStatus: input.latestScore?.status ?? 'unavailable',
      anomalyFlags: Array.isArray(input.latestScore?.anomalyFlags)
        ? input.latestScore.anomalyFlags
        : [],
      generatedAt: new Date(),
    };
  }

  private buildOrgRecommendationPreview(
    score: number | null,
    assessment: OrgAssessmentShape,
  ) {
    if (score == null || assessment.scoreStatus === 'insufficient_data') {
      return {
        outcome: 'review' as const,
        summary: 'More score evidence is needed before a clean automated decision can be made.',
      };
    }

    if ((assessment.affordabilityScore ?? 0) < 40) {
      return {
        outcome: 'decline' as const,
        summary: 'Affordability signals are materially below the current comfort range.',
      };
    }

    if (
      assessment.confidenceLevel === 'low' ||
      assessment.debtPressureIndicator === 'High' ||
      assessment.volatilitySignal === 'Volatile' ||
      assessment.anomalyFlags.some((flag) => flag.severity === 'high')
    ) {
      return {
        outcome: 'review' as const,
        summary: 'Manual review is recommended because the behavioural evidence carries elevated uncertainty or risk.',
      };
    }

    return {
      outcome: 'approve' as const,
      summary: 'Behavioural signals are currently supportive of an approval path.',
    };
  }

  private getRiskLevelFromAssessment(
    score: number | null,
    assessment: OrgAssessmentShape,
  ) {
    if (typeof score === 'number') {
      return this.getRiskLevelFromScore(score);
    }

    if (
      (assessment.affordabilityScore ?? 0) < 40 ||
      assessment.debtPressureIndicator === 'High' ||
      assessment.volatilitySignal === 'Volatile'
    ) {
      return 'High';
    }

    if (
      (assessment.affordabilityScore ?? 0) < 60 ||
      assessment.confidenceLevel === 'low'
    ) {
      return 'Moderate';
    }

    return 'Low';
  }

  private getScoreComponentScore(
    latestScore: LatestScorePayload | null,
    key: string,
  ) {
    const component = latestScore?.components.find((entry) => entry.key === key);
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

  private buildTrustSignalsPayload(applicants: WorkspaceApplicant[]) {
    const endorsements = applicants.flatMap(
      (applicant) => applicant.trustEndorsements,
    );
    const profilesWithSignals = applicants.filter(
      (applicant) => applicant.trustEndorsements.length > 0,
    ).length;
    const counts = ['Employer', 'Landlord', 'Accountant', 'Professional'].map(
      (type) => ({
        name: type,
        value: endorsements.filter((endorsement) => endorsement.type === type)
          .length,
        color:
          type === 'Employer'
            ? 'hsl(var(--primary))'
            : type === 'Landlord'
              ? 'hsl(var(--green-trust))'
              : type === 'Accountant'
                ? 'hsl(var(--gold))'
                : 'hsl(var(--blue-bright))',
      }),
    );
    const verifiedSignals = endorsements.filter(
      (endorsement) => endorsement.status === 'Verified',
    );
    const pendingSignals = endorsements.filter(
      (endorsement) => endorsement.status !== 'Verified',
    );
    const averageStrength =
      verifiedSignals.length > 0
        ? Math.round(
            verifiedSignals.reduce(
              (sum, endorsement) => sum + endorsement.strength,
              0,
            ) / verifiedSignals.length,
          )
        : 0;
    const reliabilityByMonth = new Map<string, number[]>();

    verifiedSignals.forEach((endorsement) => {
      const date = new Date(endorsement.date);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const monthKey = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      const current = reliabilityByMonth.get(monthKey) ?? [];
      current.push(endorsement.strength);
      reliabilityByMonth.set(monthKey, current);
    });

    const reliabilityData = [...reliabilityByMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-6)
      .map(([monthKey, values]) => {
        const [year, month] = monthKey.split('-').map(Number);
        const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
          'en-US',
          {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          },
        );

        return {
          month: label,
          reliability: Math.round(
            values.reduce((sum, value) => sum + value, 0) / values.length,
          ),
        };
      });
    const recentSignals = applicants
      .flatMap((applicant) =>
        applicant.trustEndorsements.map((endorsement) => ({
          type: endorsement.type,
          source: endorsement.source,
          subject: applicant.name,
          status: endorsement.status,
          strength: endorsement.strength,
          date: endorsement.date,
        })),
      )
      .sort((left, right) => {
        const leftTime = new Date(left.date).getTime();
        const rightTime = new Date(right.date).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 6);

    return {
      metrics: [
        {
          label: 'Verified Signals',
          value: String(verifiedSignals.length),
        },
        {
          label: 'Pending Signals',
          value: String(pendingSignals.length),
        },
        {
          label: 'Avg Verification Strength',
          value: `${averageStrength}%`,
        },
        {
          label: 'Profiles With Signals',
          value: String(profilesWithSignals),
        },
      ],
      endorsementTypes: counts,
      reliabilityData,
      recentSignals,
    };
  }

  private buildReputationGraphPayload(applicants: WorkspaceApplicant[]) {
    const totalConnections = applicants.reduce(
      (sum, applicant) => sum + applicant.trustEndorsements.length,
      0,
    );
    const verifiedEndorsements = applicants.flatMap((applicant) =>
      applicant.trustEndorsements.filter(
        (endorsement) => endorsement.status === 'Verified',
      ),
    );
    const averageReliability =
      verifiedEndorsements.length > 0
        ? Math.round(
            verifiedEndorsements.reduce(
              (sum, endorsement) => sum + endorsement.strength,
              0,
            ) / verifiedEndorsements.length,
          )
        : 0;
    const userNodes = applicants.slice(0, 2);
    const nodes: Array<{
      id: number;
      label: string;
      type: string;
      x: number;
      y: number;
      size: number;
    }> = [];
    const edges: Array<{ from: number; to: number }> = [];
    let nextNodeId = 1;

    const lenderNodeId = nextNodeId++;
    nodes.push({
      id: lenderNodeId,
      label: 'CALEN Organisation',
      type: 'Lender',
      x: 80,
      y: 62,
      size: 20,
    });

    const currentDate = new Date();
    const relationshipAgesInDays = verifiedEndorsements
      .map((endorsement) => {
        const verifiedAt = new Date(endorsement.date);

        if (Number.isNaN(verifiedAt.getTime())) {
          return null;
        }

        return Math.max(
          0,
          Math.round(
            (currentDate.getTime() - verifiedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
      })
      .filter((value): value is number => value != null);
    const averageRelationshipAgeDays =
      relationshipAgesInDays.length > 0
        ? Math.round(
            relationshipAgesInDays.reduce((sum, value) => sum + value, 0) /
              relationshipAgesInDays.length,
          )
        : 0;
    const averageRelationshipDuration =
      averageRelationshipAgeDays > 0
        ? averageRelationshipAgeDays >= 365
          ? `${(averageRelationshipAgeDays / 365).toFixed(1)} yrs`
          : `${Math.max(1, Math.round(averageRelationshipAgeDays / 30))} mos`
        : '0 mos';

    if (userNodes.length === 0) {
      return {
        graphMetrics: [
          {
            label: 'Trust Network Density',
            value: '0%',
            desc: 'Observed graph connectivity',
          },
          {
            label: 'Endorsement Reliability',
            value: `${averageReliability}%`,
            desc: 'Average verified endorsement strength',
          },
          {
            label: 'Avg Relationship Duration',
            value: averageRelationshipDuration,
            desc: 'Average age of verified relationships',
          },
          {
            label: 'Active Connections',
            value: '0',
            desc: 'In your portfolio',
          },
        ],
        nodes: [],
        edges: [],
        signals: [
          {
            signal: 'Verified Employment',
            count: 0,
            trend: '0%',
          },
          {
            signal: 'Verified Rental History',
            count: 0,
            trend: '0%',
          },
          {
            signal: 'Professional Endorsements',
            count: 0,
            trend: '0%',
          },
          {
            signal: 'Financial Discipline Streaks',
            count: 0,
            trend: '0%',
          },
        ],
      };
    }

    userNodes.forEach((applicant, applicantIndex) => {
      const userNodeId = nextNodeId++;
      const userPosition =
        applicantIndex === 0
          ? { x: 46, y: 44, size: 24 }
          : { x: 55, y: 78, size: 22 };

      nodes.push({
        id: userNodeId,
        label: applicant.name,
        type: 'User',
        ...userPosition,
      });
      edges.push({ from: userNodeId, to: lenderNodeId });

      const endorsementPositions =
        applicantIndex === 0
          ? [
              { x: 24, y: 24, size: 20 },
              { x: 74, y: 20, size: 18 },
              { x: 18, y: 70, size: 16 },
            ]
          : [
              { x: 38, y: 88, size: 18 },
              { x: 70, y: 86, size: 17 },
            ];

      applicant.trustEndorsements
        .slice(0, endorsementPositions.length)
        .forEach((endorsement, endorsementIndex) => {
          const endorsementNodeId = nextNodeId++;
          const position = endorsementPositions[endorsementIndex];

          nodes.push({
            id: endorsementNodeId,
            label: endorsement.source,
            type: endorsement.type,
            ...position,
          });
          edges.push({ from: userNodeId, to: endorsementNodeId });
        });
    });

    const maxPossibleEdges =
      nodes.length > 1 ? (nodes.length * (nodes.length - 1)) / 2 : 0;
    const networkDensity =
      maxPossibleEdges > 0
        ? Math.round((edges.length / maxPossibleEdges) * 100)
        : 0;
    const monthlyTrend = (filter: (applicant: WorkspaceApplicant) => number) => {
      const now = new Date();
      const currentMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const previousMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );

      const current = filterRange(filter, currentMonthStart, now);
      const previous = filterRange(
        filter,
        previousMonthStart,
        new Date(currentMonthStart.getTime() - 1),
      );

      if (previous === 0) {
        return current > 0 ? '100%' : '0%';
      }

      const delta = Math.round(((current - previous) / previous) * 100);
      return `${delta > 0 ? '+' : ''}${delta}%`;
    };
    const filterRange = (
      filter: (applicant: WorkspaceApplicant) => number,
      start: Date,
      end: Date,
    ) =>
      applicants.reduce((sum, applicant) => {
        return sum + filter({ ...applicant, trustEndorsements: applicant.trustEndorsements.filter((endorsement) => {
          if (endorsement.status !== 'Verified') {
            return false;
          }

          const verifiedAt = new Date(endorsement.date);

          if (Number.isNaN(verifiedAt.getTime())) {
            return false;
          }

          return verifiedAt >= start && verifiedAt <= end;
        }) });
      }, 0);

    return {
      graphMetrics: [
        {
          label: 'Trust Network Density',
          value: `${networkDensity}%`,
          desc: 'Observed graph connectivity',
        },
        {
          label: 'Endorsement Reliability',
          value: `${averageReliability}%`,
          desc: 'Average verified endorsement strength',
        },
        {
          label: 'Avg Relationship Duration',
          value: averageRelationshipDuration,
          desc: 'Average age of verified relationships',
        },
        {
          label: 'Active Connections',
          value: String(totalConnections),
          desc: 'In your portfolio',
        },
      ],
      nodes,
      edges,
      signals: [
        {
          signal: 'Verified Employment',
          count: applicants.reduce(
            (sum, applicant) =>
              sum +
              applicant.trustEndorsements.filter(
                (endorsement) =>
                  endorsement.status === 'Verified' &&
                  endorsement.type === 'Employer',
              ).length,
            0,
          ),
          trend: monthlyTrend(
            (applicant) =>
              applicant.trustEndorsements.filter(
                (endorsement) => endorsement.type === 'Employer',
              ).length,
          ),
        },
        {
          signal: 'Verified Rental History',
          count: applicants.reduce(
            (sum, applicant) =>
              sum +
              applicant.trustEndorsements.filter(
                (endorsement) =>
                  endorsement.status === 'Verified' &&
                  endorsement.type === 'Landlord',
              ).length,
            0,
          ),
          trend: monthlyTrend(
            (applicant) =>
              applicant.trustEndorsements.filter(
                (endorsement) => endorsement.type === 'Landlord',
              ).length,
          ),
        },
        {
          signal: 'Professional Endorsements',
          count: applicants.reduce(
            (sum, applicant) =>
              sum +
              applicant.trustEndorsements.filter(
                (endorsement) =>
                  endorsement.status === 'Verified' &&
                  ['Professional', 'Accountant'].includes(endorsement.type),
              ).length,
            0,
          ),
          trend: monthlyTrend(
            (applicant) =>
              applicant.trustEndorsements.filter((endorsement) =>
                ['Professional', 'Accountant'].includes(endorsement.type),
              ).length,
          ),
        },
        {
          signal: 'Financial Discipline Streaks',
          count: applicants.filter((applicant) => applicant.score >= 700).length,
          trend: '0%',
        },
      ],
    };
  }

  private buildLendingOffersPayload(
    applicants: WorkspaceApplicant[],
    offers: OrgWorkspaceData['lendingOffers'],
  ) {
    if (applicants.length === 0) {
      return {
        offers,
        segmentTargets: [],
      };
    }

    const profileCount = applicants.length;
    const verifiedIncomeCount = applicants.filter((applicant) =>
      applicant.trustEndorsements.some(
        (endorsement) =>
          endorsement.status === 'Verified' &&
          endorsement.type === 'Employer',
      ),
    ).length;
    const strongTrustCount = applicants.filter(
      (applicant) =>
        applicant.trustEndorsements.filter(
          (endorsement) => endorsement.status === 'Verified',
        ).length >= 3,
    ).length;
    const lowDebtCount = applicants.filter((applicant) => applicant.debt < 30)
      .length;
    const highScoreCount = applicants.filter((applicant) => applicant.score >= 700)
      .length;

    return {
      offers,
      segmentTargets: [
        {
          label: 'Score 700+',
          desc:
            highScoreCount > 0
              ? `${highScoreCount} of ${profileCount} live applicants currently qualify.`
              : 'No live applicants currently meet this score threshold.',
        },
        {
          label: 'Verified Income',
          desc:
            verifiedIncomeCount > 0
              ? `${verifiedIncomeCount} applicants have verified employer-backed income signals.`
              : 'No verified income signals are available yet.',
        },
        {
          label: 'Strong Trust Network',
          desc:
            strongTrustCount > 0
              ? `${strongTrustCount} applicants have at least 3 verified trust endorsements.`
              : 'No applicants have reached the strong trust-network threshold yet.',
        },
        {
          label: 'Low Debt Ratio',
          desc:
            lowDebtCount > 0
              ? `${lowDebtCount} applicants are currently below the 30% debt threshold.`
              : 'No applicants currently fall below the low debt threshold.',
        },
      ],
    };
  }

  private buildPortfolioPayload(applicants: WorkspaceApplicant[]) {
    const activePortfolio = applicants.filter(
      (applicant) =>
        applicant.stage === 'approved' || applicant.stage === 'analysis',
    );
    const subjectApplicants =
      activePortfolio.length > 0 ? activePortfolio : applicants;
    const averageScore =
      subjectApplicants.length > 0
        ? Math.round(
            subjectApplicants.reduce((sum, applicant) => sum + applicant.score, 0) /
              subjectApplicants.length,
          )
        : 0;
    const scoreVariance =
      subjectApplicants.length > 1
        ? Math.sqrt(
            subjectApplicants.reduce(
              (sum, applicant) => sum + (applicant.score - averageScore) ** 2,
              0,
            ) / subjectApplicants.length,
          )
        : 0;
    const volatility =
      scoreVariance >= 55 ? 'High' : scoreVariance >= 25 ? 'Medium' : 'Low';
    const riskAlerts = subjectApplicants
      .filter((applicant) => applicant.riskLevel !== 'Low')
      .slice(0, 4)
      .map((applicant) => ({
        borrower: applicant.name,
        id: applicant.calenId,
        alert:
          applicant.riskLevel === 'High'
            ? 'Debt ratio exceeds current risk tolerance'
            : 'Profile needs manual review before offer expansion',
        severity: applicant.riskLevel === 'High' ? 'High' : 'Medium',
        time: applicant.stage === 'analysis' ? 'In analysis' : 'Active',
      }));

    if (subjectApplicants.length === 0) {
      return {
        metrics: [],
        scoreHistory: [],
        behaviourTrends: [],
        riskAlerts: [],
      };
    }

    return {
      metrics: [
        {
          label: 'Portfolio Size',
          value: String(subjectApplicants.length),
          change: `${activePortfolio.length} monitored borrowers`,
          up: true,
        },
        {
          label: 'Avg CALEN Score',
          value: String(averageScore),
          change: `${subjectApplicants.filter((applicant) => applicant.score >= 700).length} above 700`,
          up: true,
        },
        {
          label: 'Score Volatility',
          value: volatility,
          change: `${Math.round(scoreVariance)} pt variance`,
          up: volatility !== 'High',
        },
        {
          label: 'Risk Alerts',
          value: String(riskAlerts.length),
          change: `${subjectApplicants.filter((applicant) => applicant.riskLevel === 'High').length} high severity`,
          up: riskAlerts.length === 0,
        },
      ],
      scoreHistory: [],
      behaviourTrends: [],
      riskAlerts,
    };
  }

  private buildAnalyticsPayload(applicants: WorkspaceApplicant[]) {
    if (applicants.length === 0) {
      return {
        scoreDistribution: [],
        approvalTrend: [],
        riskCategories: [],
        trustContribution: [],
      };
    }

    const ranges = [
      { range: '300-499', min: 300, max: 499 },
      { range: '500-599', min: 500, max: 599 },
      { range: '600-699', min: 600, max: 699 },
      { range: '700-799', min: 700, max: 799 },
      { range: '800-900', min: 800, max: 900 },
    ];
    const totalApplicants = applicants.length;
    const approvalBuckets = new Map<
      string,
      { month: string; approved: number; total: number; order: number }
    >();
    const trustBuckets = new Map<
      string,
      {
        month: string;
        employer: number;
        landlord: number;
        accountant: number;
        professional: number;
        order: number;
      }
    >();

    applicants.forEach((applicant) => {
      const createdAt = applicant.createdAt ? new Date(applicant.createdAt) : null;

      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        const monthKey = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
        const currentBucket = approvalBuckets.get(monthKey) ?? {
          month: createdAt.toLocaleString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          approved: 0,
          total: 0,
          order:
            createdAt.getUTCFullYear() * 100 + (createdAt.getUTCMonth() + 1),
        };

        currentBucket.total += 1;
        if (applicant.stage === 'approved') {
          currentBucket.approved += 1;
        }

        approvalBuckets.set(monthKey, currentBucket);
      }

      applicant.trustEndorsements.forEach((endorsement) => {
        const endorsementDate = new Date(endorsement.date);

        if (Number.isNaN(endorsementDate.getTime())) {
          return;
        }

        const monthKey = `${endorsementDate.getUTCFullYear()}-${String(
          endorsementDate.getUTCMonth() + 1,
        ).padStart(2, '0')}`;
        const endorsementBucket = trustBuckets.get(monthKey) ?? {
          month: endorsementDate.toLocaleString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          employer: 0,
          landlord: 0,
          accountant: 0,
          professional: 0,
          order:
            endorsementDate.getUTCFullYear() * 100 +
            (endorsementDate.getUTCMonth() + 1),
        };

        if (endorsement.type === 'Employer') endorsementBucket.employer += 1;
        if (endorsement.type === 'Landlord') endorsementBucket.landlord += 1;
        if (endorsement.type === 'Accountant') endorsementBucket.accountant += 1;
        if (endorsement.type === 'Professional')
          endorsementBucket.professional += 1;

        trustBuckets.set(monthKey, endorsementBucket);
      });
    });

    const lowRiskCount = applicants.filter(
      (applicant) => applicant.riskLevel === 'Low',
    ).length;
    const moderateRiskCount = applicants.filter(
      (applicant) => applicant.riskLevel === 'Moderate',
    ).length;
    const highRiskCount = applicants.filter(
      (applicant) => applicant.riskLevel === 'High',
    ).length;
    const toPercent = (count: number) =>
      totalApplicants > 0 ? Math.round((count / totalApplicants) * 100) : 0;

    return {
      scoreDistribution: ranges.map((bucket) => ({
        range: bucket.range,
        count: applicants.filter(
          (applicant) =>
            applicant.score >= bucket.min && applicant.score <= bucket.max,
        ).length,
      })).filter((bucket) => bucket.count > 0),
      approvalTrend: [...approvalBuckets.values()]
        .sort((left, right) => left.order - right.order)
        .map((bucket) => ({
          month: bucket.month,
          rate:
            bucket.total > 0
              ? Math.round((bucket.approved / bucket.total) * 100)
              : 0,
        })),
      riskCategories: [
        {
          name: 'Low Risk',
          value: toPercent(lowRiskCount),
          color: 'hsl(var(--green-trust))',
        },
        {
          name: 'Moderate',
          value: toPercent(moderateRiskCount),
          color: 'hsl(var(--gold))',
        },
        {
          name: 'High Risk',
          value: toPercent(highRiskCount),
          color: 'hsl(var(--destructive))',
        },
      ].filter((bucket) => bucket.value > 0),
      trustContribution: [...trustBuckets.values()]
        .sort((left, right) => left.order - right.order)
        .map((bucket) => ({
          month: bucket.month,
          employer: bucket.employer,
          landlord: bucket.landlord,
          accountant: bucket.accountant,
          professional: bucket.professional,
        })),
    };
  }

  private buildApiIntegrationsPayload(
    apiKeys: OrgWorkspaceData['apiKeys'],
  ) {
    return {
      apiKeys,
      usageData: [],
      recentLogs: [],
    };
  }

  private buildCompliancePayload(
    workspace: OrgWorkspaceData,
    teamMembers: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      lastLoginAt: Date | null;
    }>,
  ) {
    const accessLogs = teamMembers
      .filter((member) => member.lastLoginAt)
      .slice(0, 6)
      .map((member) => ({
        user: member.name,
        action: 'Signed in to organisation workspace',
        subject: member.email,
        time: member.lastLoginAt!.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        }),
        date: member.lastLoginAt!.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
      }));
    const consentRecords = workspace.applicants
      .slice(0, 6)
      .map((applicant) => {
        const grantedAt = applicant.createdAt
          ? new Date(applicant.createdAt)
          : null;
        const expiresAt =
          grantedAt != null
            ? new Date(
                Date.UTC(
                  grantedAt.getUTCFullYear() + 1,
                  grantedAt.getUTCMonth(),
                  grantedAt.getUTCDate(),
                ),
              )
            : null;

        return {
          subject: applicant.name,
          consent: 'Profile sharing',
          granted: grantedAt
            ? grantedAt.toISOString().slice(0, 10)
            : '—',
          expires: expiresAt ? expiresAt.toISOString().slice(0, 10) : '—',
          status: applicant.verified ? 'Active' : 'Expiring',
        };
      });

    return {
      accessLogs,
      consentRecords,
      reports: [],
    };
  }

  private buildStoredLendingOfferFields(
    dto: CreateOrgLendingOfferDto | UpdateOrgLendingOfferDto,
  ) {
    return {
      name: dto.name.trim(),
      type: dto.type.trim(),
      amountRange: `${this.formatMoney(dto.minAmount)} – ${this.formatMoney(
        dto.maxAmount,
      )}`,
      apr: `${this.formatApr(dto.minApr)} – ${this.formatApr(dto.maxApr)}`,
      minScore: dto.minScore ?? 650,
    };
  }

  private getNextCustomOfferId(organization: OrganizationSettingsShape) {
    const rawWorkspaceData = this.getRawWorkspaceData(organization);
    const existingOfferIds = new Set(
      Array.isArray(rawWorkspaceData.lendingOffers)
        ? rawWorkspaceData.lendingOffers
            .map((offer) => offer?.id)
            .filter((offerId): offerId is string => typeof offerId === 'string')
        : [],
    );

    let nextNumber = 1;

    if (existingOfferIds.size > 0) {
      nextNumber =
        Math.max(
          ...Array.from(existingOfferIds, (offerId) => {
            const match = /^LO-(\d+)$/i.exec(offerId);
            return match ? Number(match[1]) : 0;
          }),
        ) + 1;
    }

    let candidateId = `LO-${String(nextNumber).padStart(3, '0')}`;
    while (SEEDED_OFFER_IDS.has(candidateId) || existingOfferIds.has(candidateId)) {
      nextNumber += 1;
      candidateId = `LO-${String(nextNumber).padStart(3, '0')}`;
    }

    return candidateId;
  }

  private formatMoney(value?: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }

    return `£${value.toLocaleString('en-GB')}`;
  }

  private formatApr(value?: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }

    return `${value.toFixed(1)}%`;
  }

  private buildRecentActivity(input: {
    organization: OrganizationSettingsShape;
    verification: OrganizationVerificationDocument | null;
    invitations: OrganizationInvitationDocument[];
    members: Array<{
      _id?: unknown;
      displayName?: string;
      email: string;
      lastLoginAt?: Date;
      createdAt?: Date;
    }>;
  }) {
    const activity: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: Date | null;
      status: string;
    }> = [];

    if (input.verification?.submittedAt) {
      activity.push({
        id: `verification-${String(input.verification._id)}`,
        type: 'verification',
        title: 'Verification submitted',
        description: `${input.verification.documentType} is currently ${input.verification.status.replace(
          /_/g,
          ' ',
        )}.`,
        timestamp: input.verification.submittedAt,
        status: input.verification.status,
      });
    }

    for (const invitation of input.invitations.slice(0, 4)) {
      activity.push({
        id: `invite-${String(invitation._id)}`,
        type: 'invitation',
        title: 'Team invitation created',
        description: `${invitation.email} was invited as ${this.humanizeValue(
          invitation.role,
        )}.`,
        timestamp: invitation.createdAt ?? invitation.expiresAt ?? null,
        status: invitation.status,
      });
    }

    for (const member of input.members.slice(0, 4)) {
      if (!member.lastLoginAt) {
        continue;
      }

      activity.push({
        id: `member-${String(member._id)}-login`,
        type: 'member_login',
        title: 'Team member active',
        description: `${member.displayName ?? member.email} signed in to the organisation workspace.`,
        timestamp: member.lastLoginAt,
        status: 'active',
      });
    }

    const onboardingCompletedAt =
      input.organization.onboardingData?.onboardingCompletedAt;
    if (
      onboardingCompletedAt instanceof Date ||
      typeof onboardingCompletedAt === 'string' ||
      typeof onboardingCompletedAt === 'number'
    ) {
      activity.push({
        id: `onboarding-${String(input.organization._id)}`,
        type: 'onboarding',
        title: 'Organisation onboarding completed',
        description: `${input.organization.name} unlocked the full workspace.`,
        timestamp: new Date(onboardingCompletedAt),
        status: 'completed',
      });
    }

    return activity
      .sort((left, right) => {
        const leftTime = left.timestamp?.getTime() ?? 0;
        const rightTime = right.timestamp?.getTime() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 6)
      .map((entry) => ({
        ...entry,
        timestamp: entry.timestamp,
      }));
  }

  private buildProgress(
    organization: OrganizationSettingsShape,
    verificationSubmitted: boolean,
    invitationCount: number,
    memberCount: number,
    integrationPreferences: Record<string, unknown>,
    riskPolicy: Record<string, unknown>,
  ) {
    const profileCompleted =
      Boolean(organization.name?.trim()) &&
      Boolean(organization.industry?.trim()) &&
      Boolean(organization.companySize?.trim()) &&
      Boolean(organization.country?.trim());
    const hasIntegrationPreferences =
      Object.keys(integrationPreferences).length > 0;
    const hasRiskPolicy = Object.keys(riskPolicy).length > 0;
    const hasTeamSetup = memberCount > 1 || invitationCount > 0;
    const isCompleted =
      profileCompleted &&
      verificationSubmitted &&
      hasIntegrationPreferences &&
      hasRiskPolicy &&
      hasTeamSetup;

    return {
      profileCompleted,
      verificationSubmitted,
      invitationsCreated: invitationCount,
      teamMembers: memberCount,
      hasTeamSetup,
      hasRiskPolicy,
      hasIntegrationPreferences,
      isCompleted,
      completedAt:
        (organization.onboardingData?.onboardingCompletedAt as
          | Date
          | string
          | undefined) ?? null,
    };
  }

  private getRiskPolicy(organization: OrganizationSettingsShape) {
    return (
      (organization.onboardingData?.riskPolicy as Record<string, unknown>) ?? {}
    );
  }

  private getIntegrationPreferences(organization: OrganizationSettingsShape) {
    return (
      (organization.onboardingData?.integrationPreferences as Record<
        string,
        unknown
      >) ?? {}
    );
  }

  private getSecurityControls(organization: OrganizationSettingsShape) {
    return (
      (organization.onboardingData?.securityControls as Record<
        string,
        unknown
      >) ?? {}
    );
  }

  private serializeOrganization(organization: OrganizationSettingsShape) {
    return {
      id: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      industry: organization.industry ?? null,
      companySize: organization.companySize ?? null,
      country: organization.country ?? null,
      website: organization.website ?? null,
      registrationNumber: organization.registrationNumber ?? null,
      jurisdiction: organization.jurisdiction ?? null,
    };
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

  private humanizeValue(value: string) {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }

  private getRiskLevelForStage(
    stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected',
    score: number,
  ) {
    if (stage === 'rejected') {
      return 'High';
    }

    if (score >= 720) {
      return 'Low';
    }

    if (score >= 650) {
      return 'Moderate';
    }

    return 'High';
  }

  private assertOrganization(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_ACCOUNT_REQUIRED',
        message: 'This endpoint is only available to organization accounts',
      });
    }
  }

  private isDuplicateKeyError(error: unknown) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000,
    );
  }

  private isSeededOfferRecord(
    offer: OrgWorkspaceData['lendingOffers'][number],
  ) {
    return SEEDED_OFFER_IDS.has(offer.id);
  }

  private isSeededApiKeyRecord(
    apiKey: OrgWorkspaceData['apiKeys'][number],
  ) {
    return SEEDED_API_KEY_IDS.has(apiKey.id);
  }

  private isSeededPipelineApplicant(
    applicant: OrganizationPipelineApplicantDocument,
  ) {
    return SEEDED_PIPELINE_APPLICANT_IDS.has(applicant.applicantId);
  }
}
