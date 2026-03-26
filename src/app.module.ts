import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrgOnboardingModule } from './org-onboarding/org-onboarding.module';

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
      ? [DatabaseModule, AuthModule, OnboardingModule, OrgOnboardingModule]
      : []),
    ...(shouldConnectDatabase ? [DashboardModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
