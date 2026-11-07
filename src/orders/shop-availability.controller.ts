import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { InStoreQuoteDto } from './dto/in-store-quote.dto';
import { DeliverySettingsService } from './delivery-settings.service';
import { EarlyOrderDiscountService } from './early-order-discount.service';
import { InStoreService } from './in-store.service';
import { PickupRulesService } from './pickup-rules.service';
import {
  ProductStockService,
  stockKey,
  stockVariant,
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
    private readonly pickupRules: PickupRulesService,
    private readonly deliverySettings: DeliverySettingsService,
    private readonly earlyOrderDiscount: EarlyOrderDiscountService,
    private readonly inStore: InStoreService,
  ) {}

  /**
   * Sellable quantity per product for one collection day. `null` means the
   * product is not stock-tracked (unlimited). `variants` gives the same per
   * size; a size missing there was not counted by the kitchen. Drives the
   * availability shown at checkout and "Available today" on product pages.
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
      products: products.map((p) => {
        const variants: Record<string, number> = {};
        for (const v of p.variants ?? []) {
          const left = map.get(stockKey(p.id, stockVariant(v.label)));
          if (left != null) variants[v.label] = left;
        }
        return {
          id: p.id,
          sellableQty: map.get(stockKey(p.id, '')) ?? null,
          variants,
        };
      }),
    };
  }

  /**
   * Can this cart be collected in store today? Checks the shop is open and
   * before the in-store cut-off, and that every cake size has enough left on
   * today's kitchen count (after till sales and other online orders). Display
   * only: placing the order checks again and holds the stock.
   */
  @Post('in-store-today')
  @HttpCode(200)
  inStoreToday(@Body() body: InStoreQuoteDto) {
    return this.inStore.quote(body.lines);
  }

  /**
   * Whether delivery can be chosen at checkout, and the WhatsApp number to ask
   * Moja Maison for help arranging a courier. Public: it is shown to anyone
   * reaching checkout.
   */
  @Get('delivery-info')
  deliveryInfo() {
    return this.deliverySettings.getSettings();
  }

  /**
   * The early-order cake discount, so checkout can show it. Display only: the
   * server works out the real amount when the order is placed.
   */
  @Get('early-order-discount')
  earlyOrderDiscountInfo() {
    return this.earlyOrderDiscount.getSettings();
  }

  /**
   * How the shop page splits the catalog: which categories are sold from
   * today's shelf, which need days of notice, whether in-store is open right
   * now, and the earliest pre-order date. Public and cartless — the member app
   * reads it once to draw the availability tabs and their badges.
   */
  @Get('availability-rules')
  availabilityRules() {
    return this.pickupRules.availabilityRules();
  }

  /**
   * Which pickup windows are still open for a day: lead time, pre-order
   * notice for the cart's `categories`, cut-off, capacity, store hours, and
   * closed days. `date` defaults to today.
   */
  @Get('pickup-slots')
  pickupSlots(@Query() query: AvailabilityQueryDto) {
    const categories = (query.categories ?? '').split(',').filter(Boolean);
    return this.pickupRules.quoteDay(
      query.date ?? todayBusinessDate(),
      categories,
    );
  }
}
