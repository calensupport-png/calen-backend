import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PassportGrantDocument = HydratedDocument<PassportGrant>;

export type PassportScope =
  | 'score'
  | 'verify'
  | 'underwrite_summary'
  | 'full_profile';

@Schema({
  collection: 'passport_grants',
  timestamps: true,
  versionKey: false,
})
export class PassportGrant {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization', index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  grantId: string;

  @Prop({ required: true, trim: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  subjectName: string;

  @Prop({ required: true, trim: true })
  organizationName: string;

  @Prop({ required: true, trim: true })
  organizationSlug: string;

  @Prop({ required: true, trim: true })
  purpose: string;

  @Prop({
    type: [String],
    enum: ['score', 'verify', 'underwrite_summary', 'full_profile'],
    default: [],
  })
  scopes: PassportScope[];

  @Prop({ required: true, trim: true, default: 'active' })
  status: 'active' | 'revoked';

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;

  @Prop({ type: String, trim: true, default: null })
  revocationReason?: string | null;

  @Prop({ required: true, default: 0 })
  accessCount: number;

  @Prop({ type: Date, default: null })
  lastAccessedAt?: Date | null;

  createdAt?: Date;

  updatedAt?: Date;
}

export const PassportGrantSchema =
  SchemaFactory.createForClass(PassportGrant);

PassportGrantSchema.index({
  ownerUserId: 1,
  organizationId: 1,
  createdAt: -1,
});
