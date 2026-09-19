import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { ReadinessService } from './readiness.service';

/** Post-deploy configuration check for operators (reveals config state → admin only). */
@Controller('health')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('readiness')
  @RequirePermissions(P.REPORT_VIEW)
  getReadiness() {
    return this.readiness.report();
  }
}
