import { Module } from '@nestjs/common';
import { ShopCatalogController } from './shop-catalog.controller';
import { ShopCatalogService } from './shop-catalog.service';

@Module({
  controllers: [ShopCatalogController],
  providers: [ShopCatalogService],
  exports: [ShopCatalogService],
})
export class ShopCatalogModule {}

