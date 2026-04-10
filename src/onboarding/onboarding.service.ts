import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AccountType } from '../common/enums/account-type.enum';
import { NotificationsService } from '../dashboard/notifications.service';
import { EmailService } from '../email/email.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ScoresService } from '../scores/scores.service';
import { BANK_CATALOG } from './constants/bank-catalog';
import { CreateBankConnectionDto } from './dto/bank-connection.dto';
import { CompleteBankConnectionDto } from './dto/complete-bank-connection.dto';
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

type TrueLayerProviderRecord = {
  provider_id?: string;
  display_name?: string;
  logo_uri?: string;
  logo_url?: string;
  country?: string;
  country_code?: string;
  country_codes?: string[];
  capabilities?: {
    data?: boolean;
  };
  scopes?: string[];
};

type TrueLayerAccountsResponse = {
  results?: Array<{
    account_id?: string;
    account_type?: string;
    display_name?: string;
    currency?: string;
    provider?: {
      provider_id?: string;
      display_name?: string;
      logo_uri?: string;
    };
    account_number?: {
      number?: string;
      iban?: string;
    };
  }>;
};

type TrueLayerCardsResponse = {
  results?: Array<{
    account_id?: string;
    card_type?: string;
    display_name?: string;
    partial_card_number?: string;
    name_on_card?: string;
    provider?: {
      provider_id?: string;
      display_name?: string;
      logo_uri?: string;
    };
  }>;
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly scoresService: ScoresService,
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
        this.getStoredBankConnections(user.id),
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

  async getBanks() {
    const trueLayerConfig = this.getTrueLayerConfig();
    const banks = trueLayerConfig.isConfigured
      ? await this.fetchTrueLayerProviders()
      : BANK_CATALOG;

    return {
      banks,
      openBanking: {
        provider: 'truelayer',
        configured: trueLayerConfig.isConfigured,
      },
    };
  }

  async createBankConnection(
    user: AuthenticatedUser,
    dto: CreateBankConnectionDto,
  ) {
    const account = await this.assertVerifiedIndividual(user);
    const trueLayerConfig = this.requireTrueLayerConfig();
    const bank = (await this.fetchTrueLayerProviders()).find(
      (entry) => entry.id === dto.bankId,
    );

    if (!bank) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        message: 'The requested bank is not supported',
      });
    }

    await this.upsertState(
      user.id,
      {
        bankAuthState: {
          state: randomBytes(18).toString('hex'),
          bankId: bank.id,
          returnPath: this.sanitizeReturnPath(dto.returnPath),
          createdAt: new Date(),
        },
      },
    );

    const state = await this.getOrCreateOnboardingState(user.id);
    const authState = state.bankAuthState;

    if (!authState?.state) {
      throw new BadRequestException({
        code: 'BANK_CONNECTION_AUTH_STATE_UNAVAILABLE',
        message: 'We could not start the bank connection flow.',
      });
    }

    return {
      authUrl: this.buildTrueLayerAuthUrl({
        clientId: trueLayerConfig.clientId,
        redirectUri: trueLayerConfig.redirectUri,
        authBaseUrl: trueLayerConfig.authBaseUrl,
        scopes: trueLayerConfig.scopes,
        state: authState.state,
        providerId: bank.id,
        userEmail: account.email,
      }),
    };
  }

  async completeBankConnection(
    user: AuthenticatedUser,
    dto: CompleteBankConnectionDto,
  ) {
    await this.assertVerifiedIndividual(user);
    const trueLayerConfig = this.requireTrueLayerConfig();
    const state = await this.getOrCreateOnboardingState(user.id);
    const authState = state.bankAuthState;

    if (!authState?.state || authState.state !== dto.state) {
      throw new BadRequestException({
        code: 'BANK_CONNECTION_STATE_INVALID',
        message:
          'This bank connection session is invalid or has expired. Please try again.',
      });
    }

    const createdAt = authState.createdAt ? new Date(authState.createdAt) : null;
    const ageMs =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? Date.now() - createdAt.getTime()
        : Number.POSITIVE_INFINITY;

    if (ageMs > 15 * 60 * 1000) {
      await this.upsertState(user.id, { bankAuthState: null });
      throw new BadRequestException({
        code: 'BANK_CONNECTION_STATE_EXPIRED',
        message: 'This bank connection session has expired. Please try again.',
      });
    }

    const tokenResponse = await this.exchangeTrueLayerCode(dto.code);
    const infoResults = await this.fetchTrueLayerResults(
      '/data/v1/info',
      tokenResponse.access_token,
      { optional: true },
    );
    const accountsResponse = await this.fetchTrueLayerAccounts(
      tokenResponse.access_token,
    );
    const accounts = Array.isArray(accountsResponse.results)
      ? accountsResponse.results
      : [];
    const cardsResponse = await this.fetchTrueLayerCards(
      tokenResponse.access_token,
    );
    const cards = Array.isArray(cardsResponse.results)
      ? cardsResponse.results
      : [];

    if (accounts.length === 0 && cards.length === 0) {
      throw new BadRequestException({
        code: 'BANK_CONNECTION_NO_ACCOUNTS',
        message:
          'TrueLayer completed successfully but no accounts or cards were returned for this user.',
      });
    }

    const banks = await this.fetchTrueLayerProviders();
    const bankById = new Map(banks.map((bank) => [bank.id, bank]));
    const userObjectId = this.toObjectId(user.id);
    const savedConnections: BankConnectionDocument[] = [];

    for (const account of accounts) {
      const providerId =
        this.readString(account.provider?.provider_id) ?? authState.bankId ?? '';
      const providerBank = providerId ? bankById.get(providerId) : undefined;
      const bankName =
        this.readString(account.provider?.display_name) ??
        providerBank?.name ??
        this.readString(account.display_name) ??
        'Connected bank';
      const accountId = this.readString(account.account_id);

      if (!accountId) {
        continue;
      }

      const connection = await this.bankConnectionModel.findOneAndUpdate(
        {
          userId: userObjectId,
          provider: 'truelayer',
          providerAccountId: accountId,
        },
        {
          userId: userObjectId,
          bankId: providerId || authState.bankId || accountId,
          bankName,
          accountMask: this.getTrueLayerAccountMask(account),
          accountType:
            this.readString(account.account_type) ??
            this.readString(account.display_name),
          provider: 'truelayer',
          providerAccountId: accountId,
          providerLogoUri:
            this.readString(account.provider?.logo_uri) ??
            providerBank?.logoUri ??
            undefined,
          resourceType: 'account',
          scopes: trueLayerConfig.scopes,
          dataSnapshot: {
            info: infoResults,
            account,
            balance: await this.fetchTrueLayerResults(
              `/data/v1/accounts/${accountId}/balance`,
              tokenResponse.access_token,
              { optional: true },
            ),
            transactions: await this.fetchTrueLayerResults(
              `/data/v1/accounts/${accountId}/transactions`,
              tokenResponse.access_token,
              { optional: true },
            ),
            directDebits: await this.fetchTrueLayerResults(
              `/data/v1/accounts/${accountId}/direct_debits`,
              tokenResponse.access_token,
              { optional: true },
            ),
            standingOrders: await this.fetchTrueLayerResults(
              `/data/v1/accounts/${accountId}/standing_orders`,
              tokenResponse.access_token,
              { optional: true },
            ),
          },
          status: 'connected',
          connectedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );

      savedConnections.push(connection);
    }

    for (const card of cards) {
      const providerId =
        this.readString(card.provider?.provider_id) ?? authState.bankId ?? '';
      const providerBank = providerId ? bankById.get(providerId) : undefined;
      const bankName =
        this.readString(card.provider?.display_name) ??
        providerBank?.name ??
        this.readString(card.display_name) ??
        'Connected card';
      const cardId = this.readString(card.account_id);

      if (!cardId) {
        continue;
      }

      const connection = await this.bankConnectionModel.findOneAndUpdate(
        {
          userId: userObjectId,
          provider: 'truelayer',
          providerAccountId: cardId,
        },
        {
          userId: userObjectId,
          bankId: providerId || authState.bankId || cardId,
          bankName,
          accountMask:
            this.readString(card.partial_card_number) ??
            this.readString(card.account_id)?.slice(-4),
          accountType: this.readString(card.card_type) ?? 'card',
          provider: 'truelayer',
          providerAccountId: cardId,
          providerLogoUri:
            this.readString(card.provider?.logo_uri) ??
            providerBank?.logoUri ??
            undefined,
          resourceType: 'card',
          scopes: trueLayerConfig.scopes,
          dataSnapshot: {
            info: infoResults,
            card,
            balance: await this.fetchTrueLayerResults(
              `/data/v1/cards/${cardId}/balance`,
              tokenResponse.access_token,
              { optional: true },
            ),
            transactions: await this.fetchTrueLayerResults(
              `/data/v1/cards/${cardId}/transactions`,
              tokenResponse.access_token,
              { optional: true },
            ),
          },
          status: 'connected',
          connectedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );

      savedConnections.push(connection);
    }

    if (savedConnections.length === 0) {
      throw new BadRequestException({
        code: 'BANK_CONNECTION_NO_USABLE_ACCOUNTS',
        message:
          'TrueLayer returned account data, but none of the accounts could be saved.',
      });
    }

    await this.upsertState(
      user.id,
      {
        currentStep: 'trust_network',
        bankAuthState: null,
      },
      'bank_connection',
    );

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'bank_connection',
      title: 'Bank connection added',
      body: `${savedConnections.length} bank account${savedConnections.length === 1 ? '' : 's'} connected through TrueLayer.`,
      metadata: {
        bankIds: savedConnections.map((connection) => connection.bankId),
      },
    });

    return {
      bankConnections: savedConnections.map((connection) =>
        this.serializeBankConnection(connection),
      ),
      returnPath: this.sanitizeReturnPath(authState.returnPath),
    };
  }

  async getBankConnections(user: AuthenticatedUser) {
    await this.assertVerifiedIndividual(user);
    const bankConnections = await this.getStoredBankConnections(user.id);

    return {
      bankConnections: bankConnections.map((connection) =>
        this.serializeBankConnection(connection),
      ),
    };
  }

  async getBankConnectionDetails(user: AuthenticatedUser, connectionId: string) {
    await this.assertVerifiedIndividual(user);

    const bankConnection = await this.getStoredBankConnectionById(
      user.id,
      connectionId,
    );

    return {
      bankConnection: this.serializeBankConnection(bankConnection),
      details: this.serializeBankConnectionDetails(bankConnection),
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
    const queuedState = await this.upsertState(
      user.id,
      {
        scoreStatus: 'queued',
        scoreRequestedAt: new Date(),
      },
      'score_requested',
    );
    const score = await this.scoresService.generateScore(
      user.id,
      queuedState.scoreRequestedAt ?? new Date(),
    );
    const state = await this.upsertState(user.id, {
      scoreStatus: score.status,
    });

    await this.notificationsService.createNotification({
      userId: user.id,
      category: 'score',
      title:
        score.status === 'insufficient_data'
          ? 'More data is needed for your CALEN score'
          : score.status === 'flagged_for_review'
            ? 'Your CALEN score needs a quick review'
            : 'Your CALEN score is ready',
      body:
        score.status === 'insufficient_data'
          ? 'Connect more transaction history so CALEN can generate a reliable score.'
          : score.status === 'flagged_for_review'
            ? 'We generated your score, but a few transaction patterns need extra review.'
            : 'Your CALEN score has been generated and is now available on your dashboard.',
      metadata: {
        requestedAt: state.scoreRequestedAt?.toISOString(),
        scoreRunId: score.id,
        status: score.status,
      },
    });

    return {
      score,
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
      providerAccountId: bankConnection.providerAccountId,
      providerLogoUri: bankConnection.providerLogoUri,
      resourceType: bankConnection.resourceType ?? 'account',
      scopes: Array.isArray(bankConnection.scopes) ? bankConnection.scopes : [],
      dataSummary: this.buildConnectionDataSummary(bankConnection.dataSnapshot),
      status: bankConnection.status,
      provider: bankConnection.provider,
      connectedAt: bankConnection.connectedAt,
      lastSyncedAt: bankConnection.lastSyncedAt,
    };
  }

  private serializeBankConnectionDetails(bankConnection: BankConnectionDocument) {
    const snapshot = this.readRecord(bankConnection.dataSnapshot) ?? {};
    const info = this.serializeConnectionInfo(bankConnection, snapshot);
    const balances = this.serializeConnectionBalances(snapshot);
    const transactions = this.serializeConnectionTransactions(snapshot);
    const directDebits = this.serializeConnectionDirectDebits(snapshot);
    const standingOrders = this.serializeConnectionStandingOrders(snapshot);

    return {
      connection: info,
      balances,
      transactions,
      directDebits,
      standingOrders,
      creditSignals: this.buildCreditSignals({
        bankConnection,
        balances,
        transactions,
        directDebits,
        standingOrders,
      }),
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

  private async getStoredBankConnections(userId: string) {
    const userObjectId = this.toObjectId(userId);
    const legacyMockConnections = await this.bankConnectionModel.find({
      userId: userObjectId,
      provider: 'mock-open-banking',
    });

    if (legacyMockConnections.length > 0) {
      await this.bankConnectionModel.deleteMany({
        _id: {
          $in: legacyMockConnections.map((connection) => connection._id),
        },
      });
    }

    return this.bankConnectionModel
      .find({
        userId: userObjectId,
        provider: { $ne: 'mock-open-banking' },
      })
      .sort({ createdAt: -1 });
  }

  private async getStoredBankConnectionById(userId: string, connectionId: string) {
    if (!Types.ObjectId.isValid(connectionId)) {
      throw new NotFoundException({
        code: 'BANK_CONNECTION_NOT_FOUND',
        message: 'Bank connection resource not found.',
      });
    }

    const connection = await this.bankConnectionModel.findOne({
      _id: connectionId,
      userId: this.toObjectId(userId),
      provider: { $ne: 'mock-open-banking' },
    });

    if (!connection) {
      throw new NotFoundException({
        code: 'BANK_CONNECTION_NOT_FOUND',
        message: 'Bank connection resource not found.',
      });
    }

    return connection;
  }

  private getAppBaseUrl(): string {
    return (
      process.env.APP_BASE_URL?.trim() || 'http://localhost:8080'
    );
  }

  private getTrueLayerConfig() {
    const clientId = this.configService.get<string>('TRUELAYER_CLIENT_ID')?.trim();
    const clientSecret = this.configService
      .get<string>('TRUELAYER_CLIENT_SECRET')
      ?.trim();
    const appBaseUrl = this.getAppBaseUrl();
    const redirectUri =
      this.configService.get<string>('TRUELAYER_REDIRECT_URI')?.trim() ||
      `${appBaseUrl}/truelayer/callback`;
    const authBaseUrl =
      this.configService.get<string>('TRUELAYER_AUTH_BASE_URL')?.trim() ||
      'https://auth.truelayer.com';
    const apiBaseUrl =
      this.configService.get<string>('TRUELAYER_API_BASE_URL')?.trim() ||
      'https://api.truelayer.com';
    const scopes =
      this.configService
        .get<string>('TRUELAYER_SCOPES')
        ?.split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean) ?? ['info', 'accounts', 'balance', 'transactions'];
    const providerCountryCode = this.configService
      .get<string>('TRUELAYER_PROVIDER_COUNTRY_CODE')
      ?.trim()
      .toUpperCase();

    return {
      clientId,
      clientSecret,
      redirectUri,
      authBaseUrl: authBaseUrl.replace(/\/+$/, ''),
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
      scopes,
      providerCountryCode,
      isConfigured: Boolean(clientId && clientSecret),
    };
  }

  private requireTrueLayerConfig() {
    const config = this.getTrueLayerConfig();

    if (!config.isConfigured) {
      throw new BadRequestException({
        code: 'TRUELAYER_NOT_CONFIGURED',
        message:
          'TrueLayer is not configured yet. Add TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET to enable live bank connections.',
      });
    }

    return config as typeof config & {
      clientId: string;
      clientSecret: string;
    };
  }

  private async fetchTrueLayerProviders() {
    const config = this.getTrueLayerConfig();
    if (!config.isConfigured) {
      return [];
    }

    const url = new URL(`${config.authBaseUrl}/api/providers`);
    url.searchParams.set('client_id', config.clientId!);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new BadRequestException({
        code: 'TRUELAYER_PROVIDER_FETCH_FAILED',
        message: 'We could not load available banks from TrueLayer.',
      });
    }

    const payload = (await response.json()) as
      | { results?: TrueLayerProviderRecord[] }
      | TrueLayerProviderRecord[];
    const providers = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.results)
        ? payload.results
        : [];

    return providers
      .filter((provider) => {
        if (
          config.providerCountryCode &&
          !this.providerMatchesCountry(provider, config.providerCountryCode)
        ) {
          return false;
        }

        return this.providerSupportsData(provider);
      })
      .map((provider) => ({
        id: provider.provider_id ?? '',
        name: provider.display_name ?? provider.provider_id ?? 'Bank',
        country:
          this.normalizeCountryCode(provider.country) ??
          provider.country_code ??
          provider.country_codes?.[0] ??
          config.providerCountryCode ??
          'GB',
        provider: 'truelayer',
        logoUri: provider.logo_uri ?? provider.logo_url ?? null,
      }))
      .filter((provider) => provider.id)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private providerSupportsData(provider: TrueLayerProviderRecord) {
    if (provider.capabilities?.data != null) {
      return provider.capabilities.data;
    }

    if (Array.isArray(provider.scopes) && provider.scopes.length > 0) {
      return provider.scopes.includes('accounts') || provider.scopes.includes('info');
    }

    return true;
  }

  private providerMatchesCountry(
    provider: TrueLayerProviderRecord,
    countryCode: string,
  ) {
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);

    if (provider.country) {
      return this.normalizeCountryCode(provider.country) === normalizedCountryCode;
    }

    if (provider.country_code) {
      return this.normalizeCountryCode(provider.country_code) === normalizedCountryCode;
    }

    if (Array.isArray(provider.country_codes)) {
      return provider.country_codes.some(
        (code) => this.normalizeCountryCode(code) === normalizedCountryCode,
      );
    }

    return false;
  }

  private normalizeCountryCode(value?: string | null) {
    const normalized = value?.trim().toUpperCase();

    if (!normalized) {
      return undefined;
    }

    if (normalized === 'UK') {
      return 'GB';
    }

    return normalized;
  }

  private buildTrueLayerAuthUrl(input: {
    clientId: string;
    redirectUri: string;
    authBaseUrl: string;
    scopes: string[];
    state: string;
    providerId: string;
    userEmail?: string | null;
  }) {
    const url = new URL(input.authBaseUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', input.scopes.join(' '));
    url.searchParams.set('state', input.state);
    url.searchParams.set('provider_id', input.providerId);
    url.searchParams.set('providers', input.providerId);

    if (input.userEmail?.trim()) {
      url.searchParams.set('user_email', input.userEmail.trim());
    }

    return url.toString();
  }

  private async exchangeTrueLayerCode(code: string) {
    const config = this.requireTrueLayerConfig();
    const response = await fetch(`${config.authBaseUrl}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const errorPayload = await this.readErrorPayload(response);
      throw new BadRequestException({
        code: 'TRUELAYER_TOKEN_EXCHANGE_FAILED',
        message:
          errorPayload?.error_description ||
          errorPayload?.error ||
          'We could not exchange the TrueLayer authorization code.',
      });
    }

    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
  }

  private async fetchTrueLayerAccounts(accessToken: string) {
    return (await this.fetchTrueLayerPayload(
      '/data/v1/accounts',
      accessToken,
    )) as TrueLayerAccountsResponse;
  }

  private async fetchTrueLayerCards(accessToken: string) {
    return (await this.fetchTrueLayerPayload(
      '/data/v1/cards',
      accessToken,
      { optional: true },
    )) as TrueLayerCardsResponse;
  }

  private async fetchTrueLayerResults(
    path: string,
    accessToken: string,
    options?: { optional?: boolean },
  ) {
    const payload = (await this.fetchTrueLayerPayload(path, accessToken, options)) as
      | { results?: unknown[] }
      | undefined;

    return Array.isArray(payload?.results) ? payload.results : [];
  }

  private async fetchTrueLayerPayload(
    path: string,
    accessToken: string,
    options?: { optional?: boolean },
  ) {
    const config = this.requireTrueLayerConfig();
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (options?.optional && [400, 403, 404].includes(response.status)) {
        return { results: [] };
      }

      const errorPayload = await this.readErrorPayload(response);
      throw new BadRequestException({
        code: 'TRUELAYER_DATA_FETCH_FAILED',
        message:
          errorPayload?.error_description ||
          errorPayload?.error ||
          `We could not fetch ${path} from TrueLayer.`,
      });
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private async readErrorPayload(response: Response) {
    try {
      return (await response.json()) as
        | { error?: string; error_description?: string }
        | undefined;
    } catch {
      return undefined;
    }
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getTrueLayerAccountMask(
    account: NonNullable<TrueLayerAccountsResponse['results']>[number],
  ) {
    const raw =
      this.readString(account.account_number?.number) ??
      this.readString(account.account_number?.iban) ??
      this.readString(account.account_id);

    if (!raw) {
      return undefined;
    }

    const cleaned = raw.replace(/\s+/g, '');
    return cleaned.slice(-4);
  }

  private buildConnectionDataSummary(snapshot?: Record<string, unknown> | null) {
    const countEntries = (value: unknown) => (Array.isArray(value) ? value.length : 0);

    return {
      info: countEntries(snapshot?.info),
      balance: countEntries(snapshot?.balance),
      transactions: countEntries(snapshot?.transactions),
      directDebits: countEntries(snapshot?.directDebits),
      standingOrders: countEntries(snapshot?.standingOrders),
    };
  }

  private serializeConnectionInfo(
    bankConnection: BankConnectionDocument,
    snapshot: Record<string, unknown>,
  ) {
    const account = this.readRecord(snapshot.account);
    const card = this.readRecord(snapshot.card);
    const resource = account ?? card ?? {};
    const infoEntries = this.readRecordArray(snapshot.info);
    const accountNumber = this.readRecord(account?.account_number);

    return {
      bankName: bankConnection.bankName,
      provider: bankConnection.provider,
      resourceType: bankConnection.resourceType ?? 'account',
      accountType: bankConnection.accountType ?? null,
      accountMask: bankConnection.accountMask ?? null,
      providerAccountId: bankConnection.providerAccountId ?? null,
      displayName:
        this.readString(resource.display_name) ??
        this.readString(card?.name_on_card) ??
        bankConnection.bankName,
      currency: this.readString(account?.currency) ?? null,
      cardType: this.readString(card?.card_type) ?? null,
      nameOnCard: this.readString(card?.name_on_card) ?? null,
      accountNumberMask:
        this.readString(accountNumber?.number)?.slice(-4) ??
        this.readString(accountNumber?.iban)?.slice(-4) ??
        bankConnection.accountMask ??
        null,
      holders: infoEntries
        .map((entry) => this.readString(entry.full_name) ?? this.readString(entry.display_name))
        .filter((value): value is string => Boolean(value)),
      connectedAt: bankConnection.connectedAt,
      lastSyncedAt: bankConnection.lastSyncedAt,
    };
  }

  private serializeConnectionBalances(snapshot: Record<string, unknown>) {
    return this.readRecordArray(snapshot.balance)
      .map((entry, index) => ({
        id:
          this.readString(entry.balance_id) ??
          this.readString(entry.type) ??
          `balance-${index}`,
        current: this.readNumber(entry.current),
        available: this.readNumber(entry.available),
        creditLimit: this.readNumber(entry.credit_limit),
        overdraft: this.readNumber(entry.overdraft),
        lastStatementBalance: this.readNumber(entry.last_statement_balance),
        paymentDue: this.readNumber(entry.payment_due),
        paymentDueDate: this.readString(entry.payment_due_date) ?? null,
        currency: this.readString(entry.currency) ?? 'GBP',
        updateTimestamp:
          this.readString(entry.update_timestamp) ??
          this.readString(entry.timestamp) ??
          null,
      }))
      .filter(
        (entry) =>
          entry.current != null ||
          entry.available != null ||
          entry.creditLimit != null ||
          entry.overdraft != null ||
          entry.lastStatementBalance != null ||
          entry.paymentDue != null,
      );
  }

  private serializeConnectionTransactions(snapshot: Record<string, unknown>) {
    return this.readRecordArray(snapshot.transactions)
      .map((entry, index) => {
        const meta = this.readRecord(entry.meta);
        const runningBalance = this.readRecord(entry.running_balance);

        return {
          id:
            this.readString(entry.transaction_id) ??
            this.readString(entry.normalised_provider_transaction_id) ??
            `transaction-${index}`,
          timestamp:
            this.readString(entry.timestamp) ??
            this.readString(entry.booking_date) ??
            this.readString(entry.update_timestamp) ??
            null,
          description:
            this.readString(entry.description) ??
            this.readString(entry.merchant_name) ??
            this.readString(meta?.provider_reference) ??
            'Transaction',
          amount: this.readNumber(entry.amount) ?? 0,
          currency: this.readString(entry.currency) ?? 'GBP',
          type:
            this.readString(entry.transaction_type) ??
            this.readString(entry.transaction_category) ??
            'transaction',
          category: this.readTransactionCategory(entry),
          merchantName: this.readString(entry.merchant_name) ?? null,
          runningBalance:
            this.readNumber(runningBalance?.amount) ??
            this.readNumber(entry.running_balance) ??
            null,
          status: this.readString(entry.status) ?? null,
        };
      })
      .sort((left, right) => {
        const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
        const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
        return rightTime - leftTime;
      });
  }

  private serializeConnectionDirectDebits(snapshot: Record<string, unknown>) {
    return this.readRecordArray(snapshot.directDebits).map((entry, index) => ({
      id:
        this.readString(entry.direct_debit_id) ??
        this.readString(entry.mandate_id) ??
        `direct-debit-${index}`,
      merchantName:
        this.readString(entry.name) ??
        this.readString(entry.merchant_name) ??
        this.readString(entry.payee_name) ??
        'Direct debit',
      reference: this.readString(entry.reference) ?? null,
      status: this.readString(entry.status) ?? null,
      previousPaymentAmount: this.readNumber(entry.previous_payment_amount),
      previousPaymentDate: this.readString(entry.previous_payment_date) ?? null,
      currency: this.readString(entry.currency) ?? 'GBP',
    }));
  }

  private serializeConnectionStandingOrders(snapshot: Record<string, unknown>) {
    return this.readRecordArray(snapshot.standingOrders).map((entry, index) => ({
      id:
        this.readString(entry.standing_order_id) ??
        this.readString(entry.payment_id) ??
        `standing-order-${index}`,
      payeeName:
        this.readString(entry.payee_name) ??
        this.readString(entry.name) ??
        'Standing order',
      reference: this.readString(entry.reference) ?? null,
      frequency:
        this.readString(entry.frequency) ??
        this.readString(entry.payment_frequency) ??
        null,
      amount:
        this.readNumber(entry.amount) ??
        this.readNumber(entry.next_payment_amount),
      currency: this.readString(entry.currency) ?? 'GBP',
      nextPaymentDate: this.readString(entry.next_payment_date) ?? null,
      lastPaymentDate: this.readString(entry.last_payment_date) ?? null,
      status: this.readString(entry.status) ?? null,
    }));
  }

  private buildCreditSignals(input: {
    bankConnection: BankConnectionDocument;
    balances: Array<{
      current: number | null;
      available: number | null;
      creditLimit: number | null;
      overdraft: number | null;
      paymentDue: number | null;
      currency: string;
    }>;
    transactions: Array<{
      amount: number;
      description: string;
    }>;
    directDebits: Array<Record<string, unknown>>;
    standingOrders: Array<Record<string, unknown>>;
  }) {
    const balance = input.balances[0];
    const totalInflow = input.transactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalOutflow = input.transactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const salaryCredits = input.transactions.filter((transaction) =>
      /(salary|payroll|wage|paye)/i.test(transaction.description),
    ).length;
    const recurringCommitments =
      input.directDebits.length + input.standingOrders.length;

    return [
      {
        label: 'Transaction Coverage',
        value: `${input.transactions.length}`,
        desc: 'Captured transaction entries',
      },
      {
        label: 'Recurring Commitments',
        value: `${recurringCommitments}`,
        desc: 'Direct debits plus standing orders',
      },
      {
        label: 'Credit Limit',
        value:
          balance?.creditLimit != null
            ? this.formatMoney(balance.creditLimit, balance.currency)
            : 'N/A',
        desc:
          input.bankConnection.resourceType === 'card'
            ? 'Reported card limit'
            : 'Not available for this resource',
      },
      {
        label: 'Net Cashflow',
        value: this.formatMoney(totalInflow - totalOutflow, balance?.currency ?? 'GBP'),
        desc: `${salaryCredits} salary-like credit${salaryCredits === 1 ? '' : 's'} spotted`,
      },
    ];
  }

  private readTransactionCategory(entry: Record<string, unknown>) {
    if (Array.isArray(entry.transaction_classification)) {
      const values = entry.transaction_classification.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );

      if (values.length > 0) {
        return values.join(' / ');
      }
    }

    return this.readString(entry.transaction_category) ?? null;
  }

  private readRecord(value: unknown) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readRecordArray(value: unknown) {
    return Array.isArray(value)
      ? value
          .map((entry) => this.readRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      : [];
  }

  private readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private formatMoney(amount: number, currency: string) {
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currency || 'GBP',
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency || 'GBP'} ${amount.toFixed(2)}`;
    }
  }

  private sanitizeReturnPath(value?: string | null) {
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
      return '/onboarding';
    }

    return value;
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
