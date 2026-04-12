import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AdminService } from './admin.service';
import { AdminDailyCommerceDateDto } from './dto/admin-daily-commerce.dto';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminReportsController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @RequirePermissions(P.REPORT_VIEW)
  dashboard() {
    return this.admin.getReportingDashboard();
  }

  @Get('sales-analytics')
  @RequirePermissions(P.REPORT_VIEW)
  async salesAnalytics(
    @Query() query: SalesAnalyticsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.admin.getSalesAnalytics(query);
    if ((query.format ?? 'json') === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="sales-analytics.csv"',
      );
      return this.admin.salesAnalyticsToCsv(payload);
    }
    return payload;
  }

  @Get('daily-commerce')
  @RequirePermissions(P.REPORT_VIEW)
  getDailyCommerce(@Query() query: AdminDailyCommerceDateDto) {
    return this.admin.getDailyCommerceReport(query.date);
  }

  @Post('daily-commerce/close')
  @RequirePermissions(P.REPORT_VIEW)
  closeDailyCommerce(
    @Body() body: AdminDailyCommerceDateDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.closeDailyCommerce(body.date, auth);
  }
}
