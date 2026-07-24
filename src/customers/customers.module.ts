import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { SalesplayModule } from '../salesplay/salesplay.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PhoneNormalizerService } from './phone-normalizer.service';

@Module({
  imports: [
    ConfigModule,
    LoyaltyModule,
    JwtAccessModule,
    WalletModule,
    SalesplayModule,
    ShopCatalogModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, PhoneNormalizerService],
  exports: [CustomersService, PhoneNormalizerService],
})
export class CustomersModule {}
