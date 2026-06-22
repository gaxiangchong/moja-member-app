import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BentoDeliveryStatus,
  BentoPackageCode,
  BentoSubscriptionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { auditActorBase } from '../admin-auth/audit-context.util';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BENTO_SAVINGS_BASELINE_CENTS } from './bento-pricing.service';
import { isPickupDateLocked } from './bento-pickup-lock.util';
import { formatDateOnly } from './bento-weekly.util';

type DeliveryRow = {
  id: string;
  deliveryDate: Date;
  lunchQty: number;
  dinnerQty: number;
  status: BentoDeliveryStatus;
};

type SubscriptionForRefund = {
  id: string;
  status: BentoSubscriptionStatus;
  totalCents: number;
  mealCreditsTotal: number;
  deliveries: DeliveryRow[];
};

export type BentoRefundPreview = {
  subscriptionId: string;
  status: BentoSubscriptionStatus;
  /** Total meal credits purchased. */
  purchasedMeals: number;
  /** Meals already picked up (DELIVERED). */
  deliveredMeals: number;
  /** Scheduled meals locked for kitchen prep (treated as consumed). */
  lockedMeals: number;
  /** deliveredMeals + lockedMeals — charged at the single-meal rate. */
  consumedMeals: number;
  /** Meals refunded (purchased - consumed). */
  refundedMeals: number;
  /** Single-meal rate used to charge consumed meals (cents). */
  singleMealCents: number;
  /** Amount the member originally paid (cents). */
  paidCents: number;
  /** Amount retained for consumed meals (cents). */
  chargedCents: number;
  /** Amount to refund the member (cents), clamped to >= 0. */
  refundCents: number;
  /** Whether a refund has already been recorded for this subscription. */
  alreadyRefunded: boolean;
};

/**
 * Computes and records bento subscription refunds.
 *
 * Policy (confirmed with product):
 * - Consumed meals = picked up (DELIVERED) + scheduled meals locked for kitchen
 *   prep (after 5pm the day before pickup). Both are charged at the single-meal
 *   rate (the ONE_TIME package price, RM17.90 by default).
 * - Everything paid beyond the consumed charge is refunded.
 * - If nothing was consumed, the member gets a full refund.
 * - The refund can never go negative (clamped to 0): a member who consumed many
 *   deeply-discounted meals simply gets RM0 back, never owes more.
 *
 * Payout is handled manually/offline — this service only computes the amount,
 * voids unused schedule, marks the subscription REFUNDED, and writes an audit
 * record (BentoRefund) as the system-of-record.
 */
