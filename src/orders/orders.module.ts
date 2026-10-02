import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { WalletModule } from '../wallet/wallet.module';
import { DeliverySettingsService } from './delivery-settings.service';
import { MemberOrdersSettingsService } from './member-orders-settings.service';
import { OrdersMaintenanceService } from './orders-maintenance.service';
import { PickupRulesService } from './pickup-rules.service';
import { ProductStockService } from './product-stock.service';
import { ShopAvailabilityController } from './shop-availability.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ShopCatalogModule,
    LoyaltyModule,
    WalletModule,
  ],
  controllers: [ShopAvailabilityController],
  providers: [
    ProductStockService,
    OrdersMaintenanceService,
    PickupRulesService,
    MemberOrdersSettingsService,
    DeliverySettingsService,
  ],
  exports: [
    ProductStockService,
    OrdersMaintenanceService,
    PickupRulesService,
    MemberOrdersSettingsService,
    DeliverySettingsService,
  ],
})
export class OrdersModule {}
