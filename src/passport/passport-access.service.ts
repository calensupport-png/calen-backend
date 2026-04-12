import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountType } from '../common/enums/account-type.enum';
import {
  PassportGrant,
  PassportGrantDocument,
  PassportScope,
} from './schemas/passport-grant.schema';

type AccessibleAccount = Awaited<
  ReturnType<AccountsService['findIndividualByShareId']>
>;

@Injectable()
export class PassportAccessService {
  constructor(
    private readonly accountsService: AccountsService,
    @InjectModel(PassportGrant.name)
    private readonly passportGrantModel: Model<PassportGrantDocument>,
  ) {}

  async findAccessibleIndividualByShareId(
    user: AuthenticatedUser,
    calenId: string,
    requiredScopes: PassportScope[] = [],
  ): Promise<AccessibleAccount> {
    this.assertOrganization(user);
    const normalizedCalenId = calenId.trim().toUpperCase();

    if (!normalizedCalenId) {
      return null;
    }

    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      return null;
    }

    const grant = await this.findActiveGrant(
      String(account._id),
      user.organizationId!,
      requiredScopes,
    );

    return grant ? account : null;
  }

  async assertAccessibleIndividualByShareId(
    user: AuthenticatedUser,
    calenId: string,
    requiredScopes: PassportScope[] = [],
  ) {
    this.assertOrganization(user);
    const normalizedCalenId = calenId.trim().toUpperCase();
    const account = await this.accountsService.findIndividualByShareId(
      normalizedCalenId,
    );

    if (!account) {
      throw new NotFoundException({
        code: 'PASSPORT_PROFILE_NOT_FOUND',
        message: 'No CALEN profile matched that identifier.',
      });
    }

    const grant = await this.findActiveGrant(
      String(account._id),
      user.organizationId!,
      requiredScopes,
    );

    if (!grant) {
      throw new ForbiddenException({
        code: 'PASSPORT_ACCESS_REQUIRED',
        message:
          'An active Passport grant is required before this organisation can access that CALEN profile.',
      });
    }

    return account;
  }

  private async findActiveGrant(
    ownerUserId: string,
    organizationId: string,
    requiredScopes: PassportScope[],
  ) {
    const scopeFilter =
      requiredScopes.length > 0
        ? {
            scopes: {
              $in: Array.from(new Set(['full_profile', ...requiredScopes])),
            },
          }
        : {};

    return this.passportGrantModel
      .findOne({
        ownerUserId: this.toObjectId(ownerUserId),
        organizationId: this.toObjectId(organizationId),
        status: 'active',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        ...scopeFilter,
      })
      .sort({ createdAt: -1 });
  }

  private assertOrganization(user: AuthenticatedUser) {
    if (user.accountType !== AccountType.ORGANISATION || !user.organizationId) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_REQUIRED',
        message: 'This route is only available to organization accounts.',
      });
    }
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }
}
