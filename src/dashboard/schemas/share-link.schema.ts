import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ShareLinkDocument = HydratedDocument<ShareLink>;

@Schema({
  collection: 'share_links',
  timestamps: true,
  versionKey: false,
})
export class ShareLink {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  token: string;

  @Prop({ trim: true })
  label?: string;

  @Prop({ trim: true })
  purpose?: string;

  @Prop({ default: 'active' })
  status: string;

  @Prop()
  expiresAt?: Date;

  @Prop()
  revokedAt?: Date;

  @Prop({ default: 0 })
  accessCount: number;

  @Prop()
  lastAccessedAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ShareLinkSchema = SchemaFactory.createForClass(ShareLink);
