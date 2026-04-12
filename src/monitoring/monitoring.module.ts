import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import {
  BankConnection,
  BankConnectionSchema,
} from '../onboarding/schemas/bank-connection.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  PassportGrant,
  PassportGrantSchema,
} from '../passport/schemas/passport-grant.schema';
import { ScoresModule } from '../scores/scores.module';
import {
  UnderwritingCase,
  UnderwritingCaseSchema,
} from '../underwriting/schemas/underwriting-case.schema';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import {
  MonitoringAlert,
  MonitoringAlertSchema,
} from './schemas/monitoring-alert.schema';
import {
  MonitoringEnrollment,
  MonitoringEnrollmentSchema,
} from './schemas/monitoring-enrollment.schema';
import {
  MonitoringSnapshot,
  MonitoringSnapshotSchema,
} from './schemas/monitoring-snapshot.schema';
import {
  MonitoringWebhookDelivery,
  MonitoringWebhookDeliverySchema,
} from './schemas/monitoring-webhook-delivery.schema';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    DashboardModule,
    OrganizationsModule,
    ScoresModule,
    MongooseModule.forFeature([
      {
        name: MonitoringEnrollment.name,
        schema: MonitoringEnrollmentSchema,
      },
      { name: MonitoringSnapshot.name, schema: MonitoringSnapshotSchema },
      { name: MonitoringAlert.name, schema: MonitoringAlertSchema },
      {
        name: MonitoringWebhookDelivery.name,
        schema: MonitoringWebhookDeliverySchema,
      },
      { name: UnderwritingCase.name, schema: UnderwritingCaseSchema },
      { name: PassportGrant.name, schema: PassportGrantSchema },
      { name: BankConnection.name, schema: BankConnectionSchema },
    ]),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
