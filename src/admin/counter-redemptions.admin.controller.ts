import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { startOfMalaysiaDay } from '../ops-queue/ops-redemptions.service';

const DAY_MS = 86_400_000;

/**
 * What cashiers redeemed at the counter on a day, to tick off against SalesPlay
 * at closing: each discount that should appear on a till receipt, who did it,
 * and the totals.
 */
@Controller('admin/counter-redemptions')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class CounterRedemptionsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(P.LOYALTY_READ)
  async list(@Query('date') dateRaw?: string) {
    const date =
      dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
        ? new Date(`${dateRaw}T12:00:00+08:00`)
        : new Date();
    const from = startOfMalaysiaDay(date);
    const to = new Date(from.getTime() + DAY_MS);
    const rows = await this.prisma.counterRedemption.findMany({
      where: { createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { customer: { select: { displayName: true, phoneE164: true } } },
    });
    const active = rows.filter((r) => r.status === 'ACTIVE');
    return {
      date: new Date(from.getTime() + 8 * 3_600_000).toISOString().slice(0, 10),
      totals: {
        count: active.length,
        undone: rows.length - active.length,
        pointsSpent: active.reduce((n, r) => n + r.pointsSpent, 0),
        // Cash discounts only; a percentage voucher has no fixed RM figure.
        cashDiscountCents: active.reduce(
          (n, r) => n + (r.discountCents ?? 0),
          0,
        ),
        withoutReceipt: active.filter((r) => !r.salesplayReceiptRef).length,
      },
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        status: r.status,
        member: {
          id: r.customerId,
          displayName: r.customer.displayName,
          phoneE164: r.customer.phoneE164,
        },
        rewardTitle: r.rewardTitle,
        pointsSpent: r.pointsSpent,
        discountCents: r.discountCents,
        percentageOff: r.percentageOff,
        voucherCode: r.voucherCode,
        verification: r.verification,
        staffCode: r.staffCode,
        staffName: r.staffName,
        salesplayReceiptRef: r.salesplayReceiptRef,
        undoneAt: r.undoneAt?.toISOString() ?? null,
        undoneByStaff: r.undoneByStaff,
        undoReason: r.undoReason,
      })),
    };
  }
}
