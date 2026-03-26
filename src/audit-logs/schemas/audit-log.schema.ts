import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({
  collection: 'audit_logs',
  timestamps: true,
  versionKey: false,
})
export class AuditLog {
  @Prop({ required: true, trim: true })
  action: string;

  @Prop({ trim: true })
  actorType?: string;

  @Prop({ type: Types.ObjectId })
  actorId?: Types.ObjectId;

  @Prop({ trim: true })
  targetType?: string;

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId;

  @Prop({ trim: true })
  requestId?: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
