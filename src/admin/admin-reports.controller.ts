import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { AdminService } from './admin.service';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminReportsController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @RequirePermissions(P.REPORT_VIEW)
  dashboard() {
    return this.admin.getReportingDashboard();
  }
}
