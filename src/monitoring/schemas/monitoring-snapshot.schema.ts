import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MonitoringSnapshotDocument = HydratedDocument<MonitoringSnapshot>;

@Schema({
  collection: 'monitoring_snapshots',
  timestamps: true,
  versionKey: false,
})
export class MonitoringSnapshot {
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
    ref: 'MonitoringEnrollment',
    index: true,
  })
  enrollmentId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  subjectUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  subjectName: string;

  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop({ type: String, trim: true, default: null })
  riskLevel?: string | null;

  @Prop({ type: Number, default: null })
  affordabilityScore?: number | null;

  @Prop({ type: Number, default: null })
  resilienceScore?: number | null;

  @Prop({ type: String, trim: true, default: null })
  confidenceLevel?: string | null;

  @Prop({ type: String, trim: true, default: null })
  debtPressureIndicator?: string | null;

  @Prop({ type: String, trim: true, default: null })
  volatilitySignal?: string | null;

  @Prop({ type: String, trim: true, default: null })
  recommendationOutcome?: string | null;

  @Prop({ type: Number, default: null })
  averageMonthlyInflow?: number | null;

  @Prop({ type: Number, default: null })
  incomeReliabilityScore?: number | null;

  @Prop({ type: Number, default: null })
  obligationConsistencyScore?: number | null;

  @Prop({ type: Number, default: null })
  balanceResilienceScore?: number | null;

  @Prop({ type: Date, default: Date.now, index: true })
  generatedAt: Date;

  @Prop({ type: Date, default: null })
  createdAt?: Date | null;

  @Prop({ type: Date, default: null })
  updatedAt?: Date | null;
}

export const MonitoringSnapshotSchema =
  SchemaFactory.createForClass(MonitoringSnapshot);
