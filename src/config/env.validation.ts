type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  CORS_ORIGIN: string;
  MONGODB_URI: string;
  MONGODB_DB_NAME?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  SWAGGER_PATH: string;
  APP_BASE_URL?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM_ADDRESS?: string;
  PLATFORM_EMAIL_FROM_ADDRESS?: string;
  EMAIL_REPLY_TO?: string;
  TRUELAYER_CLIENT_ID?: string;
  TRUELAYER_CLIENT_SECRET?: string;
  TRUELAYER_REDIRECT_URI?: string;
  TRUELAYER_AUTH_BASE_URL?: string;
  TRUELAYER_API_BASE_URL?: string;
  TRUELAYER_SCOPES?: string;
  TRUELAYER_PROVIDER_COUNTRY_CODE?: string;
}

const DEFAULTS: EnvironmentVariables = {
  NODE_ENV: 'development',
  PORT: 3000,
  CORS_ORIGIN:
    'http://localhost:5173,https://joincalen.com,https://www.joincalen.com',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/calen',
  JWT_SECRET: 'calen-dev-secret-change-me',
  JWT_EXPIRES_IN: '1h',
  SWAGGER_PATH: 'docs',
  APP_BASE_URL: 'http://localhost:8080',
  AUTH_EMAIL_FROM_ADDRESS: 'CALEN <noreply@joincalen.com>',
  PLATFORM_EMAIL_FROM_ADDRESS: 'Phoebe from Calen <noreply@joincalen.com>',
  TRUELAYER_AUTH_BASE_URL: 'https://auth.truelayer.com',
  TRUELAYER_API_BASE_URL: 'https://api.truelayer.com',
  TRUELAYER_SCOPES:
    'info accounts balance transactions cards direct_debits standing_orders offline_access',
};

function parsePort(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULTS.PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port number');
  }

  return port;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnvRaw = String(config.NODE_ENV ?? DEFAULTS.NODE_ENV);
  const validNodeEnvironments: NodeEnvironment[] = [
    'development',
    'test',
    'production',
  ];

  if (!validNodeEnvironments.includes(nodeEnvRaw as NodeEnvironment)) {
    throw new Error(
      `NODE_ENV must be one of: ${validNodeEnvironments.join(', ')}`,
    );
  }

  const mongodbUri = String(config.MONGODB_URI ?? DEFAULTS.MONGODB_URI).trim();
  if (!mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  const jwtSecret = String(config.JWT_SECRET ?? DEFAULTS.JWT_SECRET).trim();
  if (jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters long');
  }

  const jwtExpiresIn = String(
    config.JWT_EXPIRES_IN ?? DEFAULTS.JWT_EXPIRES_IN,
  ).trim();
  if (!jwtExpiresIn) {
    throw new Error('JWT_EXPIRES_IN is required');
  }

  return {
    NODE_ENV: nodeEnvRaw as NodeEnvironment,
    PORT: parsePort(config.PORT),
    CORS_ORIGIN: String(config.CORS_ORIGIN ?? DEFAULTS.CORS_ORIGIN),
    MONGODB_URI: mongodbUri,
    MONGODB_DB_NAME: config.MONGODB_DB_NAME
      ? String(config.MONGODB_DB_NAME)
      : undefined,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    SWAGGER_PATH: String(config.SWAGGER_PATH ?? DEFAULTS.SWAGGER_PATH),
    APP_BASE_URL: String(config.APP_BASE_URL ?? DEFAULTS.APP_BASE_URL),
    RESEND_API_KEY: config.RESEND_API_KEY
      ? String(config.RESEND_API_KEY).trim()
      : undefined,
    AUTH_EMAIL_FROM_ADDRESS: String(
      config.AUTH_EMAIL_FROM_ADDRESS ?? DEFAULTS.AUTH_EMAIL_FROM_ADDRESS,
    ).trim(),
    PLATFORM_EMAIL_FROM_ADDRESS: String(
      config.PLATFORM_EMAIL_FROM_ADDRESS ??
        DEFAULTS.PLATFORM_EMAIL_FROM_ADDRESS,
    ).trim(),
    EMAIL_REPLY_TO: config.EMAIL_REPLY_TO
      ? String(config.EMAIL_REPLY_TO).trim()
      : undefined,
    TRUELAYER_CLIENT_ID: config.TRUELAYER_CLIENT_ID
      ? String(config.TRUELAYER_CLIENT_ID).trim()
      : undefined,
    TRUELAYER_CLIENT_SECRET: config.TRUELAYER_CLIENT_SECRET
      ? String(config.TRUELAYER_CLIENT_SECRET).trim()
      : undefined,
    TRUELAYER_REDIRECT_URI: config.TRUELAYER_REDIRECT_URI
      ? String(config.TRUELAYER_REDIRECT_URI).trim()
      : undefined,
    TRUELAYER_AUTH_BASE_URL: String(
      config.TRUELAYER_AUTH_BASE_URL ?? DEFAULTS.TRUELAYER_AUTH_BASE_URL,
    ).trim(),
    TRUELAYER_API_BASE_URL: String(
      config.TRUELAYER_API_BASE_URL ?? DEFAULTS.TRUELAYER_API_BASE_URL,
    ).trim(),
    TRUELAYER_SCOPES: String(
      config.TRUELAYER_SCOPES ?? DEFAULTS.TRUELAYER_SCOPES,
    ).trim(),
    TRUELAYER_PROVIDER_COUNTRY_CODE: config.TRUELAYER_PROVIDER_COUNTRY_CODE
      ? String(config.TRUELAYER_PROVIDER_COUNTRY_CODE).trim().toUpperCase()
      : undefined,
  };
}
