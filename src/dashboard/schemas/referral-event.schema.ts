import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReferralEventDocument = HydratedDocument<ReferralEvent>;

@Schema({
  collection: 'referral_events',
  timestamps: true,
  versionKey: false,
})
export class ReferralEvent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  referralCode: string;

  @Prop({ trim: true })
  inviteeEmail?: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ default: 'not_earned' })
  rewardStatus: string;

  @Prop({ trim: true })
  source?: string;

  @Prop({ trim: true })
  note?: string;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ReferralEventSchema = SchemaFactory.createForClass(ReferralEvent);
