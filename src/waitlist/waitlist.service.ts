import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model } from 'mongoose';
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

@Injectable()
export class WaitlistService {
  constructor(
    @InjectModel(WaitlistSubmission.name)
    private readonly waitlistSubmissionModel: Model<WaitlistSubmissionDocument>,
  ) {}

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

  private normalizeNullableString(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
