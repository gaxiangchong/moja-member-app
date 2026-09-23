import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ProductStockService,
  todayBusinessDate,
} from '../orders/product-stock.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { SetStockQtyDto } from './dto/set-stock-qty.dto';
import { SetStockDayDto, StockDayGridQueryDto } from './dto/stock-day.dto';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Controller('ops/kitchen')
@UseGuards(OpsApiKeyGuard)
export class OpsKitchenController {
  constructor(
    private readonly shopCatalog: ShopCatalogService,
    private readonly productStock: ProductStockService,
  ) {}

  /** Legacy product-level list (single global count). Kept for the old screen. */
  @Get('stock')
  list() {
    return this.shopCatalog.listKitchenStock();
  }

  @Patch('stock/:id')
  update(@Param('id') id: string, @Body() body: SetStockQtyDto) {
    return this.shopCatalog.setAvailableQty(id, body.qty);
  }

  /**
   * Day grid: how many of each cake the kitchen can supply on each of the next
   * N days, with what is already spoken for by paid orders.
   */
  @Get('stock/days')
  async listDays(@Query() query: StockDayGridQueryDto) {
    const products = await this.shopCatalog.listKitchenStock();
    const from = query.from ?? todayBusinessDate();
    const days = query.days ?? 7;
    const cells = await this.productStock.listRange(
      products.map((p) => p.id),
      from,
      days,
    );
    return {
      from,
      days,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
      })),
      cells,
    };
  }

  /** Kitchen sets the count for one product on one day. */
  @Post('stock/days')
  setDay(@Body() body: SetStockDayDto) {
    return this.productStock.setQty(
      body.productId,
      body.businessDate,
      body.qty,
    );
  }
}
