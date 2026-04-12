import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MonitoringEnrollmentDocument =
  HydratedDocument<MonitoringEnrollment>;

@Schema({ _id: false, versionKey: false })
class MonitoringConsentLinkage {
  @Prop({ type: String, trim: true, default: null })
  grantId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  purpose?: string | null;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;
}

@Schema({ _id: false, versionKey: false })
class MonitoringUnderwritingLinkage {
  @Prop({ type: String, trim: true, default: null })
  caseId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  recommendationOutcome?: string | null;

  @Prop({ type: String, trim: true, default: null })
  stage?: string | null;
}

@Schema({ _id: false, versionKey: false })
class MonitoringBaselineSnapshot {
  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop({ type: String, trim: true, default: null })
  riskLevel?: string | null;

  @Prop({ type: String, trim: true, default: null })
  underwritingOutcome?: string | null;

  @Prop({ type: Number, default: null })
  affordabilityScore?: number | null;

  @Prop({ type: Number, default: null })
  resilienceScore?: number | null;

  @Prop({ type: String, trim: true, default: null })
  confidenceLevel?: string | null;
}

@Schema({
  collection: 'monitoring_enrollments',
  timestamps: true,
  versionKey: false,
})
export class MonitoringEnrollment {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  subjectUserId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
  })
  enrolledByUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  enrollmentId: string;

  @Prop({ required: true, trim: true, index: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  subjectName: string;

  @Prop({ required: true, trim: true, default: 'active' })
  status: 'active' | 'paused' | 'ended';

  @Prop({ required: true, trim: true })
  source: 'underwriting_approval' | 'passport_consent';

  @Prop({ type: MonitoringConsentLinkage, default: null })
  consentLinkage?: MonitoringConsentLinkage | null;

  @Prop({ type: MonitoringUnderwritingLinkage, default: null })
  underwritingLinkage?: MonitoringUnderwritingLinkage | null;

  @Prop({ type: MonitoringBaselineSnapshot, default: {} })
  baseline: MonitoringBaselineSnapshot;

  @Prop({ type: Date, default: Date.now })
  enrolledAt: Date;

  @Prop({ type: Date, default: null })
  createdAt?: Date | null;

  @Prop({ type: Date, default: null })
  updatedAt?: Date | null;
}

export const MonitoringEnrollmentSchema = SchemaFactory.createForClass(
  MonitoringEnrollment,
);
