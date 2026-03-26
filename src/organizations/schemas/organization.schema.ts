import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({
  collection: 'organizations',
  timestamps: true,
  versionKey: false,
})
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true })
  industry?: string;

  @Prop({ trim: true })
  companySize?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  registrationNumber?: string;

  @Prop({ trim: true })
  jurisdiction?: string;

  @Prop({
    required: true,
    enum: Object.values(OrganizationStatus),
    default: OrganizationStatus.PENDING_VERIFICATION,
  })
  status: OrganizationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  primaryAdminUserId?: Types.ObjectId;

  // Early org onboarding implementation: store onboarding answers as JSON.
  @Prop({ type: Object, default: {} })
  onboardingData?: Record<string, unknown>;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
