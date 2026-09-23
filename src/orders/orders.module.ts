import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { OrdersMaintenanceService } from './orders-maintenance.service';
import { ProductStockService } from './product-stock.service';
import { ShopAvailabilityController } from './shop-availability.controller';

@Module({
  imports: [ConfigModule, PrismaModule, ShopCatalogModule],
  controllers: [ShopAvailabilityController],
  providers: [ProductStockService, OrdersMaintenanceService],
  exports: [ProductStockService, OrdersMaintenanceService],
})
export class OrdersModule {}
