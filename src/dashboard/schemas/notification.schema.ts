import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({
  collection: 'notifications',
  timestamps: true,
  versionKey: false,
})
export class Notification {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  body: string;

  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;

  @Prop()
  readAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
