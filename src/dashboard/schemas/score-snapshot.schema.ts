import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScoreSnapshotDocument = HydratedDocument<ScoreSnapshot>;

@Schema({
  collection: 'score_snapshots',
  timestamps: true,
  versionKey: false,
})
export class ScoreSnapshot {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop({ type: String, trim: true, default: null })
  band?: string | null;

  @Prop({ type: [String], default: [] })
  factors: string[];

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ type: String, trim: true, default: null })
  confidenceLevel?: string | null;

  @Prop({ type: String, trim: true, default: null })
  scoreRunId?: string | null;

  @Prop({ default: Date.now })
  generatedAt: Date;
}

export const ScoreSnapshotSchema = SchemaFactory.createForClass(ScoreSnapshot);
