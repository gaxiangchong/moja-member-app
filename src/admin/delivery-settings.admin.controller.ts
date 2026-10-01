import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { DeliverySettingsService } from '../orders/delivery-settings.service';

/** Delivery at checkout: on/off and Moja Maison's WhatsApp number for courier help. */
@Controller('admin/shop/delivery-settings')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class DeliverySettingsAdminController {
  constructor(private readonly settings: DeliverySettingsService) {}

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
