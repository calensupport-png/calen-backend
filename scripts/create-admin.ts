import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { AccountsService } from '../src/accounts/accounts.service';
import {
  User,
  UserDocument,
} from '../src/accounts/schemas/user.schema';
import { AccountRole } from '../src/common/enums/account-role.enum';
import { AccountType } from '../src/common/enums/account-type.enum';
import { UserStatus } from '../src/common/enums/user-status.enum';
import { PasswordService } from '../src/auth/password.service';

type CreateAdminOptions = {
  email: string;
  password: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  country?: string;
};

function printUsage(): void {
  console.error(
    [
      'Usage:',
      'npm run admin:create -- --email admin@joincalen.com --password StrongPass123 --name "Calen Admin"',
      '',
      'Optional flags:',
      '--first-name Jane',
      '--last-name Doe',
      '--job-title "Platform Admin"',
      '--country NG',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): CreateAdminOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const email = values.get('email')?.trim().toLowerCase();
  const password = values.get('password')?.trim();
  const name = values.get('name')?.trim();

  if (!email || !password || !name) {
    printUsage();
    throw new Error('email, password, and name are required');
  }

  if (password.length < 8) {
    throw new Error('password must be at least 8 characters long');
  }

  const firstName = values.get('first-name')?.trim();
  const lastName = values.get('last-name')?.trim();

  return {
    email,
    password,
    name,
    firstName,
    lastName,
    jobTitle: values.get('job-title')?.trim(),
    country: values.get('country')?.trim(),
  };
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const accountsService = app.get(AccountsService);
    const passwordService = app.get(PasswordService);
    const userModel =
      app.get<Model<UserDocument>>(getModelToken(User.name));
    const existingUser = await userModel
      .findOne({ email: options.email })
      .select('+passwordHash')
      .exec();

    if (
      existingUser &&
      existingUser.accountType !== AccountType.ADMIN &&
      !existingUser.roles.includes(AccountRole.ADMIN)
    ) {
      throw new Error(
        'That email already belongs to a non-admin account. Use a different email address.',
      );
    }

    const passwordHash = await passwordService.hash(options.password);

    if (existingUser) {
      existingUser.passwordHash = passwordHash;
      existingUser.displayName = options.name;
      existingUser.firstName = options.firstName;
      existingUser.lastName = options.lastName;
      existingUser.jobTitle = options.jobTitle;
      existingUser.country = options.country;
      existingUser.accountType = AccountType.ADMIN;
      existingUser.status = UserStatus.ACTIVE;
      existingUser.emailVerifiedAt = existingUser.emailVerifiedAt ?? new Date();
      existingUser.roles = Array.from(
        new Set([...(existingUser.roles ?? []), AccountRole.ADMIN]),
      );
      await existingUser.save();

      console.log(`Updated admin account for ${existingUser.email}`);
      return;
    }

    const user = await accountsService.createUser({
      email: options.email,
      passwordHash,
      displayName: options.name,
      firstName: options.firstName,
      lastName: options.lastName,
      jobTitle: options.jobTitle,
      country: options.country,
      roles: [AccountRole.ADMIN],
      accountType: AccountType.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    console.log(`Created admin account for ${user.email}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to create admin account: ${message}`);
  process.exitCode = 1;
});
