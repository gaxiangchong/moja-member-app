import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma, type CounterRedemption } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignBuilderService } from '../rewards-workflow/campaign-builder.service';
import type {
  OpsAttachReceiptDto,
  OpsRedeemDto,
  OpsUndoRedemptionDto,
} from './dto/ops-redemption.dto';

/** The most counter redemptions one member can have in a day. */
export const MAX_COUNTER_REDEMPTIONS_PER_MEMBER_PER_DAY = 3;
/** A redemption can be undone (points returned) for this long after it was made. */
export const COUNTER_UNDO_WINDOW_HOURS = 12;

const MYT_OFFSET_MS = 8 * 3_600_000;

/** Midnight Malaysia time for the day `date` falls on, as an instant. */
export function startOfMalaysiaDay(date: Date): Date {
  const shifted = new Date(date.getTime() + MYT_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - MYT_OFFSET_MS);
}

function discountLabel(c: {
  voucherType: string;
  fixedAmountOff: number | null;
  percentageOff: number | null;
}): string {
  return c.voucherType === 'PERCENTAGE'
    ? `${c.percentageOff ?? 0}% off`
    : `RM${((c.fixedAmountOff ?? 0) / 100).toFixed(2)} off`;
}

function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

/**
 * Points redeemed by a cashier at the counter. The cashier gets the discount to
 * key into the till (SalesPlay); the member's points come off immediately, and
 * the redemption can be undone — points returned — if the sale falls through.
 */
