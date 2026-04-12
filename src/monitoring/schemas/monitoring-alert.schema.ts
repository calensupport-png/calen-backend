import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MonitoringAlertDocument = HydratedDocument<MonitoringAlert>;

@Schema({
  collection: 'monitoring_alerts',
  timestamps: true,
  versionKey: false,
})
export class MonitoringAlert {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'MonitoringEnrollment',
    index: true,
  })
  enrollmentId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  subjectUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  calenId: string;

  @Prop({ required: true, trim: true })
  subjectName: string;

  @Prop({ required: true, trim: true, index: true })
  alertType:
    | 'income_decline'
    | 'resilience_decline'
    | 'volatility_rise'
    | 'debt_pressure_increase'
    | 'obligation_stress';

  @Prop({ required: true, trim: true })
  severity: 'Low' | 'Medium' | 'High';

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  detail: string;

  @Prop({ required: true, trim: true, default: 'active' })
  status: 'active' | 'resolved';

  @Prop({ type: String, trim: true, default: null })
  previousValue?: string | null;

  @Prop({ type: String, trim: true, default: null })
  currentValue?: string | null;

  @Prop({ type: Date, default: Date.now, index: true })
  triggeredAt: Date;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  @Prop({ type: Date, default: null })
  createdAt?: Date | null;

  @Prop({ type: Date, default: null })
  updatedAt?: Date | null;
}

export const MonitoringAlertSchema =
  SchemaFactory.createForClass(MonitoringAlert);
