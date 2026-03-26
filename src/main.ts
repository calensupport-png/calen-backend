import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT ?? 3000);
  const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CALEN API')
    .setDescription('Backend API documentation for CALEN')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, swaggerDocument);

  await app.listen(port);

  const appUrl = await app.getUrl();
  const frontendOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

  logger.log(`CALEN server is running on port ${port}`);
  logger.log(`HTTP base URL: ${appUrl}/api/v1`);
  logger.log(`Swagger docs URL: ${appUrl}/${swaggerPath}`);
  logger.log(`Frontend origin allowed: ${frontendOrigin}`);
}
bootstrap();
