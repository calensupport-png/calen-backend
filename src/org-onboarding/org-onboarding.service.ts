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
import { EmailService } from '../email/email.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateOrgInvitationDto } from './dto/create-org-invitation.dto';
import { UpdateOrgIntegrationPreferencesDto } from './dto/org-integration-preferences.dto';
import { UpdateOrgProfileDto } from './dto/org-profile.dto';
import { UpdateOrgRiskPolicyDto } from './dto/org-risk-policy.dto';
import { SubmitOrgVerificationDto } from './dto/org-verification.dto';
import {
  OrganizationInvitation,
  OrganizationInvitationDocument,
} from './schemas/organization-invitation.schema';
import {
  OrganizationVerification,
  OrganizationVerificationDocument,
} from './schemas/organization-verification.schema';

@Injectable()
export class OrgOnboardingService {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly accountsService: AccountsService,
    private readonly emailService: EmailService,
    @InjectModel(OrganizationInvitation.name)
    private readonly invitationModel: Model<OrganizationInvitationDocument>,
    @InjectModel(OrganizationVerification.name)
    private readonly verificationModel: Model<OrganizationVerificationDocument>,
  ) {}

  async getOrganization(user: AuthenticatedUser) {
    const organization = await this.getCurrentOrganization(user);
    return {
      organization: this.serializeOrganization(organization),
    };
  }

  async updateOrganizationProfile(
    user: AuthenticatedUser,
    dto: UpdateOrgProfileDto,
  ) {
    const organization = await this.getCurrentOrganization(user);
    const updated = await this.organizationsService.updateOrganizationProfile(
      String(organization._id),
      dto,
    );
    await this.maybeCompleteOnboarding(user, updated);

    return {
      organization: this.serializeOrganization(updated),
    };
  }

  async submitVerification(
    user: AuthenticatedUser,
    dto: SubmitOrgVerificationDto,
  ) {
    const organization = await this.getCurrentOrganization(user);
    const verification = await this.verificationModel.create({
      organizationId: organization._id as Types.ObjectId,
      provider: 'mock-kyb-provider',
      status: 'pending_review',
      documentType: dto.documentType,
      referenceNumber: dto.referenceNumber,
      supportingDocumentUrl: dto.supportingDocumentUrl,
      submittedAt: new Date(),
    });

    await this.organizationsService.updateOnboardingData(
      String(organization._id),
      {
        verificationStatus: verification.status,
      },
    );
    const updatedOrganization = await this.organizationsService.findByIdOrThrow(
      String(organization._id),
    );
    await this.maybeCompleteOnboarding(user, updatedOrganization);

    return {
      verification: this.serializeVerification(verification),
    };
  }

  async updateIntegrationPreferences(
    user: AuthenticatedUser,
    dto: UpdateOrgIntegrationPreferencesDto,
  ) {
    const organization = await this.getCurrentOrganization(user);
    const updated = await this.organizationsService.updateOnboardingData(
      String(organization._id),
      {
        integrationPreferences: {
          ...(organization.onboardingData?.integrationPreferences as
            | Record<string, unknown>
            | undefined),
          ...dto,
        },
      },
    );
    await this.maybeCompleteOnboarding(user, updated);

    return {
      integrationPreferences:
        (updated.onboardingData?.integrationPreferences as Record<
          string,
          unknown
        >) ?? {},
    };
  }

  async createInvitation(user: AuthenticatedUser, dto: CreateOrgInvitationDto) {
    const organization = await this.getCurrentOrganization(user);
    const invitation = await this.invitationModel.create({
      organizationId: organization._id as Types.ObjectId,
      invitedByUserId: new Types.ObjectId(user.id),
      email: dto.email.trim().toLowerCase(),
      role: dto.role,
      jobTitle: dto.jobTitle,
      token: `orginv_${randomBytes(10).toString('hex')}`,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await this.maybeCompleteOnboarding(user, organization, {
      invitationCountDelta: 1,
    });

    return {
      invitation: this.serializeInvitation(invitation),
    };
  }

  async getTeam(user: AuthenticatedUser) {
    const organization = await this.getCurrentOrganization(user);
    const [members, invitations] = await Promise.all([
      this.accountsService.listUsersByOrganization(String(organization._id)),
      this.invitationModel
        .find({ organizationId: organization._id })
        .sort({ createdAt: -1 }),
    ]);

    return {
      team: {
        members: members.map((member) => ({
          id: String(member._id),
          email: member.email,
          displayName: member.displayName,
          jobTitle: member.jobTitle,
          roles: member.roles,
          status: member.status,
          lastLoginAt: member.lastLoginAt ?? null,
        })),
        invitations: invitations.map((invitation) =>
          this.serializeInvitation(invitation),
        ),
      },
    };
  }

  async updateRiskPolicy(user: AuthenticatedUser, dto: UpdateOrgRiskPolicyDto) {
    const organization = await this.getCurrentOrganization(user);
    const updated = await this.organizationsService.updateOnboardingData(
      String(organization._id),
      {
        riskPolicy: {
          ...(organization.onboardingData?.riskPolicy as
            | Record<string, unknown>
            | undefined),
          ...dto,
        },
      },
    );
    await this.maybeCompleteOnboarding(user, updated);

    return {
      riskPolicy:
        (updated.onboardingData?.riskPolicy as Record<string, unknown>) ?? {},
    };
  }

  async getOnboarding(user: AuthenticatedUser) {
    const organization = await this.getCurrentOrganization(user);
    const [verification, invitationCount, memberCount] = await Promise.all([
      this.verificationModel
        .findOne({ organizationId: organization._id })
        .sort({ createdAt: -1 }),
      this.invitationModel.countDocuments({ organizationId: organization._id }),
      this.accountsService
        .listUsersByOrganization(String(organization._id))
        .then((members) => members.length),
    ]);

    const integrationPreferences =
      (organization.onboardingData?.integrationPreferences as
        | Record<string, unknown>
        | undefined) ?? {};
    const riskPolicy =
      (organization.onboardingData?.riskPolicy as
        | Record<string, unknown>
        | undefined) ?? {};
    const progress = this.buildProgress({
      organization,
      verificationSubmitted: verification != null,
      invitationCount,
      memberCount,
      integrationPreferences,
      riskPolicy,
    });

    return {
      onboarding: {
        status: progress.isCompleted
          ? 'completed'
          : verification
            ? 'in_progress'
            : 'not_started',
        organization: this.serializeOrganization(organization),
        verification: verification
          ? this.serializeVerification(verification)
          : null,
        integrationPreferences,
        riskPolicy,
        progress,
      },
    };
  }

  private async getCurrentOrganization(user: AuthenticatedUser) {
    this.assertOrganizationUser(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);

    if (!account.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message:
          'Verify your email address before continuing with onboarding.',
      });
    }

    const organization = await this.organizationsService.findByIdOrThrow(
      user.organizationId!,
    );

    return organization;
  }

  private assertOrganizationUser(user: AuthenticatedUser): void {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_ACCOUNT_REQUIRED',
        message: 'This endpoint is only available to organization accounts',
      });
    }
  }

  private async maybeCompleteOnboarding(
    user: AuthenticatedUser,
    organization: {
      _id?: unknown;
      name: string;
      industry?: string;
      companySize?: string;
      country?: string;
      onboardingData?: Record<string, unknown>;
    },
    overrides?: {
      invitationCountDelta?: number;
    },
  ): Promise<void> {
    const organizationObjectId = new Types.ObjectId(String(organization._id));
    const [verification, invitationCount, memberCount, account] =
      await Promise.all([
        this.verificationModel
          .findOne({ organizationId: organizationObjectId })
          .sort({ createdAt: -1 }),
        this.invitationModel.countDocuments({ organizationId: organizationObjectId }),
        this.accountsService
          .listUsersByOrganization(String(organization._id))
          .then((members) => members.length),
        this.accountsService.findUserByIdOrThrow(user.id),
      ]);

    const integrationPreferences =
      (organization.onboardingData?.integrationPreferences as
        | Record<string, unknown>
        | undefined) ?? {};
    const riskPolicy =
      (organization.onboardingData?.riskPolicy as
        | Record<string, unknown>
        | undefined) ?? {};

    const progress = this.buildProgress({
      organization,
      verificationSubmitted: verification != null,
      invitationCount:
        invitationCount + (overrides?.invitationCountDelta ?? 0),
      memberCount,
      integrationPreferences,
      riskPolicy,
    });

    if (
      !progress.isCompleted ||
      organization.onboardingData?.onboardingCompletedAt ||
      organization.onboardingData?.welcomeEmailSentAt
    ) {
      return;
    }

    await this.organizationsService.updateOnboardingData(String(organization._id), {
      onboardingStatus: 'completed',
      onboardingCompletedAt: new Date(),
      welcomeEmailSentAt: new Date(),
    });

    await this.emailService.sendWelcomeEmail({
      to: account.email,
      firstName: account.firstName,
      accountType: 'organisation',
    });
  }

  private buildProgress(input: {
    organization: {
      name: string;
      industry?: string;
      companySize?: string;
      country?: string;
      onboardingData?: Record<string, unknown>;
    };
    verificationSubmitted: boolean;
    invitationCount: number;
    memberCount: number;
    integrationPreferences: Record<string, unknown>;
    riskPolicy: Record<string, unknown>;
  }) {
    const hasOrgProfile =
      Boolean(input.organization.name?.trim()) &&
      Boolean(input.organization.industry?.trim()) &&
      Boolean(input.organization.companySize?.trim()) &&
      Boolean(input.organization.country?.trim());
    const hasRiskPolicy = Object.keys(input.riskPolicy).length > 0;
    const hasIntegrationPreferences =
      Object.keys(input.integrationPreferences).length > 0;
    const hasTeamSetup =
      input.memberCount > 1 || input.invitationCount > 0;
    const isCompleted =
      hasOrgProfile &&
      input.verificationSubmitted &&
      hasIntegrationPreferences &&
      hasRiskPolicy &&
      hasTeamSetup;

    return {
      profileCompleted: hasOrgProfile,
      verificationSubmitted: input.verificationSubmitted,
      invitationsCreated: input.invitationCount,
      teamMembers: input.memberCount,
      hasTeamSetup,
      hasRiskPolicy,
      hasIntegrationPreferences,
      isCompleted,
      completedAt:
        (input.organization.onboardingData?.onboardingCompletedAt as
          | Date
          | string
          | undefined) ?? null,
    };
  }

  private serializeOrganization(organization: {
    _id?: unknown;
    name: string;
    slug: string;
    industry?: string;
    companySize?: string;
    country?: string;
    website?: string;
    registrationNumber?: string;
    jurisdiction?: string;
    status: string;
    onboardingData?: Record<string, unknown>;
    primaryAdminUserId?: unknown;
  }) {
    return {
      id: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      industry: organization.industry,
      companySize: organization.companySize,
      country: organization.country,
      website: organization.website,
      registrationNumber: organization.registrationNumber,
      jurisdiction: organization.jurisdiction,
      status: organization.status,
      primaryAdminUserId: organization.primaryAdminUserId
        ? String(organization.primaryAdminUserId)
        : null,
      onboardingData: organization.onboardingData ?? {},
    };
  }

  private serializeVerification(
    verification: OrganizationVerificationDocument,
  ) {
    return {
      id: String(verification._id),
      provider: verification.provider,
      status: verification.status,
      documentType: verification.documentType,
      referenceNumber: verification.referenceNumber,
      supportingDocumentUrl: verification.supportingDocumentUrl,
      submittedAt: verification.submittedAt,
    };
  }

  private serializeInvitation(invitation: OrganizationInvitationDocument) {
    return {
      id: String(invitation._id),
      email: invitation.email,
      role: invitation.role,
      jobTitle: invitation.jobTitle,
      token: invitation.token,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt ?? null,
    };
  }
}
