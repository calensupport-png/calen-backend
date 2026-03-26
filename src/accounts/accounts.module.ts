import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsService } from './accounts.service';
import { Profile, ProfileSchema } from './schemas/profile.schema';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  providers: [AccountsService],
  exports: [AccountsService, MongooseModule],
})
export class AccountsModule {}
