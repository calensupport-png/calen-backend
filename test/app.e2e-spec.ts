import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { AppController } from './../src/app.controller';
import { configureApp } from './../src/configure-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let appController: AppController;
  const previousCorsOrigin = process.env.CORS_ORIGIN;

  beforeEach(async () => {
    process.env.CORS_ORIGIN = 'https://www.joincalen.com/';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    appController = app.get(AppController);
  });

  afterEach(async () => {
    await app.close();
    process.env.CORS_ORIGIN = previousCorsOrigin;
  });

  it('bootstraps the app with the configured API metadata', () => {
    expect(appController.getAppInfo()).toMatchObject({
      name: 'calen-be',
      apiPrefix: '/api/v1',
      database: 'mongodb',
      status: 'ready',
    });
  });

  it('exposes an application health payload', () => {
    expect(appController.getHealth()).toMatchObject({
      status: 'ok',
      database: 'mongodb',
    });
  });

  it('responds to CORS preflight requests for normalized production origins', async () => {
    await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://www.joincalen.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'https://www.joincalen.com')
      .expect('Access-Control-Allow-Credentials', 'true');
  });
});
