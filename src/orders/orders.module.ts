import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { MemberOrdersSettingsService } from './member-orders-settings.service';
import { OrdersMaintenanceService } from './orders-maintenance.service';
import { PickupRulesService } from './pickup-rules.service';
import { ProductStockService } from './product-stock.service';
import { ShopAvailabilityController } from './shop-availability.controller';

@Module({
  imports: [ConfigModule, PrismaModule, ShopCatalogModule],
  controllers: [ShopAvailabilityController],
  providers: [
    ProductStockService,
    OrdersMaintenanceService,
    PickupRulesService,
    MemberOrdersSettingsService,
  ],
  exports: [
    ProductStockService,
    OrdersMaintenanceService,
    PickupRulesService,
    MemberOrdersSettingsService,
  ],
})
export class OrdersModule {}
