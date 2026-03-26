import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({
  collection: 'sessions',
  timestamps: true,
  versionKey: false,
})
export class Session {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  sessionId: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  lastActivityAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
