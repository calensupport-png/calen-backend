import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { AppController } from './../src/app.controller';
import { configureApp } from './../src/configure-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let appController: AppController;

  beforeEach(async () => {
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
});
