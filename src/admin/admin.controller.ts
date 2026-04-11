import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import { AdminWalletReversalDto } from './dto/admin-wallet-reversal.dto';
import { AssignCustomerVoucherDto } from './dto/assign-customer-voucher.dto';
import { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';
import { GoodwillVoucherDto } from './dto/goodwill-voucher.dto';
import { RequestWalletReversalDto } from './dto/request-wallet-reversal.dto';
import { RevokeCustomerVoucherDto } from './dto/revoke-customer-voucher.dto';
import { UpdateVoucherDefinitionDto } from './dto/update-voucher-definition.dto';
import { CreateVoucherPushRuleDto } from './dto/create-voucher-push-rule.dto';
import { UpdateVoucherPushRuleDto } from './dto/update-voucher-push-rule.dto';
import { CreateShopCatalogProductDto } from './dto/create-shop-catalog-product.dto';
import { UpdateShopCatalogProductDto } from './dto/update-shop-catalog-product.dto';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';

@Controller('admin')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly approvals: ApprovalsService,
    private readonly shopCatalog: ShopCatalogService,
  ) {}

  @Get('customers')
  @RequirePermissions(P.CUSTOMER_READ)
  listCustomers(@Query() query: AdminListCustomersQueryDto) {
    return this.admin.listCustomers(query);
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
  freezeWallet(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
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

  @Get('voucher-definitions')
  @RequirePermissions(P.VOUCHER_READ)
  listVoucherDefinitions() {
    return this.admin.listVoucherDefinitions();
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

  @Get('shop-catalog/products')
  @RequirePermissions(P.VOUCHER_READ)
  listShopCatalogProducts() {
    return this.shopCatalog.listAdminProducts();
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
}
