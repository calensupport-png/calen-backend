import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UploadedDocumentDocument = HydratedDocument<UploadedDocument>;

@Schema({
  collection: 'uploaded_documents',
  timestamps: true,
  versionKey: false,
})
export class UploadedDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'IdentityVerificationCase' })
  verificationCaseId?: Types.ObjectId;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop()
  side?: string;
}

export const UploadedDocumentSchema =
  SchemaFactory.createForClass(UploadedDocument);
