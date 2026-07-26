import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { ApprovalsService } from './approvals.service';
import { AdminService } from './admin.service';
import { AdminListAuditQueryDto } from './dto/admin-list-audit-query.dto';
import { AdminListCustomersQueryDto } from './dto/admin-list-customers-query.dto';
import { AdminListOrdersQueryDto } from './dto/admin-list-orders-query.dto';
import { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import { AdminWalletReversalDto } from './dto/admin-wallet-reversal.dto';
import { AssignCustomerVoucherDto } from './dto/assign-customer-voucher.dto';
import { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';
import { GoodwillVoucherDto } from './dto/goodwill-voucher.dto';
import { RedeemVoucherDto } from './dto/redeem-voucher.dto';
import { UpdatePaymentsDemoModeDto } from './dto/update-payments-demo-mode.dto';
import { RequestWalletReversalDto } from './dto/request-wallet-reversal.dto';
import { RevokeCustomerVoucherDto } from './dto/revoke-customer-voucher.dto';
import { UpdateVoucherDefinitionDto } from './dto/update-voucher-definition.dto';
import { CreateVoucherPushRuleDto } from './dto/create-voucher-push-rule.dto';
import { UpdateVoucherPushRuleDto } from './dto/update-voucher-push-rule.dto';
import { CreatePerksCampaignRuleDto } from './dto/create-perks-campaign-rule.dto';
import { UpdatePerksCampaignRuleDto } from './dto/update-perks-campaign-rule.dto';
import { CreateShopCatalogProductDto } from './dto/create-shop-catalog-product.dto';
import { UpdateShopCatalogLayoutDto } from './dto/update-shop-catalog-layout.dto';
import { UpdateShopCatalogProductDto } from './dto/update-shop-catalog-product.dto';
import { CreateHomeAdSlideDto } from './dto/create-home-ad-slide.dto';
import { UpdateHomeAdSlideDto } from './dto/update-home-ad-slide.dto';
import { UpdateHomePopularDto } from './dto/update-home-popular.dto';
import {
  PreviewShopCatalogSyncDto,
  SyncShopCatalogFromSitesDto,
} from './dto/sync-shop-catalog-from-sites.dto';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { HomeAdsService } from '../home-ads/home-ads.service';
import { BentoMenuService } from '../bento/bento-menu.service';
import {
  addDaysUtc,
  BENTO_DISPLAY_WEEKS,
  displayWeekStartIsos,
  formatDateOnly,
  parseDateOnly,
} from '../bento/bento-weekly.util';
import { BentoPackagesService } from '../bento/bento-packages.service';
import { BentoSettingsService } from '../bento/bento-settings.service';
import { BentoVoucherService } from '../bento-vouchers/bento-voucher.service';
import { ReportingSettingsService } from './reporting-settings.service';
import { UpdateReportingSettingsDto } from './dto/update-reporting-settings.dto';
import { UpdateBentoMenuDto } from './dto/update-bento-menu.dto';
import { UpdateBentoPackagesDto } from './dto/update-bento-packages.dto';
import { UpdateBentoSettingsDto } from './dto/update-bento-settings.dto';
import { CreateBentoDiscountVoucherDto } from './dto/create-bento-discount-voucher.dto';
import { UpdateBentoDiscountVoucherDto } from './dto/update-bento-discount-voucher.dto';

@Controller('admin')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly approvals: ApprovalsService,
    private readonly shopCatalog: ShopCatalogService,
    private readonly homeAds: HomeAdsService,
    private readonly bentoMenu: BentoMenuService,
    private readonly bentoPackages: BentoPackagesService,
    private readonly bentoSettings: BentoSettingsService,
    private readonly reportingSettings: ReportingSettingsService,
    private readonly bentoVouchers: BentoVoucherService,
  ) {}

  @Get('commerce/orders')
  @RequirePermissions(P.CUSTOMER_READ)
  listCommerceOrders(@Query() query: AdminListOrdersQueryDto) {
    return this.admin.listCommerceOrders(query);
  }

  @Get('customers')
  @RequirePermissions(P.CUSTOMER_READ)
  listCustomers(@Query() query: AdminListCustomersQueryDto) {
    return this.admin.listCustomers(query);
  }

  // Declared before 'customers/:id' so the literal path wins over the param route.
  @Get('customers/export')
  @RequirePermissions(P.CUSTOMER_EXPORT)
  async exportCustomers(@Query() query: AdminListCustomersQueryDto) {
    const csv = await this.admin.exportCustomersCsv(query);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="customers.csv"',
    });
  }

  @Get('customers/:id/audit-logs')
  @RequirePermissions(P.AUDIT_READ)
  listCustomerAuditLogs(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.admin.listCustomerAuditLogs(id, limit);
  }

  @Get('customers/:id/orders')
  @RequirePermissions(P.CUSTOMER_READ)
  listCustomerOrders(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(40), ParseIntPipe) limit: number,
  ) {
    return this.admin.listCustomerOrders(id, limit);
  }

  @Get('customers/:id')
  @RequirePermissions(P.CUSTOMER_READ)
  getCustomer(@Param('id') id: string) {
    return this.admin.getCustomer(id);
  }

  // Admin-assisted login: generate a one-time login PIN for a member who can't
  // receive their OTP. Returns the PIN once for the admin to relay.
  @Post('customers/:id/login-pin')
  @RequirePermissions(P.CUSTOMER_WRITE_IDENTITY)
  setCustomerLoginPin(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.setCustomerLoginPin(id, auth);
  }

  @Post('customers/:id/loyalty/adjustments')
  @RequirePermissions(P.LOYALTY_ADJUST)
  adjustLoyalty(
    @Param('id') id: string,
    @Body() dto: AdminLoyaltyAdjustmentDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.adjustCustomerLoyalty(id, dto, auth);
  }

  @Get('customers/:id/wallet')
  @RequirePermissions(P.WALLET_READ)
  getCustomerWallet(@Param('id') id: string) {
    return this.admin.getCustomerWallet(id);
  }

  @Post('customers/:id/wallet/adjustments')
  @RequirePermissions(P.WALLET_ADJUST)
  adjustWallet(
    @Param('id') id: string,
    @Body() dto: AdminWalletAdjustmentDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.adjustCustomerWallet(id, dto, auth);
  }

  @Post('customers/:id/wallet/reverse/:transactionId')
  @RequirePermissions(P.WALLET_REVERSE)
  reverseWalletTxn(
    @Param('id') id: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: AdminWalletReversalDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.reverseWalletTransaction(
      id,
      transactionId,
      dto.reason,
      auth,
    );
  }

  @Post('customers/:id/wallet/reversal-requests')
  @RequirePermissions(P.WALLET_REVERSAL_REQUEST)
  requestWalletReversal(
    @Param('id') id: string,
    @Body() dto: RequestWalletReversalDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.approvals.requestWalletReversal(id, dto, auth);
  }

  @Post('customers/:id/wallet/freeze')
  @RequirePermissions(P.WALLET_FREEZE)
  freezeWallet(@Param('id') id: string, @CurrentAdmin() auth: AdminAuthState) {
    return this.admin.setWalletFreeze(id, true, auth);
  }

  @Post('customers/:id/wallet/unfreeze')
  @RequirePermissions(P.WALLET_FREEZE)
  unfreezeWallet(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.setWalletFreeze(id, false, auth);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: AdminUpdateCustomerDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.updateCustomer(id, dto, auth);
  }

  @Post('customers/:id/vouchers/goodwill')
  @RequirePermissions(P.VOUCHER_GOODWILL)
  assignGoodwillVoucher(
    @Param('id') id: string,
    @Body() dto: GoodwillVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.assignGoodwillVoucher(id, dto, auth);
  }

  @Post('customers/:id/vouchers')
  @RequirePermissions(P.VOUCHER_ASSIGN)
  assignCustomerVoucher(
    @Param('id') id: string,
    @Body() dto: AssignCustomerVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.assignCustomerVoucher(id, dto, auth);
  }

  @Post('customers/:id/vouchers/:voucherId/revoke')
  @RequirePermissions(P.VOUCHER_REVOKE)
  revokeCustomerVoucher(
    @Param('id') id: string,
    @Param('voucherId') voucherId: string,
    @Body() dto: RevokeCustomerVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.revokeCustomerVoucher(id, voucherId, dto, auth);
  }

  @Get('customers/:id/vouchers/redeemable')
  @RequirePermissions(P.VOUCHER_READ)
  listRedeemableVouchers(@Param('id') id: string) {
    return this.admin.listRedeemableVouchers(id);
  }

  @Post('customers/:id/vouchers/:voucherId/redeem')
  @RequirePermissions(P.VOUCHER_REDEEM)
  redeemVoucherInStore(
    @Param('id') id: string,
    @Param('voucherId') voucherId: string,
    @Body() dto: RedeemVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.redeemVoucherInStore(id, voucherId, dto, auth);
  }

  @Get('voucher-definitions')
  @RequirePermissions(P.VOUCHER_READ)
  listVoucherDefinitions() {
    return this.admin.listVoucherDefinitions();
  }

  @Get('bento-vouchers')
  @RequirePermissions(P.VOUCHER_READ)
  listBentoVouchers() {
    return this.bentoVouchers.adminList();
  }

  @Post('bento-vouchers')
  @RequirePermissions(P.VOUCHER_CREATE)
  createBentoVoucher(@Body() dto: CreateBentoDiscountVoucherDto) {
    return this.bentoVouchers.adminCreate(dto);
  }

  @Patch('bento-vouchers/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateBentoVoucher(
    @Param('id') id: string,
    @Body() dto: UpdateBentoDiscountVoucherDto,
  ) {
    return this.bentoVouchers.adminUpdate(id, dto);
  }

  /**
   * Delete a voucher that was never redeemed. Codes with confirmed or
   * in-flight redemptions are refused (deactivate those instead) so the usage
   * history behind the sales reports is never cascade-deleted.
   */
  @Delete('bento-vouchers/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  deleteBentoVoucher(@Param('id') id: string) {
    return this.bentoVouchers.adminDelete(id);
  }

  @Get('loyalty-ledger')
  @RequirePermissions(P.LOYALTY_READ)
  listLoyaltyLedger(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.admin.listLoyaltyLedger(limit);
  }

  @Get('wallet-ledger')
  @RequirePermissions(P.WALLET_READ)
  listWalletLedger(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('customerId') customerId?: string,
  ) {
    return this.admin.listWalletLedger(limit, customerId);
  }

  @Get('audit-logs')
  @RequirePermissions(P.AUDIT_READ)
  listAuditLogs(@Query() query: AdminListAuditQueryDto) {
    return this.admin.listAuditLogs(query);
  }

  @Get('overview')
  @RequirePermissions(P.REPORT_VIEW)
  getOverview() {
    return this.admin.getOverviewStats();
  }

  @Post('voucher-definitions')
  @RequirePermissions(P.VOUCHER_CREATE)
  createVoucherDefinition(
    @Body() dto: CreateVoucherDefinitionDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.createVoucherDefinition(dto, auth);
  }

  @Patch('voucher-definitions/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateVoucherDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherDefinitionDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.updateVoucherDefinition(id, dto, auth);
  }

  @Post('voucher-definitions/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }),
  )
  uploadVoucherDefinitionImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.admin.attachVoucherDefinitionImage(id, file);
  }

  @Delete('voucher-definitions/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  clearVoucherDefinitionImage(@Param('id') id: string) {
    return this.admin.clearVoucherDefinitionImage(id);
  }

  @Get('voucher-push-rules')
  @RequirePermissions(P.VOUCHER_READ)
  listVoucherPushRules() {
    return this.admin.listVoucherPushRules();
  }

  @Post('voucher-push-rules')
  @RequirePermissions(P.VOUCHER_CREATE)
  createVoucherPushRule(
    @Body() dto: CreateVoucherPushRuleDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.createVoucherPushRule(dto, auth);
  }

  @Patch('voucher-push-rules/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateVoucherPushRule(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherPushRuleDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.updateVoucherPushRule(id, dto, auth);
  }

  @Get('perks-campaign-rules')
  @RequirePermissions(P.VOUCHER_READ)
  listPerksCampaignRules() {
    return this.admin.listPerksCampaignRules();
  }

  @Post('perks-campaign-rules')
  @RequirePermissions(P.VOUCHER_CREATE)
  createPerksCampaignRule(
    @Body() dto: CreatePerksCampaignRuleDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.createPerksCampaignRule(dto, auth);
  }

  @Patch('perks-campaign-rules/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updatePerksCampaignRule(
    @Param('id') id: string,
    @Body() dto: UpdatePerksCampaignRuleDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.updatePerksCampaignRule(id, dto, auth);
  }

  @Get('shop-catalog/products')
  @RequirePermissions(P.VOUCHER_READ)
  listShopCatalogProducts() {
    return this.shopCatalog.listAdminProducts();
  }

  /** Distinct SalesPlay product codes seen on POS receipts, for mapping UI. */
  @Get('shop-catalog/salesplay-codes')
  @RequirePermissions(P.VOUCHER_READ)
  listShopCatalogSalesplayCodes() {
    return this.shopCatalog.listKnownSalesplayCodes();
  }

  @Post('shop-catalog/products')
  @RequirePermissions(P.VOUCHER_CREATE)
  createShopCatalogProduct(@Body() dto: CreateShopCatalogProductDto) {
    return this.shopCatalog.createProduct(dto);
  }

  @Patch('shop-catalog/products/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateShopCatalogProduct(
    @Param('id') id: string,
    @Body() dto: UpdateShopCatalogProductDto,
  ) {
    return this.shopCatalog.updateProduct(id, dto);
  }

  @Post('shop-catalog/products/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadShopCatalogProductImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.shopCatalog.attachProductImage(id, file);
  }

  @Delete('shop-catalog/products/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  clearShopCatalogProductImage(@Param('id') id: string) {
    return this.shopCatalog.clearProductImage(id);
  }

  @Delete('shop-catalog/products/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  deleteShopCatalogProduct(@Param('id') id: string) {
    return this.shopCatalog.deleteProduct(id);
  }

  @Post('shop-catalog/products/:id/reset-sync-overrides')
  @RequirePermissions(P.VOUCHER_UPDATE)
  resetShopCatalogProductSyncOverrides(@Param('id') id: string) {
    return this.shopCatalog.resetProductSyncOverrides(id);
  }

  // --- Bento weekly menu (separate from the cake-sales shop catalog) ---

  @Get('bento-menu')
  @RequirePermissions(P.VOUCHER_READ)
  getBentoMenu(@Query('week') week?: string) {
    const ctx = this.resolveBentoMenuWeek(week);
    if (!ctx) return this.bentoMenu.getConfig();
    return { ...ctx, ...this.bentoMenu.getWeekConfig(ctx.weekStart) };
  }

  @Put('bento-menu')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateBentoMenu(@Body() dto: UpdateBentoMenuDto, @Query('week') week?: string) {
    const ctx = this.resolveBentoMenuWeek(week);
    if (!ctx) return this.bentoMenu.setConfig(dto);
    return { ...ctx, ...this.bentoMenu.setWeekConfig(ctx.weekStart, dto) };
  }

  /** Map a `week` query (0–3 = Week 1–4) to its Monday/Sunday ISO range. */
  private resolveBentoMenuWeek(
    week?: string,
  ): { weekIndex: number; weekStart: string; weekEnd: string } | null {
    if (week == null || week === '') return null;
    const idx = Number.parseInt(week, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= BENTO_DISPLAY_WEEKS) {
      throw new BadRequestException({
        code: 'BENTO_MENU_BAD_WEEK',
        message: `week must be 0–${BENTO_DISPLAY_WEEKS - 1} (Week 1–${BENTO_DISPLAY_WEEKS}).`,
      });
    }
    const weekStart = displayWeekStartIsos(BENTO_DISPLAY_WEEKS)[idx];
    const weekEnd = formatDateOnly(addDaysUtc(parseDateOnly(weekStart), 6));
    return { weekIndex: idx, weekStart, weekEnd };
  }

  /** Download a 4-sheet .xlsx template (Week 1–Week 4). */
  @Get('bento-menu/template')
  @RequirePermissions(P.VOUCHER_READ)
  async downloadBentoMenuTemplate() {
    const buffer = await this.bentoMenu.buildTemplateBuffer();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="bento-menu-4-weeks.xlsx"',
    });
  }

  /**
   * Parse an uploaded file. Multi-sheet .xlsx maps each "Week N" tab to calendar
   * week N; single-sheet / .csv uses `?week=` as fallback. Does not persist —
   * admin reviews each tab then saves.
   */
  @Post('bento-menu/import')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importBentoMenu(
    @UploadedFile() file: Express.Multer.File,
    @Query('week') week?: string,
  ) {
    const ctx = this.resolveBentoMenuWeek(week);
    const fallbackIdx = ctx?.weekIndex ?? 0;
    const parsed = await this.bentoMenu.parseUploadToWeeks(file, fallbackIdx);
    return {
      weeks: parsed.map((w) => ({
        weekIndex: w.weekIndex,
        weekStart: w.weekStart,
        weekEnd: formatDateOnly(addDaysUtc(parseDateOnly(w.weekStart), 6)),
        weekdays: w.config.weekdays,
      })),
    };
  }

  /** Upload a dish photo; returns its public URL to store on the menu + save. */
  @Post('bento-menu/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadBentoMenuImage(@UploadedFile() file: Express.Multer.File) {
    return this.bentoMenu.saveMenuImage(file);
  }

  // --- Sales reporting cutoff (System config) ---

  @Get('reporting-settings')
  @RequirePermissions(P.REPORT_VIEW)
  getReportingSettings() {
    return this.reportingSettings.getSettings();
  }

  @Put('reporting-settings')
  @RequirePermissions(P.MASTER_MANAGE)
  updateReportingSettings(@Body() dto: UpdateReportingSettingsDto) {
    return this.reportingSettings.setSettings({
      salesStartDate: dto.salesStartDate ?? null,
    });
  }

  // --- Payments demo/test mode (System config) ---

  @Get('payments/demo-mode')
  @RequirePermissions(P.MASTER_MANAGE)
  getPaymentsDemoMode() {
    return this.admin.getPaymentsDemoMode();
  }

  @Put('payments/demo-mode')
  @RequirePermissions(P.MASTER_MANAGE)
  setPaymentsDemoMode(
    @Body() dto: UpdatePaymentsDemoModeDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.admin.setPaymentsDemoMode(dto, auth);
  }

  @Get('bento-settings')
  @RequirePermissions(P.VOUCHER_READ)
  getBentoSettings() {
    const file = this.bentoSettings.getSettings();
    const effective = this.bentoSettings.getDailyCapacityPacks();
    return {
      ...file,
      effectiveDailyCapacityPacks: effective,
      envOverride: effective !== file.dailyCapacityPacks,
    };
  }

  @Put('bento-settings')
  @RequirePermissions(P.VOUCHER_UPDATE)
  async updateBentoSettings(@Body() dto: UpdateBentoSettingsDto) {
    const saved = await this.bentoSettings.setSettings(dto);
    const effective = this.bentoSettings.getDailyCapacityPacks();
    return {
      ...saved,
      effectiveDailyCapacityPacks: effective,
      envOverride: effective !== saved.dailyCapacityPacks,
    };
  }

  @Get('bento-packages')
  @RequirePermissions(P.VOUCHER_READ)
  getBentoPackages() {
    return this.bentoPackages.listForAdmin();
  }

  @Put('bento-packages')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateBentoPackages(@Body() dto: UpdateBentoPackagesDto) {
    return this.bentoPackages.updatePricing(dto.packages);
  }

  @Get('shop-catalog/popular')
  @RequirePermissions(P.VOUCHER_READ)
  getHomePopularConfig() {
    return this.shopCatalog.getPopularConfig();
  }

  @Patch('shop-catalog/popular')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateHomePopularConfig(@Body() dto: UpdateHomePopularDto) {
    return this.shopCatalog.setPopularConfig(dto);
  }

  @Get('shop-catalog/layout')
  @RequirePermissions(P.VOUCHER_READ)
  getShopCatalogLayout() {
    return this.shopCatalog.getAdminLayout();
  }

  @Patch('shop-catalog/layout')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateShopCatalogLayout(@Body() dto: UpdateShopCatalogLayoutDto) {
    return this.shopCatalog.setLayout(dto);
  }

  @Get('shop-catalog/sites-catalog/info')
  @RequirePermissions(P.VOUCHER_READ)
  getSitesCatalogFileInfo() {
    return this.shopCatalog.getSitesCatalogFileInfo();
  }

  @Post('shop-catalog/sites-catalog/file')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  uploadSitesCatalogFile(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file provided');
    }
    return this.shopCatalog.saveSitesCatalogFile(file.buffer.toString('utf-8'));
  }

  @Post('shop-catalog/sync/preview')
  @RequirePermissions(P.VOUCHER_READ)
  previewShopCatalogSync(@Body() dto: PreviewShopCatalogSyncDto) {
    return this.shopCatalog.previewSyncFromSites({
      catalog: dto.catalog,
      mode: dto.mode,
      syncLayout: dto.syncLayout,
    });
  }

  @Post('shop-catalog/sync/apply')
  @RequirePermissions(P.VOUCHER_UPDATE)
  applyShopCatalogSync(@Body() dto: SyncShopCatalogFromSitesDto) {
    return this.shopCatalog.applySyncFromSites({
      catalog: dto.catalog,
      mode: dto.mode,
      createMissing: dto.createMissing,
      syncLayout: dto.syncLayout,
      writeSeedConfig: dto.writeSeedConfig,
    });
  }

  @Get('home-ads/slides')
  @RequirePermissions(P.VOUCHER_READ)
  listHomeAdSlides() {
    return this.homeAds.listAdminSlides();
  }

  @Post('home-ads/slides')
  @RequirePermissions(P.VOUCHER_CREATE)
  createHomeAdSlide(@Body() dto: CreateHomeAdSlideDto) {
    return this.homeAds.createSlide(dto);
  }

  @Patch('home-ads/slides/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  updateHomeAdSlide(
    @Param('id') id: string,
    @Body() dto: UpdateHomeAdSlideDto,
  ) {
    return this.homeAds.updateSlide(id, dto);
  }

  @Delete('home-ads/slides/:id')
  @RequirePermissions(P.VOUCHER_UPDATE)
  deleteHomeAdSlide(@Param('id') id: string) {
    return this.homeAds.deleteSlide(id);
  }

  @Post('home-ads/slides/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }),
  )
  uploadHomeAdSlideImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.homeAds.attachImage(id, file);
  }

  @Delete('home-ads/slides/:id/image')
  @RequirePermissions(P.VOUCHER_UPDATE)
  clearHomeAdSlideImage(@Param('id') id: string) {
    return this.homeAds.clearImage(id);
  }
}
