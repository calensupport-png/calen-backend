import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  OrganizationInvitation,
  OrganizationInvitationSchema,
} from './schemas/organization-invitation.schema';
import {
  OrganizationVerification,
  OrganizationVerificationSchema,
} from './schemas/organization-verification.schema';
import { OrgOnboardingController } from './org-onboarding.controller';
import { OrgOnboardingService } from './org-onboarding.service';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    EmailModule,
    OrganizationsModule,
    MongooseModule.forFeature([
      {
        name: OrganizationInvitation.name,
        schema: OrganizationInvitationSchema,
      },
      {
        name: OrganizationVerification.name,
        schema: OrganizationVerificationSchema,
      },
    ]),
  ],
  controllers: [OrgOnboardingController],
  providers: [OrgOnboardingService],
})
export class OrgOnboardingModule {}
