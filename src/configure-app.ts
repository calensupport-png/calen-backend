import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { assignRequestId } from './observability/request-id.middleware';

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const corsOrigin =
    configService.get<string>('CORS_ORIGIN') ?? DEFAULT_CORS_ORIGIN;
  const allowedOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.use(assignRequestId);
  app.useGlobalFilters(new BadRequestExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
}
