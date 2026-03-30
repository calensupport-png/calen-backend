import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OnboardingStateDocument = HydratedDocument<OnboardingState>;

@Schema({
  collection: 'onboarding_states',
  timestamps: true,
  versionKey: false,
})
export class OnboardingState {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, default: null })
  personalProfile?: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  employmentProfile?: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  financialProfile?: Record<string, unknown> | null;

  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  @Prop({ default: 'welcome' })
  currentStep: string;

  @Prop({ default: 'not_started' })
  identityVerificationStatus: string;

  @Prop({ default: 'not_started' })
  scoreStatus: string;

  @Prop()
  scoreRequestedAt?: Date;

  @Prop()
  onboardingCompletedAt?: Date;

  @Prop()
  welcomeEmailSentAt?: Date;

  @Prop({ type: Object, default: null })
  bankAuthState?: {
    state: string;
    bankId?: string;
    returnPath?: string;
    createdAt?: Date;
  } | null;
}

export const OnboardingStateSchema =
  SchemaFactory.createForClass(OnboardingState);
