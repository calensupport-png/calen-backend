import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import {
  PassportGrant,
  PassportGrantSchema,
} from './schemas/passport-grant.schema';
import { PassportAccessService } from './passport-access.service';

@Module({
  imports: [
    AccountsModule,
    MongooseModule.forFeature([
      { name: PassportGrant.name, schema: PassportGrantSchema },
    ]),
  ],
  providers: [PassportAccessService],
  exports: [PassportAccessService],
})
export class PassportAccessModule {}
