import { NotImplementedException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  it('rejects member wallet top-ups until payment verification exists', async () => {
    const wallet = {
      appendTransaction: jest.fn(),
      getSummary: jest.fn(),
    };
    const service = new CustomersService(
      {} as never,
      {} as never,
      wallet as never,
    );

    await expect(
      service.topUpMyWallet('customer-1', {
        amountCents: 5000,
        channel: 'online',
      }),
    ).rejects.toBeInstanceOf(NotImplementedException);
    await expect(
      service.topUpMyWallet('customer-1', {
        amountCents: 5000,
        channel: 'cashier',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'WALLET_TOPUP_PAYMENT_REQUIRED',
      },
    });
    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(wallet.getSummary).not.toHaveBeenCalled();
  });
});
