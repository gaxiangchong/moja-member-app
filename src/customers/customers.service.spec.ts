import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { WalletService } from '../wallet/wallet.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  describe('topUpMyWallet', () => {
    it('rejects self-service wallet credits before writing to the ledger', async () => {
      const wallet = {
        appendTransaction: jest.fn(),
        getSummary: jest.fn(),
      } as unknown as WalletService;
      const service = new CustomersService(
        {} as PrismaService,
        {} as LoyaltyService,
        wallet,
      );

      let error: unknown;
      try {
        await service.topUpMyWallet('customer-1', {
          amountCents: 5000,
          channel: 'online',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        code: 'WALLET_TOPUP_REQUIRES_VERIFIED_PAYMENT',
        message:
          'Wallet top-ups must be created by a verified payment or cashier flow.',
      });
      expect(wallet.appendTransaction).not.toHaveBeenCalled();
      expect(wallet.getSummary).not.toHaveBeenCalled();
    });
  });
});
