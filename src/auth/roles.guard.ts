import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountRole } from '../common/enums/account-role.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<AccountRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return false;
    }

    const hasRequiredRole = requiredRoles.some((role) => user.roles.includes(role));

    if (hasRequiredRole) {
      return true;
    }

    if (
      requiredRoles.includes(AccountRole.ADMIN) &&
      user.accountType === AccountType.ADMIN
    ) {
      return true;
    }

    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to access this resource',
    });
  }
}
