import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VerificationSnapshotDocument =
  HydratedDocument<VerificationSnapshot>;

@Schema({ _id: false, versionKey: false })
class VerificationEvidence {
  @Prop({ required: true, trim: true, default: 'not_started' })
  identityVerificationStatus: string;

  @Prop({ required: true, default: 0 })
  completedStepCount: number;

  @Prop({ required: true, default: 0 })
  connectedAccountCount: number;

  @Prop({ required: true, default: 0 })
  activeAccountCount: number;

  @Prop({ type: Date, default: null })
  mostRecentBankSyncAt?: Date | null;

  @Prop({ required: true, default: 0 })
  observedMonths: number;

  @Prop({ required: true, default: 0 })
  transactionCount: number;

  @Prop({ type: [String], default: [] })
  bankProviders: string[];
}

@Schema({
  collection: 'verification_snapshots',
  timestamps: true,
  versionKey: false,
})
export class VerificationSnapshot {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  subjectName: string;

  @Prop({ required: true, trim: true, default: 'v1.phase2' })
  engineVersion: string;

  @Prop({
    required: true,
    trim: true,
    enum: ['verified', 'likely_verified', 'unverified'],
  })
  accountAuthenticityStatus: 'verified' | 'likely_verified' | 'unverified';

  @Prop({ required: true, trim: true, enum: ['high', 'moderate', 'low'] })
  ownershipConfidence: 'high' | 'moderate' | 'low';

  @Prop({ required: true, default: 0 })
  ownershipConfidenceScore: number;

  @Prop({
    required: true,
    trim: true,
    enum: ['active', 'limited_activity', 'inactive'],
  })
  activeAccountStatus: 'active' | 'limited_activity' | 'inactive';

  @Prop({
    required: true,
    trim: true,
    enum: ['confirmed', 'partially_confirmed', 'not_confirmed'],
  })
  incomePatternConfirmation:
    | 'confirmed'
    | 'partially_confirmed'
    | 'not_confirmed';

  @Prop({
    required: true,
    trim: true,
    enum: ['consistent', 'mixed', 'inconsistent'],
  })
  cashflowConsistencyIndicator: 'consistent' | 'mixed' | 'inconsistent';

  @Prop({ required: true, trim: true, enum: ['high', 'moderate', 'low'] })
  dataQuality: 'high' | 'moderate' | 'low';

  @Prop({ required: true, trim: true, enum: ['high', 'moderate', 'low'] })
  confidenceLevel: 'high' | 'moderate' | 'low';

  @Prop({ type: Number, default: null })
  confidenceScore?: number | null;

  @Prop({
    required: true,
    trim: true,
    enum: ['verified', 'verified_with_caution', 'unable_to_verify'],
  })
  verificationOutcome:
    | 'verified'
    | 'verified_with_caution'
    | 'unable_to_verify';

  @Prop({ type: String, trim: true, default: null })
  summary?: string | null;

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  cautionFlags: string[];

  @Prop({ type: VerificationEvidence, required: true })
  evidence: VerificationEvidence;

  @Prop({ type: Date, default: Date.now })
  generatedAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const VerificationSnapshotSchema =
  SchemaFactory.createForClass(VerificationSnapshot);

VerificationSnapshotSchema.index({ userId: 1, generatedAt: -1 });
VerificationSnapshotSchema.index({ calenId: 1, generatedAt: -1 });
