import {
  INestApplication,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { assignRequestId } from './observability/request-id.middleware';

const DEFAULT_CORS_ORIGIN =
  'http://localhost:5173,https://joincalen.com,https://www.joincalen.com';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseAllowedOrigins(corsOrigin?: string): string[] {
  return (corsOrigin ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

export function isOriginAllowed(
  requestOrigin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!requestOrigin) {
    return true;
  }

  return allowedOrigins.includes(normalizeOrigin(requestOrigin));
}

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const logger = new Logger('CORS');
  const allowedOrigins = parseAllowedOrigins(
    configService.get<string>('CORS_ORIGIN'),
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (isOriginAllowed(requestOrigin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      logger.warn(`Rejected origin: ${requestOrigin ?? 'unknown'}`);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  logger.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
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
