import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';
import { spanishValidationFactory } from './common/validation/spanish-validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: env.corsOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, transform: true, exceptionFactory: spanishValidationFactory
  }));
  await app.listen(3001);
}
bootstrap();
