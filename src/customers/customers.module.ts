import { Module } from '@nestjs/common';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { SalesplayModule } from '../salesplay/salesplay.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PhoneNormalizerService } from './phone-normalizer.service';

@Module({
  imports: [LoyaltyModule, JwtAccessModule, WalletModule, SalesplayModule],
  controllers: [CustomersController],
  providers: [CustomersService, PhoneNormalizerService],
  exports: [CustomersService, PhoneNormalizerService],
})
export class CustomersModule {}
