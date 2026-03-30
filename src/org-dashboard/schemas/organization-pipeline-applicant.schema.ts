import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationPipelineApplicantDocument =
  HydratedDocument<OrganizationPipelineApplicant>;

@Schema({ _id: false, versionKey: false })
class OrganizationPipelineTrustEndorsement {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, trim: true })
  source: string;

  @Prop({ required: true, trim: true })
  status: 'Verified' | 'Pending';

  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ required: true })
  strength: number;
}

@Schema({ _id: false, versionKey: false })
class OrganizationPipelineScoreFactor {
  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true })
  value: number;
}

@Schema({ _id: false, versionKey: false })
class OrganizationPipelineIndicator {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true })
  value: number;

  @Prop({ required: true, trim: true })
  status: 'excellent' | 'good' | 'watch';
}

@Schema({
  collection: 'organization_pipeline_applicants',
  timestamps: true,
  versionKey: false,
})
export class OrganizationPipelineApplicant {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  applicantId: string;

  @Prop({ required: true, trim: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  annualIncome: number;

  @Prop({ required: true })
  income: number;

  @Prop({ required: true })
  savings: number;

  @Prop({ required: true })
  debt: number;

  @Prop({ required: true })
  trust: number;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ required: true, trim: true })
  industry: string;

  @Prop({ required: true })
  verified: boolean;

  @Prop({ required: true, trim: true })
  product: string;

  @Prop({ required: true, trim: true })
  stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected';

  @Prop({ required: true, trim: true })
  riskLevel: 'Low' | 'Moderate' | 'High';

  @Prop({ type: [OrganizationPipelineTrustEndorsement], default: [] })
  trustEndorsements: OrganizationPipelineTrustEndorsement[];

  @Prop({ type: [OrganizationPipelineScoreFactor], default: [] })
  scoreFactors: OrganizationPipelineScoreFactor[];

  @Prop({ type: [OrganizationPipelineIndicator], default: [] })
  indicators: OrganizationPipelineIndicator[];

  createdAt?: Date;

  updatedAt?: Date;
}

export const OrganizationPipelineApplicantSchema = SchemaFactory.createForClass(
  OrganizationPipelineApplicant,
);

OrganizationPipelineApplicantSchema.index(
  { organizationId: 1, applicantId: 1 },
  { unique: true },
);
