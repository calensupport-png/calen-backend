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

  @Prop({ required: true })
  score: number;

  @Prop({ required: true, trim: true })
  band: string;

  @Prop({ type: [String], default: [] })
  factors: string[];

  @Prop({ required: true, trim: true })
  status: string;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ default: Date.now })
  generatedAt: Date;
}

export const ScoreSnapshotSchema = SchemaFactory.createForClass(ScoreSnapshot);
