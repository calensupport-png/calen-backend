import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserSettingsDocument = HydratedDocument<UserSettings>;

@Schema({
  collection: 'user_settings',
  timestamps: true,
  versionKey: false,
})
export class UserSettings {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ default: true })
  marketingEmails: boolean;

  @Prop({ default: true })
  productUpdates: boolean;

  @Prop({ default: true })
  securityAlerts: boolean;

  @Prop({ default: false })
  pushNotifications: boolean;

  @Prop({ default: 'trusted_parties_only' })
  profileVisibility: string;

  @Prop({ default: 'private' })
  shareDefaultAccess: string;
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);
