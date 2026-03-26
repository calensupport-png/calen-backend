import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationVerificationDocument =
  HydratedDocument<OrganizationVerification>;

@Schema({
  collection: 'organization_verifications',
  timestamps: true,
  versionKey: false,
})
export class OrganizationVerification {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ default: 'mock-kyb-provider' })
  provider: string;

  @Prop({ default: 'pending_review' })
  status: string;

  @Prop({ trim: true })
  documentType?: string;

  @Prop({ trim: true })
  referenceNumber?: string;

  @Prop({ trim: true })
  supportingDocumentUrl?: string;

  @Prop({ default: Date.now })
  submittedAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const OrganizationVerificationSchema = SchemaFactory.createForClass(
  OrganizationVerification,
);
