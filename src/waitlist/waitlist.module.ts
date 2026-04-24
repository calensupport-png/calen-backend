import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { AdminWaitlistController } from './admin-waitlist.controller';
import { WaitlistController } from './waitlist.controller';
import {
  WaitlistSubmission,
  WaitlistSubmissionSchema,
} from './schemas/waitlist-submission.schema';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    MongooseModule.forFeature([
      {
        name: WaitlistSubmission.name,
        schema: WaitlistSubmissionSchema,
      },
    ]),
  ],
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
