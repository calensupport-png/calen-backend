import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IdentityVerificationCaseDocument =
  HydratedDocument<IdentityVerificationCase>;

@Schema({
  collection: 'identity_verification_cases',
  timestamps: true,
  versionKey: false,
})
export class IdentityVerificationCase {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ default: 'mock-kyc-provider' })
  provider: string;

  @Prop({ default: 'pending_review' })
  status: string;

  @Prop()
  documentType?: string;

  @Prop()
  country?: string;

  @Prop({ default: 'pending' })
  livenessStatus: string;

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const IdentityVerificationCaseSchema = SchemaFactory.createForClass(
  IdentityVerificationCase,
);
