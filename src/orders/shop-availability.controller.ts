import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import {
  ProductStockService,
  todayBusinessDate,
} from './product-stock.service';

/**
 * Public per-day availability for the shop.
 *
 * Lives in the orders module rather than next to the rest of `/shop/catalog`
 * because it needs ProductStockService, which itself depends on the catalog —
 * putting it there would make the two modules import each other.
 */
@Controller('shop')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ShopAvailabilityController {
  constructor(
    private readonly shopCatalog: ShopCatalogService,
    private readonly productStock: ProductStockService,
  ) {}

  /**
   * Sellable quantity per product for one collection day. `null` means the
   * product is not stock-tracked (unlimited). Drives the availability shown
   * at checkout once a pickup date is chosen.
   */
  @Get('catalog/availability')
  async availability(@Query() query: AvailabilityQueryDto) {
    const date = query.date ?? todayBusinessDate();
    const products = await this.shopCatalog.listPublicProducts();
    const map = await this.productStock.getSellableQtyMap(
      products.map((p) => p.id),
      date,
    );
    return {
      businessDate: date,
      products: products.map((p) => ({
        id: p.id,
        sellableQty: map.get(p.id) ?? null,
      })),
    };
  }
}
