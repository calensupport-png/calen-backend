import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WaitlistAudience } from '../waitlist-audience.enum';

export type WaitlistSubmissionDocument = HydratedDocument<WaitlistSubmission>;

@Schema({ _id: false, versionKey: false })
class WaitlistRequestMetadata {
  @Prop({ type: String, trim: true, default: null })
  requestId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  ipAddress?: string | null;

  @Prop({ type: String, trim: true, default: null })
  userAgent?: string | null;

  @Prop({ type: String, trim: true, default: null })
  referer?: string | null;

  @Prop({ type: String, trim: true, default: null })
  origin?: string | null;
}

@Schema({
  collection: 'waitlist_submissions',
  timestamps: true,
  versionKey: false,
})
export class WaitlistSubmission {
  @Prop({ required: true, trim: true, unique: true, index: true })
  submissionId: string;

  @Prop({
    required: true,
    enum: Object.values(WaitlistAudience),
    index: true,
  })
  audience: WaitlistAudience;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  normalizedEmail: string;

  @Prop({ type: String, trim: true, default: null })
  country?: string | null;

  @Prop({ type: String, trim: true, default: null })
  phoneNumber?: string | null;

  @Prop({ type: String, trim: true, default: null })
  organizationName?: string | null;

  @Prop({ type: String, trim: true, default: null })
  organizationType?: string | null;

  @Prop({ type: String, trim: true, default: null })
  referralCode?: string | null;

  @Prop({ type: String, trim: true, default: null })
  submissionPath?: string | null;

  @Prop({ type: Number, default: 1 })
  submissionCount: number;

  @Prop({ type: Date, default: Date.now })
  firstSubmittedAt: Date;

  @Prop({ type: Date, default: Date.now })
  lastSubmittedAt: Date;

  @Prop({ type: Object, default: {} })
  data: Record<string, unknown>;

  @Prop({ type: WaitlistRequestMetadata, default: {} })
  requestMetadata?: WaitlistRequestMetadata;

  @Prop({ type: Date, default: null })
  createdAt?: Date | null;

  @Prop({ type: Date, default: null })
  updatedAt?: Date | null;
}

export const WaitlistSubmissionSchema =
  SchemaFactory.createForClass(WaitlistSubmission);

WaitlistSubmissionSchema.index(
  { audience: 1, normalizedEmail: 1 },
  { unique: true, name: 'waitlist_audience_email_unique' },
);
