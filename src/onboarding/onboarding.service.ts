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
import { AccountType } from '../common/enums/account-type.enum';
import { NotificationsService } from '../dashboard/notifications.service';
import { EmailService } from '../email/email.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BANK_CATALOG } from './constants/bank-catalog';
import { CreateBankConnectionDto } from './dto/bank-connection.dto';
import { UpdateEmploymentProfileDto } from './dto/employment-profile.dto';
import { UpdateFinancialProfileDto } from './dto/financial-profile.dto';
import { UploadIdentityDocumentsDto } from './dto/identity-documents.dto';
import { SubmitIdentityVerificationDto } from './dto/identity-verification.dto';
import { UpdatePersonalProfileDto } from './dto/personal-profile.dto';
import { RespondTrustRequestDto } from './dto/respond-trust-request.dto';
import { CreateTrustContactDto } from './dto/trust-contact.dto';
import {
  BankConnection,
  BankConnectionDocument,
} from './schemas/bank-connection.schema';
import {
  IdentityVerificationCase,
  IdentityVerificationCaseDocument,
} from './schemas/identity-verification-case.schema';
import {
  OnboardingState,
  OnboardingStateDocument,
} from './schemas/onboarding-state.schema';
import {
  TrustContact,
  TrustContactDocument,
} from './schemas/trust-contact.schema';
import {
  UploadedDocument,
  UploadedDocumentDocument,
} from './schemas/uploaded-document.schema';

const REQUIRED_COMPLETION_STEPS = [
  'personal_profile',
  'identity_verification',
  'employment_profile',
  'financial_profile',
  'bank_connection',
  'trust_contact',
  'score_requested',
];

