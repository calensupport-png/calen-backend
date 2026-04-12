import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  OnboardingState,
  OnboardingStateSchema,
} from '../onboarding/schemas/onboarding-state.schema';
import {
  BankConnection,
  BankConnectionSchema,
} from '../onboarding/schemas/bank-connection.schema';
import {
  TrustContact,
  TrustContactSchema,
} from '../onboarding/schemas/trust-contact.schema';
import { ScoresModule } from '../scores/scores.module';
import { PassportAccessModule } from '../passport/passport-access.module';
import { VerifyModule } from '../verify/verify.module';
import {
  UnderwritingCase,
  UnderwritingCaseSchema,
} from './schemas/underwriting-case.schema';
import { UnderwritingController } from './underwriting.controller';
import { UnderwritingService } from './underwriting.service';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    OrganizationsModule,
    PassportAccessModule,
    ScoresModule,
    VerifyModule,
    MongooseModule.forFeature([
      { name: UnderwritingCase.name, schema: UnderwritingCaseSchema },
      { name: OnboardingState.name, schema: OnboardingStateSchema },
      { name: BankConnection.name, schema: BankConnectionSchema },
      { name: TrustContact.name, schema: TrustContactSchema },
    ]),
  ],
  controllers: [UnderwritingController],
  providers: [UnderwritingService],
  exports: [UnderwritingService],
})
export class UnderwritingModule {}
