import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import {
  Notification,
  NotificationSchema,
} from '../dashboard/schemas/notification.schema';
import {
  UserSettings,
  UserSettingsSchema,
} from '../dashboard/schemas/user-settings.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  OrganizationInvitation,
  OrganizationInvitationSchema,
} from '../org-onboarding/schemas/organization-invitation.schema';
import {
  OrganizationVerification,
  OrganizationVerificationSchema,
} from '../org-onboarding/schemas/organization-verification.schema';
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
import {
  MonitoringWebhookDelivery,
  MonitoringWebhookDeliverySchema,
} from '../monitoring/schemas/monitoring-webhook-delivery.schema';
import { OrgDashboardController } from './org-dashboard.controller';
import { OrgDashboardService } from './org-dashboard.service';
import {
  OrganizationPipelineApplicant,
  OrganizationPipelineApplicantSchema,
} from './schemas/organization-pipeline-applicant.schema';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    OrganizationsModule,
    PassportAccessModule,
    ScoresModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: UserSettings.name, schema: UserSettingsSchema },
      {
        name: OrganizationInvitation.name,
        schema: OrganizationInvitationSchema,
      },
      {
        name: OrganizationVerification.name,
        schema: OrganizationVerificationSchema,
      },
      {
        name: OrganizationPipelineApplicant.name,
        schema: OrganizationPipelineApplicantSchema,
      },
      {
        name: OnboardingState.name,
        schema: OnboardingStateSchema,
      },
      {
        name: BankConnection.name,
        schema: BankConnectionSchema,
      },
      {
        name: TrustContact.name,
        schema: TrustContactSchema,
      },
      {
        name: MonitoringWebhookDelivery.name,
        schema: MonitoringWebhookDeliverySchema,
      },
    ]),
  ],
  controllers: [OrgDashboardController],
  providers: [OrgDashboardService],
})
export class OrgDashboardModule {}
