import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignTemplate,
  Prisma,
  VoucherLifecycleStatus,
  VoucherType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignFromTemplateDto } from './dto/create-campaign-from-template.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

type TemplatePreset = {
  codePrefix: string;
  voucherType: VoucherType;
  discountPercent?: number;
  discountAmountRM?: number;
  minSpendRM?: number;
  voucherValidDays: number;
  usageLimitPerUser: number;
  autoCreditTrigger: string | null;
  tncText: string;
};

const TEMPLATE_PRESETS: Record<CampaignTemplate, TemplatePreset> = {
  WELCOME: {
    codePrefix: 'WELCOME',
    voucherType: VoucherType.FIXED_AMOUNT,
    discountAmountRM: 5,
    minSpendRM: 0,
    voucherValidDays: 30,
    usageLimitPerUser: 1,
    autoCreditTrigger: 'NEW_MEMBER',
    tncText: 'Welcome voucher for new members. Valid for 30 days from sign-up.',
  },
  BIRTHDAY: {
    codePrefix: 'BDAY',
    voucherType: VoucherType.PERCENTAGE,
    discountPercent: 15,
    minSpendRM: 0,
    voucherValidDays: 7,
    usageLimitPerUser: 1,
    autoCreditTrigger: 'BIRTHDAY',
    tncText:
      'Birthday voucher. Valid for 7 days around your birthday. One-time use.',
  },
  REFERRAL: {
    codePrefix: 'REF',
    voucherType: VoucherType.FIXED_AMOUNT,
    discountAmountRM: 10,
    minSpendRM: 0,
    voucherValidDays: 60,
    usageLimitPerUser: 1,
    autoCreditTrigger: 'REFERRAL_COUNT',
    tncText: 'Referral reward. Thank you for referring a friend!',
  },
  WINBACK: {
    codePrefix: 'WINBACK',
    voucherType: VoucherType.FIXED_AMOUNT,
    discountAmountRM: 8,
    minSpendRM: 0,
    voucherValidDays: 14,
    usageLimitPerUser: 1,
    autoCreditTrigger: 'INACTIVE_DAYS',
    tncText: 'We miss you! Use this voucher on your next order.',
  },
  SPEND_EARN: {
    codePrefix: 'SPEND',
    voucherType: VoucherType.PERCENTAGE,
    discountPercent: 10,
    minSpendRM: 50,
    voucherValidDays: 30,
    usageLimitPerUser: 1,
    autoCreditTrigger: 'MIN_PURCHASE',
    tncText: 'Spend & earn reward. Minimum spend applies.',
  },
  CUSTOM: {
    codePrefix: 'PROMO',
    voucherType: VoucherType.FIXED_AMOUNT,
    discountAmountRM: 0,
    voucherValidDays: 30,
    usageLimitPerUser: 1,
    autoCreditTrigger: null,
    tncText: '',
  },
};

