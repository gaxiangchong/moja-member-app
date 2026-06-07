import { ForbiddenException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService wallet top-ups', () => {
  it('rejects customer-initiated top-ups before mutating the wallet ledger', async () => {
    const wallet = {
      appendTransaction: jest.fn(),
      getSummary: jest.fn(),
    };
    const service = new CustomersService({} as never, {} as never, wallet as never);

    try {
      await service.topUpMyWallet('customer-1', {
        amountCents: 10_000,
        channel: 'online',
      });
      throw new Error('Expected top-up to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'WALLET_TOPUP_UNAVAILABLE',
      });
    }

    expect(wallet.appendTransaction).not.toHaveBeenCalled();
    expect(wallet.getSummary).not.toHaveBeenCalled();
  });
});
