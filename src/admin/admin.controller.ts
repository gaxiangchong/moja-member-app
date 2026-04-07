import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from './guards/admin-api-key.guard';
import { AdminService } from './admin.service';
import { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('customers')
  listCustomers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.admin.listCustomers(page, pageSize);
  }

  @Get('customers/:id')
  getCustomer(@Param('id') id: string) {
    return this.admin.getCustomer(id);
  }

  @Post('customers/:id/loyalty/adjustments')
  adjustLoyalty(
    @Param('id') id: string,
    @Body() dto: AdminLoyaltyAdjustmentDto,
    @Headers('x-admin-api-key') adminKey: string,
  ) {
    const hint = adminKey ? `key:${adminKey.slice(0, 6)}…` : 'admin';
    return this.admin.adjustCustomerLoyalty(id, dto, hint);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: AdminUpdateCustomerDto,
    @Headers('x-admin-api-key') adminKey: string,
  ) {
    const hint = adminKey ? `key:${adminKey.slice(0, 6)}…` : 'admin';
    return this.admin.updateCustomer(id, dto, hint);
  }

  @Get('voucher-definitions')
  listVoucherDefinitions() {
    return this.admin.listVoucherDefinitions();
  }

  @Get('loyalty-ledger')
  listLoyaltyLedger(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.admin.listLoyaltyLedger(limit);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.admin.listAuditLogs(limit);
  }

  @Get('overview')
  getOverview() {
    return this.admin.getOverviewStats();
  }

  @Post('voucher-definitions')
  createVoucherDefinition(
    @Body() dto: CreateVoucherDefinitionDto,
    @Headers('x-admin-api-key') adminKey: string,
  ) {
    const hint = adminKey ? `key:${adminKey.slice(0, 6)}…` : 'admin';
    return this.admin.createVoucherDefinition(dto, hint);
  }
}
