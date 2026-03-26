import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getAppInfo() {
    return {
      name: 'calen-be',
      version: '0.0.1',
      environment: process.env.NODE_ENV ?? 'development',
      apiPrefix: '/api/v1',
      database: 'mongodb',
      status: 'ready',
    };
  }

  getHealth() {
    return {
      status: 'ok',
      database: 'mongodb',
      timestamp: new Date().toISOString(),
    };
  }
}
