import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountsService } from '../accounts/accounts.service';
import { mongooseRefId } from '../common/utils/mongoose-ref.util';
import { AccountRole } from '../common/enums/account-role.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

interface JwtPayload {
  sub: string;
  email: string;
  accountType: AccountType;
  roles: AccountRole[];
  organizationId?: string;
  sid: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeader = request.header('authorization');

    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_AUTH_TOKEN',
        message: 'Authorization bearer token is required',
      });
    }

    const token = authorizationHeader.replace('Bearer ', '').trim();

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const user = await this.accountsService.findUserByIdOrThrow(payload.sub);
      request.user = {
        id: String(user._id),
        email: user.email,
        accountType: user.accountType,
        roles: user.roles,
        organizationId: mongooseRefId(user.organizationId),
        sessionId: payload.sid,
      };

      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_AUTH_TOKEN',
        message: 'The provided auth token is invalid or expired',
      });
    }
  }
}
