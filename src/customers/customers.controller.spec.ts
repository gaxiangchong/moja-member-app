import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  let app: INestApplication;
  const customers = {
    getProfileBundle: jest.fn(),
    updateMe: jest.fn(),
    getMeRewards: jest.fn(),
    getMeWallet: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: customers }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('does not expose a member self-top-up endpoint', async () => {
    await request(app.getHttpServer())
      .patch('/customers/me/wallet/topup')
      .send({ amountCents: 500000, channel: 'cashier' })
      .expect(404);

    expect(customers.getMeWallet).not.toHaveBeenCalled();
  });
});
