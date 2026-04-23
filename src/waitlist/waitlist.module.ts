import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WaitlistController } from './waitlist.controller';
import {
  WaitlistSubmission,
  WaitlistSubmissionSchema,
} from './schemas/waitlist-submission.schema';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WaitlistSubmission.name,
        schema: WaitlistSubmissionSchema,
      },
    ]),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
