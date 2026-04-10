import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ScoreSnapshot,
  ScoreSnapshotSchema,
} from '../dashboard/schemas/score-snapshot.schema';
import {
  BankConnection,
  BankConnectionSchema,
} from '../onboarding/schemas/bank-connection.schema';
import { ScoreRun, ScoreRunSchema } from './schemas/score-run.schema';
import { ScoresService } from './scores.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankConnection.name, schema: BankConnectionSchema },
      { name: ScoreRun.name, schema: ScoreRunSchema },
      { name: ScoreSnapshot.name, schema: ScoreSnapshotSchema },
    ]),
  ],
  providers: [ScoresService],
  exports: [ScoresService],
})
export class ScoresModule {}

