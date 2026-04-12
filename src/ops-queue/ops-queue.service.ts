import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function fulfillmentLines(raw: Prisma.JsonValue | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function maskPhone(phone: string | null | undefined): string {
  const p = (phone ?? '').trim();
  if (p.length < 5) return p || '—';
  return `···${p.slice(-4)}`;
}

@Injectable()
export class OpsQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders() {
    const [pending, history] = await Promise.all([
      this.prisma.customerOrder.findMany({
        where: { status: 'placed' },
        orderBy: { placedAt: 'asc' },
        take: 80,
        include: {
          customer: {
            select: { phoneE164: true, displayName: true },
          },
          lines: { orderBy: { id: 'asc' } },
        },
      }),
      this.prisma.customerOrder.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 80,
        include: {
          customer: {
            select: { phoneE164: true, displayName: true },
          },
          lines: { orderBy: { id: 'asc' } },
        },
      }),
    ]);

    const mapRow = (o: (typeof pending)[number]) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      placedAt: o.placedAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      totalCents: o.totalCents,
      status: o.status,
      fulfillmentSummary: fulfillmentLines(o.fulfillmentSummary),
      customerDisplayName: o.customer.displayName,
      customerPhoneMasked: maskPhone(o.customer.phoneE164),
      lineCount: o.lines.length,
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.name,
        variantLabel: l.variantLabel,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
      })),
    });

    return {
      pending: pending.map(mapRow),
      history: history.map(mapRow),
    };
  }

  async getOrder(id: string) {
    const o = await this.prisma.customerOrder.findUnique({
      where: { id },
      include: {
        customer: {
          select: { phoneE164: true, displayName: true, id: true },
        },
        lines: { orderBy: { id: 'asc' } },
      },
    });
    if (!o) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      placedAt: o.placedAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      totalCents: o.totalCents,
      status: o.status,
      fulfillmentSummary: fulfillmentLines(o.fulfillmentSummary),
      customer: {
        id: o.customer.id,
        displayName: o.customer.displayName,
        phoneE164: o.customer.phoneE164,
      },
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.name,
        variantLabel: l.variantLabel,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
        imageUrl: l.imageUrl,
      })),
    };
  }

  async completeOrder(id: string) {
    const existing = await this.prisma.customerOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    if (existing.status !== 'placed') {
      throw new BadRequestException({
        code: 'ORDER_NOT_ACTIVE',
        message: 'Order is not in the active queue',
      });
    }
    return this.prisma.customerOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: {
        customer: {
          select: { phoneE164: true, displayName: true },
        },
        lines: true,
      },
    });
  }

  async completeOrderByNumber(orderNumber: number) {
    const row = await this.prisma.customerOrder.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found for this order number',
      });
    }
    return this.completeOrder(row.id);
  }
}
