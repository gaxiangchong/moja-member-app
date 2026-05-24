import { Module } from '@nestjs/common';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import { ShopCatalogController } from './shop-catalog.controller';
import { ShopCatalogService } from './shop-catalog.service';

@Module({
  imports: [JwtAccessModule],
  controllers: [ShopCatalogController],
  providers: [ShopCatalogService, ShopCartHandoffService],
  exports: [ShopCatalogService, ShopCartHandoffService],
})
export class ShopCatalogModule {}

