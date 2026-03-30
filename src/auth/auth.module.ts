import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { StringValue } from 'ms';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { AuthToken, AuthTokenSchema } from './schemas/auth-token.schema';
import { Session, SessionSchema } from './schemas/session.schema';

@Module({
  imports: [
    ConfigModule,
    AccountsModule,
    OrganizationsModule,
    AuditLogsModule,
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_EXPIRES_IN',
          ) as StringValue,
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtAuthGuard],
  exports: [AuthService, PasswordService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
