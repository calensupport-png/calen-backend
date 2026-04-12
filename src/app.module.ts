import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrgDashboardModule } from './org-dashboard/org-dashboard.module';
import { OrgOnboardingModule } from './org-onboarding/org-onboarding.module';
import { PassportModule } from './passport/passport.module';
import { ScoresModule } from './scores/scores.module';
import { UnderwritingModule } from './underwriting/underwriting.module';
import { VerifyModule } from './verify/verify.module';

const shouldConnectDatabase = process.env.NODE_ENV !== 'test';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    ...(shouldConnectDatabase
      ? [
          DatabaseModule,
          DashboardModule,
          MonitoringModule,
          AuthModule,
          ScoresModule,
          OnboardingModule,
          OrgOnboardingModule,
          OrgDashboardModule,
          PassportModule,
          UnderwritingModule,
          VerifyModule,
        ]
      : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
