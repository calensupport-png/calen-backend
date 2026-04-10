import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EmailModule } from '../email/email.module';
import { ScoresModule } from '../scores/scores.module';
import {
  BankConnection,
  BankConnectionSchema,
} from './schemas/bank-connection.schema';
import {
  IdentityVerificationCase,
  IdentityVerificationCaseSchema,
} from './schemas/identity-verification-case.schema';
import {
  OnboardingState,
  OnboardingStateSchema,
} from './schemas/onboarding-state.schema';
import {
  TrustContact,
  TrustContactSchema,
} from './schemas/trust-contact.schema';
import {
  UploadedDocument,
  UploadedDocumentSchema,
} from './schemas/uploaded-document.schema';
import { OnboardingController } from './onboarding.controller';
import { PublicTrustRequestController } from './public-trust-request.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    DashboardModule,
    EmailModule,
    ScoresModule,
    MongooseModule.forFeature([
      { name: OnboardingState.name, schema: OnboardingStateSchema },
      {
        name: IdentityVerificationCase.name,
        schema: IdentityVerificationCaseSchema,
      },
      { name: UploadedDocument.name, schema: UploadedDocumentSchema },
      { name: BankConnection.name, schema: BankConnectionSchema },
      { name: TrustContact.name, schema: TrustContactSchema },
    ]),
  ],
  controllers: [OnboardingController, PublicTrustRequestController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
