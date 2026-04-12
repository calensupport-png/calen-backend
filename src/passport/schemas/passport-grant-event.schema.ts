import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PassportGrantEventDocument =
  HydratedDocument<PassportGrantEvent>;

@Schema({
  collection: 'passport_grant_events',
  timestamps: true,
  versionKey: false,
})
export class PassportGrantEvent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PassportGrant', index: true })
  passportGrantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization', index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  grantId: string;

  @Prop({
    required: true,
    trim: true,
    enum: ['grant_created', 'grant_revoked', 'grant_accessed'],
  })
  eventType: 'grant_created' | 'grant_revoked' | 'grant_accessed';

  @Prop({
    required: true,
    trim: true,
    enum: ['individual', 'organisation', 'system'],
  })
  actorType: 'individual' | 'organisation' | 'system';

  @Prop({ type: String, trim: true, default: null })
  actorId?: string | null;

  @Prop({ required: true, trim: true })
  organizationName: string;

  @Prop({ required: true, trim: true })
  purpose: string;

  @Prop({
    type: [String],
    enum: ['score', 'verify', 'underwrite_summary', 'full_profile'],
    default: [],
  })
  scopes: Array<'score' | 'verify' | 'underwrite_summary' | 'full_profile'>;

  @Prop({ type: String, trim: true, default: null })
  detail?: string | null;

  @Prop({ type: Date, default: Date.now })
  occurredAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const PassportGrantEventSchema =
  SchemaFactory.createForClass(PassportGrantEvent);

PassportGrantEventSchema.index({ ownerUserId: 1, occurredAt: -1 });
PassportGrantEventSchema.index({ organizationId: 1, occurredAt: -1 });
