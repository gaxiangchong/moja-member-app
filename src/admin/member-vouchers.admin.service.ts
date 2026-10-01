import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { auditActorBase } from '../admin-auth/audit-context.util';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignBuilderService } from '../rewards-workflow/campaign-builder.service';
import {
  parseExpiry,
  planVoucherEdit,
  VoucherEditError,
} from './member-voucher-edit';
import type {
  IssueMemberVoucherDto,
  RevokeMemberVoucherDto,
  UpdateMemberVoucherDto,
} from './dto/member-voucher.dto';

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  code: true,
  voucherType: true,
  percentageOff: true,
  fixedAmountOff: true,
} as const;

type VoucherWithCampaign = Prisma.VoucherGetPayload<{
  include: { voucherCampaign: { select: typeof CAMPAIGN_SELECT } };
}>;

function asBadRequest(err: unknown): never {
  if (err instanceof VoucherEditError) {
    throw new BadRequestException({ code: err.code, message: err.message });
  }
  throw err;
}

/** What an admin can do with the campaign vouchers sitting in one member's wallet. */
@Injectable()
export class MemberVouchersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignBuilderService,
    private readonly audit: AuditService,
  ) {}

  private async requireMember(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, displayName: true, phoneE164: true },
    });
    if (!customer) throw new NotFoundException('Member not found.');
    return customer;
  }

  private async requireVoucher(customerId: string, voucherId: string) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: voucherId, customerId },
    });
    if (!voucher) {
      throw new NotFoundException('Voucher not found for this member.');
    }
    return voucher;
  }

  private toRow(v: VoucherWithCampaign, now: Date) {
    const meta = (v.metadata ?? {}) as Record<string, unknown>;
    const pastExpiry =
      v.expiresAt !== null && v.expiresAt.getTime() <= now.getTime();
    const camp = v.voucherCampaign;
    return {
      id: v.id,
      code: v.code,
      name: v.name,
      status: v.status as string,
      // ACTIVE with a date in the past is as good as expired for the member.
      effectiveStatus:
        v.status === 'ACTIVE' && pastExpiry ? 'EXPIRED' : (v.status as string),
      expiresAt: v.expiresAt?.toISOString() ?? null,
      issuedAt: v.createdAt.toISOString(),
      usedAt: v.usedAt?.toISOString() ?? null,
      campaign: camp
        ? {
            id: camp.id,
            name: camp.name,
            code: camp.code,
            discount:
              camp.voucherType === 'PERCENTAGE'
                ? `${camp.percentageOff ?? 0}% off`
                : camp.voucherType === 'FIXED_AMOUNT'
                  ? `RM${((camp.fixedAmountOff ?? 0) / 100).toFixed(2)} off`
                  : camp.voucherType,
          }
        : null,
      withdrawnReason:
        typeof meta.revokeReason === 'string' ? meta.revokeReason : null,
      canEdit: v.status !== 'USED',
    };
  }

  async list(customerId: string) {
    const member = await this.requireMember(customerId);
    const rows = await this.prisma.voucher.findMany({
      where: { customerId },
      include: { voucherCampaign: { select: CAMPAIGN_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const now = new Date();
    return { member, vouchers: rows.map((v) => this.toRow(v, now)) };
  }

  async update(
    customerId: string,
    voucherId: string,
    dto: UpdateMemberVoucherDto,
    auth: AdminAuthState,
  ) {
    const voucher = await this.requireVoucher(customerId, voucherId);
    let plan: ReturnType<typeof planVoucherEdit>;
    try {
      plan = planVoucherEdit(
        {
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          lockExpiresAt: voucher.lockExpiresAt,
        },
        { expiresAt: dto.expiresAt, name: dto.name, reinstate: dto.reinstate },
      );
    } catch (err) {
      return asBadRequest(err);
    }

    const existingMeta = (voucher.metadata ?? {}) as Record<string, unknown>;
    const restored = plan.changed.includes('restored');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (restored && voucher.status === 'LOCKED') {
        await tx.voucherRedemption.updateMany({
          where: { voucherId, status: 'LOCKED' },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
      }
      return tx.voucher.update({
        where: { id: voucherId },
        data: {
          ...plan.data,
          metadata: {
            ...existingMeta,
            lastEditedAt: new Date().toISOString(),
            lastEditReason: dto.reason ?? null,
            // A restored voucher is no longer withdrawn.
            ...(restored ? { revokedAt: null, revokeReason: null } : {}),
          } as Prisma.InputJsonValue,
        },
      });
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.updated',
      entityType: 'voucher',
      entityId: voucherId,
      reason: dto.reason ?? null,
      beforeValue: {
        code: voucher.code,
        name: voucher.name,
        status: voucher.status,
        expiresAt: voucher.expiresAt?.toISOString() ?? null,
      } as object,
      afterValue: {
        code: updated.code,
        name: updated.name,
        status: updated.status,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        changed: plan.changed,
      } as object,
      metadata: { customerId },
    });
    return this.list(customerId);
  }

  async revoke(
    customerId: string,
    voucherId: string,
    dto: RevokeMemberVoucherDto,
    auth: AdminAuthState,
  ) {
    const voucher = await this.requireVoucher(customerId, voucherId);
    await this.campaigns.revokeVoucher(voucherId, dto.reason);
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.revoked',
      entityType: 'voucher',
      entityId: voucherId,
      reason: dto.reason ?? null,
      beforeValue: { code: voucher.code, status: voucher.status } as object,
      afterValue: { code: voucher.code, status: 'VOID' } as object,
      metadata: { customerId },
    });
    return this.list(customerId);
  }

  async issue(
    customerId: string,
    dto: IssueMemberVoucherDto,
    auth: AdminAuthState,
  ) {
    await this.requireMember(customerId);
    let expiresAt: string | null = null;
    if (dto.expiresAt) {
      try {
        const d = parseExpiry(dto.expiresAt);
        if (d.getTime() <= Date.now()) {
          throw new VoucherEditError(
            'VOUCHER_EXPIRY_PAST',
            'Choose an expiry date in the future.',
          );
        }
        expiresAt = d.toISOString();
      } catch (err) {
        return asBadRequest(err);
      }
    }
    const voucher = await this.campaigns.issueVoucherToCustomer(
      customerId,
      dto.campaignId,
      expiresAt,
      dto.reason ?? 'admin_replacement',
    );
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'voucher.assigned',
      entityType: 'voucher',
      entityId: voucher.id,
      reason: dto.reason ?? null,
      afterValue: { code: voucher.code, name: voucher.name } as object,
      metadata: { customerId, campaignId: dto.campaignId },
    });
    return this.list(customerId);
  }
}