@Injectable()
export class OpsRedemptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly campaigns: CampaignBuilderService,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly audit: AuditService,
  ) {}

  /** Redeeming and undoing both need a real, active staff member on record. */
  private async requireStaff(raw: string | undefined) {
    const code = raw?.trim();
    if (!code) {
      throw new BadRequestException({
        code: 'STAFF_CODE_REQUIRED',
        message: 'Enter your staff code first.',
      });
    }
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { employeeCode: true, displayName: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      throw new BadRequestException({
        code: 'STAFF_CODE_INVALID',
        message: 'That staff code is not recognised.',
      });
    }
    return { code: employee.employeeCode, name: employee.displayName };
  }

  private view(row: CounterRedemption, now = new Date()) {
    const windowMs = COUNTER_UNDO_WINDOW_HOURS * 3_600_000;
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      rewardTitle: row.rewardTitle,
      pointsSpent: row.pointsSpent,
      discountCents: row.discountCents,
      percentageOff: row.percentageOff,
      discountLabel:
        row.percentageOff != null
          ? `${row.percentageOff}% off`
          : `RM${((row.discountCents ?? 0) / 100).toFixed(2)} off`,
      minSpendCents: row.minSpendCents,
      voucherCode: row.voucherCode,
      verification: row.verification,
      staffCode: row.staffCode,
      staffName: row.staffName,
      salesplayReceiptRef: row.salesplayReceiptRef,
      undoneAt: row.undoneAt?.toISOString() ?? null,
      undoReason: row.undoReason,
      undoable:
        row.status === 'ACTIVE' &&
        now.getTime() - row.createdAt.getTime() <= windowMs,
    };
  }

  /** What can be redeemed at the counter: the rewards published in the member app. */
  async listRewards() {
    const now = new Date();
    const rewards = await this.prisma.rewardCatalog.findMany({
      where: {
        isActive: true,
        visibleInRewardsWallet: true,
        voucherCampaignId: { not: null },
        voucherCampaign: {
          isActive: true,
          voucherType: { in: ['FIXED_AMOUNT', 'PERCENTAGE'] },
        },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      include: { voucherCampaign: true },
      orderBy: { pointsCost: 'asc' },
    });
    return rewards.map((r) => ({
      id: r.id,
      title: r.name,
      pointsCost: r.pointsCost,
      discountLabel: discountLabel(r.voucherCampaign!),
      minSpendCents: r.voucherCampaign!.minSpend ?? null,
    }));
  }

  async redeem(dto: OpsRedeemDto, ip?: string | null) {
    const staff = await this.requireStaff(dto.staffCode);
    let phoneE164: string;
    try {
      phoneE164 = this.phoneNormalizer.normalizeToE164(dto.phone);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Enter a valid mobile number.',
      });
    }
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: { id: true, displayName: true, phoneE164: true, status: true },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'No member with that number.',
      });
    }
    // Points follow the phone number. An account staff created at the counter
    // (never activated by the member) cannot spend points until its owner has
    // signed in once — otherwise anyone's number could be used to claim them.
    if (customer.status === CustomerStatus.DRAFT) {
      throw new BadRequestException({
        code: 'MEMBER_NOT_ACTIVATED',
        message:
          'This member has not activated their account yet. Ask them to open the Moja app and sign in once — their points are safe.',
      });
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'MEMBER_NOT_AVAILABLE',
        message: 'This member account is not available.',
      });
    }

    const now = new Date();
    let created: { row: CounterRedemption; repeat: boolean; balance: number };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const dup = await tx.counterRedemption.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (dup) {
          if (dup.customerId !== customer.id) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'That request was already used for another member.',
            });
          }
          const w = await tx.loyaltyWallet.findUnique({
            where: { customerId: customer.id },
            select: { pointsCached: true },
          });
          return { row: dup, repeat: true, balance: w?.pointsCached ?? 0 };
        }

        const reward = await tx.rewardCatalog.findFirst({
          where: {
            id: dto.rewardId,
            isActive: true,
            visibleInRewardsWallet: true,
            voucherCampaignId: { not: null },
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          include: { voucherCampaign: true },
        });
        const campaign = reward?.voucherCampaign;
        if (
          !reward ||
          !campaign ||
          !campaign.isActive ||
          (campaign.voucherType !== 'FIXED_AMOUNT' &&
            campaign.voucherType !== 'PERCENTAGE')
        ) {
          throw new NotFoundException({
            code: 'REWARD_NOT_AVAILABLE',
            message: 'That reward is not available at the counter.',
          });
        }
        if (reward.pointsCost <= 0) {
          throw new BadRequestException({
            code: 'REWARD_NOT_REDEEMABLE',
            message: 'That reward cannot be redeemed with points.',
          });
        }

        const id = randomUUID();
        // Takes the wallet lock, so the checks below are serialised per member.
        let balanceAfter: number;
        try {
          ({ balanceAfter } = await this.loyalty.appendLedgerEntry(
            {
              customerId: customer.id,
              deltaPoints: -reward.pointsCost,
              reason: `redeem_${reward.code}`,
              referenceType: 'counter_redeem',
              referenceId: id,
            },
            tx,
          ));
        } catch (err) {
          if (
            err instanceof BadRequestException &&
            (err.getResponse() as { code?: string })?.code ===
              'LOYALTY_INSUFFICIENT_POINTS'
          ) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_POINTS',
              message: 'Not enough points for this reward.',
            });
          }
          throw err;
        }

        const today = await tx.counterRedemption.count({
          where: {
            customerId: customer.id,
            status: 'ACTIVE',
            createdAt: { gte: startOfMalaysiaDay(now) },
          },
        });
        if (today >= MAX_COUNTER_REDEMPTIONS_PER_MEMBER_PER_DAY) {
          throw new BadRequestException({
            code: 'DAILY_LIMIT',
            message: `This member has already redeemed ${MAX_COUNTER_REDEMPTIONS_PER_MEMBER_PER_DAY} times today.`,
          });
        }

        // A fresh code for this redemption, used up at once: the cashier keys
        // the discount into the till right now, so it must not be reusable.
        const voucher = await this.campaigns.issueVoucherToCustomer(
          customer.id,
          reward.voucherCampaignId!,
          null,
          `counter_redeem:${reward.code}`,
          tx,
        );
        const meta =
          voucher.metadata && typeof voucher.metadata === 'object'
            ? (voucher.metadata as Record<string, unknown>)
            : {};
        await tx.voucher.update({
          where: { id: voucher.id },
          data: {
            status: 'USED',
            usedAt: now,
            usageCount: { increment: 1 },
            metadata: {
              ...meta,
              counter: true,
              redemptionId: id,
              staff: staff.code,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.userReward.create({
          data: {
            customerId: customer.id,
            rewardCatalogId: reward.id,
            status: 'REDEEMED',
            redeemedAt: now,
            voucherId: voucher.id,
          },
        });
        const row = await tx.counterRedemption.create({
          data: {
            id,
            customerId: customer.id,
            rewardCatalogId: reward.id,
            rewardTitle: reward.name,
            pointsSpent: reward.pointsCost,
            discountCents:
              campaign.voucherType === 'FIXED_AMOUNT'
                ? (campaign.fixedAmountOff ?? 0)
                : null,
            percentageOff:
              campaign.voucherType === 'PERCENTAGE'
                ? (campaign.percentageOff ?? 0)
                : null,
            minSpendCents: campaign.minSpend ?? null,
            voucherId: voucher.id,
            voucherCode: voucher.code,
            verification: dto.verification,
            staffCode: staff.code,
            staffName: staff.name,
            idempotencyKey: dto.idempotencyKey,
          },
        });
        return { row, repeat: false, balance: balanceAfter };
      });
    } catch (err) {
      // Two taps at the same instant: the second finds the first's row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const row = await this.prisma.counterRedemption.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (row && row.customerId === customer.id) {
          const w = await this.prisma.loyaltyWallet.findUnique({
            where: { customerId: customer.id },
            select: { pointsCached: true },
          });
          created = { row, repeat: true, balance: w?.pointsCached ?? 0 };
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (!created.repeat) {
      await this.audit.log({
        actorType: 'system',
        action: 'ops.counter_redeem',
        entityType: 'counter_redemption',
        entityId: created.row.id,
        ipAddress: ip ?? null,
        metadata: {
          customerId: customer.id,
          staff: `${staff.code} (${staff.name})`,
          reward: created.row.rewardTitle,
          points: created.row.pointsSpent,
          verification: dto.verification,
        } as Prisma.InputJsonValue,
      });
    }
    return {
      repeat: created.repeat,
      redemption: this.view(created.row, now),
      pointsBalance: created.balance,
      member: {
        id: customer.id,
        displayName: customer.displayName,
        phoneE164: customer.phoneE164,
      },
    };
  }

  /** Today's counter redemptions (Malaysia day), newest first. */
  async listToday(now = new Date()) {
    const rows = await this.prisma.counterRedemption.findMany({
      where: { createdAt: { gte: startOfMalaysiaDay(now) } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { displayName: true, phoneE164: true } } },
    });
    return rows.map((r) => ({
      ...this.view(r, now),
      member: {
        displayName: r.customer.displayName,
        phoneMasked: maskPhone(r.customer.phoneE164),
      },
    }));
  }

  async undo(id: string, dto: OpsUndoRedemptionDto, ip?: string | null) {
    const staff = await this.requireStaff(dto.staffCode);
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - COUNTER_UNDO_WINDOW_HOURS * 3_600_000,
    );
    const reason = dto.reason?.trim() || null;

    const undone = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.counterRedemption.updateMany({
        where: { id, status: 'ACTIVE', createdAt: { gte: cutoff } },
        data: {
          status: 'UNDONE',
          undoneAt: now,
          undoneByStaff: staff.code,
          undoReason: reason,
        },
      });
      if (claimed.count === 0) return null;
      const row = await tx.counterRedemption.findUniqueOrThrow({
        where: { id },
      });
      // Give the points back. A "refund_" reason keeps them out of lifetime
      // earnings: they are the member's own points returning, not new ones.
      await this.loyalty.appendLedgerEntry(
        {
          customerId: row.customerId,
          deltaPoints: row.pointsSpent,
          reason: `refund_counter_redeem_${row.id}`,
          referenceType: 'counter_redeem',
          referenceId: row.id,
        },
        tx,
      );
      if (row.voucherId) {
        await tx.voucher.update({
          where: { id: row.voucherId },
          data: { status: 'VOID', visibleInWallet: false },
        });
      }
      return row;
    });

    if (!undone) {
      const row = await this.prisma.counterRedemption.findUnique({
        where: { id },
      });
      if (!row) {
        throw new NotFoundException({
          code: 'REDEMPTION_NOT_FOUND',
          message: 'Redemption not found.',
        });
      }
      if (row.status === 'UNDONE') {
        throw new BadRequestException({
          code: 'ALREADY_UNDONE',
          message: 'This redemption was already undone.',
        });
      }
      throw new BadRequestException({
        code: 'UNDO_WINDOW_PASSED',
        message: `It can only be undone within ${COUNTER_UNDO_WINDOW_HOURS} hours. Ask a manager to adjust the points.`,
      });
    }

    await this.audit.log({
      actorType: 'system',
      action: 'ops.counter_redeem_undo',
      entityType: 'counter_redemption',
      entityId: id,
      ipAddress: ip ?? null,
      reason,
      metadata: {
        customerId: undone.customerId,
        staff: `${staff.code} (${staff.name})`,
        points: undone.pointsSpent,
      } as Prisma.InputJsonValue,
    });
    const fresh = await this.prisma.counterRedemption.findUniqueOrThrow({
      where: { id },
    });
    return { redemption: this.view(fresh, now) };
  }

  /** Records which SalesPlay receipt the discount was used on, for reconciling at close. */
  async attachReceipt(id: string, dto: OpsAttachReceiptDto) {
    const staff = await this.requireStaff(dto.staffCode);
    const updated = await this.prisma.counterRedemption.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { salesplayReceiptRef: dto.receiptRef.trim() },
    });
    if (updated.count === 0) {
      throw new NotFoundException({
        code: 'REDEMPTION_NOT_FOUND',
        message: 'No active redemption with that id.',
      });
    }
    await this.audit.log({
      actorType: 'system',
      action: 'ops.counter_redeem_receipt',
      entityType: 'counter_redemption',
      entityId: id,
      metadata: {
        staff: `${staff.code} (${staff.name})`,
        receiptRef: dto.receiptRef.trim(),
      } as Prisma.InputJsonValue,
    });
    const row = await this.prisma.counterRedemption.findUniqueOrThrow({
      where: { id },
    });
    return { redemption: this.view(row) };
  }
}
