import {
  Body,
  Controller,
  Get,
  Param,
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
import { PrismaService } from '../prisma/prisma.service';
import { AdminCreateRewardCatalogDto } from './dto/admin-create-reward-catalog.dto';
import { AdminCreateVoucherCampaignDto } from './dto/admin-create-voucher-campaign.dto';
import { AdminImportGiftCodesDto } from './dto/admin-import-gift-codes.dto';

@Controller('admin/rewards-workflow')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class RewardsWorkflowAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('reward-catalog')
  @RequirePermissions(P.VOUCHER_READ)
  listRewardCatalog() {
    return this.prisma.rewardCatalog.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  @Post('reward-catalog')
  @RequirePermissions(P.VOUCHER_CREATE)
  createRewardCatalog(
    @Body() dto: AdminCreateRewardCatalogDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.prisma.rewardCatalog.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        rewardType: dto.rewardType,
        pointsCost: dto.pointsCost,
        voucherCampaignId: dto.voucherCampaignId ?? null,
        visibleInRewardsWallet: dto.visibleInRewardsWallet ?? true,
        tncText: dto.tncText?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Get('voucher-campaigns')
  @RequirePermissions(P.VOUCHER_READ)
  listVoucherCampaigns() {
    return this.prisma.voucherCampaign.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  @Post('voucher-campaigns')
  @RequirePermissions(P.VOUCHER_CREATE)
  createVoucherCampaign(
    @Body() dto: AdminCreateVoucherCampaignDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    return this.prisma.voucherCampaign.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        voucherType: dto.voucherType,
        percentageOff: dto.percentageOff ?? null,
        fixedAmountOff: dto.fixedAmountOff ?? null,
        minSpend: dto.minSpend ?? null,
        usageLimitPerUser: dto.usageLimitPerUser ?? null,
        totalRedemptionCap: dto.totalRedemptionCap ?? null,
        applicableProductIds: dto.applicableProductIds ?? [],
        applicableCategories: dto.applicableCategories ?? [],
        applicableOutlets: dto.applicableOutlets ?? [],
        applicableOrderTypes: dto.applicableOrderTypes ?? [],
        autoCreditTrigger: dto.autoCreditTrigger?.trim() || null,
        visibleInWallet: dto.visibleInWallet ?? true,
        allowStacking: dto.allowStacking ?? false,
        tncText: dto.tncText?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Post('gift-codes/import')
  @RequirePermissions(P.VOUCHER_CREATE)
  async importGiftCodes(
    @Body() dto: AdminImportGiftCodesDto,
    @CurrentAdmin() _auth: AdminAuthState,
  ) {
    const created = await this.prisma.$transaction(
      dto.rows.map((row) =>
        this.prisma.giftVoucherCode.upsert({
          where: { code: row.code.trim().toUpperCase() },
          create: {
            code: row.code.trim().toUpperCase(),
            amount: row.amount,
            campaignCode: row.campaignCode?.trim() || null,
          },
          update: {
            amount: row.amount,
            campaignCode: row.campaignCode?.trim() || null,
            status: 'ACTIVE',
          },
        }),
      ),
    );
    return { imported: created.length };
  }

  @Get('user-wallet/:customerId')
  @RequirePermissions(P.CUSTOMER_READ)
  async getUserWallet(@Param('customerId') customerId: string) {
    const [wallet, points, walletTxns, vouchers] =
      await this.prisma.$transaction([
        this.prisma.userWalletBalance.findUnique({ where: { customerId } }),
        this.prisma.rewardsPointsLedger.findMany({
          where: { customerId },
          orderBy: [{ createdAt: 'desc' }],
          take: 100,
        }),
        this.prisma.walletTransaction.findMany({
          where: { customerId },
          orderBy: [{ createdAt: 'desc' }],
          take: 100,
        }),
        this.prisma.voucher.findMany({
          where: { customerId },
          orderBy: [{ updatedAt: 'desc' }],
        }),
      ]);
    return { wallet, points, walletTxns, vouchers };
  }

  @Get('points-ledger')
  @RequirePermissions(P.LOYALTY_READ)
  pointsLedger(@Query('limit') limitRaw?: string) {
    const limit = Math.max(1, Math.min(Number(limitRaw ?? 100), 500));
    return this.prisma.rewardsPointsLedger.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  @Get('wallet-transactions')
  @RequirePermissions(P.WALLET_READ)
  walletTransactions(@Query('limit') limitRaw?: string) {
    const limit = Math.max(1, Math.min(Number(limitRaw ?? 100), 500));
    return this.prisma.walletTransaction.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  @Get('redemption-reports')
  @RequirePermissions(P.REPORT_VIEW)
  async redemptionReports() {
    const [total, confirmed, released] = await this.prisma.$transaction([
      this.prisma.voucherRedemption.count(),
      this.prisma.voucherRedemption.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.voucherRedemption.count({ where: { status: 'RELEASED' } }),
    ]);
    return { total, confirmed, released };
  }

  @Get('campaign-analytics')
  @RequirePermissions(P.REPORT_VIEW)
  async campaignAnalytics() {
    const campaigns = await this.prisma.voucherCampaign.findMany({
      include: {
        vouchers: true,
        rewards: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      campaigns: campaigns.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        vouchersIssued: c.vouchers.length,
        rewardsLinked: c.rewards.length,
      })),
    };
  }
}
