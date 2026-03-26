import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ShareAccessLogDocument = HydratedDocument<ShareAccessLog>;

@Schema({
  collection: 'share_access_logs',
  timestamps: true,
  versionKey: false,
})
export class ShareAccessLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ShareLink', index: true })
  shareLinkId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId: Types.ObjectId;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ default: Date.now })
  accessedAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ShareAccessLogSchema =
  SchemaFactory.createForClass(ShareAccessLog);
