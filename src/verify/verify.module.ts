import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import {
  BankConnection,
  BankConnectionSchema,
} from '../onboarding/schemas/bank-connection.schema';
import {
  IdentityVerificationCase,
  IdentityVerificationCaseSchema,
} from '../onboarding/schemas/identity-verification-case.schema';
import {
  OnboardingState,
  OnboardingStateSchema,
} from '../onboarding/schemas/onboarding-state.schema';
import { ScoresModule } from '../scores/scores.module';
import { PassportAccessModule } from '../passport/passport-access.module';
import {
  VerificationSnapshot,
  VerificationSnapshotSchema,
} from './schemas/verification-snapshot.schema';
import { AuthModule } from '../auth/auth.module';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    PassportAccessModule,
    ScoresModule,
    MongooseModule.forFeature([
      { name: VerificationSnapshot.name, schema: VerificationSnapshotSchema },
      { name: OnboardingState.name, schema: OnboardingStateSchema },
      {
        name: IdentityVerificationCase.name,
        schema: IdentityVerificationCaseSchema,
      },
      { name: BankConnection.name, schema: BankConnectionSchema },
    ]),
  ],
  controllers: [VerifyController],
  providers: [VerifyService],
  exports: [VerifyService],
})
export class VerifyModule {}