@Injectable()
export class BentoRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Live single-meal rate (ONE_TIME package price), falling back to RM17.90. */
  private async resolveSingleMealCents(): Promise<number> {
    const oneTime = await this.prisma.bentoPackage.findUnique({
      where: { code: BentoPackageCode.ONE_TIME },
      select: { pricePerMealCents: true },
    });
    return oneTime?.pricePerMealCents ?? BENTO_SAVINGS_BASELINE_CENTS;
  }

  private computeBreakdown(
    sub: SubscriptionForRefund,
    singleMealCents: number,
    ref = new Date(),
  ): BentoRefundPreview {
    let deliveredMeals = 0;
    let lockedMeals = 0;

    for (const d of sub.deliveries) {
      const packs = d.lunchQty + d.dinnerQty;
      if (d.status === BentoDeliveryStatus.DELIVERED) {
        deliveredMeals += packs;
      } else if (
        d.status === BentoDeliveryStatus.SCHEDULED &&
        isPickupDateLocked(formatDateOnly(d.deliveryDate), ref)
      ) {
        // Kitchen is already preparing these — treat as consumed.
        lockedMeals += packs;
      }
    }

    // Never charge for more meals than were actually purchased.
    const consumedMeals = Math.min(
      deliveredMeals + lockedMeals,
      sub.mealCreditsTotal,
    );
    const chargedCents = consumedMeals * singleMealCents;
    const refundCents = Math.max(0, sub.totalCents - chargedCents);

    return {
      subscriptionId: sub.id,
      status: sub.status,
      purchasedMeals: sub.mealCreditsTotal,
      deliveredMeals,
      lockedMeals,
      consumedMeals,
      refundedMeals: Math.max(0, sub.mealCreditsTotal - consumedMeals),
      singleMealCents,
      paidCents: sub.totalCents,
      chargedCents,
      refundCents,
      alreadyRefunded: sub.status === BentoSubscriptionStatus.REFUNDED,
    };
  }

  private async loadSubscription(id: string): Promise<SubscriptionForRefund> {
    const sub = await this.prisma.bentoSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalCents: true,
        mealCreditsTotal: true,
        deliveries: {
          select: {
            id: true,
            deliveryDate: true,
            lunchQty: true,
            dinnerQty: true,
            status: true,
          },
        },
      },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'BENTO_SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    return sub;
  }

  /** Dry-run: show the admin exactly what would be refunded before confirming. */
  async previewRefund(subscriptionId: string): Promise<BentoRefundPreview> {
    const sub = await this.loadSubscription(subscriptionId);
    const singleMealCents = await this.resolveSingleMealCents();
    return this.computeBreakdown(sub, singleMealCents);
  }

  /**
   * Records a refund: voids unused schedule, marks the subscription REFUNDED,
   * and writes the BentoRefund audit row. The money is paid out manually.
   */
  async refundSubscription(
    subscriptionId: string,
    input: { reason: string; payoutNote?: string | null },
    auth: AdminAuthState,
  ): Promise<{ refund: BentoRefundPreview; refundId: string }> {
    const sub = await this.loadSubscription(subscriptionId);

    if (sub.status === BentoSubscriptionStatus.REFUNDED) {
      throw new BadRequestException({
        code: 'BENTO_ALREADY_REFUNDED',
        message: 'This subscription has already been refunded.',
      });
    }
    if (
      sub.status !== BentoSubscriptionStatus.ACTIVE &&
      sub.status !== BentoSubscriptionStatus.COMPLETED
    ) {
      throw new BadRequestException({
        code: 'BENTO_NOT_REFUNDABLE',
        message:
          'Only paid (active or completed) subscriptions can be refunded.',
      });
    }

    const singleMealCents = await this.resolveSingleMealCents();
    const ref = new Date();
    const breakdown = this.computeBreakdown(sub, singleMealCents, ref);

    // Future, unlocked scheduled pickups are voided so kitchen/capacity is freed.
    const voidableIds = sub.deliveries
      .filter(
        (d) =>
          d.status === BentoDeliveryStatus.SCHEDULED &&
          !isPickupDateLocked(formatDateOnly(d.deliveryDate), ref),
      )
      .map((d) => d.id);

    const created = await this.prisma.$transaction(async (tx) => {
      if (voidableIds.length > 0) {
        await tx.bentoDeliveryDay.updateMany({
          where: { id: { in: voidableIds } },
          data: { status: BentoDeliveryStatus.SKIPPED },
        });
      }

      await tx.bentoSubscription.update({
        where: { id: subscriptionId },
        data: { status: BentoSubscriptionStatus.REFUNDED },
      });

      return tx.bentoRefund.create({
        data: {
          subscriptionId,
          consumedMeals: breakdown.consumedMeals,
          singleMealCents: breakdown.singleMealCents,
          paidCents: breakdown.paidCents,
          chargedCents: breakdown.chargedCents,
          refundCents: breakdown.refundCents,
          reason: input.reason,
          payoutNote: input.payoutNote ?? null,
          adminUserId:
            auth.kind === 'user' ? (auth.adminUserId ?? null) : null,
          adminActorLabel: auth.actorLabel,
        },
        select: { id: true },
      });
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'bento.refunded',
      entityType: 'bento_subscription',
      entityId: subscriptionId,
      reason: input.reason,
      metadata: {
        refundId: created.id,
        consumedMeals: breakdown.consumedMeals,
        singleMealCents: breakdown.singleMealCents,
        paidCents: breakdown.paidCents,
        chargedCents: breakdown.chargedCents,
        refundCents: breakdown.refundCents,
        voidedDeliveries: voidableIds.length,
      },
    });

    return {
      refundId: created.id,
      refund: { ...breakdown, status: BentoSubscriptionStatus.REFUNDED },
    };
  }
}
