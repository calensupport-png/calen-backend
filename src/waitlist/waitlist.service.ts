import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model } from 'mongoose';
import {
  AdminWaitlistAudienceFilter,
  AdminWaitlistQueryDto,
} from './dto/admin-waitlist-query.dto';
import {
  IndividualWaitlistDto,
  OrganisationWaitlistDto,
  SubmitWaitlistDto,
} from './dto/submit-waitlist.dto';
import { WaitlistSubmissionResponseDto } from './dto/waitlist-submission-response.dto';
import {
  WaitlistSubmission,
  WaitlistSubmissionDocument,
} from './schemas/waitlist-submission.schema';
import { WaitlistAudience } from './waitlist-audience.enum';

type WaitlistRequestContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  origin?: string;
};

type WaitlistPersistenceShape = {
  fullName: string;
  email: string;
  normalizedEmail: string;
  country?: string | null;
  phoneNumber?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
  data: Record<string, unknown>;
};

type AdminWaitlistStats = {
  totalSubmissions: number;
  individualSubmissions: number;
  organisationSubmissions: number;
  submissionsToday: number;
  betaInterestedIndividuals: number;
  pilotReadyOrganizations: number;
};

@Injectable()
export class WaitlistService {
  constructor(
    @InjectModel(WaitlistSubmission.name)
    private readonly waitlistSubmissionModel: Model<WaitlistSubmissionDocument>,
  ) {}

  async getAdminWaitlist(query: AdminWaitlistQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const search = query.search?.trim() ?? '';
    const audience = query.audience ?? 'all';
    const filter = this.buildAdminWaitlistFilter(audience, search);
    const skip = (page - 1) * pageSize;

    const [totalResults, submissions, stats] = await Promise.all([
      this.waitlistSubmissionModel.countDocuments(filter),
      this.waitlistSubmissionModel
        .find(filter)
        .sort({ lastSubmittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      this.getAdminWaitlistStats(),
    ]);

    return {
      stats,
      filters: {
        audience,
        search,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalResults / pageSize)),
        totalResults,
      },
      submissions: submissions.map((submission) =>
        this.mapAdminWaitlistSubmission(submission),
      ),
    };
  }

  async getAdminWaitlistSubmission(submissionId: string) {
    const normalizedSubmissionId = submissionId.trim().toUpperCase();
    const submission = await this.waitlistSubmissionModel
      .findOne({
        submissionId: normalizedSubmissionId,
      })
      .lean()
      .exec();

    if (!submission) {
      throw new NotFoundException({
        code: 'WAITLIST_SUBMISSION_NOT_FOUND',
        message: 'Waitlist submission was not found',
      });
    }

    return this.mapAdminWaitlistSubmission(submission);
  }

  async submit(
    dto: SubmitWaitlistDto,
    context: WaitlistRequestContext,
  ): Promise<WaitlistSubmissionResponseDto> {
    const normalizedReferralCode = this.normalizeNullableString(dto.referralCode);
    const normalizedSubmissionPath = this.normalizeNullableString(
      dto.submissionPath,
    );
    const requestMetadata = {
      requestId: this.normalizeNullableString(context.requestId),
      ipAddress: this.normalizeNullableString(context.ipAddress),
      userAgent: this.normalizeNullableString(context.userAgent),
      referer: this.normalizeNullableString(context.referer),
      origin: this.normalizeNullableString(context.origin),
    };

    const persistence =
      dto.audience === WaitlistAudience.INDIVIDUAL
        ? this.buildIndividualPersistence(dto.individual!)
        : this.buildOrganisationPersistence(dto.organisation!);

    const now = new Date();
    const existing = await this.waitlistSubmissionModel.findOne({
      audience: dto.audience,
      normalizedEmail: persistence.normalizedEmail,
    });

    if (existing) {
      existing.fullName = persistence.fullName;
      existing.email = persistence.email;
      existing.normalizedEmail = persistence.normalizedEmail;
      existing.country = persistence.country ?? null;
      existing.phoneNumber = persistence.phoneNumber ?? null;
      existing.organizationName = persistence.organizationName ?? null;
      existing.organizationType = persistence.organizationType ?? null;
      existing.referralCode = normalizedReferralCode;
      existing.submissionPath = normalizedSubmissionPath;
      existing.data = persistence.data;
      existing.requestMetadata = requestMetadata;
      existing.lastSubmittedAt = now;
      existing.submissionCount = (existing.submissionCount ?? 1) + 1;
      await existing.save();

      return {
        submissionId: existing.submissionId,
        audience: existing.audience,
        status: 'updated',
        thankYouPath: '/thank-you',
        message: 'Waitlist submission updated successfully.',
      };
    }

    const created = await this.waitlistSubmissionModel.create({
      submissionId: this.createSubmissionId(),
      audience: dto.audience,
      fullName: persistence.fullName,
      email: persistence.email,
      normalizedEmail: persistence.normalizedEmail,
      country: persistence.country ?? null,
      phoneNumber: persistence.phoneNumber ?? null,
      organizationName: persistence.organizationName ?? null,
      organizationType: persistence.organizationType ?? null,
      referralCode: normalizedReferralCode,
      submissionPath: normalizedSubmissionPath,
      submissionCount: 1,
      firstSubmittedAt: now,
      lastSubmittedAt: now,
      data: persistence.data,
      requestMetadata,
    });

    return {
      submissionId: created.submissionId,
      audience: created.audience,
      status: 'created',
      thankYouPath: '/thank-you',
      message: 'Waitlist submission received successfully.',
    };
  }

