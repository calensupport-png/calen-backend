import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';

interface CreateOrganizationInput {
  name: string;
  industry?: string;
  companySize?: string;
  country?: string;
  website?: string;
  registrationNumber?: string;
  jurisdiction?: string;
}

function slugifyOrganizationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  async createOrganization(
    input: CreateOrganizationInput,
  ): Promise<OrganizationDocument> {
    const baseSlug = slugifyOrganizationName(input.name);
    let candidateSlug = baseSlug;
    let suffix = 1;

    while (
      await this.organizationModel.exists({
        slug: candidateSlug,
      })
    ) {
      suffix += 1;
      candidateSlug = `${baseSlug}-${suffix}`;
      if (suffix > 50) {
        throw new ConflictException({
          code: 'ORGANIZATION_SLUG_CONFLICT',
          message: 'Could not generate a unique organization slug',
        });
      }
    }

    return this.organizationModel.create({
      ...input,
      slug: candidateSlug,
    });
  }

  async assignPrimaryAdmin(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    await this.organizationModel.findByIdAndUpdate(organizationId, {
      primaryAdminUserId: userId,
    });
  }

  async findByIdOrThrow(organizationId: string): Promise<OrganizationDocument> {
    const organization = await this.organizationModel
      .findById(organizationId)
      .exec();

    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization was not found',
      });
    }

    return organization;
  }

  async updateOrganizationProfile(
    organizationId: string,
    updates: Partial<CreateOrganizationInput>,
  ): Promise<OrganizationDocument> {
    const organization = await this.organizationModel.findByIdAndUpdate(
      organizationId,
      updates,
      { new: true },
    );

    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization was not found',
      });
    }

    return organization;
  }

  async updateOnboardingData(
    organizationId: string,
    updates: Record<string, unknown>,
  ): Promise<OrganizationDocument> {
    const organization = await this.findByIdOrThrow(organizationId);
    const currentData = organization.onboardingData ?? {};

    const updated = await this.organizationModel.findByIdAndUpdate(
      organizationId,
      {
        onboardingData: {
          ...currentData,
          ...updates,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization was not found',
      });
    }

    return updated;
  }
}
