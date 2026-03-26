import { AccountRole } from '../../common/enums/account-role.enum';
import { AccountType } from '../../common/enums/account-type.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  accountType: AccountType;
  roles: AccountRole[];
  organizationId?: string;
  sessionId: string;
}
