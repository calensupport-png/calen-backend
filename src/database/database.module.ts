import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const logger = new Logger('MongoDB');

function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.getOrThrow<string>('MONGODB_URI');
        const dbName = configService.get<string>('MONGODB_DB_NAME');

        return {
          uri,
          ...(dbName ? { dbName } : {}),
          serverSelectionTimeoutMS: 5000,
          connectionFactory: (connection: Connection) => {
            const connectionTarget = dbName
              ? `${redactMongoUri(uri)} / ${dbName}`
              : redactMongoUri(uri);

            connection.on('connected', () => {
              logger.log(`Connected to ${connectionTarget}`);
            });
            connection.on('disconnected', () => {
              logger.warn('Disconnected from MongoDB');
            });
            connection.on('reconnected', () => {
              logger.log('Reconnected to MongoDB');
            });
            connection.on('error', (error) => {
              logger.error(`MongoDB connection error: ${error.message}`);
            });

            return connection;
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