@Injectable()
export class CampaignBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  getTemplatePresets() {
    return Object.entries(TEMPLATE_PRESETS).map(([key, preset]) => ({
      template: key,
      ...preset,
    }));
  }

  async createFromTemplate(dto: CreateCampaignFromTemplateDto) {
    const preset = TEMPLATE_PRESETS[dto.template];
    const codePrefix = preset.codePrefix;
    const campaignCode = `${codePrefix}-${this.generateShortId()}`.toUpperCase();

    const existingCode = await this.prisma.voucherCampaign.findUnique({
      where: { code: campaignCode },
    });
    if (existingCode) {
      throw new BadRequestException(
        'Generated code collision, please try again.',
      );
    }

    const voucherType = dto.voucherType ?? preset.voucherType;
    const percentageOff = dto.discountPercent ?? preset.discountPercent ?? null;
    const fixedAmountOffSen = dto.discountAmountRM
      ? Math.round(dto.discountAmountRM * 100)
      : preset.discountAmountRM
        ? preset.discountAmountRM * 100
        : null;
    const minSpendSen = dto.minSpendRM
      ? Math.round(dto.minSpendRM * 100)
      : preset.minSpendRM !== undefined
        ? preset.minSpendRM * 100
        : null;
    const walletCreditSen = dto.walletCreditRM
      ? Math.round(dto.walletCreditRM * 100)
      : null;

    const triggerValue =
      dto.trigger.type === 'AUTO' ? (dto.trigger.criteria ?? null) : null;
    // MIN_PURCHASE is entered in RM but compared against order totals in
    // sen; REFERRAL_COUNT/INACTIVE_DAYS are plain counts, stored as-is.
    const triggerThreshold =
      dto.trigger.type === 'AUTO' && dto.trigger.thresholdValue != null
        ? Math.round(
            dto.trigger.criteria === 'MIN_PURCHASE'
              ? dto.trigger.thresholdValue * 100
              : dto.trigger.thresholdValue,
          )
        : null;

    const campaign = await this.prisma.voucherCampaign.create({
      data: {
        code: campaignCode,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        template: dto.template,
        codePrefix,
        voucherType,
        percentageOff,
        fixedAmountOff: fixedAmountOffSen,
        freeItemSku: dto.freeItemSku ?? null,
        walletCreditAmount: walletCreditSen,
        minSpend: minSpendSen,
        oneTimeUse: (dto.usageLimitPerUser ?? preset.usageLimitPerUser) === 1,
        usageLimitPerUser: dto.usageLimitPerUser ?? preset.usageLimitPerUser,
        totalRedemptionCap: dto.maxTotalIssued ?? null,
        applicableOutlets: dto.applicableOutlets ?? [],
        applicableOrderTypes: dto.applicableOrderTypes ?? [],
        applicableCategories: dto.applicableCategories ?? [],
        autoCreditTrigger: triggerValue ?? preset.autoCreditTrigger,
        autoCreditThreshold: triggerThreshold,
        allowStacking: dto.allowStacking ?? false,
        visibleInWallet: true,
        tncText: dto.tncText?.trim() || preset.tncText,
        isActive: true,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        voucherValidDays: dto.voucherValidDays ?? preset.voucherValidDays,
      },
    });

    if (
      dto.trigger.type === 'POINTS_REDEEM' &&
      dto.pointsCost !== undefined &&
      dto.pointsCost > 0
    ) {
      await this.prisma.rewardCatalog.create({
        data: {
          code: `REWARD-${campaignCode}`,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          rewardType: 'DISCOUNT_VOUCHER',
          pointsCost: dto.pointsCost,
          voucherCampaignId: campaign.id,
          visibleInRewardsWallet: true,
          isActive: true,
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          tncText: dto.tncText?.trim() || preset.tncText,
        },
      });
    }

    return campaign;
  }

  async updateCampaign(campaignId: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!existing) throw new NotFoundException('Campaign not found.');

    // Threshold unit depends on the (possibly just-changed) criteria, so
    // resolve which criteria is in effect before converting MIN_PURCHASE's
    // RM input to the sen the automation sweep compares against.
    const effectiveTrigger =
      dto.autoCreditTrigger !== undefined
        ? dto.autoCreditTrigger || null
        : existing.autoCreditTrigger;
    const nextThreshold =
      dto.autoCreditThresholdValue !== undefined
        ? Math.round(
            effectiveTrigger === 'MIN_PURCHASE'
              ? dto.autoCreditThresholdValue * 100
              : dto.autoCreditThresholdValue,
          )
        : dto.autoCreditTrigger !== undefined
          ? null // trigger changed with no fresh threshold — drop the stale one
          : undefined;

    return this.prisma.voucherCampaign.update({
      where: { id: campaignId },
      data: {
        ...(dto.autoCreditTrigger !== undefined
          ? { autoCreditTrigger: effectiveTrigger }
          : {}),
        ...(nextThreshold !== undefined
          ? { autoCreditThreshold: nextThreshold }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.discountPercent !== undefined
          ? { percentageOff: dto.discountPercent }
          : {}),
        ...(dto.discountAmountRM !== undefined
          ? { fixedAmountOff: Math.round(dto.discountAmountRM * 100) }
          : {}),
        ...(dto.minSpendRM !== undefined
          ? { minSpend: Math.round(dto.minSpendRM * 100) }
          : {}),
        ...(dto.startsAt !== undefined
          ? { startsAt: new Date(dto.startsAt) }
          : {}),
        ...(dto.endsAt !== undefined
          ? { endsAt: new Date(dto.endsAt) }
          : {}),
        ...(dto.voucherValidDays !== undefined
          ? { voucherValidDays: dto.voucherValidDays }
          : {}),
        ...(dto.maxTotalIssued !== undefined
          ? { totalRedemptionCap: dto.maxTotalIssued }
          : {}),
        ...(dto.usageLimitPerUser !== undefined
          ? { usageLimitPerUser: dto.usageLimitPerUser }
          : {}),
        ...(dto.applicableOutlets !== undefined
          ? { applicableOutlets: dto.applicableOutlets }
          : {}),
        ...(dto.applicableOrderTypes !== undefined
          ? { applicableOrderTypes: dto.applicableOrderTypes }
          : {}),
        ...(dto.applicableCategories !== undefined
          ? { applicableCategories: dto.applicableCategories }
          : {}),
        ...(dto.allowStacking !== undefined
          ? { allowStacking: dto.allowStacking }
          : {}),
        ...(dto.tncText !== undefined
          ? { tncText: dto.tncText.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.visibleInWallet !== undefined
          ? { visibleInWallet: dto.visibleInWallet }
          : {}),
      },
    });
  }

  /**
   * Pass `tx` when issuing as part of a caller's own transaction (e.g. reward
   * redemption debits points and issues a voucher atomically) — otherwise
   * runs directly against the shared PrismaService connection.
   */
  async issueVoucherToCustomer(
    customerId: string,
    campaignId: string,
    expiresAt?: string | null,
    reason?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const campaign = await db.voucherCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    if (!campaign.isActive) {
      throw new BadRequestException('Campaign is not active.');
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found.');

    if (campaign.totalRedemptionCap) {
      const issuedCount = await db.voucher.count({
        where: { voucherCampaignId: campaignId },
      });
      if (issuedCount >= campaign.totalRedemptionCap) {
        throw new BadRequestException('Campaign issuance cap reached.');
      }
    }

    const prefix = campaign.codePrefix ?? campaign.code.split('-')[0] ?? 'V';
    const code = `${prefix}-${this.generateShortId()}`.toUpperCase();

    const isBirthday =
      campaign.template === 'BIRTHDAY' ||
      campaign.autoCreditTrigger === 'BIRTHDAY';

    let computedExpiry: Date | null = null;
    let validFrom: Date | null = null;
    if (expiresAt) {
      // Explicit override always wins.
      computedExpiry = new Date(expiresAt);
    } else if (isBirthday && customer.birthday) {
      // Anchor the validity window to the member's birthday so a birthday
      // voucher can only be used around their birthday for the defined number
      // of days, regardless of when it was issued.
      const window = this.computeBirthdayWindow(
        customer.birthday,
        campaign.voucherValidDays ?? 7,
      );
      validFrom = window.validFrom;
      computedExpiry = window.expiresAt;
    } else if (campaign.voucherValidDays) {
      computedExpiry = new Date();
      computedExpiry.setDate(
        computedExpiry.getDate() + campaign.voucherValidDays,
      );
    }

    const metadata: Record<string, string> = {};
    if (reason) metadata.issueReason = reason;
    // Only record a start date when it's in the future (enforced at checkout).
    if (validFrom && validFrom.getTime() > Date.now()) {
      metadata.validFrom = validFrom.toISOString();
    }

    const voucher = await db.voucher.create({
      data: {
        customerId,
        voucherCampaignId: campaignId,
        code,
        name: campaign.name,
        status: VoucherLifecycleStatus.ACTIVE,
        expiresAt: computedExpiry,
        usageLimitPerUser: campaign.usageLimitPerUser,
        visibleInWallet: campaign.visibleInWallet,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      },
    });

    return voucher;
  }

  /**
   * Resolve the next relevant birthday window for a member. Anchors a window of
   * `validDays` length at this year's birthday; if that window has already
   * fully passed, rolls forward to next year's birthday. Uses UTC month/day
   * from the stored birthday (year is irrelevant).
   */
  private computeBirthdayWindow(
    birthday: Date,
    validDays: number,
    now: Date = new Date(),
  ): { validFrom: Date; expiresAt: Date } {
    const days = validDays > 0 ? validDays : 7;
    const month = birthday.getUTCMonth();
    const day = birthday.getUTCDate();
    const year = now.getUTCFullYear();
    let start = new Date(Date.UTC(year, month, day, 0, 0, 0));
    let end = new Date(start.getTime() + days * 86_400_000);
    if (end.getTime() < now.getTime()) {
      start = new Date(Date.UTC(year + 1, month, day, 0, 0, 0));
      end = new Date(start.getTime() + days * 86_400_000);
    }
    return { validFrom: start, expiresAt: end };
  }

  async getCampaignDashboard() {
    const now = new Date();
    const campaigns = await this.prisma.voucherCampaign.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { vouchers: true } },
        rewards: { select: { id: true, pointsCost: true } },
      },
    });

    return campaigns.map((c) => {
      let status: 'active' | 'scheduled' | 'ended' | 'paused';
      if (!c.isActive) {
        status = 'paused';
      } else if (c.startsAt && c.startsAt > now) {
        status = 'scheduled';
      } else if (c.endsAt && c.endsAt <= now) {
        status = 'ended';
      } else {
        status = 'active';
      }

      return {
        id: c.id,
        code: c.code,
        name: c.name,
        template: c.template,
        voucherType: c.voucherType,
        status,
        vouchersIssued: c._count.vouchers,
        totalRedemptionCap: c.totalRedemptionCap,
        discountDisplay: this.formatDiscount(c),
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        createdAt: c.createdAt,
        linkedRewards: c.rewards.length,
        autoCreditTrigger: c.autoCreditTrigger,
      };
    });
  }

  async getCampaignDetail(campaignId: string) {
    const campaign = await this.prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
      include: {
        vouchers: {
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
          include: {
            customer: {
              select: { id: true, displayName: true, phoneE164: true },
            },
          },
        },
        rewards: true,
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');

    const stats = await this.prisma.voucher.groupBy({
      by: ['status'],
      where: { voucherCampaignId: campaignId },
      _count: true,
    });

    return {
      ...campaign,
      fixedAmountOffRM: campaign.fixedAmountOff
        ? campaign.fixedAmountOff / 100
        : null,
      minSpendRM: campaign.minSpend ? campaign.minSpend / 100 : null,
      walletCreditRM: campaign.walletCreditAmount
        ? campaign.walletCreditAmount / 100
        : null,
      stats: Object.fromEntries(
        stats.map((s) => [s.status, s._count]),
      ),
    };
  }

  async bulkIssueToSegment(
    campaignId: string,
    customerIds: string[],
    reason?: string,
  ) {
    const results: { customerId: string; voucherCode: string }[] = [];
    const errors: { customerId: string; error: string }[] = [];

    for (const customerId of customerIds) {
      try {
        const voucher = await this.issueVoucherToCustomer(
          customerId,
          campaignId,
          null,
          reason ?? 'bulk_issue',
        );
        results.push({ customerId, voucherCode: voucher.code });
      } catch (err) {
        errors.push({
          customerId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      issued: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Issue this campaign's voucher to every ACTIVE customer who doesn't already
   * hold one from it. Skips duplicates so it's safe to run more than once.
   */
  async issueToAllActive(campaignId: string, reason?: string) {
    const campaign = await this.prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    if (!campaign.isActive) {
      throw new BadRequestException('Campaign is not active.');
    }

    const [customers, alreadyIssued] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.voucher.findMany({
        where: { voucherCampaignId: campaignId },
        select: { customerId: true },
      }),
    ]);
    const have = new Set(alreadyIssued.map((v) => v.customerId));
    const targetIds = customers
      .map((c) => c.id)
      .filter((id) => !have.has(id));

    const result = await this.bulkIssueToSegment(
      campaignId,
      targetIds,
      reason ?? 'issue_all_active',
    );
    return { ...result, skipped: have.size, eligible: targetIds.length };
  }

  /**
   * Delete a campaign. Refuses when vouchers have already been issued (those
   * are real member assets) — deactivate instead. Cleans up the auto-created
   * linked reward-catalog entry when it has no redemptions.
   */
  async deleteCampaign(campaignId: string) {
    const campaign = await this.prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
      include: {
        _count: { select: { vouchers: true } },
        rewards: { include: { _count: { select: { userRewards: true } } } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');

    if (campaign._count.vouchers > 0) {
      throw new BadRequestException(
        `Cannot delete: ${campaign._count.vouchers} voucher(s) already issued to members. Deactivate the campaign instead.`,
      );
    }
    const rewardsWithRedemptions = campaign.rewards.filter(
      (r) => r._count.userRewards > 0,
    );
    if (rewardsWithRedemptions.length > 0) {
      throw new BadRequestException(
        'Cannot delete: a linked gift reward has already been redeemed. Deactivate instead.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.rewardCatalog.deleteMany({
        where: { voucherCampaignId: campaignId },
      }),
      this.prisma.voucherCampaign.delete({ where: { id: campaignId } }),
    ]);
    return { deleted: true };
  }

  /**
   * Searchable, filterable, paginated list of every voucher issued to a member.
   * Powers the admin "Issued vouchers" overview: who received what, current
   * status, and when it was redeemed.
   */
  async listIssuedVouchers(params: {
    search?: string;
    status?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.VoucherWhereInput = {};
    const statusValues = Object.values(VoucherLifecycleStatus) as string[];
    if (params.status && statusValues.includes(params.status)) {
      where.status = params.status as VoucherLifecycleStatus;
    }
    if (params.campaignId) {
      where.voucherCampaignId = params.campaignId;
    }
    const search = params.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { customer: { phoneE164: { contains: search } } },
        { customer: { displayName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, displayName: true, phoneE164: true },
          },
          voucherCampaign: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return {
      items: items.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        status: v.status,
        issuedAt: v.createdAt,
        expiresAt: v.expiresAt,
        usedAt: v.usedAt,
        validFrom:
          (v.metadata as { validFrom?: string } | null)?.validFrom ?? null,
        customer: v.customer
          ? {
              id: v.customer.id,
              displayName: v.customer.displayName,
              phoneE164: v.customer.phoneE164,
            }
          : null,
        campaign: v.voucherCampaign
          ? {
              id: v.voucherCampaign.id,
              name: v.voucherCampaign.name,
              code: v.voucherCampaign.code,
            }
          : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Withdraw (void) an issued voucher so the member can no longer use it. A
   * voucher that has already been redeemed cannot be withdrawn. Releases any
   * in-flight checkout lock and hides it from the member wallet.
   */
  async revokeVoucher(voucherId: string, reason?: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
    });
    if (!voucher) throw new NotFoundException('Voucher not found.');
    if (voucher.status === VoucherLifecycleStatus.USED) {
      throw new BadRequestException(
        'Cannot withdraw a voucher that has already been redeemed.',
      );
    }
    if (voucher.status === VoucherLifecycleStatus.VOID) {
      return voucher;
    }

    const existingMeta =
      voucher.metadata && typeof voucher.metadata === 'object'
        ? (voucher.metadata as Record<string, unknown>)
        : {};

    const [updated] = await this.prisma.$transaction([
      this.prisma.voucher.update({
        where: { id: voucherId },
        data: {
          status: VoucherLifecycleStatus.VOID,
          visibleInWallet: false,
          lockToken: null,
          lockedAt: null,
          lockExpiresAt: null,
          metadata: {
            ...existingMeta,
            revokedAt: new Date().toISOString(),
            revokeReason: reason ?? null,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.voucherRedemption.updateMany({
        where: { voucherId, status: 'LOCKED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      }),
    ]);
    return updated;
  }

  private generateShortId(): string {
    return randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  }

  private formatDiscount(campaign: {
    voucherType: VoucherType;
    percentageOff: number | null;
    fixedAmountOff: number | null;
    deliveryDiscountAmount: number | null;
    walletCreditAmount: number | null;
  }): string {
    switch (campaign.voucherType) {
      case 'PERCENTAGE':
        return `${campaign.percentageOff ?? 0}% off`;
      case 'FIXED_AMOUNT':
        return `RM${((campaign.fixedAmountOff ?? 0) / 100).toFixed(2)} off`;
      case 'DELIVERY_DISCOUNT':
        return `RM${((campaign.deliveryDiscountAmount ?? 0) / 100).toFixed(2)} delivery discount`;
      case 'WALLET_TOPUP_CODE':
        return `RM${((campaign.walletCreditAmount ?? 0) / 100).toFixed(2)} wallet credit`;
      case 'FREE_ITEM':
        return 'Free item';
      default:
        return '';
    }
  }
}
