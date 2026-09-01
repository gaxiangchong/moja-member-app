import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { memberRewardsCatalogWhere } from '../rewards/member-rewards-catalog.util';
import {
  formatKitchenPickupCode,
  KITCHEN_PICKUP_CODE_MAX,
  KITCHEN_PICKUP_CODE_MIN,
} from './kitchen-pickup-code.util';
import { loadDefinitionDiscountMap } from '../rewards/voucher-definition-discount.util';
import { WalletService } from '../wallet/wallet.service';
import { SalesplayService } from '../salesplay/salesplay.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { CampaignAutomationService } from '../rewards-workflow/campaign-automation.service';
import type { SubmitMemberOrderDto } from './dto/submit-member-order.dto';

/**
 * Product-interest tags stored in Customer.tags[] for targeted marketing.
 * A member tagged with both 'bento' and 'cake' is effectively "both" — there
 * is no separate value; the combination is the array containing both. These
 * plug into the existing segmentation tag filters (tags && / tags @>).
 */
export const INTEREST_TAGS = ['bento', 'cake'] as const;
export type InterestTag = (typeof INTEREST_TAGS)[number];

/** Maps an originating app/source to its product-interest tag. */
export function interestTagForSource(
  source: string | null | undefined,
): InterestTag | null {
  switch (source?.trim().toLowerCase()) {
    case 'bento':
      return 'bento';
    case 'cake':
    case 'client':
      return 'cake';
    default:
      return null;
  }
}

function fulfillmentSummaryLinesFromJson(
  raw: Prisma.JsonValue | null,
): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/**
 * Collapse a new-model voucher lifecycle status into the simple status string
 * the member app's voucher tabs understand (ACTIVE / USED / EXPIRED / VOID).
 * A LOCKED voucher (held by an in-progress checkout) is shown as ACTIVE.
 */
function mapNewVoucherStatus(status: string): string {
  switch (status) {
    case 'LOCKED':
      return 'ACTIVE';
    default:
      return status;
  }
}

type CampaignDiscountShape = {
  rebateValueSen: number | null;
  minSpendSen: number | null;
  percentageOff: number | null;
};

/**
 * Derive the member-facing discount fields from a voucher campaign so the
 * client can render and price both fixed-amount and percentage vouchers.
 */
