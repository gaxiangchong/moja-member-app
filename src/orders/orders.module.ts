import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { ProductStockService } from './product-stock.service';

@Module({
  imports: [PrismaModule, ShopCatalogModule],
  providers: [ProductStockService],
  exports: [ProductStockService],
})
export class OrdersModule {}
