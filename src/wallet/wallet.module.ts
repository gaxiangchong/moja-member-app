import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletTopUpSettingsService } from './topup-settings.service';

@Module({
  providers: [WalletService, WalletTopUpSettingsService],
  exports: [WalletService, WalletTopUpSettingsService],
})
export class WalletModule {}
