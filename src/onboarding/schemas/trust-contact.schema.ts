import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrustContactDocument = HydratedDocument<TrustContact>;

@Schema({
  collection: 'trust_contacts',
  timestamps: true,
  versionKey: false,
})
export class TrustContact {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ required: true, trim: true })
  relationship: string;

  @Prop({ default: 'draft' })
  status: string;

  @Prop()
  requestToken?: string;

  @Prop()
  requestedAt?: Date;

  @Prop()
  respondedAt?: Date;

  @Prop()
  declinedAt?: Date;

  @Prop({ trim: true })
  responseRelationship?: string;

  @Prop()
  responseYearsKnown?: number;

  @Prop()
  responseTrustLevel?: number;

  @Prop({ trim: true })
  responseNote?: string;
}

export const TrustContactSchema = SchemaFactory.createForClass(TrustContact);
