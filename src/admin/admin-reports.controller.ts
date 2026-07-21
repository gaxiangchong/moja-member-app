import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AdminService } from './admin.service';
import { ActivateBentoSubscriptionDto } from './dto/activate-bento-subscription.dto';
import { AdminDailyCommerceDateDto } from './dto/admin-daily-commerce.dto';
import { BentoCustomerLookupQueryDto } from './dto/bento-customer-lookup-query.dto';
import { BentoOrdersReportQueryDto } from './dto/bento-orders-report-query.dto';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { PosPullDto } from './dto/pos-pull.dto';
import { FinanceOverviewQueryDto } from './dto/finance-overview-query.dto';
import { UnifiedTransactionsQueryDto } from './dto/unified-transactions-query.dto';
import { BentoOrdersReportService } from '../bento/bento-orders-report.service';
import { BentoService } from '../bento/bento.service';
import { BentoScheduleDto } from '../bento/dto/bento-subscription.dto';
import { SalesplayPullService } from '../salesplay/salesplay-pull.service';
import { FinanceReportService } from './finance-report.service';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminReportsController {
  constructor(
    private readonly admin: AdminService,
    private readonly bentoOrdersReport: BentoOrdersReportService,
    private readonly bento: BentoService,
    private readonly salesplayPull: SalesplayPullService,
    private readonly finance: FinanceReportService,
  ) {}

  /**
   * Consolidated cross-channel finance overview (POS + online shop + bento):
   * per-channel totals, merged revenue series, payment-method mix, refunds,
   * top products, and prior-period comparison.
   */
  @Get('finance-overview')
  @RequirePermissions(P.REPORT_VIEW)
  financeOverview(@Query() query: FinanceOverviewQueryDto) {
    return this.finance.getFinanceOverview(query);
  }

  /**
   * Unified transaction ledger across all three channels, each row tagged with
   * its channel. Supports date / channel / payment-method / customer / amount
   * filters, pagination, and CSV export.
   */
  @Get('transactions')
  @RequirePermissions(P.REPORT_VIEW)
  async transactions(
    @Query() query: UnifiedTransactionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.finance.getUnifiedTransactions(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="transactions.csv"',
      );
      return this.finance.unifiedTransactionsToCsv(payload);
    }
    return payload;
  }

  /** SalesPlay POS ingest health for the finance dashboard sync panel. */
  @Get('pos/sync-health')
  @RequirePermissions(P.REPORT_VIEW)
  posSyncHealth() {
    return this.salesplayPull.getSyncHealth();
  }

  /**
   * Manually trigger a SalesPlay pull. `mode=reconcile` (default) catches
   * missed webhooks over a recent window; `mode=backfill` walks history from
   * the sales reporting cutoff. Idempotent — safe to run anytime.
   */
  @Post('pos/pull')
  @RequirePermissions(P.REPORT_VIEW)
  posPull(@Body() body: PosPullDto) {
    return body.mode === 'backfill'
      ? this.salesplayPull.backfill()
      : this.salesplayPull.reconcile();
  }

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

  @Get('bento/overview')
  @RequirePermissions(P.REPORT_VIEW)
  bentoOverview(@Query() query: SalesAnalyticsQueryDto) {
    return this.admin.getBentoMemberFunnel(query);
  }

  @Get('bento/transactions')
  @RequirePermissions(P.REPORT_VIEW)
  bentoTransactions(@Query() query: SalesAnalyticsQueryDto) {
    return this.admin.listBentoTransactions(query);
  }

  /**
   * Per-customer pickup progress: boxes collected so far vs meals left on
   * each paid bento plan.
   */
  @Get('bento/pickup-progress')
  @RequirePermissions(P.REPORT_VIEW)
  bentoPickupProgress() {
    return this.admin.listBentoPickupProgress();
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

  @Get('bento-meal-orders')
  @RequirePermissions(P.REPORT_VIEW)
  async bentoMealOrders(
    @Query() query: BentoOrdersReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const defaults = this.bentoOrdersReport.defaultRange();
    const from = query.from ?? defaults.from;
    const to = query.to ?? defaults.to;

    if (query.format === 'xlsx') {
      const { buffer, filename } = await this.bentoOrdersReport.exportXlsx(
        from,
        to,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      return new StreamableFile(buffer);
    }

    return this.bentoOrdersReport.getCounts(from, to);
  }

  @Post('bento-subscriptions/:id/refund')
  @RequirePermissions(P.REPORT_VIEW)
  markBentoSubscriptionRefunded(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.markBentoSubscriptionRefunded(id, auth);
  }

  /**
   * Look up a member by phone and list their bento subscriptions + statuses.
   * Support entry point for the "paid but can't schedule" complaint.
   */
  @Get('bento/customer-lookup')
  @RequirePermissions(P.REPORT_VIEW)
  lookupBentoCustomer(@Query() query: BentoCustomerLookupQueryDto) {
    return this.admin.lookupBentoCustomer(query.phone);
  }

  /**
   * Unblock a subscription stuck at PENDING_PAYMENT (reconciles with Xendit
   * first, then force-activates with a reason) so the member can schedule.
   */
  @Post('bento-subscriptions/:id/activate')
  @RequirePermissions(P.REPORT_VIEW)
  activateBentoSubscription(
    @Param('id') id: string,
    @Body() dto: ActivateBentoSubscriptionDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.activateBentoSubscription(id, dto, auth);
  }

  /**
   * Cancel an unpaid (PENDING_PAYMENT) subscription — clears abandoned /
   * duplicate checkout attempts that block scheduling.
   */
  @Post('bento-subscriptions/:id/cancel')
  @RequirePermissions(P.REPORT_VIEW)
  cancelBentoSubscription(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.cancelBentoSubscription(id, auth);
  }

  /**
   * Schedule pickup days on a customer's behalf. Runs with admin override so
   * staff can resolve missed-cutoff / closed-day complaints from the dashboard.
   * Pass `overrideLocked: true` to also edit days past the 5 PM day-before
   * lock (e.g. switch a locked lunch+dinner day to dinner only).
   */
  @Post('bento-subscriptions/:id/schedule')
  @RequirePermissions(P.REPORT_VIEW)
  scheduleBentoSubscription(
    @Param('id') id: string,
    @Body() dto: BentoScheduleDto,
  ) {
    return this.bento.adminScheduleDeliveries(id, dto);
  }
}
