import { Test } from '@nestjs/testing';
import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('Auth E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  it('rechaza registro sin celular', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', email: 'a@b.com', password: 'secret123' })
      .expect(400);
  });

  afterAll(async () => app.close());
});
