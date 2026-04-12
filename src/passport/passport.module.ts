import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import {
  OnboardingState,
  OnboardingStateSchema,
} from '../onboarding/schemas/onboarding-state.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ScoresModule } from '../scores/scores.module';
import { VerifyModule } from '../verify/verify.module';
import { PassportController } from './passport.controller';
import { PassportService } from './passport.service';
import {
  PassportGrant,
  PassportGrantSchema,
} from './schemas/passport-grant.schema';
import {
  PassportGrantEvent,
  PassportGrantEventSchema,
} from './schemas/passport-grant-event.schema';
import {
  UnderwritingCase,
  UnderwritingCaseSchema,
} from '../underwriting/schemas/underwriting-case.schema';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    OrganizationsModule,
    ScoresModule,
    VerifyModule,
    MongooseModule.forFeature([
      { name: PassportGrant.name, schema: PassportGrantSchema },
      { name: PassportGrantEvent.name, schema: PassportGrantEventSchema },
      { name: OnboardingState.name, schema: OnboardingStateSchema },
      { name: UnderwritingCase.name, schema: UnderwritingCaseSchema },
    ]),
  ],
  controllers: [PassportController],
  providers: [PassportService],
  exports: [PassportService],
})
export class PassportModule {}
