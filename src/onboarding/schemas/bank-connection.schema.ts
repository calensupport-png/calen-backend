import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BankConnectionDocument = HydratedDocument<BankConnection>;

@Schema({
  collection: 'bank_connections',
  timestamps: true,
  versionKey: false,
})
export class BankConnection {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  bankId: string;

  @Prop({ required: true, trim: true })
  bankName: string;

  @Prop({ trim: true })
  accountMask?: string;

  @Prop({ trim: true })
  accountType?: string;

  @Prop({ default: 'connected' })
  status: string;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ default: Date.now })
  connectedAt: Date;

  @Prop({ default: Date.now })
  lastSyncedAt: Date;
}

export const BankConnectionSchema =
  SchemaFactory.createForClass(BankConnection);
