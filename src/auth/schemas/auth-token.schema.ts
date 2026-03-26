import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuthTokenDocument = HydratedDocument<AuthToken>;

export type AuthTokenType = 'email_verification' | 'password_reset';

@Schema({
  collection: 'auth_tokens',
  timestamps: true,
  versionKey: false,
})
export class AuthToken {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['email_verification', 'password_reset'],
    index: true,
  })
  type: AuthTokenType;

  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  consumedAt?: Date;
}

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
