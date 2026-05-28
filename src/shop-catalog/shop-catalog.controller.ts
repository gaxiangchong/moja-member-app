import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CreateCartHandoffDto } from './dto/create-cart-handoff.dto';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import { ShopCatalogService } from './shop-catalog.service';

@Controller('shop')
export class ShopCatalogController {
  constructor(
    private readonly shopCatalog: ShopCatalogService,
    private readonly cartHandoff: ShopCartHandoffService,
  ) {}

  @Get('catalog/products')
  listProducts() {
    return this.shopCatalog.listPublicProducts();
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
