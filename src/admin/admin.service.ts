import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BentoDeliveryStatus,
  BentoSubscriptionStatus,
  CustomerStatus,
  PerksCriteriaKind,
  PerksProgramKind,
  Prisma,
  VoucherLifecycleStatus,
  VoucherStatus,
  WalletTxnType,
} from '@prisma/client';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';

// Voucher-definition image uploads land on the same persistent disk mounted
// at <cwd>/data/ as the home-ad carousel uploads. See docs/DEPLOYMENT.md §6.1.
// Served by app.useStaticAssets in src/main.ts under /uploads/.
const VOUCHER_IMAGE_PUBLIC_PREFIX = '/uploads/voucher-defs/';
const VOUCHER_IMAGE_ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const VOUCHER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
import { auditActorBase } from '../admin-auth/audit-context.util';
import { daysUntilBirthdayUtc } from '../common/birthday.util';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { P, hasPermission } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { stringify } from 'csv-stringify/sync';
import {
  isVoucherExpired,
  isVoucherNotYetValid,
} from './admin-instore-voucher.util';
import { ReportingSettingsService } from './reporting-settings.service';
import type { ActivateBentoSubscriptionDto } from './dto/activate-bento-subscription.dto';
import type { AdminBackfillLoyaltyDto } from './dto/admin-backfill-loyalty.dto';
import type { AdminListAuditQueryDto } from './dto/admin-list-audit-query.dto';
import type { AdminListCustomersQueryDto } from './dto/admin-list-customers-query.dto';
import type { AdminListOrdersQueryDto } from './dto/admin-list-orders-query.dto';
import type { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import type { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import type { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import type { AssignCustomerVoucherDto } from './dto/assign-customer-voucher.dto';
import type { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';
import type { CreateVoucherPushRuleDto } from './dto/create-voucher-push-rule.dto';
import type { CreateWalkInCustomerDto } from './dto/create-walk-in-customer.dto';
import type { GoodwillVoucherDto } from './dto/goodwill-voucher.dto';
import type { RedeemVoucherDto } from './dto/redeem-voucher.dto';
import type { RevokeCustomerVoucherDto } from './dto/revoke-customer-voucher.dto';
import type {
  BentoMemberFunnelResult,
  BentoTransactionRow,
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
        message:
          'Voucher rebate rules require a rebate value greater than RM 0',
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
        message:
          'Pick a voucher definition with a points cost (catalog redeemable)',
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
      if (
        input.minPurchaseAmountSen == null ||
        input.minPurchaseAmountSen < 1
      ) {
        throw new BadRequestException({
          code: 'PERKS_MIN_PURCHASE',
          message: 'Enter minimum purchase (RM) for single-order criteria',
        });
      }
      break;
    case PerksCriteriaKind.TIER_AND_PURCHASE_MIN_RM:
      if (
        input.minPurchaseAmountSen == null ||
        input.minPurchaseAmountSen < 1
      ) {
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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly reportingSettings: ReportingSettingsService,
    private readonly payments: PaymentsService,
    private readonly customers: CustomersService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  /** Configured sales reporting cutoff (UTC midnight) or null when unset. */
  private salesFloor(): Date | null {
    return this.reportingSettings.getSalesStartDate();
  }

  /** Raise a range's lower bound to the sales cutoff when one is configured. */
  private clampFrom(from: Date): Date {
    const floor = this.salesFloor();
    return floor && floor.getTime() > from.getTime() ? floor : from;
  }

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

    if (q.tag?.trim()) {
      const tags = q.tag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) parts.push({ tags: { hasSome: tags } });
    }

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

  /**
   * Export all customers matching the same filters/sort as {@link listCustomers}
   * (no pagination, capped) as a CSV string for download.
   */
  async exportCustomersCsv(query: AdminListCustomersQueryDto): Promise<string> {
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

    const items = await this.prisma.customer.findMany({
      where,
      orderBy,
      take: 50_000,
      include: {
        wallet: { select: { pointsCached: true } },
        storedWallet: { select: { lifetimeSpentCents: true } },
        _count: { select: { referredMembers: true } },
      },
    });

    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');
    const records = items.map((c) => ({
      phone: c.phoneE164,
      name: c.displayName ?? '',
      email: c.email ?? '',
      status: c.status,
      member_tier: c.memberTier,
      signup_source: c.signupSource,
      marketing_consent: c.marketingConsent ? 'yes' : 'no',
      points_balance: c.wallet?.pointsCached ?? 0,
      lifetime_spent_rm: ((c.storedWallet?.lifetimeSpentCents ?? 0) / 100).toFixed(
        2,
      ),
      referrals_made: c._count.referredMembers,
      tags: (c.tags ?? []).join('; '),
      birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : '',
      gender: c.gender ?? '',
      preferred_store: c.preferredStore ?? '',
      created_at: iso(c.createdAt),
      last_login_at: iso(c.lastLoginAt),
    }));

    return stringify(records, {
      header: true,
      columns: [
        'phone',
        'name',
        'email',
        'status',
        'member_tier',
        'signup_source',
        'marketing_consent',
        'points_balance',
        'lifetime_spent_rm',
        'referrals_made',
        'tags',
        'birthday',
        'gender',
        'preferred_store',
        'created_at',
        'last_login_at',
      ],
    });
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

    // Derived email-verification status: the member has at some point completed
    // an email OTP for their *current* email address. No dedicated column.
    let emailVerifiedAt: string | null = null;
    const currentEmail = customer.email?.trim().toLowerCase();
    if (currentEmail) {
      const usedEmailOtp = await this.prisma.otpChallenge.findFirst({
        where: {
          customerId: customer.id,
          deliveryChannel: 'email',
          usedAt: { not: null },
          email: { equals: currentEmail, mode: 'insensitive' },
        },
        orderBy: { usedAt: 'desc' },
        select: { usedAt: true },
      });
      emailVerifiedAt = usedEmailOtp?.usedAt
        ? usedEmailOtp.usedAt.toISOString()
        : null;
    }

    const { loginPinHash, ...safe } = customer;
    return {
      ...safe,
      hasLoginPin: Boolean(loginPinHash),
      emailVerified: emailVerifiedAt !== null,
      emailVerifiedAt,
    };
  }

  /**
   * Admin-assisted login rescue: set a fresh 6-digit login PIN for a member who
   * can't receive their OTP. Reuses the existing PIN-login path — once set,
   * `loginLookup` reports `hasPin` and the member signs in with phone + PIN.
   * The PIN is returned once (plaintext) for the admin to read out, and stored
   * only as a bcrypt hash.
   */
  async setCustomerLoginPin(
    id: string,
    auth: AdminAuthState,
  ): Promise<{ pin: string }> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }

    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const loginPinHash = await bcrypt.hash(pin, 12);
    await this.prisma.customer.update({
      where: { id },
      data: { loginPinHash },
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'customer.login_pin_set_by_admin',
      entityType: 'customer',
      entityId: id,
      metadata: { phoneE164: customer.phoneE164 },
    });

    return { pin };
  }

  /**
   * Admin-assisted walk-in signup: creates an ACTIVE member from just a phone
   * number and immediately issues a login PIN, so staff can hand a walk-in
   * customer one working login in a single action.
   */
  async createWalkInMember(dto: CreateWalkInCustomerDto, auth: AdminAuthState) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(dto.phoneE164);
    const customer = await this.customers.createWalkInCustomer(phoneE164, {
      displayName: dto.displayName,
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'customer.created_by_admin',
      entityType: 'customer',
      entityId: customer.id,
      metadata: { phoneE164: customer.phoneE164 },
    });

    const { pin } = await this.setCustomerLoginPin(customer.id, auth);
    return { customer, loginPin: pin };
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
    const canProfile = hasPermission(
      auth.permissions,
      P.CUSTOMER_WRITE_PROFILE,
    );
    const canIdentity = hasPermission(
      auth.permissions,
      P.CUSTOMER_WRITE_IDENTITY,
    );
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
          this.config
            .get<string>('ADMIN_ALLOW_PHONE_CHANGE', 'false')
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
      metadata: dto.campaignCode
        ? { campaignCode: dto.campaignCode }
        : undefined,
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
    // Sales reporting cutoff: never count commerce dated before salesStartDate.
    const salesFloor = this.reportingSettings.getSalesStartDate();
    const commerceStart =
      salesFloor && salesFloor.getTime() > thirtyDaysAgo.getTime()
        ? salesFloor
        : thirtyDaysAgo;

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
        where: { placedAt: { gte: commerceStart } },
      }),
      this.prisma.customerOrder.aggregate({
        where: { placedAt: { gte: commerceStart } },
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
        rebateValueSen: dto.rebateValueSen ?? null,
        minSpendSen: dto.minSpendSen ?? null,
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
    const raw =
      this.config.get<string>('SUPPORT_GOODWILL_VOUCHER_CODES', '') ?? '';
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
    if (dto.rebateValueSen !== undefined) {
      data.rebateValueSen =
        dto.rebateValueSen == null ? null : dto.rebateValueSen;
    }
    if (dto.minSpendSen !== undefined) {
      data.minSpendSen = dto.minSpendSen == null ? null : dto.minSpendSen;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.imageUrl !== undefined) {
      const newUrl = dto.imageUrl?.trim() ? dto.imageUrl.trim() : null;
      // If we're replacing a previously uploaded local image with a different
      // URL (or clearing it), delete the orphan file from disk so the
      // persistent volume doesn't accumulate dead uploads.
      if (
        before.imageUrl &&
        before.imageUrl !== newUrl &&
        before.imageUrl.startsWith(VOUCHER_IMAGE_PUBLIC_PREFIX)
      ) {
        this.tryRemoveLocalVoucherImage(before.imageUrl);
      }
      data.imageUrl = newUrl;
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

  // ----- Voucher-definition image uploads (persistent disk) ---------------
  // Stored under <cwd>/data/uploads/voucher-defs/ and served via /uploads/...
  // Mirrors the home-ad slide upload pattern in src/home-ads/home-ads.service.

  private voucherImagesDir(): string {
    return resolve(process.cwd(), 'data', 'uploads', 'voucher-defs');
  }

  /**
   * Best-effort delete of a previously uploaded voucher image when its public
   * URL is being replaced. Silently ignores non-local URLs (e.g. external CDN
   * links the admin pasted into the URL field) and missing files.
   */
  private tryRemoveLocalVoucherImage(url: string | null | undefined): void {
    if (!url) return;
    if (!url.startsWith(VOUCHER_IMAGE_PUBLIC_PREFIX)) return;
    const name = url.substring(VOUCHER_IMAGE_PUBLIC_PREFIX.length);
    if (!/^[a-z0-9._-]+$/i.test(name)) return;
    const p = resolve(this.voucherImagesDir(), name);
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  async attachVoucherDefinitionImage(
    id: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    },
  ) {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > VOUCHER_IMAGE_MAX_BYTES) {
      throw new BadRequestException(
        `Image too large. Max ${Math.round(
          VOUCHER_IMAGE_MAX_BYTES / 1024 / 1024,
        )} MB.`,
      );
    }
    const ext =
      VOUCHER_IMAGE_ALLOWED_MIME[String(file.mimetype || '').toLowerCase()] ||
      (file.originalname ? extname(file.originalname).toLowerCase() : '');
    const allowedExts = new Set(Object.values(VOUCHER_IMAGE_ALLOWED_MIME));
    if (!ext || !allowedExts.has(ext)) {
      throw new BadRequestException(
        'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.',
      );
    }

    const before = await this.prisma.voucherDefinition.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message: 'Voucher definition not found',
      });
    }

    mkdirSync(this.voucherImagesDir(), { recursive: true });
    const filename = `${id}-${Date.now()}${ext}`;
    const diskPath = resolve(this.voucherImagesDir(), filename);
    writeFileSync(diskPath, file.buffer);

    const publicUrl = `${VOUCHER_IMAGE_PUBLIC_PREFIX}${filename}`;
    const updated = await this.prisma.voucherDefinition.update({
      where: { id },
      data: { imageUrl: publicUrl },
    });

    if (before.imageUrl && before.imageUrl !== publicUrl) {
      this.tryRemoveLocalVoucherImage(before.imageUrl);
    }
    return updated;
  }

  async clearVoucherDefinitionImage(id: string) {
    const before = await this.prisma.voucherDefinition.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message: 'Voucher definition not found',
      });
    }
    if (before.imageUrl) this.tryRemoveLocalVoucherImage(before.imageUrl);
    return this.prisma.voucherDefinition.update({
      where: { id },
      data: { imageUrl: null },
    });
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

  private formatCampaignVoucherDiscount(campaign: {
    voucherType: string;
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

  /**
   * Vouchers a walk-in member currently holds that staff can redeem in-store,
   * merged across both voucher systems (same union used for the member's
   * in-app "My Vouchers" list, see customers.service.ts:getMeRewards).
   */
  async listRedeemableVouchers(customerId: string) {
    await this.getCustomer(customerId);
    const now = new Date();
    const nowMs = now.getTime();
    const [customerVouchers, campaignVouchers] = await Promise.all([
      this.prisma.customerVoucher.findMany({
        where: { customerId, status: VoucherStatus.ISSUED },
        include: {
          definition: {
            select: { code: true, title: true, description: true },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.voucher.findMany({
        where: {
          customerId,
          status: {
            in: [VoucherLifecycleStatus.ACTIVE, VoucherLifecycleStatus.LOCKED],
          },
        },
        include: { voucherCampaign: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Mirror online checkout: hide expired / not-yet-valid vouchers so staff
    // cannot apply a till discount the member app would reject.
    const catalogItems = customerVouchers
      .filter((cv) => !isVoucherExpired(cv.expiresAt, nowMs))
      .map((cv) => ({
        id: cv.id,
        source: 'CATALOG' as const,
        code: cv.definition.code,
        title: cv.definition.title,
        discountLabel: cv.definition.description ?? '',
        expiresAt: cv.expiresAt,
        locked: false,
      }));

    const campaignItems = campaignVouchers
      .filter(
        (v) =>
          !isVoucherExpired(v.expiresAt, nowMs) &&
          !isVoucherNotYetValid(v.metadata, nowMs),
      )
      .map((v) => ({
        id: v.id,
        source: 'CAMPAIGN' as const,
        code: v.code,
        title: v.name,
        discountLabel: v.voucherCampaign
          ? this.formatCampaignVoucherDiscount(v.voucherCampaign)
          : '',
        expiresAt: v.expiresAt,
        locked:
          v.status === VoucherLifecycleStatus.LOCKED &&
          !!v.lockExpiresAt &&
          v.lockExpiresAt.getTime() > nowMs,
      }));

    return [...catalogItems, ...campaignItems];
  }

  /**
   * Marks a member's voucher as used because staff redeemed it in-store for
   * a walk-in (SalesPlay has no voucher/discount API, so the discount is
   * applied manually at the till; this just prevents the voucher being
   * reused afterwards).
   */
  async redeemVoucherInStore(
    customerId: string,
    voucherId: string,
    dto: RedeemVoucherDto,
    auth: AdminAuthState,
  ) {
    await this.getCustomer(customerId);

    if (dto.source === 'CATALOG') {
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
          code: 'VOUCHER_NOT_REDEEMABLE',
          message: 'Only issued vouchers can be redeemed.',
        });
      }
      if (isVoucherExpired(row.expiresAt)) {
        throw new BadRequestException({
          code: 'VOUCHER_EXPIRED',
          message: 'This voucher has expired.',
        });
      }
      const updated = await this.prisma.customerVoucher.update({
        where: { id: voucherId },
        data: { status: VoucherStatus.REDEEMED, redeemedAt: new Date() },
        include: { definition: { select: { code: true } } },
      });
      await this.audit.log({
        ...auditActorBase(auth),
        action: 'voucher.redeemed_in_store',
        entityType: 'customer_voucher',
        entityId: voucherId,
        reason: dto.reason ?? null,
        beforeValue: { status: row.status, voucherCode: row.definition.code } as object,
        afterValue: {
          status: updated.status,
          voucherCode: updated.definition.code,
        } as object,
        metadata: { customerId },
      });
      return updated;
    }

    const row = await this.prisma.voucher.findFirst({
      where: { id: voucherId, customerId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'VOUCHER_NOT_FOUND',
        message: 'Voucher not found for this member',
      });
    }
    if (
      row.status === VoucherLifecycleStatus.USED ||
      row.status === VoucherLifecycleStatus.VOID ||
      row.status === VoucherLifecycleStatus.EXPIRED
    ) {
      throw new BadRequestException({
        code: 'VOUCHER_NOT_REDEEMABLE',
        message: 'Only active vouchers can be redeemed.',
      });
    }
    if (isVoucherExpired(row.expiresAt)) {
      throw new BadRequestException({
        code: 'VOUCHER_EXPIRED',
        message: 'This voucher has expired.',
      });
    }
    if (isVoucherNotYetValid(row.metadata)) {
      throw new BadRequestException({
        code: 'VOUCHER_NOT_YET_VALID',
        message: 'This voucher cannot be redeemed yet.',
      });
    }
    const now = new Date();
    if (
      row.status === VoucherLifecycleStatus.LOCKED &&
      row.lockExpiresAt &&
      row.lockExpiresAt.getTime() > now.getTime()
    ) {
      throw new BadRequestException({
        code: 'VOUCHER_LOCKED',
        message: 'Voucher is currently locked by an in-progress online checkout.',
      });
    }

    const updateResult = await this.prisma.voucher.updateMany({
      where: {
        id: voucherId,
        customerId,
        OR: [
          { status: VoucherLifecycleStatus.ACTIVE },
          {
            status: VoucherLifecycleStatus.LOCKED,
            lockExpiresAt: { lt: now },
          },
        ],
      },
      data: {
        status: VoucherLifecycleStatus.USED,
        usageCount: { increment: 1 },
        usedAt: now,
        lockToken: null,
        lockedAt: null,
        lockExpiresAt: null,
        metadata: {
          ...(row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {}),
          redeemedInStoreByAdminId: auth.adminUserId ?? auth.actorLabel ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    if (updateResult.count === 0) {
      throw new BadRequestException({
        code: 'VOUCHER_NOT_REDEEMABLE',
        message: 'Voucher could not be redeemed (it may have just been used).',
      });
    }
    const updated = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.redeemed_in_store',
      entityType: 'voucher',
      entityId: voucherId,
      reason: dto.reason ?? null,
      beforeValue: { status: row.status, voucherCode: row.code } as object,
      afterValue: { status: updated?.status, voucherCode: updated?.code } as object,
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

  /**
   * Retroactively credits points for past purchases (e.g. a walk-in who
   * shopped before joining). Requires the admin to re-enter their own
   * password as a step-up confirmation, since crediting free points is easy
   * to abuse — only available under a real JWT admin session, not the
   * legacy API-key auth mode (there's no per-request admin identity to
   * verify a password against).
   */
  async backfillCustomerLoyalty(
    customerId: string,
    dto: AdminBackfillLoyaltyDto,
    auth: AdminAuthState,
  ) {
    if (!auth.adminUserId) {
      throw new BadRequestException({
        code: 'PASSWORD_STEP_UP_UNAVAILABLE',
        message:
          'Backfilling points requires signing in as an admin user (not an API key), so your password can be re-verified.',
      });
    }
    const passwordOk = await this.adminAuth.verifyPassword(
      auth.adminUserId,
      dto.adminPassword,
    );
    if (!passwordOk) {
      throw new UnauthorizedException({
        code: 'ADMIN_PASSWORD_INCORRECT',
        message: 'Incorrect password.',
      });
    }

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
      referenceType: 'backfill',
      referenceId: null,
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'loyalty.backfilled_by_admin',
      entityType: 'customer',
      entityId: customerId,
      reason: dto.reason,
      metadata: {
        deltaPoints: dto.deltaPoints,
        balanceAfter,
        passwordVerified: true,
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

    // Sales reporting cutoff: exclude spend dated before salesStartDate.
    const salesFloor = this.salesFloor();
    const topSpenderFloor = salesFloor
      ? Prisma.sql`WHERE o.placed_at >= ${salesFloor}`
      : Prisma.empty;
    const topSpenderSql = (from: Date, to: Date) => {
      const f = this.clampFrom(from);
      return this.prisma.$queryRaw<
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
        WHERE o.placed_at >= ${f} AND o.placed_at < ${to}
        GROUP BY o.customer_id
        ORDER BY spent_cents DESC
        LIMIT 10
      `;
    };

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
      this.prisma.customer.count({
        where: { status: CustomerStatus.SUSPENDED },
      }),
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
      this.prisma.$queryRaw<{ day: Date; referred: bigint; organic: bigint }[]>`
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
        ${topSpenderFloor}
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
        WHERE o.placed_at >= ${this.clampFrom(monthAgo)}
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

  async getSalesAnalytics(
    query: SalesAnalyticsQueryDto,
  ): Promise<SalesAnalyticsResult> {
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

    const bucket = query.bucket ?? 'month';
    const category = query.category ?? 'cake';

    // Apply the configured sales reporting cutoff: nothing dated before
    // salesStartDate counts toward GMV. If the whole window is before the
    // cutoff, return a zeroed result instead of querying.
    const flooredFrom = this.clampFrom(from);
    if (flooredFrom.getTime() >= to.getTime()) {
      return this.buildSalesAnalyticsResult({
        from: flooredFrom,
        to,
        bucket,
        category,
        now,
        seriesRows: [],
        topProducts: [],
        paidCount: 0,
        totalGmv: 0,
        openPlaced: 0,
        loyaltyNeg: 0,
        loyaltyPos: 0,
        walletSpend: 0,
        walletTopUp: 0,
        vouchersRedeemed: 0,
        vouchersIssued: 0,
      });
    }

    if (category === 'bento') {
      return this.getBentoSalesAnalytics(flooredFrom, to, bucket, now);
    }
    return this.getCakeSalesAnalytics(flooredFrom, to, bucket, now);
  }

  private async getCakeSalesAnalytics(
    from: Date,
    to: Date,
    bucket: 'day' | 'week' | 'month',
    now: Date,
  ): Promise<SalesAnalyticsResult> {
    const trunc = bucket;
    const paidStatusFilter = Prisma.sql`o.status NOT IN ('pending_payment', 'cancelled')`;

    const bucketSeries = () => {
      if (trunc === 'week') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('week', (o.placed_at AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(o.total_cents)::bigint AS gmv_cents
          FROM customer_orders o
          WHERE ${paidStatusFilter}
            AND o.placed_at >= ${from}
            AND o.placed_at < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      if (trunc === 'month') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('month', (o.placed_at AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(o.total_cents)::bigint AS gmv_cents
          FROM customer_orders o
          WHERE ${paidStatusFilter}
            AND o.placed_at >= ${from}
            AND o.placed_at < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      return this.prisma.$queryRaw<
        { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
      >`
        SELECT date_trunc('day', (o.placed_at AT TIME ZONE 'UTC')) AS period_start,
               COUNT(*)::bigint AS order_count,
               SUM(o.total_cents)::bigint AS gmv_cents
        FROM customer_orders o
        WHERE ${paidStatusFilter}
          AND o.placed_at >= ${from}
          AND o.placed_at < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    };

    const [
      seriesRows,
      topProducts,
      paidRow,
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
        WHERE ${paidStatusFilter}
          AND o.placed_at >= ${from}
          AND o.placed_at < ${to}
        GROUP BY l.product_id
        ORDER BY qty_sold DESC
        LIMIT 25
      `,
      this.prisma.$queryRaw<{ cnt: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS cnt,
               COALESCE(SUM(o.total_cents), 0)::bigint AS gmv
        FROM customer_orders o
        WHERE ${paidStatusFilter}
          AND o.placed_at >= ${from}
          AND o.placed_at < ${to}
      `,
      this.prisma.customerOrder.count({
        where: {
          status: { notIn: ['pending_payment', 'cancelled', 'completed'] },
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

    const paidCount = Number(paidRow[0]?.cnt ?? 0n);
    const totalGmv = Number(paidRow[0]?.gmv ?? 0n);

    return this.buildSalesAnalyticsResult({
      from,
      to,
      bucket,
      category: 'cake',
      now,
      seriesRows,
      topProducts,
      paidCount,
      totalGmv,
      openPlaced,
      loyaltyNeg: loyaltyNeg._sum.deltaPoints ?? 0,
      loyaltyPos: loyaltyPos._sum.deltaPoints ?? 0,
      walletSpend: walletSpend._sum.amountCents ?? 0,
      walletTopUp: walletTopUp._sum.amountCents ?? 0,
      vouchersRedeemed,
      vouchersIssued,
    });
  }

  private async getBentoSalesAnalytics(
    from: Date,
    to: Date,
    bucket: 'day' | 'week' | 'month',
    now: Date,
  ): Promise<SalesAnalyticsResult> {
    const trunc = bucket;

    const bucketSeries = () => {
      if (trunc === 'week') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('week', (pi.updated_at AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(pi.amount_cents)::bigint AS gmv_cents
          FROM payment_intents pi
          WHERE pi.purpose = 'bento_subscription'
            AND pi.status = 'SUCCEEDED'
            AND pi.updated_at >= ${from}
            AND pi.updated_at < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      if (trunc === 'month') {
        return this.prisma.$queryRaw<
          { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
        >`
          SELECT date_trunc('month', (pi.updated_at AT TIME ZONE 'UTC')) AS period_start,
                 COUNT(*)::bigint AS order_count,
                 SUM(pi.amount_cents)::bigint AS gmv_cents
          FROM payment_intents pi
          WHERE pi.purpose = 'bento_subscription'
            AND pi.status = 'SUCCEEDED'
            AND pi.updated_at >= ${from}
            AND pi.updated_at < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
      }
      return this.prisma.$queryRaw<
        { period_start: Date; order_count: bigint; gmv_cents: bigint }[]
      >`
        SELECT date_trunc('day', (pi.updated_at AT TIME ZONE 'UTC')) AS period_start,
               COUNT(*)::bigint AS order_count,
               SUM(pi.amount_cents)::bigint AS gmv_cents
        FROM payment_intents pi
        WHERE pi.purpose = 'bento_subscription'
          AND pi.status = 'SUCCEEDED'
          AND pi.updated_at >= ${from}
          AND pi.updated_at < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    };

    const [seriesRows, topProducts, paidRow] = await Promise.all([
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
        SELECT bp.code AS product_id,
               MAX(bp.label) AS name,
               COUNT(*)::bigint AS qty_sold,
               SUM(pi.amount_cents)::bigint AS revenue_cents,
               COUNT(DISTINCT pi.id)::bigint AS order_count
        FROM payment_intents pi
        INNER JOIN bento_subscriptions bs ON bs.payment_intent_id = pi.id
        INNER JOIN bento_packages bp ON bp.id = bs.package_id
        WHERE pi.purpose = 'bento_subscription'
          AND pi.status = 'SUCCEEDED'
          AND pi.updated_at >= ${from}
          AND pi.updated_at < ${to}
        GROUP BY bp.code
        ORDER BY qty_sold DESC
        LIMIT 25
      `,
      this.prisma.$queryRaw<{ cnt: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS cnt,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE pi.purpose = 'bento_subscription'
          AND pi.status = 'SUCCEEDED'
          AND pi.updated_at >= ${from}
          AND pi.updated_at < ${to}
      `,
    ]);

    const paidCount = Number(paidRow[0]?.cnt ?? 0n);
    const totalGmv = Number(paidRow[0]?.gmv ?? 0n);

    return this.buildSalesAnalyticsResult({
      from,
      to,
      bucket,
      category: 'bento',
      now,
      seriesRows,
      topProducts,
      paidCount,
      totalGmv,
      openPlaced: 0,
      loyaltyNeg: 0,
      loyaltyPos: 0,
      walletSpend: 0,
      walletTopUp: 0,
      vouchersRedeemed: 0,
      vouchersIssued: 0,
    });
  }

  /**
   * Marketing funnel for the Bento member app: how many members registered vs
   * how many actually paid for a bento plan. "Registered" = every customer
   * (the Bento app shares the main member login, so there is no separate bento
   * signup source). "Paid" reuses the same SUCCEEDED bento_subscription payment
   * predicate as {@link getBentoSalesAnalytics} so the numbers stay consistent.
   */
  async getBentoMemberFunnel(
    query: SalesAnalyticsQueryDto,
  ): Promise<BentoMemberFunnelResult> {
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
    const bucket = query.bucket ?? 'month';
    // bucket is validated to one of day/week/month by the DTO, so it is safe to
    // splice into the date_trunc unit literal via Prisma.raw.
    const truncUnit = Prisma.raw(`'${bucket}'`);
    const bentoPaid = Prisma.sql`pi.purpose = 'bento_subscription' AND pi.status = 'SUCCEEDED'`;
    // Sales reporting cutoff: exclude payments before salesStartDate from the
    // money figures. Member-count queries keep their real (uncut) values.
    const floor = this.salesFloor();
    const paidFloor = floor
      ? Prisma.sql`AND pi.updated_at >= ${floor}`
      : Prisma.empty;
    const rangeFrom = this.clampFrom(from);

    const [
      totalMembers,
      newMembers,
      paidRow,
      rangeRow,
      regSeries,
      paySeries,
    ] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({
        where: { createdAt: { gte: from, lt: to } },
      }),
      this.prisma.$queryRaw<
        { members: bigint; payments: bigint; gmv: bigint }[]
      >`
        SELECT COUNT(DISTINCT pi.customer_id)::bigint AS members,
               COUNT(*)::bigint AS payments,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE ${bentoPaid} ${paidFloor}
      `,
      this.prisma.$queryRaw<
        { members: bigint; payments: bigint; gmv: bigint }[]
      >`
        SELECT COUNT(DISTINCT pi.customer_id)::bigint AS members,
               COUNT(*)::bigint AS payments,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE ${bentoPaid}
          AND pi.updated_at >= ${rangeFrom}
          AND pi.updated_at < ${to}
      `,
      this.prisma.$queryRaw<{ period_start: Date; cnt: bigint }[]>`
        SELECT date_trunc(${truncUnit}, (c.created_at AT TIME ZONE 'UTC')) AS period_start,
               COUNT(*)::bigint AS cnt
        FROM customers c
        WHERE c.created_at >= ${from}
          AND c.created_at < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<
        { period_start: Date; cnt: bigint; gmv: bigint }[]
      >`
        SELECT date_trunc(${truncUnit}, (pi.updated_at AT TIME ZONE 'UTC')) AS period_start,
               COUNT(*)::bigint AS cnt,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE ${bentoPaid}
          AND pi.updated_at >= ${rangeFrom}
          AND pi.updated_at < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const paidMembers = Number(paidRow[0]?.members ?? 0n);
    const payingTransactions = Number(paidRow[0]?.payments ?? 0n);
    const totalGmvCents = Number(paidRow[0]?.gmv ?? 0n);

    // Merge the two per-bucket series on period_start.
    const byPeriod = new Map<
      string,
      { registrations: number; payments: number; gmvCents: number }
    >();
    for (const r of regSeries) {
      const key = r.period_start.toISOString();
      const e = byPeriod.get(key) ?? {
        registrations: 0,
        payments: 0,
        gmvCents: 0,
      };
      e.registrations = Number(r.cnt);
      byPeriod.set(key, e);
    }
    for (const r of paySeries) {
      const key = r.period_start.toISOString();
      const e = byPeriod.get(key) ?? {
        registrations: 0,
        payments: 0,
        gmvCents: 0,
      };
      e.payments = Number(r.cnt);
      e.gmvCents = Number(r.gmv);
      byPeriod.set(key, e);
    }
    const series = Array.from(byPeriod.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([periodStart, v]) => ({ periodStart, ...v }));

    return {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        generatedAt: now.toISOString(),
      },
      totals: {
        totalMembers,
        paidMembers,
        payingTransactions,
        totalGmvCents,
        conversionRate: totalMembers > 0 ? paidMembers / totalMembers : 0,
      },
      inRange: {
        newMembers,
        newPaidMembers: Number(rangeRow[0]?.members ?? 0n),
        payments: Number(rangeRow[0]?.payments ?? 0n),
        gmvCents: Number(rangeRow[0]?.gmv ?? 0n),
      },
      series,
    };
  }

  /**
   * Bento-only transaction ledger: recent successful bento payments joined to
   * the member and the package they bought. Ordered newest-first.
   */
  async listBentoTransactions(
    query: SalesAnalyticsQueryDto,
  ): Promise<{ transactions: BentoTransactionRow[] }> {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 86400000);
    const hasRange =
      !Number.isNaN(from.getTime()) &&
      !Number.isNaN(to.getTime()) &&
      from.getTime() < to.getTime();
    const rangeFilter = hasRange
      ? Prisma.sql`AND pi.updated_at >= ${from} AND pi.updated_at < ${to}`
      : Prisma.empty;
    // Hide test-phase transactions dated before the sales reporting cutoff.
    const floor = this.salesFloor();
    const floorFilter = floor
      ? Prisma.sql`AND pi.updated_at >= ${floor}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        payment_intent_id: string;
        paid_at: Date;
        customer_id: string | null;
        display_name: string | null;
        phone_e164: string | null;
        package_code: string | null;
        package_label: string | null;
        meal_option: string | null;
        amount_cents: bigint;
        voucher_code: string | null;
        voucher_discount_cents: bigint | null;
      }[]
    >`
      SELECT pi.id AS payment_intent_id,
             pi.updated_at AS paid_at,
             c.id AS customer_id,
             c.display_name AS display_name,
             c.phone_e164 AS phone_e164,
             bp.code AS package_code,
             bp.label AS package_label,
             bs.meal_option AS meal_option,
             pi.amount_cents AS amount_cents,
             bdv.code AS voucher_code,
             bdr.discount_cents AS voucher_discount_cents
      FROM payment_intents pi
      LEFT JOIN bento_subscriptions bs ON bs.payment_intent_id = pi.id
      LEFT JOIN bento_packages bp ON bp.id = bs.package_id
      LEFT JOIN customers c ON c.id = pi.customer_id
      LEFT JOIN bento_discount_redemptions bdr
        ON bdr.payment_intent_id = pi.id AND bdr.status = 'CONFIRMED'
      LEFT JOIN bento_discount_vouchers bdv ON bdv.id = bdr.voucher_id
      WHERE pi.purpose = 'bento_subscription'
        AND pi.status = 'SUCCEEDED'
        ${rangeFilter}
        ${floorFilter}
      ORDER BY pi.updated_at DESC
      LIMIT 100
    `;

    return {
      transactions: rows.map((r) => ({
        paymentIntentId: r.payment_intent_id,
        paidAt: r.paid_at.toISOString(),
        customerId: r.customer_id,
        customerName: r.display_name,
        customerPhone: r.phone_e164,
        packageCode: r.package_code,
        packageLabel: r.package_label,
        mealOption: r.meal_option,
        amountCents: Number(r.amount_cents),
        voucherCode: r.voucher_code,
        voucherDiscountCents:
          r.voucher_discount_cents == null
            ? null
            : Number(r.voucher_discount_cents),
      })),
    };
  }

  /**
   * Per-customer meal pickup progress for paid bento plans: how many boxes
   * have been collected (DELIVERED pickup days) and how many meals are still
   * owed on each plan. Backs the "Pickup progress" table on Bento · Sales.
   */
  async listBentoPickupProgress() {
    const subs = await this.prisma.bentoSubscription.findMany({
      where: {
        status: {
          in: [
            BentoSubscriptionStatus.ACTIVE,
            BentoSubscriptionStatus.COMPLETED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        customer: {
          select: { id: true, displayName: true, phoneE164: true },
        },
        package: { select: { code: true, label: true, durationDays: true } },
        deliveries: {
          select: {
            includesLunch: true,
            includesDinner: true,
            lunchQty: true,
            dinnerQty: true,
            status: true,
          },
        },
      },
    });
    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const MS_PER_DAY = 86_400_000;
    const rows = subs.map((s) => {
      let collected = 0;
      let scheduled = 0;
      for (const d of s.deliveries) {
        // Legacy rows predate the qty columns (qty 0 with the boolean set).
        const packs =
          (d.lunchQty || (d.includesLunch ? 1 : 0)) +
          (d.dinnerQty || (d.includesDinner ? 1 : 0));
        if (d.status === BentoDeliveryStatus.DELIVERED) collected += packs;
        else if (d.status === BentoDeliveryStatus.SCHEDULED) scheduled += packs;
      }
      // Validity countdown: the package window (e.g. 90 days for 30 meals)
      // counted from the purchase day, losing one day per calendar day.
      // Day-of-purchase shows the full window; 0 = window used up.
      const purchasedUtc = Date.UTC(
        s.createdAt.getUTCFullYear(),
        s.createdAt.getUTCMonth(),
        s.createdAt.getUTCDate(),
      );
      const daysElapsed = Math.floor((todayUtc - purchasedUtc) / MS_PER_DAY);
      const daysLeft = Math.max(0, s.package.durationDays - daysElapsed);
      const validUntil = new Date(
        purchasedUtc + s.package.durationDays * MS_PER_DAY,
      );
      return {
        subscriptionId: s.id,
        status: s.status,
        // Archived by admin (test/invalid plan) — UI hides these by default.
        hiddenAt: s.progressHiddenAt ? s.progressHiddenAt.toISOString() : null,
        customerId: s.customer.id,
        customerName: s.customer.displayName,
        customerPhone: s.customer.phoneE164,
        packageCode: s.package.code,
        packageLabel: s.package.label,
        mealOption: s.mealOption,
        mealCreditsTotal: s.mealCreditsTotal,
        collectedMeals: collected,
        scheduledMeals: scheduled,
        remainingMeals: Math.max(0, s.mealCreditsTotal - collected),
        unscheduledMeals: Math.max(
          0,
          s.mealCreditsTotal - collected - scheduled,
        ),
        startDate: s.startDate ? s.startDate.toISOString().slice(0, 10) : null,
        endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
        durationDays: s.package.durationDays,
        daysLeft,
        validUntil: validUntil.toISOString().slice(0, 10),
        createdAt: s.createdAt.toISOString(),
      };
    });
    // Plans with the most meals still owed float to the top.
    rows.sort((a, b) => b.remainingMeals - a.remainingMeals);
    return { rows };
  }

  /**
   * Archive (or restore) a plan on the pickup-progress report. Used to clear
   * out leftover test/invalid plans without touching the subscription or its
   * pickup history.
   */
  async setBentoProgressHidden(
    id: string,
    hidden: boolean,
    auth: AdminAuthState,
  ) {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: { id: true, progressHiddenAt: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    const updated = await this.prisma.bentoSubscription.update({
      where: { id: sub.id },
      data: { progressHiddenAt: hidden ? new Date() : null },
      select: { id: true, progressHiddenAt: true },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: hidden
        ? 'bento.pickup_progress_archived'
        : 'bento.pickup_progress_restored',
      entityType: 'bento_subscription',
      entityId: updated.id,
      metadata: {
        previousHiddenAt: sub.progressHiddenAt?.toISOString() ?? null,
      } as object,
    });
    return {
      id: updated.id,
      hiddenAt: updated.progressHiddenAt
        ? updated.progressHiddenAt.toISOString()
        : null,
    };
  }

  private buildSalesAnalyticsResult(params: {
    from: Date;
    to: Date;
    bucket: 'day' | 'week' | 'month';
    category: 'cake' | 'bento';
    now: Date;
    seriesRows: { period_start: Date; order_count: bigint; gmv_cents: bigint }[];
    topProducts: {
      product_id: string;
      name: string;
      qty_sold: bigint;
      revenue_cents: bigint;
      order_count: bigint;
    }[];
    paidCount: number;
    totalGmv: number;
    openPlaced: number;
    loyaltyNeg: number;
    loyaltyPos: number;
    walletSpend: number;
    walletTopUp: number;
    vouchersRedeemed: number;
    vouchersIssued: number;
  }): SalesAnalyticsResult {
    const pointsRedeemedPeriod = Math.abs(params.loyaltyNeg);
    const pointsIssuedPeriod = params.loyaltyPos;
    const walletSpendCents = Math.abs(params.walletSpend);

    const series = params.seriesRows.map((r) => ({
      periodStart: r.period_start.toISOString(),
      orderCount: Number(r.order_count),
      gmvCents: Number(r.gmv_cents),
    }));

    const top = params.topProducts.map((p) => ({
      productId: p.product_id,
      name: p.name,
      qtySold: Number(p.qty_sold),
      revenueCents: Number(p.revenue_cents),
      orders: Number(p.order_count),
    }));

    return {
      meta: {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        bucket: params.bucket,
        category: params.category,
        generatedAt: params.now.toISOString(),
      },
      series,
      topProducts: top,
      bestSeller: top[0] ?? null,
      summary: {
        completedOrders: params.paidCount,
        totalGmvCents: params.totalGmv,
        averageOrderValueCents:
          params.paidCount > 0
            ? Math.round(params.totalGmv / params.paidCount)
            : 0,
        openOrdersPlacedInRange: params.openPlaced,
        loyaltyPointsIssuedInRange: pointsIssuedPeriod,
        loyaltyPointsRedeemedInRange: pointsRedeemedPeriod,
        storedWalletSpendCentsInRange: walletSpendCents,
        storedWalletTopUpCentsInRange: params.walletTopUp,
        vouchersIssuedInRange: params.vouchersIssued,
        vouchersRedeemedInRange: params.vouchersRedeemed,
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
    lines.push(['meta', 'category', payload.meta.category].map(esc).join(','));
    lines.push(
      ['meta', 'generatedAt', payload.meta.generatedAt].map(esc).join(','),
    );
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
        fulfillmentSummary: this.fulfillmentSummaryStrings(
          o.fulfillmentSummary,
        ),
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
    // Apply the sales reporting cutoff: a day fully before salesStartDate yields
    // an empty (>= start AND < next) window and therefore zeroed totals.
    const floor = this.salesFloor();
    const start = floor && floor.getTime() > day.getTime() ? floor : day;

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
        AND COALESCE(o.completed_at, o.placed_at) >= ${start}
        AND COALESCE(o.completed_at, o.placed_at) < ${next}
      GROUP BY l.product_id
      ORDER BY qty_sold DESC
    `;

    const [totals, posTotals, bentoTotals] = await Promise.all([
      this.prisma.$queryRaw<{ orders: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS orders,
               COALESCE(SUM(o.total_cents), 0)::bigint AS gmv
        FROM customer_orders o
        WHERE o.status = 'completed'
          AND COALESCE(o.completed_at, o.placed_at) >= ${start}
          AND COALESCE(o.completed_at, o.placed_at) < ${next}
      `,
      // In-store POS, booked on its MYT business date. Exclude online-order
      // settlement receipts (already counted in the online channel).
      this.prisma.$queryRaw<{ orders: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS orders,
               COALESCE(SUM(pr.net_cents), 0)::bigint AS gmv
        FROM pos_receipts pr
        WHERE pr.origin_online_order_id IS NULL
          AND pr.business_date >= (${start} AT TIME ZONE 'UTC')::date
          AND pr.business_date < (${next} AT TIME ZONE 'UTC')::date
      `,
      this.prisma.$queryRaw<{ orders: bigint; gmv: bigint }[]>`
        SELECT COUNT(*)::bigint AS orders,
               COALESCE(SUM(pi.amount_cents), 0)::bigint AS gmv
        FROM payment_intents pi
        WHERE pi.purpose = 'bento_subscription'
          AND pi.status = 'SUCCEEDED'
          AND pi.updated_at >= ${start}
          AND pi.updated_at < ${next}
      `,
    ]);

    const onlineOrders = Number(totals[0]?.orders ?? 0n);
    const onlineGmv = Number(totals[0]?.gmv ?? 0n);
    const posOrders = Number(posTotals[0]?.orders ?? 0n);
    const posGmv = Number(posTotals[0]?.gmv ?? 0n);
    const bentoOrders = Number(bentoTotals[0]?.orders ?? 0n);
    const bentoGmv = Number(bentoTotals[0]?.gmv ?? 0n);

    return {
      date: day.toISOString().slice(0, 10),
      closed: !!closed,
      closedAt: closed?.closedAt.toISOString() ?? null,
      // Kept for backward compatibility — the online-shop channel figures.
      completedOrders: onlineOrders,
      totalGmvCents: onlineGmv,
      // All-channel breakdown for the finance daily view.
      channels: {
        onlineShop: { orders: onlineOrders, gmvCents: onlineGmv },
        pos: { orders: posOrders, gmvCents: posGmv },
        bento: { orders: bentoOrders, gmvCents: bentoGmv },
      },
      allChannelsOrders: onlineOrders + posOrders + bentoOrders,
      allChannelsGmvCents: onlineGmv + posGmv + bentoGmv,
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

  /**
   * Mark a bento subscription as REFUNDED. Used by the "Awaiting scheduling"
   * panel to clear members who were already refunded outside the app — once
   * refunded the subscription is no longer ACTIVE, so it drops off the
   * awaiting-schedule and kitchen reports.
   */
  async markBentoSubscriptionRefunded(id: string, auth: AdminAuthState) {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status === BentoSubscriptionStatus.REFUNDED) {
      return { id: sub.id, status: sub.status, alreadyRefunded: true as const };
    }
    const updated = await this.prisma.bentoSubscription.update({
      where: { id: sub.id },
      data: { status: BentoSubscriptionStatus.REFUNDED },
      select: { id: true, status: true },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'bento.subscription_refunded',
      entityType: 'bento_subscription',
      entityId: updated.id,
      metadata: { previousStatus: sub.status } as object,
    });
    return { id: updated.id, status: updated.status, alreadyRefunded: false as const };
  }

  /**
   * Support tool: look up a member by phone and return every bento subscription
   * with its status and scheduled pickups. Staff use this to diagnose the
   * "paid but can't schedule" complaint (subscription stuck at PENDING_PAYMENT).
   */
  async lookupBentoCustomer(phone: string) {
    const phoneE164 = this.phoneNormalizer.normalizeToE164(phone);
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: {
        id: true,
        phoneE164: true,
        displayName: true,
        email: true,
        status: true,
        kitchenPickupCode: true,
        createdAt: true,
      },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: `No member found for phone ${phoneE164}`,
      });
    }
    const subscriptions = await this.prisma.bentoSubscription.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        package: { select: { code: true, label: true, mealCredits: true } },
        deliveries: {
          orderBy: { deliveryDate: 'asc' },
          select: {
            id: true,
            deliveryDate: true,
            includesLunch: true,
            includesDinner: true,
            lunchQty: true,
            dinnerQty: true,
            status: true,
          },
        },
      },
    });
    return {
      customer,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        package: s.package,
        mealOption: s.mealOption,
        mealCreditsTotal: s.mealCreditsTotal,
        lunchCredits: s.lunchCredits,
        dinnerCredits: s.dinnerCredits,
        totalCents: s.totalCents,
        paymentIntentId: s.paymentIntentId,
        createdAt: s.createdAt,
        scheduledCount: s.deliveries.length,
        deliveries: s.deliveries,
        // What the client app gates scheduling on: ACTIVE with no pickups yet.
        needsScheduling:
          s.status === BentoSubscriptionStatus.ACTIVE &&
          s.deliveries.length === 0,
        // The stuck state that blocks scheduling despite a completed payment.
        blockedByPayment: s.status === BentoSubscriptionStatus.PENDING_PAYMENT,
      })),
    };
  }

  /**
   * Unblock a subscription stuck at PENDING_PAYMENT so the member can schedule.
   * First re-checks Xendit and activates legitimately if the payment actually
   * succeeded; only if Xendit still cannot confirm does it force-activate, which
   * requires a reason for the audit trail.
   */
  async activateBentoSubscription(
    id: string,
    dto: ActivateBentoSubscriptionDto,
    auth: AdminAuthState,
  ) {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status === BentoSubscriptionStatus.ACTIVE) {
      return {
        id: sub.id,
        status: sub.status,
        method: 'already_active' as const,
      };
    }
    if (sub.status !== BentoSubscriptionStatus.PENDING_PAYMENT) {
      throw new BadRequestException({
        code: 'BENTO_NOT_PENDING',
        message: `Only subscriptions awaiting payment can be activated (current status: ${sub.status}).`,
      });
    }

    // 1) Reconcile with Xendit — if the payment really succeeded, activate cleanly.
    await this.payments.reconcileBentoSubscriptionPayment(id);
    const afterReconcile = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: { status: true },
    });
    if (afterReconcile?.status === BentoSubscriptionStatus.ACTIVE) {
      await this.audit.log({
        ...auditActorBase(auth),
        action: 'bento.subscription_activated',
        entityType: 'bento_subscription',
        entityId: id,
        metadata: {
          method: 'reconciled',
          previousStatus: sub.status,
        } as object,
      });
      return {
        id,
        status: BentoSubscriptionStatus.ACTIVE,
        method: 'reconciled' as const,
      };
    }

    // 2) Force override — Xendit could not confirm, so require an explicit reason.
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'BENTO_ACTIVATION_REASON_REQUIRED',
        message:
          'Xendit did not confirm payment. Provide a reason to force-activate this subscription.',
      });
    }
    const updated = await this.prisma.bentoSubscription.update({
      where: { id },
      data: { status: BentoSubscriptionStatus.ACTIVE },
      select: { id: true, status: true },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'bento.subscription_activated',
      entityType: 'bento_subscription',
      entityId: id,
      metadata: {
        method: 'forced',
        previousStatus: sub.status,
        reason,
      } as object,
    });
    return {
      id: updated.id,
      status: updated.status,
      method: 'forced' as const,
    };
  }

  /**
   * Cancel an unpaid (PENDING_PAYMENT) subscription so abandoned/duplicate
   * checkout attempts stop cluttering the member's list and blocking
   * scheduling. Paid plans must go through refund instead, not cancel.
   */
  async cancelBentoSubscription(id: string, auth: AdminAuthState) {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status === BentoSubscriptionStatus.CANCELLED) {
      return {
        id: sub.id,
        status: sub.status,
        alreadyCancelled: true as const,
      };
    }
    if (sub.status !== BentoSubscriptionStatus.PENDING_PAYMENT) {
      throw new BadRequestException({
        code: 'BENTO_CANNOT_CANCEL',
        message: `Only unpaid subscriptions can be cancelled here (current status: ${sub.status}). Use refund for a paid plan.`,
      });
    }
    const updated = await this.prisma.bentoSubscription.update({
      where: { id },
      data: { status: BentoSubscriptionStatus.CANCELLED },
      select: { id: true, status: true },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'bento.subscription_cancelled',
      entityType: 'bento_subscription',
      entityId: id,
      metadata: { previousStatus: sub.status } as object,
    });
    return {
      id: updated.id,
      status: updated.status,
      alreadyCancelled: false as const,
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
      afterValue: {
        name: created.name,
        triggerType: created.triggerType,
      } as object,
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
    const def = await this.prisma.voucherDefinition.findUnique({
      where: { id: dto.voucherDefinitionId },
      select: { id: true, pointsCost: true },
    });
    if (!def) {
      throw new BadRequestException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message:
          'Voucher definition not found. Select a valid voucher/reward series before creating this campaign rule.',
      });
    }
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
      afterValue: {
        name: created.name,
        programKind: created.programKind,
      } as object,
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
    const def = await this.prisma.voucherDefinition.findUnique({
      where: { id: defId },
      select: { id: true, pointsCost: true },
    });
    if (!def) {
      throw new BadRequestException({
        code: 'VOUCHER_DEFINITION_NOT_FOUND',
        message:
          'Voucher definition not found. Select a valid voucher/reward series before updating this campaign rule.',
      });
    }
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
        dto.rebateValueSen !== undefined
          ? dto.rebateValueSen
          : before.rebateValueSen,
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
