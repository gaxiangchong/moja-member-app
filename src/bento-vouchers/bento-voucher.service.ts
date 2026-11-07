import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Lowest order total we are allowed to charge (RM1.00), shared with bento checkout. */
const MIN_TOTAL_CENTS = 100;

export type VoucherValidationFailure =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'CAPACITY_FULL'
  | 'MIN_SPEND';

export type VoucherQuoteResult =
  | {
      ok: true;
      voucherId: string;
      code: string;
      amountOffCents: number;
      /** Effective discount applied to this subtotal (clamped so total stays >= RM1). */
      discountCents: number;
      newTotalCents: number;
    }
  | { ok: false; reason: VoucherValidationFailure; minSpendCents?: number };

export type ReserveResult = {
  redemptionId: string;
  voucherId: string;
  code: string;
  discountCents: number;
};

type PrismaTx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class BentoVoucherService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /**
   * Compute the discount a code would apply to `subtotalCents` without reserving
   * any capacity. Used by the checkout quote preview. The discount is clamped so
   * the order total never drops below the RM1 minimum.
   */
  async validateForQuote(
    codeRaw: string,
    subtotalCents: number,
  ): Promise<VoucherQuoteResult> {
    const code = this.normalizeCode(codeRaw);
    if (!code) return { ok: false, reason: 'NOT_FOUND' };

    const voucher = await this.prisma.bentoDiscountVoucher.findUnique({
      where: { code },
    });
    if (!voucher) return { ok: false, reason: 'NOT_FOUND' };

    const now = new Date();
    if (!voucher.isActive) return { ok: false, reason: 'INACTIVE' };
    if (voucher.startsAt > now) return { ok: false, reason: 'NOT_STARTED' };
    if (voucher.endsAt < now) return { ok: false, reason: 'EXPIRED' };
    if (voucher.redeemedCount >= voucher.redemptionCap) {
      return { ok: false, reason: 'CAPACITY_FULL' };
    }
    if (voucher.minSpendCents != null && subtotalCents < voucher.minSpendCents) {
      return {
        ok: false,
        reason: 'MIN_SPEND',
        minSpendCents: voucher.minSpendCents,
      };
    }

    const discountCents = this.clampDiscount(
      voucher.amountOffCents,
      subtotalCents,
    );
    return {
      ok: true,
      voucherId: voucher.id,
      code: voucher.code,
      amountOffCents: voucher.amountOffCents,
      discountCents,
      newTotalCents: subtotalCents - discountCents,
    };
  }

  /** Never discount below RM1 total, and never below 0. */
  private clampDiscount(amountOffCents: number, subtotalCents: number): number {
    const maxDiscount = Math.max(0, subtotalCents - MIN_TOTAL_CENTS);
    return Math.max(0, Math.min(amountOffCents, maxDiscount));
  }

  /**
   * Atomically claim one redemption slot and create a RESERVED redemption row.
   * Re-validates the window/active flag and increments `redeemedCount` only if
   * capacity remains, so concurrent checkouts cannot oversell the voucher.
   * Throws BadRequestException with a stable `code` if the voucher cannot be used.
   */
  async reserve(
    codeRaw: string,
    customerId: string,
    subtotalCents: number,
    tx: PrismaTx = this.prisma,
  ): Promise<ReserveResult> {
    const code = this.normalizeCode(codeRaw);
    const preview = await this.validateForQuote(code, subtotalCents);
    if (!preview.ok) {
      throw this.toBadRequest(preview.reason, preview.minSpendCents);
    }

    // Conditional, atomic capacity claim. Prisma's typed `updateMany` cannot
    // compare two columns (`redeemed_count < redemption_cap`), so use a raw
    // UPDATE that only bumps the counter while a slot is free and the voucher is
    // still within its active window. Concurrent checkouts cannot oversell.
    const claimedCount = await tx.$executeRaw`
      UPDATE "bento_discount_vouchers"
      SET "redeemed_count" = "redeemed_count" + 1, "updated_at" = now()
      WHERE "id" = ${preview.voucherId}::uuid
        AND "is_active" = true
        AND "starts_at" <= now()
        AND "ends_at" >= now()
        AND "redeemed_count" < "redemption_cap"
    `;
    if (claimedCount === 0) {
      throw this.toBadRequest('CAPACITY_FULL');
    }

    const redemption = await tx.bentoDiscountRedemption.create({
      data: {
        voucherId: preview.voucherId,
        customerId,
        discountCents: preview.discountCents,
        status: 'RESERVED',
      },
    });

    return {
      redemptionId: redemption.id,
      voucherId: preview.voucherId,
      code: preview.code,
      discountCents: preview.discountCents,
    };
  }

  /** Stamp the reserved redemption with its payment intent so we can confirm/release later. */
  async attachPaymentIntent(
    redemptionId: string,
    paymentIntentId: string,
  ): Promise<void> {
    await this.prisma.bentoDiscountRedemption.update({
      where: { id: redemptionId },
      data: { paymentIntentId },
    });
  }

  /** Confirm a single reserved redemption by id (used by the demo payment flow). */
  async confirmRedemption(redemptionId: string): Promise<void> {
    await this.prisma.bentoDiscountRedemption.updateMany({
      where: { id: redemptionId, status: 'RESERVED' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }

  /**
   * Release a single reserved redemption by id, returning its capacity slot.
   * Used when checkout fails after a reservation was already claimed. Idempotent.
   */
  async releaseRedemption(redemptionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.bentoDiscountRedemption.findFirst({
        where: { id: redemptionId, status: 'RESERVED' },
        select: { id: true, voucherId: true },
      });
      if (!redemption) return;
      await tx.bentoDiscountRedemption.update({
        where: { id: redemption.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await tx.bentoDiscountVoucher.update({
        where: { id: redemption.voucherId },
        data: { redeemedCount: { decrement: 1 } },
      });
    });
  }

  /** Mark every RESERVED redemption on a payment intent as CONFIRMED (payment succeeded). */
  async confirmByPaymentIntent(paymentIntentId: string): Promise<void> {
    await this.prisma.bentoDiscountRedemption.updateMany({
      where: { paymentIntentId, status: 'RESERVED' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }

  /**
   * Release RESERVED redemptions on a failed/expired payment intent, returning
   * the claimed capacity to the voucher. Idempotent: only RESERVED rows count.
   */
  async releaseByPaymentIntent(paymentIntentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.bentoDiscountRedemption.findMany({
        where: { paymentIntentId, status: 'RESERVED' },
        select: { id: true, voucherId: true },
      });
      if (reserved.length === 0) return;
      await tx.bentoDiscountRedemption.updateMany({
        where: { paymentIntentId, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      // Return one capacity slot per released redemption.
      const byVoucher = new Map<string, number>();
      for (const r of reserved) {
        byVoucher.set(r.voucherId, (byVoucher.get(r.voucherId) ?? 0) + 1);
      }
      for (const [voucherId, count] of byVoucher) {
        await tx.bentoDiscountVoucher.update({
          where: { id: voucherId },
          data: { redeemedCount: { decrement: count } },
        });
      }
    });
  }

  /**
   * Release RESERVED redemptions that never got a payment intent (crash between
   * reserve and intent creation). Used when clearing abandoned checkout rows so
   * a retry can reclaim the promo slot. Idempotent.
   */
  async releaseUnattachedReservations(customerId: string): Promise<void> {
    const dangling = await this.prisma.bentoDiscountRedemption.findMany({
      where: { customerId, status: 'RESERVED', paymentIntentId: null },
      select: { id: true },
    });
    for (const row of dangling) {
      await this.releaseRedemption(row.id);
    }
  }

  private toBadRequest(
    reason: VoucherValidationFailure,
    minSpendCents?: number,
  ): BadRequestException {
    const messages: Record<VoucherValidationFailure, string> = {
      NOT_FOUND: 'This promo code is not valid.',
      INACTIVE: 'This promo code is no longer available.',
      NOT_STARTED: 'This promo code is not active yet.',
      EXPIRED: 'This promo code has expired.',
      CAPACITY_FULL: 'This promo code has been fully redeemed.',
      MIN_SPEND:
        minSpendCents != null
          ? `Minimum spend of RM${(minSpendCents / 100).toFixed(2)} required for this code.`
          : 'Order does not meet the minimum spend for this code.',
    };
    return new BadRequestException({
      code: `BENTO_VOUCHER_${reason}`,
      message: messages[reason],
    });
  }

  // ---- Admin CRUD -------------------------------------------------------

  async adminList() {
    const vouchers = await this.prisma.bentoDiscountVoucher.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return vouchers.map((v) => ({
      ...v,
      remaining: Math.max(0, v.redemptionCap - v.redeemedCount),
    }));
  }

  async adminCreate(input: {
    code: string;
    description?: string | null;
    amountOffCents: number;
    minSpendCents?: number | null;
    startsAt: string;
    endsAt: string;
    redemptionCap: number;
  }) {
    const code = this.normalizeCode(input.code);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'BENTO_VOUCHER_BAD_WINDOW',
        message: 'End date must be after the start date.',
      });
    }
    const existing = await this.prisma.bentoDiscountVoucher.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'BENTO_VOUCHER_DUPLICATE',
        message: 'A voucher with this code already exists.',
      });
    }
    return this.prisma.bentoDiscountVoucher.create({
      data: {
        code,
        description: input.description?.trim() || null,
        amountOffCents: input.amountOffCents,
        minSpendCents: input.minSpendCents ?? null,
        startsAt,
        endsAt,
        redemptionCap: input.redemptionCap,
      },
    });
  }

  async adminUpdate(
    id: string,
    input: {
      description?: string | null;
      amountOffCents?: number;
      minSpendCents?: number | null;
      startsAt?: string;
      endsAt?: string;
      redemptionCap?: number;
      isActive?: boolean;
    },
  ) {
    const voucher = await this.prisma.bentoDiscountVoucher.findUnique({
      where: { id },
    });
    if (!voucher) {
      throw new NotFoundException({
        code: 'BENTO_VOUCHER_NOT_FOUND',
        message: 'Voucher not found.',
      });
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : voucher.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : voucher.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'BENTO_VOUCHER_BAD_WINDOW',
        message: 'End date must be after the start date.',
      });
    }
    if (
      input.redemptionCap != null &&
      input.redemptionCap < voucher.redeemedCount
    ) {
      throw new BadRequestException({
        code: 'BENTO_VOUCHER_CAP_TOO_LOW',
        message: `Capacity cannot be below the ${voucher.redeemedCount} already redeemed.`,
      });
    }
    return this.prisma.bentoDiscountVoucher.update({
      where: { id },
      data: {
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        amountOffCents: input.amountOffCents,
        minSpendCents: input.minSpendCents,
        startsAt: input.startsAt ? startsAt : undefined,
        endsAt: input.endsAt ? endsAt : undefined,
        redemptionCap: input.redemptionCap,
        isActive: input.isActive,
      },
    });
  }

  /**
   * Delete a voucher outright. Blocked once the code has confirmed (or
   * in-flight reserved) redemptions — deleting would cascade-erase the usage
   * history that sales reviews rely on; deactivate instead. Vouchers that were
   * never successfully used can be removed freely.
   */
  async adminDelete(id: string) {
    const voucher = await this.prisma.bentoDiscountVoucher.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!voucher) {
      throw new NotFoundException({
        code: 'BENTO_VOUCHER_NOT_FOUND',
        message: 'Voucher not found.',
      });
    }
    const usedCount = await this.prisma.bentoDiscountRedemption.count({
      where: { voucherId: id, status: { in: ['CONFIRMED', 'RESERVED'] } },
    });
    if (usedCount > 0) {
      throw new BadRequestException({
        code: 'BENTO_VOUCHER_IN_USE',
        message: `${voucher.code} has ${usedCount} redemption(s) — deactivate it instead of deleting so the usage history stays reviewable.`,
      });
    }
    await this.prisma.bentoDiscountVoucher.delete({ where: { id } });
    return { id, code: voucher.code, deleted: true as const };
  }
}
