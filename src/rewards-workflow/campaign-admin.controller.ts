import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CampaignBuilderService } from './campaign-builder.service';
import { CreateCampaignFromTemplateDto } from './dto/create-campaign-from-template.dto';
import { IssueVoucherToCustomerDto } from './dto/issue-voucher-to-customer.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('admin/campaigns')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class CampaignAdminController {
  constructor(private readonly builder: CampaignBuilderService) {}

  @Get('templates')
  @RequirePermissions(P.VOUCHER_READ)
  getTemplates() {
    return this.builder.getTemplatePresets();
  }

  @Get()
  @RequirePermissions(P.VOUCHER_READ)
  listCampaigns() {
    return this.builder.getCampaignDashboard();
  }

  // Declared before ':campaignId' so the literal path wins over the param route.
  @Get('issued-vouchers')
  @RequirePermissions(P.VOUCHER_READ)
  listIssuedVouchers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('campaignId') campaignId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.builder.listIssuedVouchers({
      search,
      status,
      campaignId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':campaignId')
  @RequirePermissions(P.VOUCHER_READ)
  getCampaign(@Param('campaignId') campaignId: string) {
    return this.builder.getCampaignDetail(campaignId);
  }

  @Post()
  @RequirePermissions(P.VOUCHER_CREATE)
  createCampaign(
    @Body() dto: CreateCampaignFromTemplateDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.createFromTemplate(dto);
  }

  @Patch(':campaignId')
  @RequirePermissions(P.VOUCHER_CREATE)
  updateCampaign(
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.updateCampaign(campaignId, dto);
  }

  @Post(':campaignId/issue/:customerId')
  @RequirePermissions(P.VOUCHER_CREATE)
  issueToCustomer(
    @Param('campaignId') campaignId: string,
    @Param('customerId') customerId: string,
    @Body() dto: IssueVoucherToCustomerDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.issueVoucherToCustomer(
      customerId,
      campaignId,
      dto.expiresAt,
      dto.reason,
    );
  }

  @Post(':campaignId/bulk-issue')
  @RequirePermissions(P.VOUCHER_CREATE)
  bulkIssue(
    @Param('campaignId') campaignId: string,
    @Body() body: { customerIds: string[]; reason?: string },
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.bulkIssueToSegment(
      campaignId,
      body.customerIds,
      body.reason,
    );
  }

  @Post(':campaignId/issue-all')
  @RequirePermissions(P.VOUCHER_CREATE)
  issueAll(
    @Param('campaignId') campaignId: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.issueToAllActive(campaignId, body?.reason);
  }

  @Post('vouchers/:voucherId/revoke')
  @RequirePermissions(P.VOUCHER_CREATE)
  revokeVoucher(
    @Param('voucherId') voucherId: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.revokeVoucher(voucherId, body?.reason);
  }

  @Delete(':campaignId')
  @RequirePermissions(P.VOUCHER_CREATE)
  deleteCampaign(
    @Param('campaignId') campaignId: string,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.builder.deleteCampaign(campaignId);
  }
}
