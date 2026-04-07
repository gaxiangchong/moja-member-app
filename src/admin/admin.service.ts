import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminLoyaltyAdjustmentDto } from './dto/admin-loyalty-adjustment.dto';
import type { AdminUpdateCustomerDto } from './dto/admin-update-customer.dto';
import type { CreateVoucherDefinitionDto } from './dto/create-voucher-definition.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async listCustomers(page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: true,
        },
      }),
      this.prisma.customer.count(),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        phoneE164: c.phoneE164,
        status: c.status,
        displayName: c.displayName,
        email: c.email,
        pointsBalance: c.wallet?.pointsCached ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      page: Math.max(page, 1),
      pageSize: take,
      total,
    };
  }

  async getCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        wallet: true,
        ledgerEntries: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }
    return customer;
  }

  async updateCustomer(
    id: string,
    dto: AdminUpdateCustomerDto,
    adminKeyHint: string,
  ) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        displayName: dto.displayName ?? undefined,
        email: dto.email ?? undefined,
        status: dto.status ?? undefined,
      },
      include: { wallet: true },
    });

    await this.audit.log({
      actorType: 'admin',
      actorId: adminKeyHint,
      action: 'customer.updated',
      entityType: 'customer',
      entityId: id,
      metadata: {
        before: {
          displayName: existing.displayName,
          email: existing.email,
          status: existing.status,
        },
        after: {
          displayName: updated.displayName,
          email: updated.email,
          status: updated.status,
        },
      },
    });

    return updated;
  }

  async listVoucherDefinitions() {
    return this.prisma.voucherDefinition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVoucherDefinition(
    dto: CreateVoucherDefinitionDto,
    adminKeyHint: string,
  ) {
    const created = await this.prisma.voucherDefinition.create({
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description ?? null,
        pointsCost: dto.pointsCost ?? null,
      },
    });

    await this.audit.log({
      actorType: 'admin',
      actorId: adminKeyHint,
      action: 'voucher_definition.created',
      entityType: 'voucher_definition',
      entityId: created.id,
      metadata: { code: created.code },
    });

    return created;
  }

  async adjustCustomerLoyalty(
    customerId: string,
    dto: AdminLoyaltyAdjustmentDto,
    adminKeyHint: string,
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
      actorType: 'admin',
      actorId: adminKeyHint,
      action: 'loyalty.adjusted',
      entityType: 'customer',
      entityId: customerId,
      metadata: {
        deltaPoints: dto.deltaPoints,
        balanceAfter,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
      },
    });

    return { customerId, pointsBalance: balanceAfter };
  }
}
