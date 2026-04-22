import { Controller, Get } from '@nestjs/common';
import { ShopCatalogService } from './shop-catalog.service';

@Controller('shop/catalog')
export class ShopCatalogController {
  constructor(private readonly shopCatalog: ShopCatalogService) {}

  @Get('products')
  listProducts() {
    return this.shopCatalog.listPublicProducts();
  }

  @Get('popular')
  listPopular() {
    return this.shopCatalog.listPopularProducts();
  }
}