@Injectable()
export class OnboardingService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    @InjectModel(OnboardingState.name)
    private readonly onboardingStateModel: Model<OnboardingStateDocument>,
    @InjectModel(IdentityVerificationCase.name)
    private readonly identityVerificationCaseModel: Model<IdentityVerificationCaseDocument>,
    @InjectModel(UploadedDocument.name)
    private readonly uploadedDocumentModel: Model<UploadedDocumentDocument>,
    @InjectModel(BankConnection.name)
    private readonly bankConnectionModel: Model<BankConnectionDocument>,
    @InjectModel(TrustContact.name)
    private readonly trustContactModel: Model<TrustContactDocument>,
  ) {}

  async getOnboarding(user: AuthenticatedUser) {
    await this.assertVerifiedIndividual(user);
    const [state, verificationCase, documents, bankConnections, trustContacts] =
      await Promise.all([
        this.getOrCreateOnboardingState(user.id),
        this.identityVerificationCaseModel
          .findOne({ userId: user.id })
          .sort({ createdAt: -1 }),
        this.uploadedDocumentModel
          .find({ userId: user.id })
          .sort({ createdAt: -1 }),
        this.bankConnectionModel
          .find({ userId: user.id })
          .sort({ createdAt: -1 }),
        this.trustContactModel
          .find({ userId: user.id })
          .sort({ createdAt: -1 }),
      ]);

    return this.buildOnboardingResponse(
      state,
      verificationCase,
      documents,
      bankConnections,
      trustContacts,
    );
  }

  async updatePersonalProfile(
    user: AuthenticatedUser,
    dto: UpdatePersonalProfileDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const state = await this.upsertState(
      user.id,
      {
        personalProfile: this.toProfilePayload(dto),
        currentStep: 'identity_verification',
      },
      'personal_profile',
    );

    return {
      personalProfile: state.personalProfile,
      onboarding: await this.getOnboarding(user),
    };
  }

  async submitIdentityVerification(
    user: AuthenticatedUser,
    dto: SubmitIdentityVerificationDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const verificationCase = await this.identityVerificationCaseModel.create({
      userId: user.id,
      documentType: dto.documentType,
      country: dto.country,
      livenessStatus: dto.livenessStatus ?? 'pending',
      status: 'pending_review',
      provider: 'mock-kyc-provider',
      submittedAt: new Date(),
    });

    await this.upsertState(
      user.id,
      {
        identityVerificationStatus: verificationCase.status,
        currentStep: 'employment_profile',
      },
      'identity_verification',
    );

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'identity_verification',
      title: 'Identity verification submitted',
      body: 'Your verification details have been submitted and are pending review.',
      metadata: {
        status: verificationCase.status,
      },
    });

    return {
      verification: this.serializeVerificationCase(verificationCase),
    };
  }

  async uploadIdentityDocuments(
    user: AuthenticatedUser,
    dto: UploadIdentityDocumentsDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const verificationCase = await this.identityVerificationCaseModel
      .findOne({ userId: user.id })
      .sort({ createdAt: -1 });

    const documents = await this.uploadedDocumentModel.insertMany(
      dto.documents.map((document) => ({
        userId: user.id,
        verificationCaseId: verificationCase?._id,
        ...document,
      })),
    );

    return {
      documents: documents.map((document) => this.serializeDocument(document)),
    };
  }

  async updateEmploymentProfile(
    user: AuthenticatedUser,
    dto: UpdateEmploymentProfileDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const state = await this.upsertState(
      user.id,
      {
        employmentProfile: this.toProfilePayload(dto),
        currentStep: 'financial_profile',
      },
      'employment_profile',
    );

    return {
      employmentProfile: state.employmentProfile,
      onboarding: await this.getOnboarding(user),
    };
  }

  async updateFinancialProfile(
    user: AuthenticatedUser,
    dto: UpdateFinancialProfileDto,
  ) {
    this.assertIndividual(user);
    const state = await this.upsertState(
      user.id,
      {
        financialProfile: this.toProfilePayload(dto),
        currentStep: 'connect_banks',
      },
      'financial_profile',
    );

    return {
      financialProfile: state.financialProfile,
      onboarding: await this.getOnboarding(user),
    };
  }

  getBanks() {
    return {
      banks: BANK_CATALOG,
    };
  }

  async createBankConnection(
    user: AuthenticatedUser,
    dto: CreateBankConnectionDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const bank = BANK_CATALOG.find((entry) => entry.id === dto.bankId);

    if (!bank) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        message: 'The requested bank is not supported',
      });
    }

    const bankConnection = await this.bankConnectionModel.create({
      userId: user.id,
      bankId: bank.id,
      bankName: bank.name,
      accountMask: dto.accountMask,
      accountType: dto.accountType,
      provider: bank.provider,
      status: 'connected',
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
    });

    await this.upsertState(
      user.id,
      {
        currentStep: 'trust_network',
      },
      'bank_connection',
    );

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'bank_connection',
      title: 'Bank connection added',
      body: `${bank.name} is now connected to your financial identity profile.`,
      metadata: {
        bankId: bank.id,
      },
    });

    return {
      bankConnection: this.serializeBankConnection(bankConnection),
    };
  }

  async getBankConnections(user: AuthenticatedUser) {
    await this.assertVerifiedIndividual(user);
    const bankConnections = await this.bankConnectionModel
      .find({ userId: user.id })
      .sort({ createdAt: -1 });

    return {
      bankConnections: bankConnections.map((connection) =>
        this.serializeBankConnection(connection),
      ),
    };
  }

  async createTrustContact(
    user: AuthenticatedUser,
    dto: CreateTrustContactDto,
  ) {
    const account = await this.assertVerifiedIndividual(user);
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (normalizedEmail === account.email.trim().toLowerCase()) {
      throw new BadRequestException({
        code: 'SELF_TRUST_CONTACT_NOT_ALLOWED',
        message:
          'You cannot add your own email as a trust contact.',
      });
    }

    const existingTrustContact = await this.trustContactModel.findOne({
      userId: this.toObjectId(user.id),
      email: normalizedEmail,
    });

    if (existingTrustContact) {
      throw new BadRequestException({
        code: 'DUPLICATE_TRUST_CONTACT_EMAIL',
        message:
          'You already added this email as a trust contact.',
      });
    }

    const trustContact = await this.trustContactModel.create({
      userId: user.id,
      ...dto,
      email: normalizedEmail,
      status: 'draft',
    });

    await this.upsertState(
      user.id,
      {
        currentStep: 'generate_score',
      },
      'trust_contact',
    );

    return {
      trustContact: this.serializeTrustContact(trustContact),
    };
  }

  async getTrustContacts(user: AuthenticatedUser) {
    await this.assertVerifiedIndividual(user);
    const trustContacts = await this.trustContactModel
      .find({ userId: user.id })
      .sort({ createdAt: -1 });

    return {
      trustContacts: trustContacts.map((contact) =>
        this.serializeTrustContact(contact),
      ),
    };
  }

  async sendTrustRequest(user: AuthenticatedUser, trustContactId: string) {
    await this.assertVerifiedIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);
    const trustContact = await this.trustContactModel.findOneAndUpdate(
      {
        _id: trustContactId,
        userId: user.id,
      },
      {
        status: 'request_sent',
        requestToken: `trustreq_${randomBytes(12).toString('hex')}`,
        requestedAt: new Date(),
      },
      { new: true },
    );

    if (!trustContact) {
      throw new NotFoundException({
        code: 'TRUST_CONTACT_NOT_FOUND',
        message: 'Trust contact was not found for this user',
      });
    }

    await this.emailService.sendTrustRequestEmail({
      to: trustContact.email,
      requesterName: account.displayName,
      contactName: trustContact.fullName,
      relationship: trustContact.relationship,
      reviewUrl: `${this.getAppBaseUrl()}/trust-request/${encodeURIComponent(
        trustContact.requestToken ?? '',
      )}`,
    });

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'trust_network',
      title: 'Trust request sent',
      body: `An endorsement request was sent to ${trustContact.fullName}.`,
      metadata: {
        trustContactId: String(trustContact._id),
      },
    });

    return {
      trustContact: this.serializeTrustContact(trustContact),
    };
  }

  async getPublicTrustRequest(token: string) {
    const trustContact = await this.trustContactModel.findOne({
      requestToken: token,
      status: { $in: ['request_sent', 'endorsed', 'declined'] },
    });

    if (!trustContact) {
      throw new NotFoundException({
        code: 'TRUST_REQUEST_NOT_FOUND',
        message: 'This trust request was not found or is no longer available',
      });
    }

    const owner = await this.accountsService.findUserByIdOrThrow(
      String(trustContact.userId),
    );

    return {
      trustRequest: {
        id: String(trustContact._id),
        status: trustContact.status,
        contact: {
          fullName: trustContact.fullName,
          email: trustContact.email,
        },
        requester: {
          displayName: owner.displayName,
          country: owner.country ?? null,
        },
        requestedRelationship: trustContact.relationship,
        requestedAt: trustContact.requestedAt ?? null,
        response: trustContact.respondedAt
          ? {
              action: trustContact.status,
              relationship: trustContact.responseRelationship ?? null,
              yearsKnown: trustContact.responseYearsKnown ?? null,
              trustLevel: trustContact.responseTrustLevel ?? null,
              note: trustContact.responseNote ?? null,
              respondedAt: trustContact.respondedAt,
            }
          : null,
      },
    };
  }

  async respondToTrustRequest(
    token: string,
    dto: RespondTrustRequestDto,
  ) {
    const trustContact = await this.trustContactModel.findOne({
      requestToken: token,
      status: 'request_sent',
    });

    if (!trustContact) {
      throw new NotFoundException({
        code: 'TRUST_REQUEST_NOT_FOUND',
        message: 'This trust request was not found or is no longer available',
      });
    }

    const nextStatus = dto.action === 'endorsed' ? 'endorsed' : 'declined';
    const now = new Date();

    trustContact.status = nextStatus;
    trustContact.respondedAt = now;
    trustContact.declinedAt = dto.action === 'declined' ? now : undefined;
    trustContact.responseRelationship = dto.relationship;
    trustContact.responseYearsKnown = dto.yearsKnown;
    trustContact.responseTrustLevel = dto.trustLevel;
    trustContact.responseNote = dto.note;

    await trustContact.save();

    const owner = await this.accountsService.findUserByIdOrThrow(
      String(trustContact.userId),
    );

    await this.notificationsService.createNotification({
      userId: String(trustContact.userId),
      category: 'trust_network',
      title:
        dto.action === 'endorsed'
          ? 'Trust endorsement received'
          : 'Trust request declined',
      body:
        dto.action === 'endorsed'
          ? `${trustContact.fullName} submitted an endorsement for your profile.`
          : `${trustContact.fullName} declined your trust request.`,
      metadata: {
        trustContactId: String(trustContact._id),
        status: nextStatus,
      },
    });

    await this.emailService.sendTrustRequestOutcomeEmail({
      to: owner.email,
      firstName: owner.firstName,
      contactName: trustContact.fullName,
      status: nextStatus as 'endorsed' | 'declined',
    });

    return {
      trustRequest: {
        id: String(trustContact._id),
        status: trustContact.status,
        respondedAt: trustContact.respondedAt,
      },
    };
  }

  async generateScore(user: AuthenticatedUser) {
    await this.assertVerifiedIndividual(user);
    const state = await this.upsertState(
      user.id,
      {
        scoreStatus: 'queued',
        scoreRequestedAt: new Date(),
      },
      'score_requested',
    );

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'score',
      title: 'Score generation queued',
      body: 'We have queued your trust score generation and will update your dashboard shortly.',
      metadata: {
        requestedAt: state.scoreRequestedAt?.toISOString(),
      },
    });

    return {
      score: {
        status: state.scoreStatus,
        requestedAt: state.scoreRequestedAt,
        provider: 'mock-score-engine',
      },
      onboarding: await this.getOnboarding(user),
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

  private async assertVerifiedIndividual(
    user: AuthenticatedUser,
  ) {
    this.assertIndividual(user);
    const account = await this.accountsService.findUserByIdOrThrow(user.id);

    if (!account.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message:
          'Verify your email address before continuing with onboarding.',
      });
    }

    return account;
  }

  private async getOrCreateOnboardingState(userId: string) {
    const userObjectId = this.toObjectId(userId);

    try {
      return await this.onboardingStateModel.findOneAndUpdate(
        { userId: userObjectId },
        {
          $setOnInsert: {
            userId: userObjectId,
            completedSteps: [],
            currentStep: 'personal_profile',
            identityVerificationStatus: 'not_started',
            scoreStatus: 'not_started',
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
        const existingState = await this.onboardingStateModel.findOne({
          userId: userObjectId,
        });

        if (existingState) {
          return existingState;
        }
      }

      throw error;
    }
  }

  private async upsertState(
    userId: string,
    updates: Partial<OnboardingState>,
    completedStep?: string,
  ) {
    const userObjectId = this.toObjectId(userId);
    const currentState = await this.getOrCreateOnboardingState(userId);
    const completedSteps = new Set(currentState.completedSteps);

    if (completedStep) {
      completedSteps.add(completedStep);
    }

    const nextCompletedSteps = Array.from(completedSteps);
    const isCompleted = REQUIRED_COMPLETION_STEPS.every((step) =>
      nextCompletedSteps.includes(step),
    );
    const onboardingCompletedAt = isCompleted ? new Date() : undefined;
    const shouldSendWelcomeEmail =
      isCompleted &&
      currentState.onboardingCompletedAt == null &&
      currentState.welcomeEmailSentAt == null;
    const welcomeEmailSentAt = shouldSendWelcomeEmail ? new Date() : undefined;

    const state = await this.onboardingStateModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        ...updates,
        completedSteps: nextCompletedSteps,
        onboardingCompletedAt,
        ...(welcomeEmailSentAt ? { welcomeEmailSentAt } : {}),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    await this.accountsService.updateProfileOnboardingState(userId, {
      onboardingStatus: isCompleted ? 'completed' : 'in_progress',
      onboardingCompletedAt: onboardingCompletedAt ?? null,
    });

    if (shouldSendWelcomeEmail) {
      const account = await this.accountsService.findUserByIdOrThrow(userId);
      await this.emailService.sendWelcomeEmail({
        to: account.email,
        firstName: account.firstName,
        accountType: 'individual',
      });
    }

    return state;
  }

  private buildOnboardingResponse(
    state: OnboardingStateDocument,
    verificationCase: IdentityVerificationCaseDocument | null,
    documents: UploadedDocumentDocument[],
    bankConnections: BankConnectionDocument[],
    trustContacts: TrustContactDocument[],
  ) {
    return {
      onboarding: {
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        completion: {
          completed: state.completedSteps.length,
          total: REQUIRED_COMPLETION_STEPS.length,
        },
        personalProfile: state.personalProfile,
        employmentProfile: state.employmentProfile,
        financialProfile: state.financialProfile,
        identityVerificationStatus: state.identityVerificationStatus,
        scoreStatus: state.scoreStatus,
        scoreRequestedAt: state.scoreRequestedAt,
        onboardingCompletedAt: state.onboardingCompletedAt,
      },
      identityVerification: verificationCase
        ? this.serializeVerificationCase(verificationCase)
        : null,
      documents: documents.map((document) => this.serializeDocument(document)),
      bankConnections: bankConnections.map((connection) =>
        this.serializeBankConnection(connection),
      ),
      trustContacts: trustContacts.map((contact) =>
        this.serializeTrustContact(contact),
      ),
    };
  }

  private serializeVerificationCase(
    verificationCase: IdentityVerificationCaseDocument,
  ) {
    return {
      id: String(verificationCase._id),
      provider: verificationCase.provider,
      status: verificationCase.status,
      documentType: verificationCase.documentType,
      country: verificationCase.country,
      livenessStatus: verificationCase.livenessStatus,
      submittedAt: verificationCase.submittedAt,
    };
  }

  private serializeDocument(document: {
    _id?: unknown;
    type: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    sizeBytes: number;
    side?: string;
    verificationCaseId?: unknown;
  }) {
    return {
      id: String(document._id),
      type: document.type,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      side: document.side,
      verificationCaseId: document.verificationCaseId
        ? String(document.verificationCaseId)
        : undefined,
    };
  }

  private serializeBankConnection(bankConnection: BankConnectionDocument) {
    return {
      id: String(bankConnection._id),
      bankId: bankConnection.bankId,
      bankName: bankConnection.bankName,
      accountMask: bankConnection.accountMask,
      accountType: bankConnection.accountType,
      status: bankConnection.status,
      provider: bankConnection.provider,
      connectedAt: bankConnection.connectedAt,
      lastSyncedAt: bankConnection.lastSyncedAt,
    };
  }

  private serializeTrustContact(trustContact: TrustContactDocument) {
    return {
      id: String(trustContact._id),
      fullName: trustContact.fullName,
      email: trustContact.email,
      phone: trustContact.phone,
      relationship: trustContact.relationship,
      status: trustContact.status,
      requestedAt: trustContact.requestedAt,
       respondedAt: trustContact.respondedAt,
       responseRelationship: trustContact.responseRelationship,
       responseYearsKnown: trustContact.responseYearsKnown,
       responseTrustLevel: trustContact.responseTrustLevel,
       responseNote: trustContact.responseNote,
    };
  }

  private getAppBaseUrl(): string {
    return (
      process.env.APP_BASE_URL?.trim() || 'http://localhost:8080'
    );
  }

  private toProfilePayload<T extends object>(dto: T): Record<string, unknown> {
    return { ...dto } as Record<string, unknown>;
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
