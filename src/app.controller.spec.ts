import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getAppInfo', () => {
    it('should return the app metadata', () => {
      expect(appController.getAppInfo()).toMatchObject({
        name: 'calen-be',
        apiPrefix: '/api/v1',
        database: 'mongodb',
        status: 'ready',
      });
    });
  });

  describe('getHealth', () => {
    it('should return an ok health status', () => {
      expect(appController.getHealth()).toMatchObject({
        status: 'ok',
        database: 'mongodb',
      });
    });
  });
});
