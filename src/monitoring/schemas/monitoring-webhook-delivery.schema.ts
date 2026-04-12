import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MonitoringWebhookDeliveryDocument =
  HydratedDocument<MonitoringWebhookDelivery>;

@Schema({
  collection: 'monitoring_webhook_deliveries',
  timestamps: true,
  versionKey: false,
})
export class MonitoringWebhookDelivery {
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
    type: Types.ObjectId,
    ref: 'MonitoringAlert',
    default: null,
    index: true,
  })
  alertId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true, unique: true, index: true })
  deliveryId: string;

  @Prop({ required: true, trim: true, index: true })
  eventType: 'monitoring_alert_triggered' | 'monitoring_alert_resolved';

  @Prop({ required: true, trim: true })
  targetUrl: string;

  @Prop({ required: true, trim: true, default: 'failed' })
  status: 'success' | 'failed';

  @Prop({ type: Number, default: null })
  responseStatus?: number | null;

  @Prop({ type: String, trim: true, default: null })
  errorMessage?: string | null;

  @Prop({ type: Date, default: Date.now, index: true })
  attemptedAt: Date;

  @Prop({ type: Date, default: null })
  deliveredAt?: Date | null;

  @Prop({ type: Date, default: null })
  createdAt?: Date | null;

  @Prop({ type: Date, default: null })
  updatedAt?: Date | null;
}

export const MonitoringWebhookDeliverySchema = SchemaFactory.createForClass(
  MonitoringWebhookDelivery,
);
