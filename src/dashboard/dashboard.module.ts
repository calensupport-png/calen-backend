import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ScoresModule } from '../scores/scores.module';
import { Session, SessionSchema } from '../auth/schemas/session.schema';
import {
  BankConnection,
  BankConnectionSchema,
} from '../onboarding/schemas/bank-connection.schema';
import {
  OnboardingState,
  OnboardingStateSchema,
} from '../onboarding/schemas/onboarding-state.schema';
import {
  TrustContact,
  TrustContactSchema,
} from '../onboarding/schemas/trust-contact.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { NotificationsService } from './notifications.service';
import { PublicShareLinksController } from './public-share-links.controller';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import {
  ReferralEvent,
  ReferralEventSchema,
} from './schemas/referral-event.schema';
import {
  ShareAccessLog,
  ShareAccessLogSchema,
} from './schemas/share-access-log.schema';
import { ShareLink, ShareLinkSchema } from './schemas/share-link.schema';
import {
  UserSettings,
  UserSettingsSchema,
} from './schemas/user-settings.schema';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    EmailModule,
    ScoresModule,
    MongooseModule.forFeature([
      { name: OnboardingState.name, schema: OnboardingStateSchema },
      { name: BankConnection.name, schema: BankConnectionSchema },
      { name: TrustContact.name, schema: TrustContactSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: UserSettings.name, schema: UserSettingsSchema },
      { name: ShareLink.name, schema: ShareLinkSchema },
      { name: ShareAccessLog.name, schema: ShareAccessLogSchema },
      { name: ReferralEvent.name, schema: ReferralEventSchema },
    ]),
  ],
  controllers: [DashboardController, PublicShareLinksController],
  providers: [DashboardService, NotificationsService],
  exports: [NotificationsService],
})
export class DashboardModule {}
