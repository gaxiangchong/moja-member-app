import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { EarlyOrderDiscountService } from '../orders/early-order-discount.service';

/** Percent off whole cakes ordered a set number of days ahead. */
@Controller('admin/shop/early-order-discount')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class EarlyOrderDiscountAdminController {
  constructor(private readonly settings: EarlyOrderDiscountService) {}

  @Get()
  @RequirePermissions(P.SHOP_MANAGE)
  getSettings() {
    return this.settings.getSettings();
  }

  @Put()
  @RequirePermissions(P.SHOP_MANAGE)
  setSettings(@Body() body: unknown) {
    return this.settings.setSettings(body);
  }
}
