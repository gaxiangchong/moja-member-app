import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AdminDashboardMenuService } from './admin-dashboard-menu.service';

@Controller('admin/dashboard-menu')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminDashboardMenuAdminController {
  constructor(private readonly menu: AdminDashboardMenuService) {}

  @Get()
  @RequirePermissions(P.ADMIN_MANAGE)
  getMenu() {
    return this.menu.settings();
  }

  @Put()
  @RequirePermissions(P.ADMIN_MANAGE)
  saveMenu(@Body() body: unknown, @CurrentAdmin() auth: AdminAuthState) {
    return this.menu.save(body, auth);
  }

  @Delete()
  @RequirePermissions(P.ADMIN_MANAGE)
  resetMenu(@CurrentAdmin() auth: AdminAuthState) {
    return this.menu.reset(auth);
  }
}
