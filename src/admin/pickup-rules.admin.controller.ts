import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { PickupRulesService } from '../orders/pickup-rules.service';

@Controller('admin/shop/pickup-rules')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class PickupRulesAdminController {
  constructor(private readonly pickupRules: PickupRulesService) {}

  @Get()
  @RequirePermissions(P.SHOP_MANAGE)
  getRules() {
    return this.pickupRules.getRules();
  }

  @Put()
  @RequirePermissions(P.SHOP_MANAGE)
  setRules(@Body() body: unknown) {
    return this.pickupRules.setRules(body);
  }
}
