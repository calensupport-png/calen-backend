import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationInvitationDocument =
  HydratedDocument<OrganizationInvitation>;

@Schema({
  collection: 'organization_invitations',
  timestamps: true,
  versionKey: false,
})
export class OrganizationInvitation {
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
    ref: 'User',
  })
  invitedByUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ trim: true })
  jobTitle?: string;

  @Prop({ required: true, trim: true })
  token: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const OrganizationInvitationSchema = SchemaFactory.createForClass(
  OrganizationInvitation,
);
