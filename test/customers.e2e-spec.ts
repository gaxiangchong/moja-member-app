import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CustomersController } from '../src/customers/customers.controller';
import { CustomersService } from '../src/customers/customers.service';

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: {},
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not expose member wallet self top-up', () => {
    return request(app.getHttpServer())
      .patch('/customers/me/wallet/topup')
      .send({ amountCents: 10000, channel: 'online' })
      .expect(404);
  });
});
