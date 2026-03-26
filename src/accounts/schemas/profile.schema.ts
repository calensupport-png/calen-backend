import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';

export type ProfileDocument = HydratedDocument<Profile>;

@Schema({
  collection: 'profiles',
  timestamps: true,
  versionKey: false,
})
export class Profile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(AccountType),
  })
  accountType: AccountType;

  @Prop({ required: true, unique: true, trim: true })
  shareId: string;

  @Prop({ default: 'not_started' })
  onboardingStatus: string;

  @Prop()
  onboardingCompletedAt?: Date;

  // Early onboarding implementation stores structured onboarding answers
  // as JSON so the frontend can persist step-by-step while we evolve schemas.
  @Prop({ type: Object, default: {} })
  onboardingData?: Record<string, unknown>;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
