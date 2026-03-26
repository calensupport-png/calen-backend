import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountRole } from '../common/enums/account-role.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { generateShareId } from '../common/utils/share-id.util';
import { Profile, ProfileDocument } from './schemas/profile.schema';
import { User, UserDocument } from './schemas/user.schema';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  jobTitle?: string;
  roles: AccountRole[];
  accountType: AccountType;
  organizationId?: Types.ObjectId;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
  ) {}

  async assertEmailAvailable(email: string): Promise<void> {
    const existingUser = await this.userModel.exists({
      email: email.trim().toLowerCase(),
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'An account with that email already exists',
      });
    }
  }

  async createUser(input: CreateUserInput): Promise<UserDocument> {
    const user = await this.userModel.create({
      ...input,
      email: input.email.trim().toLowerCase(),
    });

    const profile = await this.profileModel.create({
      userId: user._id,
      accountType: input.accountType,
      shareId: generateShareId(),
    });

    user.profileId = profile._id as Types.ObjectId;
    await user.save();

    return this.findUserByIdOrThrow(String(user._id));
  }

  async findUserByEmailForLogin(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.trim().toLowerCase(),
      })
      .select('+passwordHash')
      .exec();
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.trim().toLowerCase(),
      })
      .populate('organizationId')
      .populate('profileId')
      .exec();
  }

  async findUserByIdOrThrow(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(userId)
      .populate('organizationId')
      .populate('profileId')
      .exec();

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User account was not found',
      });
    }

    return user;
  }

  async markLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      emailVerifiedAt: new Date(),
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
    });
  }

  async updateProfileOnboardingState(
    userId: string,
    input: {
      onboardingStatus: string;
      onboardingCompletedAt?: Date | null;
    },
  ): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('profileId')
      .exec();

    if (!user?.profileId) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'User profile was not found',
      });
    }

    await this.profileModel.findByIdAndUpdate(user.profileId, {
      onboardingStatus: input.onboardingStatus,
      onboardingCompletedAt: input.onboardingCompletedAt ?? null,
    });
  }

  async listUsersByOrganization(
    organizationId: string,
  ): Promise<UserDocument[]> {
    return this.userModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .populate('organizationId')
      .populate('profileId')
      .sort({ createdAt: 1 })
      .exec();
  }
}
