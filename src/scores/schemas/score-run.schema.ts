import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScoreRunDocument = HydratedDocument<ScoreRun>;

@Schema({
  collection: 'score_runs',
  timestamps: true,
  versionKey: false,
})
export class ScoreRun {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop({ type: Number, default: null })
  composite?: number | null;

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({ type: String, trim: true, default: null })
  bandKey?: string | null;

  @Prop({ type: String, trim: true, default: null })
  orgLabel?: string | null;

  @Prop({ type: String, trim: true, default: null })
  userLabel?: string | null;

  @Prop({
    type: Object,
    default: {
      score: 0,
      level: 'low',
    },
  })
  confidence: {
    score: number;
    level: string;
  };

  @Prop({ required: true, trim: true })
  engineVersion: string;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ type: [String], default: [] })
  reasonCodes: string[];

  @Prop({ type: [String], default: [] })
  explanationSummary: string[];

  @Prop({ type: [Object], default: [] })
  anomalyFlags: Array<{
    code: string;
    severity: string;
    detail?: string;
  }>;

  @Prop({
    type: Object,
    default: {
      startDate: null,
      endDate: null,
      observedDays: 0,
      observedMonths: 0,
      transactionCount: 0,
      connectionCount: 0,
    },
  })
  inputWindow: {
    startDate: Date | null;
    endDate: Date | null;
    observedDays: number;
    observedMonths: number;
    transactionCount: number;
    connectionCount: number;
  };

  @Prop({ type: [Object], default: [] })
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    metrics: Record<string, number | null>;
    reasons: string[];
  }>;

  @Prop({ type: [Types.ObjectId], default: [] })
  sourceConnectionIds: Types.ObjectId[];

  @Prop({ default: Date.now, index: true })
  generatedAt: Date;
}

export const ScoreRunSchema = SchemaFactory.createForClass(ScoreRun);