  private buildIndividualPersistence(
    submission: IndividualWaitlistDto,
  ): WaitlistPersistenceShape {
    return {
      fullName: submission.fullName.trim(),
      email: submission.email.trim().toLowerCase(),
      normalizedEmail: submission.email.trim().toLowerCase(),
      country: this.normalizeNullableString(submission.countryOfResidence),
      phoneNumber: this.normalizeNullableString(submission.phoneNumber),
      data: {
        ...submission,
        fullName: submission.fullName.trim(),
        email: submission.email.trim().toLowerCase(),
        countryOfResidence: submission.countryOfResidence.trim(),
      },
    };
  }

  private buildOrganisationPersistence(
    submission: OrganisationWaitlistDto,
  ): WaitlistPersistenceShape {
    return {
      fullName: submission.fullName.trim(),
      email: submission.workEmail.trim().toLowerCase(),
      normalizedEmail: submission.workEmail.trim().toLowerCase(),
      country: this.normalizeNullableString(submission.countryMarket),
      organizationName: submission.organisationName.trim(),
      organizationType: submission.organisationType.trim(),
      data: {
        ...submission,
        fullName: submission.fullName.trim(),
        workEmail: submission.workEmail.trim().toLowerCase(),
        organisationName: submission.organisationName.trim(),
        organisationType: submission.organisationType.trim(),
        countryMarket: submission.countryMarket.trim(),
      },
    };
  }

  private createSubmissionId(): string {
    return `WL-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private buildAdminWaitlistFilter(
    audience: AdminWaitlistAudienceFilter,
    search: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (audience !== 'all') {
      filter.audience = audience;
    }

    if (!search) {
      return filter;
    }

    const escapedSearch = this.escapeRegex(search);
    const regex = new RegExp(escapedSearch, 'i');

    filter.$or = [
      { submissionId: regex },
      { fullName: regex },
      { email: regex },
      { organizationName: regex },
      { country: regex },
    ];

    return filter;
  }

  private async getAdminWaitlistStats(): Promise<AdminWaitlistStats> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalSubmissions,
      individualSubmissions,
      organisationSubmissions,
      submissionsToday,
      betaInterestedIndividuals,
      pilotReadyOrganizations,
    ] = await Promise.all([
      this.waitlistSubmissionModel.countDocuments(),
      this.waitlistSubmissionModel.countDocuments({
        audience: WaitlistAudience.INDIVIDUAL,
      }),
      this.waitlistSubmissionModel.countDocuments({
        audience: WaitlistAudience.ORGANISATION,
      }),
      this.waitlistSubmissionModel.countDocuments({
        lastSubmittedAt: { $gte: startOfToday },
      }),
      this.waitlistSubmissionModel.countDocuments({
        audience: WaitlistAudience.INDIVIDUAL,
        'data.wantsBeta': true,
      }),
      this.waitlistSubmissionModel.countDocuments({
        audience: WaitlistAudience.ORGANISATION,
        'data.wouldJoinPilot': { $in: ['yes', 'Yes', 'YES', true] },
      }),
    ]);

    return {
      totalSubmissions,
      individualSubmissions,
      organisationSubmissions,
      submissionsToday,
      betaInterestedIndividuals,
      pilotReadyOrganizations,
    };
  }

  private mapAdminWaitlistSubmission(
    submission: WaitlistSubmission,
  ): Record<string, unknown> {
    const data = submission.data ?? {};

    return {
      submissionId: submission.submissionId,
      audience: submission.audience,
      fullName: submission.fullName,
      email: submission.email,
      country: submission.country ?? null,
      phoneNumber: submission.phoneNumber ?? null,
      organizationName: submission.organizationName ?? null,
      organizationType: submission.organizationType ?? null,
      referralCode: submission.referralCode ?? null,
      submissionPath: submission.submissionPath ?? null,
      submissionCount: submission.submissionCount,
      firstSubmittedAt: submission.firstSubmittedAt,
      lastSubmittedAt: submission.lastSubmittedAt,
      createdAt: submission.createdAt ?? null,
      updatedAt: submission.updatedAt ?? null,
      flags: {
        wantsBeta: data.wantsBeta === true,
        wantsPilot: this.isAffirmative(data.wouldJoinPilot),
      },
      requestMetadata: {
        requestId: submission.requestMetadata?.requestId ?? null,
        ipAddress: submission.requestMetadata?.ipAddress ?? null,
        userAgent: submission.requestMetadata?.userAgent ?? null,
        referer: submission.requestMetadata?.referer ?? null,
        origin: submission.requestMetadata?.origin ?? null,
      },
      data,
    };
  }

  private normalizeNullableString(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isAffirmative(value: unknown): boolean {
    if (value === true) {
      return true;
    }

    if (typeof value !== 'string') {
      return false;
    }

    return ['yes', 'y', 'true', 'pilot'].includes(value.trim().toLowerCase());
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
