import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { SetStockQtyDto } from './dto/set-stock-qty.dto';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Controller('ops/kitchen')
@UseGuards(OpsApiKeyGuard)
export class OpsKitchenController {
  constructor(private readonly shopCatalog: ShopCatalogService) {}

  @Get('stock')
  list() {
    return this.shopCatalog.listKitchenStock();
  }

  @Patch('stock/:id')
  update(@Param('id') id: string, @Body() body: SetStockQtyDto) {
    return this.shopCatalog.setAvailableQty(id, body.qty);
  }
}
