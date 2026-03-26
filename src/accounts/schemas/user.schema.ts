import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AccountRole } from '../../common/enums/account-role.enum';
import { AccountType } from '../../common/enums/account-type.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: 'users',
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  jobTitle?: string;

  @Prop({
    type: [String],
    enum: Object.values(AccountRole),
    default: [],
  })
  roles: AccountRole[];

  @Prop({
    required: true,
    enum: Object.values(AccountType),
  })
  accountType: AccountType;

  @Prop({
    required: true,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Prop()
  emailVerifiedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  organizationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  profileId?: Types.ObjectId;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
