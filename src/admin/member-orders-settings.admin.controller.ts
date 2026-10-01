import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { MemberOrdersSettingsService } from '../orders/member-orders-settings.service';

/** What the member app's Orders page shows — e.g. how many days of past orders. */
@Controller('admin/shop/member-orders-settings')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class MemberOrdersSettingsAdminController {
  constructor(private readonly settings: MemberOrdersSettingsService) {}

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
