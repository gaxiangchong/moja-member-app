import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { memberRewardsCatalogWhere } from '../rewards/member-rewards-catalog.util';
import { WalletService } from '../wallet/wallet.service';
import type { SubmitMemberOrderDto } from './dto/submit-member-order.dto';

function fulfillmentSummaryLinesFromJson(
  raw: Prisma.JsonValue | null,
): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
  ) {}

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
    opts?: { referralCode?: string | null },
  ) {
    const existing = await this.findByPhoneE164(phoneE164);
    if (existing) {
      await this.loyalty.ensureWallet(existing.id);
      await this.wallet.ensureWallet(existing.id);
      if (!existing.referralCode) {
        const code = await this.generateUniqueReferralCode();
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { referralCode: code },
        });
      }
      return existing;
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
        referralCode,
        referredByCustomerId: referredById,
      },
    });
    await this.loyalty.ensureWallet(customer.id);
    await this.wallet.ensureWallet(customer.id);
    return customer;
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

    return {
      id: customer.id,
      phoneE164: customer.phoneE164,
      status: customer.status,
      displayName: customer.displayName,
      email: customer.email,
      birthday: customer.birthday,
      gender: customer.gender,
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
        pointsBalance: loyalty.pointsBalance,
        walletId: loyalty.walletId || null,
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
        preferredStore: dto.preferredStore ?? undefined,
        marketingConsent: dto.marketingConsent ?? undefined,
      },
    });
    return this.getProfileBundle(updated.id);
  }

  async getMeRewards(customerId: string) {
    const [wallet, vouchers, rewardCatalog] = await this.prisma.$transaction([
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
    ]);

    return {
      wallet: {
        pointsBalance: wallet?.pointsCached ?? 0,
      },
      vouchers: vouchers.map((v) => ({
        id: v.id,
        status: v.status,
        issuedAt: v.issuedAt,
        expiresAt: v.expiresAt,
        definition: v.definition,
      })),
      rewards: rewardCatalog,
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
        fulfillmentSummary: fulfillmentSummaryLinesFromJson(o.fulfillmentSummary),
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
    if (computed !== dto.totalCents) {
      throw new BadRequestException({
        code: 'ORDER_TOTAL_MISMATCH',
        message: 'Order total does not match line items',
      });
    }
  }

  /**
   * Creates a shop order awaiting payment (Xendit). Does not credit lifetime spend until finalized.
   */
  async createPendingMemberOrder(customerId: string, dto: SubmitMemberOrderDto) {
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
   * Marks a pending shop order as placed and applies stored-wallet lifetime spend (idempotent).
   */
  async finalizeShopOrderAfterPayment(orderId: string): Promise<void> {
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
    });
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