function campaignVoucherDiscount(
  campaign: {
    voucherType: string;
    fixedAmountOff: number | null;
    deliveryDiscountAmount: number | null;
    percentageOff: number | null;
    minSpend: number | null;
  } | null,
): CampaignDiscountShape {
  if (!campaign) {
    return { rebateValueSen: null, minSpendSen: null, percentageOff: null };
  }
  const minSpendSen = campaign.minSpend ?? null;
  switch (campaign.voucherType) {
    case 'FIXED_AMOUNT':
      return {
        rebateValueSen: campaign.fixedAmountOff ?? null,
        minSpendSen,
        percentageOff: null,
      };
    case 'DELIVERY_DISCOUNT':
      return {
        rebateValueSen: campaign.deliveryDiscountAmount ?? null,
        minSpendSen,
        percentageOff: null,
      };
    case 'PERCENTAGE':
      return {
        rebateValueSen: null,
        minSpendSen,
        percentageOff: campaign.percentageOff ?? null,
      };
    default:
      return { rebateValueSen: null, minSpendSen, percentageOff: null };
  }
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
    private readonly salesplay: SalesplayService,
    private readonly shopCatalog: ShopCatalogService,
    private readonly config: ConfigService,
    private readonly campaignAutomation: CampaignAutomationService,
  ) {}

  /**
   * Earn rate (points per unit of currency spent). Unified across channels —
   * both in-store (SalesPlay webhook) and online (member-app shop) read this.
   * Legacy `SALESPLAY_POINTS_PER_UNIT` is honored as a fallback so existing
   * deployments keep working without an env change.
   */
  private loyaltyPointsPerCurrencyUnit(): number {
    const unified = Number(this.config.get<string>('LOYALTY_POINTS_PER_RM'));
    if (Number.isFinite(unified) && unified > 0) return unified;
    const legacy = Number(this.config.get<string>('SALESPLAY_POINTS_PER_UNIT'));
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 1;
  }

  /**
   * Loyalty points awarded to a referrer when a member they referred completes
   * their **first paid order**. Configured via `REFERRAL_REWARD_POINTS`.
   * Default 0 = referral rewards disabled (referrals are still tracked).
   */
  private referralRewardPoints(): number {
    const raw = Number(this.config.get<string>('REFERRAL_REWARD_POINTS'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  /**
   * Loyalty points gifted to a member during their birthday month. Configured
   * via `BIRTHDAY_REWARD_POINTS`. Default 0 = disabled. Granted at most once per
   * calendar year, and only while the current month matches the member's
   * birthday month.
   */
  private birthdayRewardPoints(): number {
    const raw = Number(this.config.get<string>('BIRTHDAY_REWARD_POINTS'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  /**
   * Lazily grants the birthday points gift. Safe to call on any member touch
   * (profile load / update): it only credits when the current month is the
   * member's birthday month and they have not already received this year's
   * gift. No scheduler required.
   */
  private async maybeGrantBirthdayReward(customerId: string): Promise<void> {
    const rewardPoints = this.birthdayRewardPoints();
    if (rewardPoints <= 0) return;

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, birthday: true },
    });
    if (!customer?.birthday) return;

    const now = new Date();
    const currentMonth = now.getUTCMonth();
    const currentYear = now.getUTCFullYear();
    if (customer.birthday.getUTCMonth() !== currentMonth) return;

    const yearRef = String(currentYear);
    const already = await this.prisma.loyaltyLedgerEntry.findFirst({
      where: {
        customerId,
        reason: 'birthday_reward',
        referenceType: 'birthday',
        referenceId: yearRef,
      },
      select: { id: true },
    });
    if (already) return;

    try {
      const result = await this.loyalty.appendLedgerEntry({
        customerId,
        deltaPoints: rewardPoints,
        reason: 'birthday_reward',
        referenceType: 'birthday',
        referenceId: yearRef,
      });
      this.logger.log(
        `Awarded ${rewardPoints} birthday points to member ${customerId} ` +
          `for ${yearRef} (balanceAfter=${result.balanceAfter}).`,
      );
    } catch (err) {
      // A birthday gift must never break profile load/update.
      this.logger.error(
        `Birthday reward grant failed for member ${customerId}`,
        err as Error,
      );
    }
  }

  async findByIdOrThrow(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }
    return customer;
  }

  async findByPhoneE164(phoneE164: string) {
    return this.prisma.customer.findUnique({ where: { phoneE164 } });
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 12; i += 1) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      const clash = await this.prisma.customer.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new Error('REFERRAL_CODE_GENERATION_FAILED');
  }

  private async nextKitchenPickupCodeCandidate(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ max_code: string | null }[]>`
      SELECT MAX(CAST(kitchen_pickup_code AS INTEGER))::text AS max_code
      FROM customers
      WHERE kitchen_pickup_code ~ '^[0-9]{6}$'
    `;
    const maxRaw = rows[0]?.max_code;
    const next = maxRaw
      ? Number.parseInt(maxRaw, 10) + 1
      : KITCHEN_PICKUP_CODE_MIN;
    if (!Number.isFinite(next) || next > KITCHEN_PICKUP_CODE_MAX) {
      throw new Error('KITCHEN_PICKUP_CODE_EXHAUSTED');
    }
    return formatKitchenPickupCode(next);
  }

  /** Assigns a persistent unique 6-digit kitchen pickup code (idempotent). */
  async ensureKitchenPickupCode(customerId: string): Promise<string> {
    const existing = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { kitchenPickupCode: true },
    });
    if (existing?.kitchenPickupCode) return existing.kitchenPickupCode;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = await this.nextKitchenPickupCodeCandidate();
      try {
        const updated = await this.prisma.customer.updateMany({
          where: { id: customerId, kitchenPickupCode: null },
          data: { kitchenPickupCode: candidate },
        });
        if (updated.count === 1) return candidate;

        const after = await this.prisma.customer.findUnique({
          where: { id: customerId },
          select: { kitchenPickupCode: true },
        });
        if (after?.kitchenPickupCode) return after.kitchenPickupCode;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('KITCHEN_PICKUP_CODE_GENERATION_FAILED');
  }

  private async resolveReferrerId(
    code: string | null | undefined,
  ): Promise<string | null> {
    const normalized = String(code ?? '')
      .trim()
      .toUpperCase();
    if (!normalized) return null;
    const ref = await this.prisma.customer.findFirst({
      where: { referralCode: { equals: normalized, mode: 'insensitive' } },
      select: { id: true },
    });
    return ref?.id ?? null;
  }

  /**
   * Creates a draft member keyed by normalized phone (first successful OTP verify).
   * Optional `referralCode` attributes signup to an existing member (first signup only).
   */
  async ensureCustomerForPhone(
    phoneE164: string,
    opts?: {
      referralCode?: string | null;
      email?: string | null;
      /** Originating app ('bento' | 'cake'); seeds the interest tag at signup. */
      source?: string | null;
    },
  ) {
    const normalizedEmail = opts?.email?.trim().toLowerCase() || null;
    const initialInterestTag = interestTagForSource(opts?.source);
    const existing = await this.findByPhoneE164(phoneE164);
    if (existing) {
      await this.loyalty.ensureWallet(existing.id);
      await this.wallet.ensureWallet(existing.id);
      if (normalizedEmail && !existing.email) {
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { email: normalizedEmail },
        });
      }
      if (!existing.referralCode) {
        const code = await this.generateUniqueReferralCode();
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { referralCode: code, ...(normalizedEmail ? { email: normalizedEmail } : {}) },
        });
      }
      if (!existing.kitchenPickupCode) {
        await this.ensureKitchenPickupCode(existing.id);
        return this.findByIdOrThrow(existing.id);
      }
    }

    let referredById: string | null = null;
    if (opts?.referralCode) {
      referredById = await this.resolveReferrerId(opts.referralCode);
    }

    const referralCode = await this.generateUniqueReferralCode();

    const customer = await this.prisma.customer.create({
      data: {
        phoneE164,
        status: CustomerStatus.DRAFT,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(initialInterestTag ? { tags: [initialInterestTag] } : {}),
        referralCode,
        referredByCustomerId: referredById,
      },
    });
    await this.loyalty.ensureWallet(customer.id);
    await this.wallet.ensureWallet(customer.id);
    await this.ensureKitchenPickupCode(customer.id);
    this.syncToSalesplay(customer);
    return customer;
  }

  /**
   * Adds a product-interest tag to a member (idempotent). Called when a member
   * signs up from an app or completes a purchase, so the tag set reflects which
   * product lines they care about — a member with both 'bento' and 'cake' is
   * "both". Best-effort: never throws, since callers fire it from payment
   * webhooks where a tag write must not roll back a successful purchase.
   */
  async addInterestTag(customerId: string, tag: InterestTag): Promise<void> {
    try {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { tags: true },
      });
      if (!customer || customer.tags.includes(tag)) return;
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { tags: { set: Array.from(new Set([...customer.tags, tag])) } },
      });
    } catch (err) {
      this.logger.error(
        `addInterestTag(${tag}) failed for member ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Fire-and-forget SalesPlay upsert that also stores the returned customer id. */
  private syncToSalesplay(customer: {
    id: string;
    displayName: string | null;
    phoneE164: string;
    email: string | null;
    referralCode: string | null;
    memberTier: string;
  }): void {
    void this.salesplay
      .syncCustomer({
        id: customer.id,
        displayName: customer.displayName,
        phoneE164: customer.phoneE164,
        email: customer.email,
        code: customer.referralCode,
        memberTier: customer.memberTier,
      })
      .then((salesplayCustomerId) => {
        if (!salesplayCustomerId) return;
        return this.prisma.customer
          .update({
            where: { id: customer.id },
            data: { salesplayCustomerId },
          })
          .then(() => undefined);
      })
      .catch(() => undefined);
  }

  async getProfileBundle(customerId: string) {
    const customer = await this.findByIdOrThrow(customerId);
    const loyalty = await this.loyalty.getWalletSummary(customerId);
    const storedWallet = await this.wallet.getSummary(customerId);
    const [referralCount, favorites] = await Promise.all([
      this.prisma.customer.count({
        where: { referredByCustomerId: customerId },
      }),
      this.prisma.$queryRaw<
        { product_id: string; name: string; total_qty: bigint }[]
      >`
        SELECT l.product_id AS product_id, MAX(l.name) AS name, SUM(l.qty)::bigint AS total_qty
        FROM customer_order_lines l
        INNER JOIN customer_orders o ON o.id = l.order_id
        WHERE o.customer_id = ${customerId}::uuid
        GROUP BY l.product_id
        ORDER BY total_qty DESC
        LIMIT 5
      `,
    ]);

    let referralCode = customer.referralCode;
    if (!referralCode) {
      referralCode = await this.generateUniqueReferralCode();
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { referralCode },
      });
    }

    const kitchenPickupId = await this.ensureKitchenPickupCode(customerId);

    // Birthday gift is evaluated lazily on profile access (and after a birthday
    // update, since updateMe returns this bundle). Idempotent and month-gated.
    await this.maybeGrantBirthdayReward(customerId);
    const loyaltyAfter = await this.loyalty.getWalletSummary(customerId);

    return {
      id: customer.id,
      phoneE164: customer.phoneE164,
      kitchenPickupId,
      status: customer.status,
      displayName: customer.displayName,
      email: customer.email,
      birthday: customer.birthday,
      gender: customer.gender,
      address: customer.address,
      preferredStore: customer.preferredStore,
      signupSource: customer.signupSource,
      memberTier: customer.memberTier,
      marketingConsent: customer.marketingConsent,
      lastLoginAt: customer.lastLoginAt,
      referralCode,
      referralCount,
      favoriteProducts: favorites.map((r) => ({
        productId: r.product_id,
        name: r.name,
        totalQty: Number(r.total_qty),
      })),
      loyalty: {
        pointsBalance: loyaltyAfter.pointsBalance,
        walletId: loyaltyAfter.walletId || null,
      },
      storedWallet,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async touchLastLogin(customerId: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { lastLoginAt: new Date() },
    });
  }

  async updateMe(
    customerId: string,
    dto: {
      displayName?: string;
      email?: string;
      birthday?: string;
      gender?: string;
      address?: string;
      preferredStore?: string;
      marketingConsent?: boolean;
    },
  ) {
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        displayName: dto.displayName ?? undefined,
        email: dto.email ?? undefined,
        birthday:
          dto.birthday !== undefined
            ? dto.birthday
              ? new Date(dto.birthday)
              : null
            : undefined,
        gender: dto.gender ?? undefined,
        address: dto.address ?? undefined,
        preferredStore: dto.preferredStore ?? undefined,
        marketingConsent: dto.marketingConsent ?? undefined,
      },
    });
    this.syncToSalesplay(updated);
    return this.getProfileBundle(updated.id);
  }

  async getMeRewards(customerId: string) {
    const [wallet, vouchers, rewardCatalog, newVouchers, newRewards] =
      await this.prisma.$transaction([
        this.prisma.loyaltyWallet.findUnique({
          where: { customerId },
        }),
        this.prisma.customerVoucher.findMany({
          where: { customerId, status: 'ISSUED' },
          include: {
            definition: {
              select: {
                id: true,
                code: true,
                title: true,
                description: true,
                pointsCost: true,
              },
            },
          },
          orderBy: { issuedAt: 'desc' },
        }),
        this.prisma.voucherDefinition.findMany({
          where: memberRewardsCatalogWhere(),
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            pointsCost: true,
            isActive: true,
            imageUrl: true,
            rewardCategory: true,
          },
          orderBy: [{ rewardSortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        // New campaign model: vouchers issued to this member's wallet.
        this.prisma.voucher.findMany({
          where: { customerId, visibleInWallet: true },
          include: { voucherCampaign: true },
          orderBy: { createdAt: 'desc' },
        }),
        // New campaign model: points-catalog rewards (linked to a campaign).
        this.prisma.rewardCatalog.findMany({
          where: {
            isActive: true,
            visibleInRewardsWallet: true,
            voucherCampaignId: { not: null },
          },
          include: { voucherCampaign: true },
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);

    const definitionIds = [
      ...vouchers.map((v) => v.definition.id),
      ...rewardCatalog.map((r) => r.id),
    ];
    const discountMap = await loadDefinitionDiscountMap(
      this.prisma,
      definitionIds,
    );
    const withDiscount = (definitionId: string) => {
      const m = discountMap.get(definitionId);
      return {
        rebateValueSen: m?.rebateValueSen ?? null,
        minSpendSen: m?.minSpendSen ?? null,
        percentageOff: null as number | null,
      };
    };

    return {
      wallet: {
        pointsBalance: wallet?.pointsCached ?? 0,
      },
      vouchers: [
        ...vouchers.map((v) => ({
          id: v.id,
          status: v.status as string,
          issuedAt: v.issuedAt,
          expiresAt: v.expiresAt,
          definition: {
            ...v.definition,
            ...withDiscount(v.definition.id),
          },
        })),
        ...newVouchers.map((v) => {
          const d = campaignVoucherDiscount(v.voucherCampaign);
          let description = v.voucherCampaign?.description ?? null;
          // Surface a "usable from" note for birthday (and other future-dated)
          // vouchers so the member understands why they can't redeem it yet.
          const validFrom = (v.metadata as { validFrom?: string } | null)
            ?.validFrom;
          if (validFrom) {
            const from = new Date(validFrom);
            if (!Number.isNaN(from.getTime()) && from.getTime() > Date.now()) {
              const fromLabel = from.toISOString().slice(0, 10);
              description = `Usable from ${fromLabel}.${description ? ' ' + description : ''}`;
            }
          }
          return {
            id: v.id,
            status: mapNewVoucherStatus(v.status),
            issuedAt: v.createdAt,
            expiresAt: v.expiresAt,
            definition: {
              id: v.id,
              code: v.code,
              title: v.name,
              description,
              pointsCost: null as number | null,
              rebateValueSen: d.rebateValueSen,
              minSpendSen: d.minSpendSen,
              percentageOff: d.percentageOff,
            },
          };
        }),
      ],
      rewards: [
        ...rewardCatalog.map((r) => ({
          ...r,
          ...withDiscount(r.id),
        })),
        // Only surface new rewards that resolve to a fixed cash discount so
        // every listed reward is redeemable at checkout.
        ...newRewards
          .filter((r) => r.voucherCampaign?.voucherType === 'FIXED_AMOUNT')
          .map((r) => ({
            id: r.id,
            code: r.code,
            title: r.name,
            description: r.description,
            pointsCost: r.pointsCost,
            isActive: r.isActive,
            imageUrl: null as string | null,
            rewardCategory: null as string | null,
            rebateValueSen: r.voucherCampaign?.fixedAmountOff ?? null,
            minSpendSen: r.voucherCampaign?.minSpend ?? null,
            percentageOff: null as number | null,
          })),
      ],
    };
  }

  /**
   * Member-facing loyalty points history. Returns most recent ledger entries
   * (capped at 100) and, for entries tied to a customer order, resolves the
   * public order number so the UI can render "Order #1234" instead of an
   * opaque UUID. Pure read; safe for the member token guard.
   */
  async getMyLoyaltyHistory(
    customerId: string,
    rawLimit?: number,
  ): Promise<{
    pointsBalance: number;
    entries: Array<{
      id: string;
      deltaPoints: number;
      balanceAfter: number;
      reason: string;
      referenceType: string | null;
      referenceId: string | null;
      orderNumber: number | null;
      createdAt: string;
    }>;
  }> {
    const limit =
      Number.isInteger(rawLimit) && rawLimit && rawLimit > 0
        ? Math.min(rawLimit, 100)
        : 25;

    const [wallet, entries] = await Promise.all([
      this.prisma.loyaltyWallet.findUnique({ where: { customerId } }),
      this.prisma.loyaltyLedgerEntry.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const orderRefIds = entries
      .filter(
        (e) => e.referenceType === 'customer_order' && e.referenceId != null,
      )
      .map((e) => e.referenceId as string);

    const orders = orderRefIds.length
      ? await this.prisma.customerOrder.findMany({
          where: { id: { in: orderRefIds }, customerId },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderById = new Map(orders.map((o) => [o.id, o.orderNumber]));

    return {
      pointsBalance: wallet?.pointsCached ?? 0,
      entries: entries.map((e) => ({
        id: e.id,
        deltaPoints: e.deltaPoints,
        balanceAfter: e.balanceAfter,
        reason: e.reason,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        orderNumber:
          e.referenceType === 'customer_order' && e.referenceId
            ? (orderById.get(e.referenceId) ?? null)
            : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async getMeWallet(customerId: string) {
    const [summary, entries] = await Promise.all([
      this.wallet.getSummary(customerId),
      this.wallet.listLedger(customerId, 100),
    ]);
    return {
      summary,
      transactions: entries,
    };
  }

  async listMemberOrders(customerId: string, limit = 40) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.customerOrder.findMany({
      where: { customerId },
      orderBy: { placedAt: 'desc' },
      take,
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    return {
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt.toISOString(),
        completedAt: o.completedAt?.toISOString() ?? null,
        totalCents: o.totalCents,
        status: o.status,
        fulfillmentSummary: fulfillmentSummaryLinesFromJson(
          o.fulfillmentSummary,
        ),
        lines: o.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.name,
          variantLabel: l.variantLabel,
          unitPriceCents: l.unitPriceCents,
          qty: l.qty,
          imageUrl: l.imageUrl,
        })),
      })),
    };
  }

  private validateMemberOrderTotals(dto: SubmitMemberOrderDto) {
    const computed = dto.lines.reduce(
      (acc, l) => acc + l.unitPriceCents * l.qty,
      0,
    );
    const discountCents = Math.max(0, Math.floor(dto.discountCents ?? 0));
    const expectedTotal = Math.max(0, computed - discountCents);
    if (expectedTotal !== dto.totalCents) {
      throw new BadRequestException({
        code: 'ORDER_TOTAL_MISMATCH',
        message:
          'Order total does not match line items and discount calculation.',
      });
    }
  }

  /**
   * Creates a shop order awaiting payment (Xendit). Does not credit lifetime spend until finalized.
   */
  async createPendingMemberOrder(
    customerId: string,
    dto: SubmitMemberOrderDto,
  ) {
    this.validateMemberOrderTotals(dto);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.customerOrder.create({
        data: {
          customerId,
          totalCents: dto.totalCents,
          status: 'pending_payment',
          fulfillmentSummary:
            dto.fulfillmentSummary == null
              ? Prisma.JsonNull
              : (dto.fulfillmentSummary as Prisma.InputJsonValue),
          lines: {
            create: dto.lines.map((l) => ({
              productId: l.productId,
              name: l.name,
              variantLabel: l.variantLabel ?? null,
              unitPriceCents: l.unitPriceCents,
              qty: l.qty,
              imageUrl: l.imageUrl ?? null,
            })),
          },
        },
        include: { lines: true },
      });
      return created;
    });
  }

  /**
   * Marks a pending shop order as placed, increments lifetime spend, and
   * credits loyalty points to the universal `loyalty_wallets` ledger — the
   * same place SalesPlay POS receipts write to. All work is atomic in one
   * transaction. Idempotency is guarded by the `pending_payment → placed`
   * status transition: subsequent calls return early without re-awarding.
   */
  async finalizeShopOrderAfterPayment(orderId: string): Promise<void> {
    const pointsPerRm = this.loyaltyPointsPerCurrencyUnit();
    let finalized = false;
    let finalizedCustomerId: string | undefined;
    let finalizedTotalCents = 0;
    let referrerRewardedId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.findFirst({
        where: { id: orderId },
      });
      if (!order) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        });
      }
      if (order.status !== 'pending_payment') {
        return;
      }
      finalized = true;
      finalizedCustomerId = order.customerId;
      finalizedTotalCents = order.totalCents;
      await tx.customerOrder.update({
        where: { id: orderId },
        data: { status: 'placed' },
      });
      await tx.storedWallet.upsert({
        where: { customerId: order.customerId },
        create: {
          customerId: order.customerId,
          lifetimeSpentCents: order.totalCents,
        },
        update: {
          lifetimeSpentCents: { increment: order.totalCents },
        },
      });

      // Award loyalty points using the unified earn rate. Floor RM (major
      // unit) × rate so RM 45.90 @ 1 pt/RM = 45 points — matching SalesPlay's
      // in-store behavior so members get the same rate whichever channel
      // they spend through.
      const amountRm = Math.floor(order.totalCents / 100);
      const points = Math.floor(amountRm * pointsPerRm);
      if (points > 0) {
        const result = await this.loyalty.appendLedgerEntry(
          {
            customerId: order.customerId,
            deltaPoints: points,
            reason: 'shop_order_purchase',
            referenceType: 'customer_order',
            referenceId: order.id,
          },
          tx,
        );
        this.logger.log(
          `Awarded ${points} loyalty points for online order ${order.id} (customer=${order.customerId}, balanceAfter=${result.balanceAfter}).`,
        );
      }

      referrerRewardedId = await this.maybeRewardReferrerOnFirstOrder(
        tx,
        order.customerId,
        order.id,
      );
    });
    if (finalized) {
      this.pushShopOrderToSalesplay(orderId);
      if (finalizedCustomerId) {
        void this.campaignAutomation
          .runMinPurchaseTrigger(finalizedCustomerId, finalizedTotalCents)
          .catch((err) =>
            this.logger.error(
              `Min-purchase campaign trigger failed for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
      if (referrerRewardedId) {
        void this.campaignAutomation
          .runReferralCountTrigger(referrerRewardedId)
          .catch((err) =>
            this.logger.error(
              `Referral-count campaign trigger failed for referrer ${referrerRewardedId}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
    }
  }

  /** Fire-and-forget SalesPlay online_orders push after a shop order is paid. */
  private pushShopOrderToSalesplay(orderId: string): void {
    void (async () => {
      const order = await this.prisma.customerOrder.findUnique({
        where: { id: orderId },
        include: {
          lines: true,
          customer: {
            select: {
              displayName: true,
              phoneE164: true,
              email: true,
            },
          },
        },
      });
      if (!order) return;
      if (order.salesplaySyncedAt || order.salesplaySystemUniqueId) return;

      const result = await this.salesplay.pushOnlineOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        placedAt: order.placedAt,
        fulfillmentSummaryLines: fulfillmentSummaryLinesFromJson(
          order.fulfillmentSummary,
        ),
        lines: order.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          variantLabel: line.variantLabel,
          unitPriceCents: line.unitPriceCents,
          qty: line.qty,
          salesplayProductCode: this.shopCatalog.resolveSalesplayProductCode(
            line.productId,
            line.variantLabel,
          ),
        })),
        customer: {
          displayName: order.customer.displayName,
          phoneE164: order.customer.phoneE164,
          email: order.customer.email,
        },
      });
      if (!result) return;

      await this.prisma.customerOrder.update({
        where: { id: orderId },
        data: {
          salesplaySystemUniqueId: result.systemUniqueId,
          salesplaySyncedAt: new Date(),
        },
      });
    })().catch((err) => {
      this.logger.error(
        `SalesPlay online order push failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  /**
   * Grants the referrer loyalty points the first time a member they referred
   * completes a paid order. Runs inside the order-finalization transaction so
   * it is atomic with the purchase. Idempotent: a referrer is rewarded at most
   * once per referred member (guarded by a unique ledger reference).
   *
   * Returns the referrer's customer id when a reward was actually granted (so
   * the caller can fire a REFERRAL_COUNT campaign trigger after the
   * transaction commits), or undefined otherwise.
   */
  private async maybeRewardReferrerOnFirstOrder(
    tx: Prisma.TransactionClient,
    buyerCustomerId: string,
    orderId: string,
  ): Promise<string | undefined> {
    const rewardPoints = this.referralRewardPoints();
    if (rewardPoints <= 0) return undefined;

    const buyer = await tx.customer.findUnique({
      where: { id: buyerCustomerId },
      select: { id: true, referredByCustomerId: true },
    });
    const referrerId = buyer?.referredByCustomerId;
    if (!referrerId) return undefined;

    // Only on the buyer's FIRST paid order. The current order was just moved to
    // 'placed' in this transaction, so a count of 1 paid order means first.
    const paidOrderCount = await tx.customerOrder.count({
      where: {
        customerId: buyerCustomerId,
        status: { notIn: ['pending_payment', 'cancelled'] },
      },
    });
    if (paidOrderCount !== 1) return undefined;

    // Idempotency: never reward the same referrer twice for the same referee.
    const existing = await tx.loyaltyLedgerEntry.findFirst({
      where: {
        customerId: referrerId,
        reason: 'referral_reward',
        referenceType: 'referral',
        referenceId: buyerCustomerId,
      },
      select: { id: true },
    });
    if (existing) return undefined;

    const result = await this.loyalty.appendLedgerEntry(
      {
        customerId: referrerId,
        deltaPoints: rewardPoints,
        reason: 'referral_reward',
        referenceType: 'referral',
        referenceId: buyerCustomerId,
      },
      tx,
    );
    this.logger.log(
      `Awarded ${rewardPoints} referral points to referrer ${referrerId} ` +
        `for referee ${buyerCustomerId}'s first paid order ${orderId} ` +
        `(balanceAfter=${result.balanceAfter}).`,
    );
    return referrerId;
  }

  async topUpMyWallet(
    customerId: string,
    dto: { amountCents: number; channel: 'online' | 'cashier' },
  ) {
    if (dto.channel === 'online') {
      throw new BadRequestException({
        code: 'WALLET_TOPUP_ONLINE_REQUIRES_XENDIT',
        message:
          'Online top-up uses Xendit. Sign in and call POST /payments/xendit/wallet-topup, then complete payment in the redirect flow.',
      });
    }
    const entry = await this.wallet.appendTransaction({
      customerId,
      type: 'TOPUP',
      amountCents: dto.amountCents,
      reason: `customer_topup_${dto.channel}`,
      createdByType: 'customer',
      createdBy: customerId,
      metadata: { channel: dto.channel },
    });
    const summary = await this.wallet.getSummary(customerId);
    return { entry, summary };
  }
}
