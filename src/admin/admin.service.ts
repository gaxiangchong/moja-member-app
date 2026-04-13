import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerStatus,
  PerksCriteriaKind,
  PerksProgramKind,
  Prisma,
  VoucherStatus,
  WalletTxnType,
} from '@prisma/client';
import { auditActorBase } from '../admin-auth/audit-context.util';
import { P, hasPermission } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import type { AdminListAuditQueryDto } from './dto/admin-list-audit-query.dto';
import type { AdminListCustomersQueryDto } from './dto/admin-list-customers-query.dto';
import type { AdminListOrdersQueryDto } from './dto/admin-list-orders-query.dto';
import type { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import type { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import type { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import type { AssignCustomerVoucherDto } from './dto/assign-customer-voucher.dto';
import type { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';
import type { CreateVoucherPushRuleDto } from './dto/create-voucher-push-rule.dto';
import type { GoodwillVoucherDto } from './dto/goodwill-voucher.dto';
import type { RevokeCustomerVoucherDto } from './dto/revoke-customer-voucher.dto';
import type {
  SalesAnalyticsQueryDto,
  SalesAnalyticsResult,
} from './dto/sales-analytics-query.dto';
import type { UpdateVoucherDefinitionDto } from './dto/update-voucher-definition.dto';
import type { UpdateVoucherPushRuleDto } from './dto/update-voucher-push-rule.dto';
import type { CreatePerksCampaignRuleDto } from './dto/create-perks-campaign-rule.dto';
import type { UpdatePerksCampaignRuleDto } from './dto/update-perks-campaign-rule.dto';

function dtoHas<T extends object>(dto: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(dto, key);
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfLocalWeekMonday(d = new Date()): Date {
  const x = startOfLocalDay(d);
  const dow = x.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfLocalMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function perksDateOnly(isoDate: string): Date {
  const s = isoDate.trim().slice(0, 10);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: 'Invalid campaign date',
    });
  }
  return d;
}

function validatePerksCampaignRuleFields(input: {
  programKind: PerksProgramKind;
  criteriaKind: PerksCriteriaKind;
  campaignStartDate: Date;
  campaignEndDate: Date;
  minPurchaseAmountSen: number | null;
  rebateValueSen: number | null;
  minWalletTopupSen: number | null;
  withinDaysOfSignup: number | null;
  minReferralCount: number | null;
  inactiveDays: number | null;
  minMemberTier: string | null;
  definitionPointsCost: number | null;
}) {
  const end = input.campaignEndDate.getTime();
  const start = input.campaignStartDate.getTime();
  if (end < start) {
    throw new BadRequestException({
      code: 'PERKS_CAMPAIGN_DATES',
      message: 'Campaign end date must be on or after start date',
    });
  }

  if (input.programKind === PerksProgramKind.VOUCHER_REBATE) {
    if (input.rebateValueSen == null || input.rebateValueSen < 1) {
      throw new BadRequestException({
        code: 'PERKS_REBATE_REQUIRED',
        message: 'Voucher rebate rules require a rebate value greater than RM 0',
      });
    }
  } else if (input.rebateValueSen != null && input.rebateValueSen > 0) {
    throw new BadRequestException({
      code: 'PERKS_REBATE_FORBIDDEN',
      message: 'Rebate value applies only to voucher (cash rebate) programs',
    });
  }

  if (input.programKind === PerksProgramKind.REWARD_POINTS_REDEEM) {
    if (input.criteriaKind !== PerksCriteriaKind.CAMPAIGN_WINDOW_ONLY) {
      throw new BadRequestException({
        code: 'PERKS_POINTS_CRITERIA',
        message: 'Points-catalog rewards use criteria “Campaign window only”',
      });
    }
    const pc = input.definitionPointsCost;
    if (pc == null || pc < 1) {
      throw new BadRequestException({
        code: 'PERKS_POINTS_COST',
        message: 'Pick a voucher definition with a points cost (catalog redeemable)',
      });
    }
  }

  switch (input.criteriaKind) {
    case PerksCriteriaKind.CAMPAIGN_WINDOW_ONLY:
      break;
    case PerksCriteriaKind.NEW_MEMBER_WITHIN_DAYS:
      if (input.withinDaysOfSignup == null || input.withinDaysOfSignup < 1) {
        throw new BadRequestException({
          code: 'PERKS_WITHIN_DAYS',
          message: 'Enter within-days for new member criteria',
        });
      }
      break;
    case PerksCriteriaKind.SINGLE_PURCHASE_MIN_RM:
      if (input.minPurchaseAmountSen == null || input.minPurchaseAmountSen < 1) {
        throw new BadRequestException({
          code: 'PERKS_MIN_PURCHASE',
          message: 'Enter minimum purchase (RM) for single-order criteria',
        });
      }
      break;
    case PerksCriteriaKind.TIER_AND_PURCHASE_MIN_RM:
      if (input.minPurchaseAmountSen == null || input.minPurchaseAmountSen < 1) {
        throw new BadRequestException({
          code: 'PERKS_MIN_PURCHASE',
          message: 'Enter minimum purchase (RM) for tier + purchase criteria',
        });
      }
      if (!input.minMemberTier?.trim()) {
        throw new BadRequestException({
          code: 'PERKS_MIN_TIER',
          message: 'Select minimum member tier (Silver / Gold / Platinum)',
        });
      }
      break;
    case PerksCriteriaKind.BIRTHDAY_DURING_CAMPAIGN:
      break;
    case PerksCriteriaKind.WALLET_TOPUP_MIN_RM:
      if (input.minWalletTopupSen == null || input.minWalletTopupSen < 1) {
        throw new BadRequestException({
          code: 'PERKS_MIN_TOPUP',
          message: 'Enter minimum wallet top-up (RM)',
        });
      }
      break;
    case PerksCriteriaKind.REFERRALS_MIN_COUNT:
      if (input.minReferralCount == null || input.minReferralCount < 1) {
        throw new BadRequestException({
          code: 'PERKS_MIN_REFERRALS',
          message: 'Enter minimum successful referrals',
        });
      }
      break;
    case PerksCriteriaKind.REENGAGEMENT_INACTIVE_DAYS:
      if (input.inactiveDays == null || input.inactiveDays < 1) {
        throw new BadRequestException({
          code: 'PERKS_INACTIVE_DAYS',
          message: 'Enter inactive days for re-engagement criteria',
        });
      }
      break;
    default:
      throw new BadRequestException({
        code: 'PERKS_CRITERIA',
        message: 'Unsupported criteria kind',
      });
  }
}

function daysUntilBirthdayUtc(birthday: Date | null): number | null {
  if (!birthday) return null;
  const now = new Date();
  const m = birthday.getUTCMonth();
  const d = birthday.getUTCDate();
  const y = now.getUTCFullYear();
  let next = Date.UTC(y, m, d);
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (next < todayUtc) {
    next = Date.UTC(y + 1, m, d);
  }
  return Math.round((next - todayUtc) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
    private readonly phoneNormalizer: PhoneNormalizerService,
  ) {}

  private buildCustomerWhere(
    q: AdminListCustomersQueryDto,
  ): Prisma.CustomerWhereInput {
    const parts: Prisma.CustomerWhereInput[] = [];

    if (q.search?.trim()) {
      const s = q.search.trim();
      const or: Prisma.CustomerWhereInput[] = [
        { phoneE164: { contains: s, mode: 'insensitive' } },
        { displayName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          s,
        )
      ) {
        or.push({ id: s });
      }
      parts.push({ OR: or });
    }

    if (q.status) parts.push({ status: q.status });
    if (q.memberTier) parts.push({ memberTier: q.memberTier });
    if (q.signupSource) parts.push({ signupSource: q.signupSource });

    if (q.minPoints != null || q.maxPoints != null) {
      const range: Prisma.IntFilter = {};
      if (q.minPoints != null) range.gte = q.minPoints;
      if (q.maxPoints != null) range.lte = q.maxPoints;
      parts.push({ wallet: { pointsCached: range } });
    }

    if (q.hasActiveVoucher === true) {
      parts.push({ vouchers: { some: { status: 'ISSUED' } } });
    } else if (q.hasActiveVoucher === false) {
      parts.push({ NOT: { vouchers: { some: { status: 'ISSUED' } } } });
    }

    if (!parts.length) return {};
    return { AND: parts };
  }

  async listCustomers(query: AdminListCustomersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = this.buildCustomerWhere(query);
    const dir = query.sortDir === 'asc' ? 'asc' : 'desc';
    let orderBy: Prisma.CustomerOrderByWithRelationInput = { createdAt: dir };
    switch (query.sortBy) {
      case 'lastLoginAt':
        orderBy = { lastLoginAt: dir };
        break;
      case 'points':
        orderBy = { wallet: { pointsCached: dir } };
        break;
      case 'spent':
        orderBy = { storedWallet: { lifetimeSpentCents: dir } };
        break;
      case 'name':
        orderBy = { displayName: dir };
        break;
      case 'referrals':
        orderBy = { referredMembers: { _count: dir } };
        break;
      default:
        orderBy = { createdAt: dir };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          wallet: true,
          storedWallet: { select: { lifetimeSpentCents: true } },
          vouchers: {
            where: { status: 'ISSUED' },
            select: { id: true },
          },
          _count: { select: { referredMembers: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        phoneE164: c.phoneE164,
        status: c.status,
        displayName: c.displayName,
        email: c.email,
        birthday: c.birthday,
        gender: c.gender,
        preferredStore: c.preferredStore,
        signupSource: c.signupSource,
        memberTier: c.memberTier,
        marketingConsent: c.marketingConsent,
        tags: c.tags,
        lastLoginAt: c.lastLoginAt,
        lastVisitAt: c.lastLoginAt,
        birthdayDaysUntil: daysUntilBirthdayUtc(c.birthday),
        pointsBalance: c.wallet?.pointsCached ?? 0,
        lifetimeSpentCents: c.storedWallet?.lifetimeSpentCents ?? 0,
        referralsMade: c._count.referredMembers,
        activeVoucherCount: c.vouchers.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      page: Math.max(page, 1),
      pageSize: take,
      total,
    };
  }

  async listCustomerOrders(customerId: string, limit = 40) {
    await this.getCustomer(customerId);
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.customerOrder.findMany({
      where: { customerId },
      orderBy: { placedAt: 'desc' },
      take,
      include: { lines: true },
    });
  }

  async getCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        wallet: true,
        storedWallet: { select: { lifetimeSpentCents: true } },
        ledgerEntries: { take: 20, orderBy: { createdAt: 'desc' } },
        vouchers: {
          take: 30,
          orderBy: { updatedAt: 'desc' },
          include: { definition: true },
        },
        _count: { select: { referredMembers: true } },
      },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }
    const { loginPinHash: _loginPinHash, ...safe } = customer;
    return safe;
  }

  async listCustomerAuditLogs(customerId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    await this.getCustomer(customerId);
    return this.prisma.auditLog.findMany({
      where: { entityType: 'customer', entityId: customerId },
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCustomer(
    id: string,
    dto: AdminUpdateCustomerDto,
    auth: AdminAuthState,
  ) {
    const base = auditActorBase(auth);
    const canProfile = hasPermission(auth.permissions, P.CUSTOMER_WRITE_PROFILE);
    const canIdentity = hasPermission(auth.permissions, P.CUSTOMER_WRITE_IDENTITY);
    const canPhone = hasPermission(auth.permissions, P.CUSTOMER_PHONE_CHANGE);
    if (!canProfile && !canIdentity && !canPhone) {
      throw new ForbiddenException({
        code: 'CUSTOMER_UPDATE_FORBIDDEN',
        message: 'No permission to update member records',
      });
    }

    const profileKeys = [
      'displayName',
      'email',
      'birthday',
      'gender',
      'preferredStore',
      'marketingConsent',
      'notes',
      'tags',
    ] as const;
    const identityKeys = ['status', 'signupSource', 'memberTier'] as const;

    for (const k of profileKeys) {
      if (dtoHas(dto, k) && !canProfile) {
        throw new ForbiddenException({
          code: 'CUSTOMER_PROFILE_UPDATE_FORBIDDEN',
          message: 'Missing permission to update profile fields',
        });
      }
    }
    for (const k of identityKeys) {
      if (dtoHas(dto, k) && !canIdentity) {
        throw new ForbiddenException({
          code: 'CUSTOMER_IDENTITY_UPDATE_FORBIDDEN',
          message: 'Missing permission to update identity fields',
        });
      }
    }

    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }

    let targetPhone = existing.phoneE164;
    let phoneChanging = false;
    if (dtoHas(dto, 'phoneE164') && dto.phoneE164 !== undefined) {
      targetPhone = this.phoneNormalizer.normalizeToE164(dto.phoneE164);
      phoneChanging = targetPhone !== existing.phoneE164;
    }

    if (dtoHas(dto, 'phoneE164') && dto.phoneE164 !== undefined) {
      if (phoneChanging && !canPhone) {
        throw new ForbiddenException({
          code: 'PHONE_CHANGE_FORBIDDEN',
          message: 'Missing permission to change member phone number',
        });
      }
      if (phoneChanging) {
        const allow =
          this.config.get<string>('ADMIN_ALLOW_PHONE_CHANGE', 'false')
            .toLowerCase()
            .trim() === 'true';
        if (!allow) {
          throw new ForbiddenException({
            code: 'PHONE_CHANGE_DISABLED',
            message:
              'Changing member phone is disabled. Set ADMIN_ALLOW_PHONE_CHANGE=true to enable.',
          });
        }
        const taken = await this.prisma.customer.findUnique({
          where: { phoneE164: targetPhone },
        });
        if (taken) {
          throw new ConflictException({
            code: 'PHONE_IN_USE',
            message: 'Another member already uses this phone number.',
          });
        }
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        phoneE164: targetPhone,
        displayName: dto.displayName ?? undefined,
        email: dto.email ?? undefined,
        status: dto.status ?? undefined,
        birthday:
          dto.birthday !== undefined
            ? dto.birthday
              ? new Date(dto.birthday)
              : null
            : undefined,
        gender: dto.gender ?? undefined,
        preferredStore: dto.preferredStore ?? undefined,
        signupSource: dto.signupSource ?? undefined,
        memberTier: dto.memberTier ?? undefined,
        marketingConsent: dto.marketingConsent ?? undefined,
        notes: dto.notes ?? undefined,
        tags: dto.tags !== undefined ? { set: dto.tags } : undefined,
      },
      include: { wallet: true },
    });

    const snapshot = (c: typeof existing) => ({
      phoneE164: c.phoneE164,
      displayName: c.displayName,
      email: c.email,
      status: c.status,
      birthday: c.birthday?.toISOString().slice(0, 10) ?? null,
      gender: c.gender,
      preferredStore: c.preferredStore,
      signupSource: c.signupSource,
      memberTier: c.memberTier,
      marketingConsent: c.marketingConsent,
      notes: c.notes,
      tags: c.tags,
    });

    await this.audit.log({
      ...base,
      action: 'customer.updated',
      entityType: 'customer',
      entityId: id,
      beforeValue: snapshot(existing) as object,
      afterValue: snapshot(updated) as object,
      metadata: {
        sensitiveFields: ['phoneE164', 'email', 'birthday', 'marketingConsent'],
      },
    });

    if (targetPhone !== existing.phoneE164) {
      await this.audit.log({
        ...base,
        action: 'customer.phone_changed',
        entityType: 'customer',
        entityId: id,
        beforeValue: { phoneE164: existing.phoneE164 } as object,
        afterValue: { phoneE164: targetPhone } as object,
        metadata: { sensitive: true },
      });
    }

    return updated;
  }

  async listVoucherDefinitions() {
    return this.prisma.voucherDefinition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLoyaltyLedger(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const entries = await this.prisma.loyaltyLedgerEntry.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            phoneE164: true,
          },
        },
      },
    });
    return entries.map((entry) => ({
      id: entry.id,
      customerId: entry.customerId,
      customerPhone: entry.customer.phoneE164,
      deltaPoints: entry.deltaPoints,
      balanceAfter: entry.balanceAfter,
      reason: entry.reason,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      createdAt: entry.createdAt,
    }));
  }

  async listAuditLogs(query: AdminListAuditQueryDto) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.adminUserId) where.adminUserId = query.adminUserId;
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }
    if (query.entityType) {
      where.entityType = { contains: query.entityType, mode: 'insensitive' };
    }
    if (query.entityId) where.entityId = query.entityId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    return this.prisma.auditLog.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCustomerWallet(customerId: string) {
    await this.getCustomer(customerId);
    const [summary, transactions] = await Promise.all([
      this.wallet.getSummary(customerId),
      this.wallet.listLedger(customerId, 100),
    ]);
    return { summary, transactions };
  }

  async listWalletLedger(limit = 50, customerId?: string) {
    const rows = await this.wallet.listLedgerGlobal(limit, customerId);
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerPhone: r.customer.phoneE164,
      type: r.type,
      amountCents: r.amountCents,
      balanceBefore: r.balanceBefore,
      balanceAfter: r.balanceAfter,
      reason: r.reason,
      createdByType: r.createdByType,
      createdBy: r.createdBy,
      reversedByTxnId: r.reversedByTxnId,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }));
  }

  async setWalletFreeze(
    customerId: string,
    isFrozen: boolean,
    auth: AdminAuthState,
  ) {
    await this.getCustomer(customerId);
    const updated = await this.wallet.setFreeze(customerId, isFrozen);
    await this.audit.log({
      ...auditActorBase(auth),
      action: isFrozen ? 'wallet.frozen' : 'wallet.unfrozen',
      entityType: 'customer',
      entityId: customerId,
      metadata: { walletId: updated.id, isFrozen },
    });
    return {
      customerId,
      walletId: updated.id,
      isFrozen: updated.isFrozen,
      updatedAt: updated.updatedAt,
    };
  }

  async adjustCustomerWallet(
    customerId: string,
    dto: AdminWalletAdjustmentDto,
    auth: AdminAuthState,
  ) {
    await this.getCustomer(customerId);
    if (dto.type === WalletTxnType.SPEND && dto.amountCents > 0) {
      throw new ConflictException({
        code: 'WALLET_SPEND_SIGN',
        message: 'SPEND must use negative amountCents',
      });
    }
    if (
      (dto.type === WalletTxnType.TOPUP ||
        dto.type === WalletTxnType.REFUND ||
        dto.type === WalletTxnType.PROMOTIONAL_BONUS) &&
      dto.amountCents < 0
    ) {
      throw new ConflictException({
        code: 'WALLET_CREDIT_SIGN',
        message: `${dto.type} must use positive amountCents`,
      });
    }
    if (dto.type === WalletTxnType.REVERSAL) {
      throw new ConflictException({
        code: 'WALLET_REVERSAL_REQUIRES_ENDPOINT',
        message: 'Use reverse endpoint to create reversal entries.',
      });
    }

    const entry = await this.wallet.appendTransaction({
      customerId,
      type: dto.type,
      amountCents: dto.amountCents,
      reason: dto.reason,
      createdByType: 'admin',
      createdBy: auth.actorLabel,
      metadata: dto.campaignCode ? { campaignCode: dto.campaignCode } : undefined,
    });
    const summary = await this.wallet.getSummary(customerId);

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'wallet.adjusted',
      entityType: 'customer',
      entityId: customerId,
      reason: dto.reason,
      metadata: {
        transactionId: entry.id,
        type: entry.type,
        amountCents: entry.amountCents,
        balanceAfter: entry.balanceAfter,
      },
    });
    return { entry, summary };
  }

  async reverseWalletTransaction(
    customerId: string,
    transactionId: string,
    reason: string,
    auth: AdminAuthState,
  ) {
    if (!hasPermission(auth.permissions, P.WALLET_REVERSE)) {
      throw new ForbiddenException({
        code: 'WALLET_REVERSE_FORBIDDEN',
        message:
          'Direct reversal is not permitted for this role. Submit a reversal request instead.',
      });
    }
    await this.getCustomer(customerId);
    const reversed = await this.wallet.reverseTransaction({
      customerId,
      transactionId,
      reason,
      createdByType: 'admin',
      createdBy: auth.actorLabel,
    });
    const summary = await this.wallet.getSummary(customerId);
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'wallet.reversed',
      entityType: 'customer',
      entityId: customerId,
      reason,
      metadata: {
        originalTransactionId: reversed.original.id,
        reversalTransactionId: reversed.reversal.id,
        amountCents: reversed.reversal.amountCents,
      },
    });
    return { ...reversed, summary };
  }

  async getOverviewStats() {
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const weekStart = startOfLocalWeekMonday(now);
    const monthStart = startOfLocalMonth(now);
    const monthNumber = now.getMonth() + 1;
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      members,
      activeMembers,
      newToday,
      newWeek,
      newMonth,
      pointsPositive,
      pointsNegative,
      walletTopUps,
      voucherGrouped,
      otpVerified,
      recentCustomers,
      recentVouchers,
      recentLedger,
      birthdayThisMonth,
      ordersLast30Days,
      ordersGmv30,
    ] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
      this.prisma.customer.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.loyaltyLedgerEntry.aggregate({
        _sum: { deltaPoints: true },
        where: { deltaPoints: { gt: 0 } },
      }),
      this.prisma.loyaltyLedgerEntry.aggregate({
        _sum: { deltaPoints: true },
        where: { deltaPoints: { lt: 0 } },
      }),
      this.prisma.storedWalletLedgerEntry.aggregate({
        _sum: { amountCents: true },
        where: { type: WalletTxnType.TOPUP },
      }),
      this.prisma.customerVoucher.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.otpChallenge.aggregate({
        _count: { id: true },
        where: { usedAt: { not: null } },
      }),
      this.prisma.customer.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phoneE164: true,
          displayName: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.customerVoucher.findMany({
        take: 8,
        orderBy: { updatedAt: 'desc' },
        include: {
          definition: { select: { code: true, title: true } },
          customer: { select: { phoneE164: true } },
        },
      }),
      this.prisma.loyaltyLedgerEntry.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { phoneE164: true } },
        },
      }),
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM customers
        WHERE birthday IS NOT NULL
        AND EXTRACT(MONTH FROM birthday::date) = ${monthNumber}
      `,
      this.prisma.customerOrder.count({
        where: { placedAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.customerOrder.aggregate({
        where: { placedAt: { gte: thirtyDaysAgo } },
        _sum: { totalCents: true },
      }),
    ]);

    const voucherStats: Record<string, number> = {};
    for (const g of voucherGrouped) {
      const raw = g._count as { _all?: number } | undefined;
      voucherStats[g.status] = raw?._all ?? 0;
    }

    const pointsIssued = pointsPositive._sum.deltaPoints ?? 0;
    const pointsRedeemed = Math.abs(pointsNegative._sum.deltaPoints ?? 0);

    const vIssued = voucherStats.ISSUED ?? 0;
    const vRedeemed = voucherStats.REDEEMED ?? 0;
    const vExpired = voucherStats.EXPIRED ?? 0;
    const vVoid = voucherStats.VOID ?? 0;
    const voucherTotal = vIssued + vRedeemed + vExpired + vVoid;

    return {
      members,
      activeMembers,
      newMembers: {
        today: newToday,
        thisWeek: newWeek,
        thisMonth: newMonth,
      },
      loyalty: {
        pointsIssued,
        pointsRedeemed,
        walletTopUpTotal: walletTopUps._sum.amountCents ?? 0,
      },
      vouchers: {
        issued: vIssued,
        redeemed: vRedeemed,
        expired: vExpired,
        void: vVoid,
        redemptionRate: voucherTotal ? vRedeemed / voucherTotal : 0,
      },
      otpVerifiedCount: otpVerified._count.id,
      birthdayMembersThisMonth: Number(birthdayThisMonth[0]?.count ?? 0n),
      commerce: {
        ordersLast30Days: ordersLast30Days,
        gmvLast30DaysCents: ordersGmv30._sum.totalCents ?? 0,
      },
      memberSalesContribution: null,
      recentRegistrations: recentCustomers,
      recentVoucherActivity: recentVouchers.map((v) => ({
        id: v.id,
        status: v.status,
        code: v.definition.code,
        title: v.definition.title,
        memberPhone: v.customer.phoneE164,
        issuedAt: v.issuedAt,
        redeemedAt: v.redeemedAt,
        updatedAt: v.updatedAt,
      })),
      recentWalletActivity: recentLedger.map((e) => ({
        id: e.id,
        memberPhone: e.customer.phoneE164,
        deltaPoints: e.deltaPoints,
        balanceAfter: e.balanceAfter,
        reason: e.reason,
        referenceType: e.referenceType,
        createdAt: e.createdAt,
      })),
    };
  }

  async createVoucherDefinition(
    dto: CreateVoucherDefinitionDto,
    auth: AdminAuthState,
  ) {
    const created = await this.prisma.voucherDefinition.create({
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description ?? null,
        pointsCost: dto.pointsCost ?? null,
        imageUrl: dto.imageUrl?.trim() || null,
        rewardCategory: dto.rewardCategory?.trim() || null,
        showInRewardsCatalog: dto.showInRewardsCatalog ?? false,
        rewardSortOrder: dto.rewardSortOrder ?? 0,
        rewardValidFrom: dto.rewardValidFrom
          ? new Date(dto.rewardValidFrom)
          : null,
        rewardValidUntil: dto.rewardValidUntil
          ? new Date(dto.rewardValidUntil)
          : null,
        maxTotalIssued: dto.maxTotalIssued ?? null,
      },
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.created',
      entityType: 'voucher_definition',
      entityId: created.id,
      afterValue: { code: created.code, title: created.title } as object,
      metadata: { code: created.code },
    });

    return created;
  }

  private goodwillVoucherCodeSet(): Set<string> {
    const raw = this.config.get<string>('SUPPORT_GOODWILL_VOUCHER_CODES', '') ?? '';
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async updateVoucherDefinition(
    id: string,
    dto: UpdateVoucherDefinitionDto,
    auth: AdminAuthState,
  ) {
    const before = await this.prisma.voucherDefinition.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message: 'Voucher definition not found',
      });
    }
    const data: Prisma.VoucherDefinitionUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) {
      data.description =
        dto.description && String(dto.description).trim()
          ? String(dto.description).trim()
          : null;
    }
    if (dto.pointsCost !== undefined) data.pointsCost = dto.pointsCost;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.imageUrl !== undefined) {
      data.imageUrl = dto.imageUrl?.trim() ? dto.imageUrl.trim() : null;
    }
    if (dto.rewardCategory !== undefined) {
      data.rewardCategory = dto.rewardCategory?.trim()
        ? dto.rewardCategory.trim()
        : null;
    }
    if (dto.showInRewardsCatalog !== undefined) {
      data.showInRewardsCatalog = dto.showInRewardsCatalog;
    }
    if (dto.rewardSortOrder !== undefined) {
      data.rewardSortOrder = dto.rewardSortOrder;
    }
    if (dto.rewardValidFrom !== undefined) {
      data.rewardValidFrom = dto.rewardValidFrom
        ? new Date(dto.rewardValidFrom)
        : null;
    }
    if (dto.rewardValidUntil !== undefined) {
      data.rewardValidUntil = dto.rewardValidUntil
        ? new Date(dto.rewardValidUntil)
        : null;
    }
    if (dto.maxTotalIssued !== undefined) {
      data.maxTotalIssued = dto.maxTotalIssued;
    }
    const updated = await this.prisma.voucherDefinition.update({
      where: { id },
      data,
    });
    const snap = (v: typeof before) => ({
      code: v.code,
      title: v.title,
      description: v.description,
      pointsCost: v.pointsCost,
      isActive: v.isActive,
      imageUrl: v.imageUrl,
      rewardCategory: v.rewardCategory,
      showInRewardsCatalog: v.showInRewardsCatalog,
      rewardSortOrder: v.rewardSortOrder,
      rewardValidFrom: v.rewardValidFrom,
      rewardValidUntil: v.rewardValidUntil,
      maxTotalIssued: v.maxTotalIssued,
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.modified',
      entityType: 'voucher_definition',
      entityId: id,
      beforeValue: snap(before) as object,
      afterValue: snap(updated) as object,
    });
    return updated;
  }

  async assignCustomerVoucher(
    customerId: string,
    dto: AssignCustomerVoucherDto,
    auth: AdminAuthState,
  ) {
    await this.getCustomer(customerId);
    const code = dto.voucherCode.trim();
    const def = await this.prisma.voucherDefinition.findFirst({
      where: { code, isActive: true },
    });
    if (!def) {
      throw new NotFoundException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message: 'Unknown or inactive voucher code',
      });
    }
    const cv = await this.prisma.customerVoucher.create({
      data: {
        customerId,
        definitionId: def.id,
        status: VoucherStatus.ISSUED,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        referenceType: 'admin_assign',
      },
      include: { definition: { select: { code: true, title: true } } },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.assigned',
      entityType: 'customer_voucher',
      entityId: cv.id,
      metadata: { customerId, voucherCode: def.code },
    });
    return cv;
  }

  async assignGoodwillVoucher(
    customerId: string,
    dto: GoodwillVoucherDto,
    auth: AdminAuthState,
  ) {
    const allowed = this.goodwillVoucherCodeSet();
    const norm = dto.voucherCode.trim().toLowerCase();
    if (!allowed.size) {
      throw new ForbiddenException({
        code: 'GOODWILL_VOUCHERS_NOT_CONFIGURED',
        message:
          'SUPPORT_GOODWILL_VOUCHER_CODES is not configured. Add allowed voucher codes to environment.',
      });
    }
    if (!allowed.has(norm)) {
      throw new ForbiddenException({
        code: 'GOODWILL_VOUCHER_NOT_ALLOWED',
        message:
          'This voucher code is not in the goodwill allow-list for support.',
      });
    }
    await this.getCustomer(customerId);
    const def = await this.prisma.voucherDefinition.findFirst({
      where: {
        code: { equals: dto.voucherCode.trim(), mode: 'insensitive' },
        isActive: true,
      },
    });
    if (!def) {
      throw new NotFoundException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message: 'Unknown or inactive voucher code',
      });
    }
    const cv = await this.prisma.customerVoucher.create({
      data: {
        customerId,
        definitionId: def.id,
        status: VoucherStatus.ISSUED,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        referenceType: 'goodwill',
      },
      include: { definition: { select: { code: true, title: true } } },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.assigned',
      entityType: 'customer_voucher',
      entityId: cv.id,
      reason: dto.reason ?? null,
      metadata: { customerId, voucherCode: def.code, goodwill: true },
    });
    return cv;
  }

  async revokeCustomerVoucher(
    customerId: string,
    voucherId: string,
    dto: RevokeCustomerVoucherDto,
    auth: AdminAuthState,
  ) {
    const row = await this.prisma.customerVoucher.findFirst({
      where: { id: voucherId, customerId },
      include: { definition: { select: { code: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'CUSTOMER_VOUCHER_NOT_FOUND',
        message: 'Voucher not found for this member',
      });
    }
    if (row.status !== VoucherStatus.ISSUED) {
      throw new BadRequestException({
        code: 'VOUCHER_NOT_REVOKABLE',
        message: 'Only issued vouchers can be revoked (voided).',
      });
    }
    const updated = await this.prisma.customerVoucher.update({
      where: { id: voucherId },
      data: { status: VoucherStatus.VOID },
      include: { definition: { select: { code: true } } },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.revoked',
      entityType: 'customer_voucher',
      entityId: voucherId,
      reason: dto.reason ?? null,
      beforeValue: {
        status: row.status,
        voucherCode: row.definition.code,
      } as object,
      afterValue: {
        status: updated.status,
        voucherCode: updated.definition.code,
      } as object,
      metadata: { customerId },
    });
    return updated;
  }

  async adjustCustomerLoyalty(
    customerId: string,
    dto: AdminLoyaltyAdjustmentDto,
    auth: AdminAuthState,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }

    const { balanceAfter } = await this.loyalty.appendLedgerEntry({
      customerId,
      deltaPoints: dto.deltaPoints,
      reason: dto.reason,
      referenceType: dto.referenceType ?? null,
      referenceId: dto.referenceId ?? null,
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'loyalty.adjusted',
      entityType: 'customer',
      entityId: customerId,
      reason: dto.reason,
      metadata: {
        deltaPoints: dto.deltaPoints,
        balanceAfter,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
      },
    });

    return { customerId, pointsBalance: balanceAfter };
  }

  async getReportingDashboard() {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const now = new Date();
    const utcDayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const utcDayEnd = new Date(utcDayStart);
    utcDayEnd.setUTCDate(utcDayEnd.getUTCDate() + 1);
    const utcMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const utcMonthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const utcYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const utcYearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

    const topSpenderSql = (
      from: Date,
      to: Date,
    ) => this.prisma.$queryRaw<
      {
        customer_id: string;
        phone_e164: string;
        display_name: string | null;
        spent_cents: bigint;
      }[]
    >`
      SELECT o.customer_id AS customer_id,
             MAX(c.phone_e164) AS phone_e164,
             MAX(c.display_name) AS display_name,
             SUM(o.total_cents)::bigint AS spent_cents
      FROM customer_orders o
      INNER JOIN customers c ON c.id = o.customer_id
      WHERE o.placed_at >= ${from} AND o.placed_at < ${to}
      GROUP BY o.customer_id
      ORDER BY spent_cents DESC
      LIMIT 10
    `;

    const [
      overview,
      bySource,
      suspended,
      walletAgg,
      importCount,
      exportCount,
      adjCount,
      signupsByDay,
      topSpenders,
      topSpendersToday,
      topSpendersThisMonth,
      topSpendersThisYear,
      topReferrers,
      topProducts,
    ] = await Promise.all([
      this.getOverviewStats(),
      this.prisma.customer.groupBy({
        by: ['signupSource'],
        _count: { _all: true },
      }),
      this.prisma.customer.count({ where: { status: CustomerStatus.SUSPENDED } }),
      this.prisma.storedWallet.aggregate({
        _sum: {
          balanceCents: true,
          promotionalCreditCents: true,
          lifetimeTopUpCents: true,
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'import.performed',
          createdAt: { gte: monthAgo },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'export.performed',
          createdAt: { gte: monthAgo },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: { in: ['wallet.adjusted', 'loyalty.adjusted'] },
          createdAt: { gte: monthAgo },
        },
      }),
      this.prisma.$queryRaw<
        { day: Date; referred: bigint; organic: bigint }[]
      >`
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
               COUNT(*) FILTER (WHERE referred_by_customer_id IS NOT NULL)::bigint AS referred,
               COUNT(*) FILTER (WHERE referred_by_customer_id IS NULL)::bigint AS organic
        FROM customers
        WHERE created_at >= ${monthAgo}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<
        {
          customer_id: string;
          phone_e164: string;
          display_name: string | null;
          spent_cents: bigint;
        }[]
      >`
        SELECT o.customer_id AS customer_id,
               MAX(c.phone_e164) AS phone_e164,
               MAX(c.display_name) AS display_name,
               SUM(o.total_cents)::bigint AS spent_cents
        FROM customer_orders o
        INNER JOIN customers c ON c.id = o.customer_id
        GROUP BY o.customer_id
        ORDER BY spent_cents DESC
        LIMIT 10
      `,
      topSpenderSql(utcDayStart, utcDayEnd),
      topSpenderSql(utcMonthStart, utcMonthEnd),
      topSpenderSql(utcYearStart, utcYearEnd),
      this.prisma.customer.findMany({
        take: 10,
        where: { referredMembers: { some: {} } },
        orderBy: { referredMembers: { _count: 'desc' } },
        select: {
          id: true,
          phoneE164: true,
          displayName: true,
          referralCode: true,
          _count: { select: { referredMembers: true } },
        },
      }),
      this.prisma.$queryRaw<
        {
          product_id: string;
          name: string;
          qty_sold: bigint;
          order_count: bigint;
        }[]
      >`
        SELECT l.product_id AS product_id,
               MAX(l.name) AS name,
               SUM(l.qty)::bigint AS qty_sold,
               COUNT(DISTINCT o.id)::bigint AS order_count
        FROM customer_order_lines l
        INNER JOIN customer_orders o ON o.id = l.order_id
        WHERE o.placed_at >= ${monthAgo}
        GROUP BY l.product_id
        ORDER BY qty_sold DESC
        LIMIT 10
      `,
    ]);

    return {
      overview,
      acquisitionBySource: bySource.map((g) => ({
        signupSource: g.signupSource,
        count: g._count._all,
      })),
      inactiveMembers: suspended,
      walletSummary: {
        outstandingLiabilityCents: walletAgg._sum.balanceCents ?? 0,
        promotionalCreditOutstandingCents:
          walletAgg._sum.promotionalCreditCents ?? 0,
        lifetimeTopUpCents: walletAgg._sum.lifetimeTopUpCents ?? 0,
      },
      last30Days: {
        importCommits: importCount,
        exportRuns: exportCount,
        manualWalletOrLoyaltyAdjustments: adjCount,
      },
      marketing: {
        signupsByDay: signupsByDay.map((r) => {
          const referred = Number(r.referred);
          const organic = Number(r.organic);
          return {
            date: r.day.toISOString().slice(0, 10),
            newMembers: referred + organic,
            referredSignups: referred,
            organicSignups: organic,
          };
        }),
        topSpenders: topSpenders.map((r) => ({
          id: r.customer_id,
          phoneE164: r.phone_e164,
          displayName: r.display_name,
          lifetimeSpentCents: Number(r.spent_cents),
        })),
        topSpendersToday: topSpendersToday.map((r) => ({
          id: r.customer_id,
          phoneE164: r.phone_e164,
          displayName: r.display_name,
          lifetimeSpentCents: Number(r.spent_cents),
        })),
        topSpendersThisMonth: topSpendersThisMonth.map((r) => ({
          id: r.customer_id,
          phoneE164: r.phone_e164,
          displayName: r.display_name,
          lifetimeSpentCents: Number(r.spent_cents),
        })),
        topSpendersThisYear: topSpendersThisYear.map((r) => ({
          id: r.customer_id,
          phoneE164: r.phone_e164,
          displayName: r.display_name,
          lifetimeSpentCents: Number(r.spent_cents),
        })),
        topReferrers: topReferrers.map((c) => ({
          id: c.id,
          phoneE164: c.phoneE164,
          displayName: c.displayName,
          referralCode: c.referralCode,
          referralsSignedUp: c._count.referredMembers,
        })),
        topProducts: topProducts.map((p) => ({
          productId: p.product_id,
          name: p.name,
          qtySold: Number(p.qty_sold),
          orders: Number(p.order_count),
        })),
      },
    };
  }

  async getSalesAnalytics(query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsResult> {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from and to must be valid ISO dates',
      });
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from must be before to',
      });
    }
    const maxMs = 800 * 86400000;
    if (to.getTime() - from.getTime() > maxMs) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LARGE',
        message: 'Date range cannot exceed 800 days',
      });
    }

    const bucket = query.bucket ?? 'day';

    const bucketSeries = () => {
      if (bucket === 'week') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('week', (COALESCE(o.completed_at, o.placed_at) AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(o.total_cents)::bigint AS gmv_cents
          FROM customer_orders o
          WHERE o.status = 'completed'
            AND COALESCE(o.completed_at, o.placed_at) >= ${from}
            AND COALESCE(o.completed_at, o.placed_at) < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      if (bucket === 'month') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('month', (COALESCE(o.completed_at, o.placed_at) AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(o.total_cents)::bigint AS gmv_cents
          FROM customer_orders o
          WHERE o.status = 'completed'
            AND COALESCE(o.completed_at, o.placed_at) >= ${from}
            AND COALESCE(o.completed_at, o.placed_at) < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      return this.prisma.$queryRaw<
        { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
      >`
        SELECT date_trunc('day', (COALESCE(o.completed_at, o.placed_at) AT TIME ZONE 'UTC')) AS period_start,
               COUNT(*)::bigint AS order_count,
               SUM(o.total_cents)::bigint AS gmv_cents
        FROM customer_orders o
        WHERE o.status = 'completed'
          AND COALESCE(o.completed_at, o.placed_at) >= ${from}
          AND COALESCE(o.completed_at, o.placed_at) < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    };

    const [
      seriesRows,
      topProducts,
      completedRow,
      openPlaced,
      loyaltyNeg,
      loyaltyPos,
      walletSpend,
      walletTopUp,
      vouchersRedeemed,
      vouchersIssued,
    ] = await Promise.all([
      bucketSeries(),
      this.prisma.$queryRaw<
        {
          product_id: string;
          name: string;
          qty_sold: bigint;
          revenue_cents: bigint;
          order_count: bigint;
        }[]
      >`
        SELECT l.product_id AS product_id,
               MAX(l.name) AS name,
               SUM(l.qty)::bigint AS qty_sold,
               SUM(l.unit_price_cents * l.qty)::bigint AS revenue_cents,
               COUNT(DISTINCT o.id)::bigint AS order_count
        FROM customer_order_lines l
        INNER JOIN customer_orders o ON o.id = l.order_id
        WHERE o.status = 'completed'
          AND COALESCE(o.completed_at, o.placed_at) >= ${from}
          AND COALESCE(o.completed_at, o.placed_at) < ${to}
        GROUP BY l.product_id
        ORDER BY qty_sold DESC
        LIMIT 25
      `,
      this.prisma.$queryRaw<{ cnt: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS cnt,
               COALESCE(SUM(o.total_cents), 0)::bigint AS gmv
        FROM customer_orders o
        WHERE o.status = 'completed'
          AND COALESCE(o.completed_at, o.placed_at) >= ${from}
          AND COALESCE(o.completed_at, o.placed_at) < ${to}
      `,
      this.prisma.customerOrder.count({
        where: {
          status: { not: 'completed' },
          placedAt: { gte: from, lt: to },
        },
      }),
      this.prisma.loyaltyLedgerEntry.aggregate({
        where: {
          deltaPoints: { lt: 0 },
          createdAt: { gte: from, lt: to },
        },
        _sum: { deltaPoints: true },
      }),
      this.prisma.loyaltyLedgerEntry.aggregate({
        where: {
          deltaPoints: { gt: 0 },
          createdAt: { gte: from, lt: to },
        },
        _sum: { deltaPoints: true },
      }),
      this.prisma.storedWalletLedgerEntry.aggregate({
        where: {
          type: WalletTxnType.SPEND,
          createdAt: { gte: from, lt: to },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.storedWalletLedgerEntry.aggregate({
        where: {
          type: WalletTxnType.TOPUP,
          createdAt: { gte: from, lt: to },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.customerVoucher.count({
        where: {
          status: VoucherStatus.REDEEMED,
          redeemedAt: { gte: from, lt: to },
        },
      }),
      this.prisma.customerVoucher.count({
        where: {
          issuedAt: { gte: from, lt: to },
        },
      }),
    ]);

    const completedCount = Number(completedRow[0]?.cnt ?? 0n);
    const totalGmv = Number(completedRow[0]?.gmv ?? 0n);
    const pointsRedeemedPeriod = Math.abs(loyaltyNeg._sum.deltaPoints ?? 0);
    const pointsIssuedPeriod = loyaltyPos._sum.deltaPoints ?? 0;
    const walletSpendSum = walletSpend._sum.amountCents ?? 0;
    const walletSpendCents = Math.abs(walletSpendSum);
    const walletTopUpPeriod = walletTopUp._sum.amountCents ?? 0;

    const series = seriesRows.map((r) => ({
      periodStart: r.period_start.toISOString(),
      orderCount: Number(r.order_count),
      gmvCents: Number(r.gmv_cents),
    }));

    const top = topProducts.map((p) => ({
      productId: p.product_id,
      name: p.name,
      qtySold: Number(p.qty_sold),
      revenueCents: Number(p.revenue_cents),
      orders: Number(p.order_count),
    }));

    const bestSeller = top[0] ?? null;

    return {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        generatedAt: now.toISOString(),
      },
      series,
      topProducts: top,
      bestSeller,
      summary: {
        completedOrders: completedCount,
        totalGmvCents: totalGmv,
        averageOrderValueCents:
          completedCount > 0 ? Math.round(totalGmv / completedCount) : 0,
        openOrdersPlacedInRange: openPlaced,
        loyaltyPointsIssuedInRange: pointsIssuedPeriod,
        loyaltyPointsRedeemedInRange: pointsRedeemedPeriod,
        storedWalletSpendCentsInRange: walletSpendCents,
        storedWalletTopUpCentsInRange: walletTopUpPeriod,
        vouchersIssuedInRange: vouchersIssued,
        vouchersRedeemedInRange: vouchersRedeemed,
      },
    };
  }

  salesAnalyticsToCsv(payload: SalesAnalyticsResult): string {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines: string[] = [];
    lines.push('kind,key,value');
    lines.push(['meta', 'from', payload.meta.from].map(esc).join(','));
    lines.push(['meta', 'to', payload.meta.to].map(esc).join(','));
    lines.push(['meta', 'bucket', payload.meta.bucket].map(esc).join(','));
    lines.push(['meta', 'generatedAt', payload.meta.generatedAt].map(esc).join(','));
    for (const [k, v] of Object.entries(payload.summary)) {
      lines.push(['summary', k, v].map(esc).join(','));
    }
    lines.push('');
    lines.push('periodStart,orderCount,gmvCents');
    for (const row of payload.series) {
      lines.push(
        [row.periodStart, row.orderCount, row.gmvCents].map(esc).join(','),
      );
    }
    lines.push('');
    lines.push('productId,name,qtySold,revenueCents,orders');
    for (const p of payload.topProducts) {
      lines.push(
        [p.productId, p.name, p.qtySold, p.revenueCents, p.orders]
          .map(esc)
          .join(','),
      );
    }
    if (payload.bestSeller) {
      lines.push('');
      lines.push('bestSellerKey,value');
      const b = payload.bestSeller;
      lines.push(['productId', b.productId].map(esc).join(','));
      lines.push(['name', b.name].map(esc).join(','));
      lines.push(['qtySold', b.qtySold].map(esc).join(','));
      lines.push(['revenueCents', b.revenueCents].map(esc).join(','));
      lines.push(['orders', b.orders].map(esc).join(','));
    }
    return lines.join('\n') + '\n';
  }

  private fulfillmentSummaryStrings(raw: Prisma.JsonValue | null): string[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === 'string');
    }
    return [];
  }

  private maskOrderPhone(phone: string | null | undefined): string {
    const p = (phone ?? '').trim();
    if (p.length < 5) return p || '—';
    return `···${p.slice(-4)}`;
  }

  async listCommerceOrders(query: AdminListOrdersQueryDto) {
    const take = Math.min(Math.max(query.limit ?? 100, 1), 200);
    const where: Prisma.CustomerOrderWhereInput = {};
    const st = query.status ?? 'all';
    if (st === 'placed') where.status = 'placed';
    else if (st === 'completed') where.status = 'completed';

    const parseDayStart = (iso: string) =>
      iso.length >= 10
        ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
        : new Date(iso);
    const parseDayExclusiveEnd = (iso: string) => {
      const d = parseDayStart(iso);
      if (iso.length >= 10) {
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return d;
    };

    const from = query.from ? parseDayStart(query.from) : undefined;
    const toEx = query.to ? parseDayExclusiveEnd(query.to) : undefined;

    if (from || toEx) {
      if (query.dateField === 'completed' && st === 'completed') {
        where.AND = [
          { status: 'completed' },
          {
            OR: [
              {
                completedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(toEx ? { lt: toEx } : {}),
                },
              },
              {
                AND: [
                  { completedAt: null },
                  {
                    placedAt: {
                      ...(from ? { gte: from } : {}),
                      ...(toEx ? { lt: toEx } : {}),
                    },
                  },
                ],
              },
            ],
          },
        ];
      } else {
        where.placedAt = {
          ...(from ? { gte: from } : {}),
          ...(toEx ? { lt: toEx } : {}),
        };
      }
    }

    if (query.productId?.trim()) {
      where.lines = { some: { productId: query.productId.trim() } };
    } else if (query.productContains?.trim()) {
      const q = query.productContains.trim();
      where.lines = {
        some: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { productId: { contains: q, mode: 'insensitive' } },
          ],
        },
      };
    }

    const sort = query.sort ?? 'placed_desc';
    let orderBy: Prisma.CustomerOrderOrderByWithRelationInput = {
      placedAt: 'desc',
    };
    if (sort === 'placed_asc') orderBy = { placedAt: 'asc' };
    else if (sort === 'total_desc') orderBy = { totalCents: 'desc' };
    else if (sort === 'total_asc') orderBy = { totalCents: 'asc' };
    else if (sort === 'completed_desc') orderBy = { completedAt: 'desc' };
    else if (sort === 'completed_asc') orderBy = { completedAt: 'asc' };

    const rows = await this.prisma.customerOrder.findMany({
      where,
      orderBy,
      take,
      include: {
        customer: { select: { id: true, phoneE164: true, displayName: true } },
        lines: { orderBy: { id: 'asc' } },
      },
    });

    return {
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt.toISOString(),
        completedAt: o.completedAt?.toISOString() ?? null,
        totalCents: o.totalCents,
        status: o.status,
        fulfillmentSummary: this.fulfillmentSummaryStrings(o.fulfillmentSummary),
        customerDisplayName: o.customer.displayName,
        customerPhoneMasked: this.maskOrderPhone(o.customer.phoneE164),
        lineCount: o.lines.length,
        lines: o.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.name,
          variantLabel: l.variantLabel,
          unitPriceCents: l.unitPriceCents,
          qty: l.qty,
        })),
      })),
    };
  }

  async getDailyCommerceReport(dateStr: string) {
    const day = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);

    const closed = await this.prisma.dailySalesClose.findUnique({
      where: { businessDate: day },
    });

    const items = await this.prisma.$queryRaw<
      {
        product_id: string;
        name: string;
        qty_sold: bigint;
        revenue_cents: bigint;
      }[]
    >`
      SELECT l.product_id AS product_id,
             MAX(l.name) AS name,
             SUM(l.qty)::bigint AS qty_sold,
             SUM(l.unit_price_cents * l.qty)::bigint AS revenue_cents
      FROM customer_order_lines l
      INNER JOIN customer_orders o ON o.id = l.order_id
      WHERE o.status = 'completed'
        AND COALESCE(o.completed_at, o.placed_at) >= ${day}
        AND COALESCE(o.completed_at, o.placed_at) < ${next}
      GROUP BY l.product_id
      ORDER BY qty_sold DESC
    `;

    const totals = await this.prisma.$queryRaw<{ orders: bigint; gmv: bigint }[]>`
      SELECT COUNT(*)::bigint AS orders,
             COALESCE(SUM(o.total_cents), 0)::bigint AS gmv
      FROM customer_orders o
      WHERE o.status = 'completed'
        AND COALESCE(o.completed_at, o.placed_at) >= ${day}
        AND COALESCE(o.completed_at, o.placed_at) < ${next}
    `;

    return {
      date: day.toISOString().slice(0, 10),
      closed: !!closed,
      closedAt: closed?.closedAt.toISOString() ?? null,
      completedOrders: Number(totals[0]?.orders ?? 0n),
      totalGmvCents: Number(totals[0]?.gmv ?? 0n),
      items: items.map((r) => ({
        productId: r.product_id,
        name: r.name,
        qtySold: Number(r.qty_sold),
        revenueCents: Number(r.revenue_cents),
      })),
    };
  }

  async closeDailyCommerce(dateStr: string, auth: AdminAuthState) {
    const day = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    const existing = await this.prisma.dailySalesClose.findUnique({
      where: { businessDate: day },
    });
    if (existing) {
      return {
        date: day.toISOString().slice(0, 10),
        closedAt: existing.closedAt.toISOString(),
        alreadyClosed: true as const,
      };
    }
    const row = await this.prisma.dailySalesClose.create({
      data: { businessDate: day },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'commerce.daily_closed',
      entityType: 'daily_sales_close',
      entityId: row.id,
      metadata: { businessDate: day.toISOString().slice(0, 10) } as object,
    });
    return {
      date: day.toISOString().slice(0, 10),
      closedAt: row.closedAt.toISOString(),
      alreadyClosed: false as const,
    };
  }

  listVoucherPushRules() {
    return this.prisma.voucherPushRule.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
          },
        },
      },
    });
  }

  async createVoucherPushRule(
    dto: CreateVoucherPushRuleDto,
    auth: AdminAuthState,
  ) {
    await this.prisma.voucherDefinition.findUniqueOrThrow({
      where: { id: dto.voucherDefinitionId },
    });
    const created = await this.prisma.voucherPushRule.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        triggerType: dto.triggerType,
        triggerConfig: dto.triggerConfig as Prisma.InputJsonValue,
        voucherDefinitionId: dto.voucherDefinitionId,
        maxGrantsPerCustomer: dto.maxGrantsPerCustomer ?? null,
        cooldownDays: dto.cooldownDays ?? null,
      },
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
          },
        },
      },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher_push_rule.created',
      entityType: 'voucher_push_rule',
      entityId: created.id,
      afterValue: { name: created.name, triggerType: created.triggerType } as object,
    });
    return created;
  }

  async updateVoucherPushRule(
    id: string,
    dto: UpdateVoucherPushRuleDto,
    auth: AdminAuthState,
  ) {
    const before = await this.prisma.voucherPushRule.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'VOUCHER_PUSH_RULE_NOT_FOUND',
        message: 'Voucher push rule not found',
      });
    }
    if (dto.voucherDefinitionId) {
      await this.prisma.voucherDefinition.findUniqueOrThrow({
        where: { id: dto.voucherDefinitionId },
      });
    }
    const data: Prisma.VoucherPushRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.triggerType !== undefined) data.triggerType = dto.triggerType;
    if (dto.triggerConfig !== undefined) {
      data.triggerConfig = dto.triggerConfig as Prisma.InputJsonValue;
    }
    if (dto.voucherDefinitionId !== undefined) {
      data.voucherDefinition = {
        connect: { id: dto.voucherDefinitionId },
      };
    }
    if (dto.maxGrantsPerCustomer !== undefined) {
      data.maxGrantsPerCustomer = dto.maxGrantsPerCustomer;
    }
    if (dto.cooldownDays !== undefined) {
      data.cooldownDays = dto.cooldownDays;
    }
    const updated = await this.prisma.voucherPushRule.update({
      where: { id },
      data,
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
          },
        },
      },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher_push_rule.updated',
      entityType: 'voucher_push_rule',
      entityId: id,
      beforeValue: {
        name: before.name,
        triggerType: before.triggerType,
        isActive: before.isActive,
      } as object,
      afterValue: {
        name: updated.name,
        triggerType: updated.triggerType,
        isActive: updated.isActive,
      } as object,
    });
    return updated;
  }

  listPerksCampaignRules() {
    return this.prisma.perksCampaignRule.findMany({
      orderBy: [{ campaignStartDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
            pointsCost: true,
          },
        },
      },
    });
  }

  async createPerksCampaignRule(
    dto: CreatePerksCampaignRuleDto,
    auth: AdminAuthState,
  ) {
    const def = await this.prisma.voucherDefinition.findUniqueOrThrow({
      where: { id: dto.voucherDefinitionId },
      select: { id: true, pointsCost: true },
    });
    const start = perksDateOnly(dto.campaignStartDate);
    const end = perksDateOnly(dto.campaignEndDate);
    validatePerksCampaignRuleFields({
      programKind: dto.programKind,
      criteriaKind: dto.criteriaKind,
      campaignStartDate: start,
      campaignEndDate: end,
      minPurchaseAmountSen: dto.minPurchaseAmountSen ?? null,
      rebateValueSen: dto.rebateValueSen ?? null,
      minWalletTopupSen: dto.minWalletTopupSen ?? null,
      withinDaysOfSignup: dto.withinDaysOfSignup ?? null,
      minReferralCount: dto.minReferralCount ?? null,
      inactiveDays: dto.inactiveDays ?? null,
      minMemberTier: dto.minMemberTier?.trim() || null,
      definitionPointsCost: def.pointsCost,
    });
    const created = await this.prisma.perksCampaignRule.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        programKind: dto.programKind,
        criteriaKind: dto.criteriaKind,
        campaignStartDate: start,
        campaignEndDate: end,
        minPurchaseAmountSen: dto.minPurchaseAmountSen ?? null,
        rebateValueSen: dto.rebateValueSen ?? null,
        minWalletTopupSen: dto.minWalletTopupSen ?? null,
        withinDaysOfSignup: dto.withinDaysOfSignup ?? null,
        minReferralCount: dto.minReferralCount ?? null,
        inactiveDays: dto.inactiveDays ?? null,
        minMemberTier: dto.minMemberTier?.trim() || null,
        voucherDefinitionId: dto.voucherDefinitionId,
        maxGrantsPerCustomer: dto.maxGrantsPerCustomer ?? null,
      },
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
            pointsCost: true,
          },
        },
      },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'perks_campaign_rule.created',
      entityType: 'perks_campaign_rule',
      entityId: created.id,
      afterValue: { name: created.name, programKind: created.programKind } as object,
    });
    return created;
  }

  async updatePerksCampaignRule(
    id: string,
    dto: UpdatePerksCampaignRuleDto,
    auth: AdminAuthState,
  ) {
    const before = await this.prisma.perksCampaignRule.findUnique({
      where: { id },
      include: {
        voucherDefinition: { select: { pointsCost: true } },
      },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'PERKS_CAMPAIGN_RULE_NOT_FOUND',
        message: 'Perks campaign rule not found',
      });
    }
    const defId = dto.voucherDefinitionId ?? before.voucherDefinitionId;
    const def = await this.prisma.voucherDefinition.findUniqueOrThrow({
      where: { id: defId },
      select: { id: true, pointsCost: true },
    });
    const programKind = dto.programKind ?? before.programKind;
    const criteriaKind = dto.criteriaKind ?? before.criteriaKind;
    const start =
      dto.campaignStartDate != null
        ? perksDateOnly(dto.campaignStartDate)
        : before.campaignStartDate;
    const end =
      dto.campaignEndDate != null
        ? perksDateOnly(dto.campaignEndDate)
        : before.campaignEndDate;
    validatePerksCampaignRuleFields({
      programKind,
      criteriaKind,
      campaignStartDate: start,
      campaignEndDate: end,
      minPurchaseAmountSen:
        dto.minPurchaseAmountSen !== undefined
          ? dto.minPurchaseAmountSen
          : before.minPurchaseAmountSen,
      rebateValueSen:
        dto.rebateValueSen !== undefined ? dto.rebateValueSen : before.rebateValueSen,
      minWalletTopupSen:
        dto.minWalletTopupSen !== undefined
          ? dto.minWalletTopupSen
          : before.minWalletTopupSen,
      withinDaysOfSignup:
        dto.withinDaysOfSignup !== undefined
          ? dto.withinDaysOfSignup
          : before.withinDaysOfSignup,
      minReferralCount:
        dto.minReferralCount !== undefined
          ? dto.minReferralCount
          : before.minReferralCount,
      inactiveDays:
        dto.inactiveDays !== undefined ? dto.inactiveDays : before.inactiveDays,
      minMemberTier:
        dto.minMemberTier !== undefined
          ? dto.minMemberTier?.trim() || null
          : before.minMemberTier,
      definitionPointsCost: def.pointsCost,
    });
    const data: Prisma.PerksCampaignRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.programKind !== undefined) data.programKind = dto.programKind;
    if (dto.criteriaKind !== undefined) data.criteriaKind = dto.criteriaKind;
    if (dto.campaignStartDate !== undefined) {
      data.campaignStartDate = start;
    }
    if (dto.campaignEndDate !== undefined) {
      data.campaignEndDate = end;
    }
    if (dto.minPurchaseAmountSen !== undefined) {
      data.minPurchaseAmountSen = dto.minPurchaseAmountSen;
    }
    if (dto.rebateValueSen !== undefined) {
      data.rebateValueSen = dto.rebateValueSen;
    }
    if (dto.minWalletTopupSen !== undefined) {
      data.minWalletTopupSen = dto.minWalletTopupSen;
    }
    if (dto.withinDaysOfSignup !== undefined) {
      data.withinDaysOfSignup = dto.withinDaysOfSignup;
    }
    if (dto.minReferralCount !== undefined) {
      data.minReferralCount = dto.minReferralCount;
    }
    if (dto.inactiveDays !== undefined) {
      data.inactiveDays = dto.inactiveDays;
    }
    if (dto.minMemberTier !== undefined) {
      data.minMemberTier = dto.minMemberTier?.trim() || null;
    }
    if (dto.voucherDefinitionId !== undefined) {
      data.voucherDefinition = { connect: { id: dto.voucherDefinitionId } };
    }
    if (dto.maxGrantsPerCustomer !== undefined) {
      data.maxGrantsPerCustomer = dto.maxGrantsPerCustomer;
    }
    const updated = await this.prisma.perksCampaignRule.update({
      where: { id },
      data,
      include: {
        voucherDefinition: {
          select: {
            id: true,
            code: true,
            title: true,
            showInRewardsCatalog: true,
            pointsCost: true,
          },
        },
      },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'perks_campaign_rule.updated',
      entityType: 'perks_campaign_rule',
      entityId: id,
      beforeValue: { name: before.name, isActive: before.isActive } as object,
      afterValue: { name: updated.name, isActive: updated.isActive } as object,
    });
    return updated;
  }
}
