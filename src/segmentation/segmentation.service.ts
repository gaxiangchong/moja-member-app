import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma, VoucherStatus, WalletTxnType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { WalletService } from '../wallet/wallet.service';
import type { SegmentFiltersDto } from './dto/segment-filters.dto';
import type { SaveAudienceDto } from './dto/save-audience.dto';
import type { CampaignRunDto } from './dto/campaign-run.dto';
import type { CampaignInsightsQueryDto } from './dto/campaign-insights-query.dto';

function parseDateStart(s?: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parseDateEnd(s?: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class SegmentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
  ) {}

  private buildWhereSql(f: SegmentFiltersDto): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (f.search?.trim()) {
      const raw = f.search.trim().replace(/[%_\\]/g, '');
      const p = `%${raw}%`;
      parts.push(
        Prisma.sql`(c.phone_e164 ILIKE ${p} OR COALESCE(c.display_name,'') ILIKE ${p} OR COALESCE(c.email,'') ILIKE ${p})`,
      );
    }

    if (f.status) {
      parts.push(
        Prisma.sql`c.status = ${f.status}::"CustomerStatus"`,
      );
    }
    if (f.memberTier) {
      parts.push(Prisma.sql`c.member_tier = ${f.memberTier}`);
    }
    if (f.signupSource) {
      parts.push(Prisma.sql`c.signup_source = ${f.signupSource}`);
    }
    if (f.preferredStore) {
      parts.push(Prisma.sql`c.preferred_store = ${f.preferredStore}`);
    }

    const signupFrom = parseDateStart(f.signupFrom);
    const signupTo = parseDateEnd(f.signupTo);
    if (signupFrom) {
      parts.push(Prisma.sql`c.created_at >= ${signupFrom}`);
    }
    if (signupTo) {
      parts.push(Prisma.sql`c.created_at <= ${signupTo}`);
    }

    const llFrom = parseDateStart(f.lastLoginFrom);
    const llTo = parseDateEnd(f.lastLoginTo);
    if (llFrom) {
      parts.push(
        Prisma.sql`c.last_login_at IS NOT NULL AND c.last_login_at >= ${llFrom}`,
      );
    }
    if (llTo) {
      parts.push(
        Prisma.sql`c.last_login_at IS NOT NULL AND c.last_login_at <= ${llTo}`,
      );
    }

    if (f.neverLoggedIn === true) {
      parts.push(Prisma.sql`c.last_login_at IS NULL`);
    }

    if (f.inactiveDays != null && f.inactiveDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - f.inactiveDays);
      parts.push(
        Prisma.sql`COALESCE(c.last_login_at, c.created_at) < ${cutoff}`,
      );
    }

    if (f.birthdayMonth != null) {
      if (f.birthdayDay != null) {
        parts.push(
          Prisma.sql`c.birthday IS NOT NULL AND EXTRACT(MONTH FROM c.birthday::date) = ${f.birthdayMonth} AND EXTRACT(DAY FROM c.birthday::date) = ${f.birthdayDay}`,
        );
      } else {
        parts.push(
          Prisma.sql`c.birthday IS NOT NULL AND EXTRACT(MONTH FROM c.birthday::date) = ${f.birthdayMonth}`,
        );
      }
    }

    if (f.voucherStatus) {
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM customer_vouchers cv WHERE cv.customer_id = c.id AND cv.status = ${f.voucherStatus}::"VoucherStatus")`,
      );
    }

    if (f.hasAnyVoucher === false) {
      parts.push(
        Prisma.sql`NOT EXISTS (SELECT 1 FROM customer_vouchers cv WHERE cv.customer_id = c.id)`,
      );
    }

    if (f.tagsAny?.length) {
      const arr = Prisma.join(
        f.tagsAny.map((t) => Prisma.sql`${t}`),
        ', ',
      );
      parts.push(Prisma.sql`c.tags && ARRAY[${arr}]::text[]`);
    }

    if (f.tagsAll?.length) {
      const arr = Prisma.join(
        f.tagsAll.map((t) => Prisma.sql`${t}`),
        ', ',
      );
      parts.push(Prisma.sql`c.tags @> ARRAY[${arr}]::text[]`);
    }

    if (f.minPoints != null) {
      parts.push(
        Prisma.sql`COALESCE(lw.points_cached, 0) >= ${f.minPoints}`,
      );
    }
    if (f.maxPoints != null) {
      parts.push(
        Prisma.sql`COALESCE(lw.points_cached, 0) <= ${f.maxPoints}`,
      );
    }

    if (f.minWalletCents != null) {
      parts.push(
        Prisma.sql`COALESCE(sw.balance_cents, 0) >= ${f.minWalletCents}`,
      );
    }
    if (f.maxWalletCents != null) {
      parts.push(
        Prisma.sql`COALESCE(sw.balance_cents, 0) <= ${f.maxWalletCents}`,
      );
    }

    if (f.minLifetimeSpendCents != null) {
      parts.push(
        Prisma.sql`COALESCE(sw.lifetime_spent_cents, 0) >= ${f.minLifetimeSpendCents}`,
      );
    }
    if (f.maxLifetimeSpendCents != null) {
      parts.push(
        Prisma.sql`COALESCE(sw.lifetime_spent_cents, 0) <= ${f.maxLifetimeSpendCents}`,
      );
    }

    return Prisma.join(parts, ' AND ');
  }

  private baseFrom(): Prisma.Sql {
    return Prisma.sql`
      FROM customers c
      LEFT JOIN loyalty_wallets lw ON lw.customer_id = c.id
      LEFT JOIN stored_wallets sw ON sw.customer_id = c.id
    `;
  }

  async countSegment(f: SegmentFiltersDto): Promise<number> {
    const where = this.buildWhereSql(f);
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n
      ${this.baseFrom()}
      WHERE ${where}
    `;
    return Number(rows[0]?.n ?? 0n);
  }

  async previewSegment(f: SegmentFiltersDto, sampleSize = 20) {
    const where = this.buildWhereSql(f);
    const total = await this.countSegment(f);
    const sample = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      ${this.baseFrom()}
      WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT ${Math.min(Math.max(sampleSize, 1), 100)}
    `;
    return {
      total,
      sampleCustomerIds: sample.map((r) => r.id),
    };
  }

  async *iterateSegmentIds(
    f: SegmentFiltersDto,
    batchSize = 500,
  ): AsyncGenerator<string[]> {
    const where = this.buildWhereSql(f);
    const take = Math.min(Math.max(batchSize, 1), 2000);
    let cursor: string | null = null;
    for (;;) {
      const rows = cursor
        ? await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT c.id
            ${this.baseFrom()}
            WHERE ${where} AND c.id > ${cursor}::uuid
            ORDER BY c.id ASC
            LIMIT ${take}
          `
        : await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT c.id
            ${this.baseFrom()}
            WHERE ${where}
            ORDER BY c.id ASC
            LIMIT ${take}
          `;
      if (!rows.length) break;
      yield rows.map((r) => r.id);
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < take) break;
    }
  }

  async listAudiences() {
    return this.prisma.segmentAudience.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAudience(id: string) {
    const a = await this.prisma.segmentAudience.findUnique({ where: { id } });
    if (!a) {
      throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND', message: 'Audience not found' });
    }
    return a;
  }

  async saveAudience(dto: SaveAudienceDto) {
    return this.prisma.segmentAudience.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        filters: dto.filters as object,
      },
    });
  }

  async updateAudience(
    id: string,
    dto: Partial<Pick<SaveAudienceDto, 'name' | 'description' | 'filters'>>,
  ) {
    await this.getAudience(id);
    return this.prisma.segmentAudience.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        filters: dto.filters !== undefined ? (dto.filters as object) : undefined,
      },
    });
  }

  async deleteAudience(id: string) {
    await this.getAudience(id);
    await this.prisma.segmentAudience.delete({ where: { id } });
    return { ok: true };
  }

  async getCampaignInsights(query: CampaignInsightsQueryDto) {
    const inactiveDays = Math.min(Math.max(query.inactiveDays ?? 60, 1), 3650);
    const limit = Math.min(Math.max(query.limit ?? 120, 1), 500);
    const phoneRaw = query.phone?.trim().replace(/[%_\\]/g, '');

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);

    const birthdaySql = Prisma.sql`
      (c.birthday IS NOT NULL
       AND EXTRACT(MONTH FROM c.birthday::date) = ${month}
       AND EXTRACT(DAY FROM c.birthday::date) = ${day})
    `;
    const inactiveSql = Prisma.sql`COALESCE(c.last_login_at, c.created_at) < ${cutoff}`;
    const phoneSql = phoneRaw
      ? Prisma.sql`AND (c.phone_e164 ILIKE ${`%${phoneRaw}%`} OR COALESCE(c.display_name,'') ILIKE ${`%${phoneRaw}%`})`
      : Prisma.empty;

    const summaryRows = await this.prisma.$queryRaw<
      { birthday_count: bigint; inactive_count: bigint; both_count: bigint }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE ${birthdaySql})::bigint AS birthday_count,
        COUNT(*) FILTER (WHERE ${inactiveSql})::bigint AS inactive_count,
        COUNT(*) FILTER (WHERE ${birthdaySql} AND ${inactiveSql})::bigint AS both_count
      FROM customers c
      WHERE c.status <> ${CustomerStatus.SUSPENDED}::"CustomerStatus"
      ${phoneSql}
    `;

    const targetRows = await this.prisma.$queryRaw<
      {
        id: string;
        phone_e164: string;
        display_name: string | null;
        member_tier: string | null;
        birthday: Date | null;
        last_login_at: Date | null;
        is_birthday_today: boolean;
        is_inactive: boolean;
        days_since_last_seen: number;
      }[]
    >`
      SELECT
        c.id,
        c.phone_e164,
        c.display_name,
        c.member_tier,
        c.birthday,
        c.last_login_at,
        (${birthdaySql}) AS is_birthday_today,
        (${inactiveSql}) AS is_inactive,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.last_login_at, c.created_at))) / 86400))::int AS days_since_last_seen
      FROM customers c
      WHERE c.status <> ${CustomerStatus.SUSPENDED}::"CustomerStatus"
        AND (${birthdaySql} OR ${inactiveSql})
        ${phoneSql}
      ORDER BY
        (${birthdaySql}) DESC,
        (${inactiveSql}) DESC,
        COALESCE(c.last_login_at, c.created_at) ASC
      LIMIT ${limit}
    `;

    const birthdayCount = Number(summaryRows[0]?.birthday_count ?? 0n);
    const inactiveCount = Number(summaryRows[0]?.inactive_count ?? 0n);
    const bothCount = Number(summaryRows[0]?.both_count ?? 0n);

    return {
      inactiveDays,
      summary: {
        birthdayToday: birthdayCount,
        notReturning: inactiveCount,
        overlapBirthdayAndNotReturning: bothCount,
        uniquePriorityAudience: birthdayCount + inactiveCount - bothCount,
      },
      guests: targetRows.map((r) => ({
        id: r.id,
        phoneE164: r.phone_e164,
        displayName: r.display_name,
        memberTier: r.member_tier,
        birthday: r.birthday,
        lastLoginAt: r.last_login_at,
        isBirthdayToday: r.is_birthday_today,
        isNotReturning: r.is_inactive,
        daysSinceLastSeen: r.days_since_last_seen,
      })),
    };
  }

  private parseFilters(raw: unknown): SegmentFiltersDto {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException({ code: 'INVALID_FILTERS', message: 'Invalid filters' });
    }
    return raw as SegmentFiltersDto;
  }

  async runCampaign(dto: CampaignRunDto, adminHint: string) {
    let filters: SegmentFiltersDto;
    let audienceId: string | null = null;
    if (dto.audienceId) {
      const a = await this.getAudience(dto.audienceId);
      audienceId = a.id;
      filters = this.parseFilters(a.filters);
    } else if (dto.filters) {
      filters = dto.filters;
    } else {
      throw new BadRequestException({
        code: 'CAMPAIGN_NO_TARGET',
        message: 'Provide audienceId or filters',
      });
    }

    const matched = await this.countSegment(filters);
    const run = await this.prisma.campaignRun.create({
      data: {
        segmentAudienceId: audienceId,
        filtersSnapshot: filters as object,
        action: dto.action,
        payload: dto.payload as object,
        createdBy: adminHint,
        customerMatched: matched,
      },
    });

    const errors: { customerId: string; message: string }[] = [];
    let succeeded = 0;
    let failed = 0;

    for await (const batch of this.iterateSegmentIds(filters, 200)) {
      for (const customerId of batch) {
        try {
          await this.applyCampaignAction(customerId, dto.action, dto.payload);
          succeeded++;
        } catch (e) {
          failed++;
          errors.push({
            customerId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    await this.prisma.campaignRun.update({
      where: { id: run.id },
      data: {
        customerSucceeded: succeeded,
        customerFailed: failed,
        errors: errors.length ? errors.slice(0, 500) : undefined,
      },
    });

    await this.audit.log({
      actorType: 'admin',
      actorId: adminHint,
      action: 'campaign.run',
      entityType: 'campaign_run',
      entityId: run.id,
      metadata: {
        action: dto.action,
        audienceId: audienceId,
        matched,
        succeeded,
        failed,
      },
    });

    return {
      runId: run.id,
      matched,
      succeeded,
      failed,
      errorsPreview: errors.slice(0, 20),
    };
  }

  private async applyCampaignAction(
    customerId: string,
    action: CampaignRunDto['action'],
    payload: Record<string, unknown>,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new Error('Customer not found');
    }
    if (customer.status === CustomerStatus.SUSPENDED) {
      throw new Error('Customer suspended');
    }

    if (action === 'push_voucher') {
      const code = String(payload.voucherCode ?? '').trim();
      if (!code) throw new Error('voucherCode required');
      const def = await this.prisma.voucherDefinition.findUnique({
        where: { code },
      });
      if (!def || !def.isActive) {
        throw new Error('Unknown or inactive voucher code');
      }
      await this.prisma.customerVoucher.create({
        data: {
          customerId,
          definitionId: def.id,
          status: VoucherStatus.ISSUED,
          referenceType: 'campaign_push',
        },
      });
      return;
    }

    if (action === 'wallet_bonus') {
      const amountCents = Number(payload.amountCents);
      const reason = String(payload.reason ?? 'campaign_wallet_bonus');
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('amountCents must be positive integer');
      }
      await this.wallet.appendTransaction({
        customerId,
        type: WalletTxnType.PROMOTIONAL_BONUS,
        amountCents,
        reason,
        createdByType: 'system',
        createdBy: 'campaign',
        metadata: { campaign: true },
      });
      return;
    }

    if (action === 'points_bonus') {
      const deltaPoints = Number(payload.deltaPoints);
      const reason = String(payload.reason ?? 'campaign_points_bonus');
      if (!Number.isInteger(deltaPoints) || deltaPoints === 0) {
        throw new Error('deltaPoints must be non-zero integer');
      }
      await this.loyalty.appendLedgerEntry({
        customerId,
        deltaPoints,
        reason,
        referenceType: 'campaign_points',
      });
    }
  }
}
