import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TIER_POINTS_MULTIPLIER } from '../loyalty/member-tier';
import { CreateCartHandoffDto } from './dto/create-cart-handoff.dto';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import { ShopCatalogService } from './shop-catalog.service';

@Controller('shop')
// Guest browsing in the member app now hits these read endpoints on every
// visit (previously only reached after login, or from the separate public
// shop site), so give them the same throttle floor as the neighboring
// cart-handoff endpoints instead of leaving them completely unguarded.
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ShopCatalogController {
  constructor(
    private readonly shopCatalog: ShopCatalogService,
    private readonly cartHandoff: ShopCartHandoffService,
    private readonly config: ConfigService,
  ) {}

  @Get('catalog/products')
  listProducts() {
    return this.shopCatalog.listPublicProducts();
  }

  /**
   * How purchases earn points, so the shop can show "earn X pts · RM Y
   * cashback". Same rate the earn paths use (LOYALTY_POINTS_PER_RM, legacy
   * SALESPLAY_POINTS_PER_UNIT); a point's worth in sen comes from
   * LOYALTY_POINT_VALUE_SEN (default 10: 50 pts redeem RM5).
   */
  @Get('loyalty-earn')
  loyaltyEarn() {
    const num = (k: string) => Number(this.config.get<string>(k));
    const rate = [num('LOYALTY_POINTS_PER_RM'), num('SALESPLAY_POINTS_PER_UNIT')].find(
      (n) => Number.isFinite(n) && n > 0,
    );
    const value = num('LOYALTY_POINT_VALUE_SEN');
    return {
      pointsPerRm: rate ?? 1,
      pointValueSen: Number.isFinite(value) && value > 0 ? value : 10,
      tierMultipliers: TIER_POINTS_MULTIPLIER,
    };
  }

  @Get('catalog/popular')
  listPopular() {
    return this.shopCatalog.listPopularProducts();
  }

  @Get('catalog/layout')
  listLayout() {
    return this.shopCatalog.getPublicLayout();
  }

  @Get('catalog/featured')
  listFeatured() {
    return this.shopCatalog.listHomeFeaturedProducts();
  }

  /** Shop site calls this when the customer taps Pay — returns a redirect URL for the member app. */
  @Post('cart-handoff')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  createCartHandoff(@Body() dto: CreateCartHandoffDto) {
    return this.cartHandoff.createHandoff(dto);
  }

  /** Member app consumes the handoff token and imports cart lines. */
  @Get('cart-handoff/consume')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  consumeCartHandoff(@Query('token') token: string) {
    return this.cartHandoff.consumeHandoff(token);
  }
}
