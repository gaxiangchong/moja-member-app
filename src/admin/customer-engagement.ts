/**
 * What the member list shows beyond identity: are they still buying, and which
 * of the automatic vouchers (welcome, birthday, referral) have they been given
 * and spent.
 *
 * "Active" here means *bought recently*, online or in store — not the account
 * status, which only says whether the member has set a PIN. A member who signed
 * up a year ago and never came back is an active account and a lapsed customer,
 * and the second one is what win-back campaigns are for.
 */
import {
  Prisma,
  VoucherLifecycleStatus,
  type PrismaClient,
} from '@prisma/client';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { NON_REVENUE_ORDER_STATUSES } from '../orders/order-status';

export const DEFAULT_ACTIVE_DAYS = 60;
const DAY_MS = 86_400_000;
const CHUNK = 2000;

export const AWARD_KINDS = ['welcome', 'birthday', 'referral'] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

/** What the admin can ask for in an award column. */
export const AWARD_FILTERS = [
  'none',
  'issued',
  'available',
  'used',
  'expired',
] as const;
export type AwardFilter = (typeof AWARD_FILTERS)[number];

export type AwardState = 'none' | 'available' | 'used' | 'expired';

export type Activity = 'active' | 'lapsed' | 'never';

export type Engagement = {
  lastPurchaseAt: Date | null;
  activity: Activity;
  awards: {
    welcome: AwardState;
    birthday: AwardState;
    referral: { earned: number; used: number; available: number };
  };
};

/**
 * Which campaigns count as each kind of award. Matched on the template the
 * campaign was made from or its trigger, so a campaign set up as "Custom" but
 * triggered on birthdays still shows up in the birthday column.
 */
export function awardCampaignWhere(
  kind: AwardKind,
): Prisma.VoucherCampaignWhereInput {
  switch (kind) {
    case 'welcome':
      return {
        OR: [{ template: 'WELCOME' }, { autoCreditTrigger: 'NEW_MEMBER' }],
      };
    case 'birthday':
      return {
        OR: [{ template: 'BIRTHDAY' }, { autoCreditTrigger: 'BIRTHDAY' }],
      };
    case 'referral':
      return {
        OR: [
          { template: 'REFERRAL' },
          {
            autoCreditTrigger: { in: ['REFERRAL_PURCHASE', 'REFERRAL_COUNT'] },
          },
        ],
      };
  }
}

/** A voucher counts as available only while unused *and* unexpired. */
function availableWhere(now: Date): Prisma.VoucherWhereInput {
  return {
    status: {
      in: [VoucherLifecycleStatus.ACTIVE, VoucherLifecycleStatus.LOCKED],
    },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/** Narrow the member list by one award column. */
export function awardFilterWhere(
  kind: AwardKind,
  filter: AwardFilter,
  now: Date = new Date(),
): Prisma.CustomerWhereInput {
  const voucherCampaign = awardCampaignWhere(kind);
  const any: Prisma.CustomerWhereInput = {
    vouchersV2: { some: { voucherCampaign } },
  };
  const available: Prisma.CustomerWhereInput = {
    vouchersV2: { some: { voucherCampaign, ...availableWhere(now) } },
  };
  const used: Prisma.CustomerWhereInput = {
    vouchersV2: {
      some: { voucherCampaign, status: VoucherLifecycleStatus.USED },
    },
  };
  switch (filter) {
    case 'none':
      return { NOT: any };
    case 'issued':
      return any;
    case 'available':
      return available;
    case 'used':
      return used;
    case 'expired':
      // Was given one, never spent it, and none is still usable.
      return { AND: [any, { NOT: available }, { NOT: used }] };
  }
}

function paidOrderWhere(): Prisma.CustomerOrderWhereInput {
  return { status: { notIn: NON_REVENUE_ORDER_STATUSES } };
}

/** `yyyy-mm-dd` → a UTC-midnight Date, the shape `business_date` columns use. */
function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Narrow the member list by purchase activity.
 *  - active: bought (online or in store) within `activeDays`
 *  - lapsed: has bought before, but not within `activeDays`
 *  - never:  has never bought
 */
export function activityWhere(
  activity: Activity,
  activeDays: number,
  now: Date = new Date(),
): Prisma.CustomerWhereInput {
  const cutoff = new Date(now.getTime() - activeDays * DAY_MS);
  // POS receipts are dated by Malaysian business day, so compare on that day.
  const cutoffDay = ymdToDate(shopCalendarYmd(cutoff));
  const boughtRecently: Prisma.CustomerWhereInput = {
    OR: [
      { orders: { some: { ...paidOrderWhere(), placedAt: { gte: cutoff } } } },
      { posReceipts: { some: { businessDate: { gte: cutoffDay } } } },
    ],
  };
  const everBought: Prisma.CustomerWhereInput = {
    OR: [{ orders: { some: paidOrderWhere() } }, { posReceipts: { some: {} } }],
  };
  switch (activity) {
    case 'active':
      return boughtRecently;
    case 'lapsed':
      return { AND: [everBought, { NOT: boughtRecently }] };
    case 'never':
      return { NOT: everBought };
  }
}

type VoucherLike = { status: VoucherLifecycleStatus; expiresAt: Date | null };

/** Roll a member's vouchers of one kind up into the state the grid shows. */
export function summarizeAward(
  vouchers: VoucherLike[],
  now: Date = new Date(),
): { state: AwardState; earned: number; used: number; available: number } {
  let used = 0;
  let available = 0;
  for (const v of vouchers) {
    if (v.status === VoucherLifecycleStatus.USED) used++;
    else if (
      (v.status === VoucherLifecycleStatus.ACTIVE ||
        v.status === VoucherLifecycleStatus.LOCKED) &&
      (!v.expiresAt || v.expiresAt > now)
    ) {
      available++;
    }
  }
  const earned = vouchers.length;
  // Something still spendable wins over history; then anything spent; else it lapsed.
  const state: AwardState =
    earned === 0
      ? 'none'
      : available > 0
        ? 'available'
        : used > 0
          ? 'used'
          : 'expired';
  return { state, earned, used, available };
}

/**
 * Latest purchase and award state for a set of members, in a handful of
 * queries (not one per member), chunked so an export of tens of thousands of
 * members stays within bind-parameter limits.
 */
export async function loadEngagement(
  prisma: Pick<PrismaClient, 'customerOrder' | 'posReceipt' | 'voucher'>,
  ids: string[],
  activeDays: number,
  now: Date = new Date(),
): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>();
  const cutoff = now.getTime() - activeDays * DAY_MS;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [orders, receipts, vouchers] = await Promise.all([
      prisma.customerOrder.groupBy({
        by: ['customerId'],
        where: { customerId: { in: chunk }, ...paidOrderWhere() },
        _max: { placedAt: true },
      }),
      prisma.posReceipt.groupBy({
        by: ['customerId'],
        where: { customerId: { in: chunk } },
        _max: { soldAt: true, businessDate: true },
      }),
      prisma.voucher.findMany({
        where: {
          customerId: { in: chunk },
          voucherCampaign: {
            OR: AWARD_KINDS.map((k) => awardCampaignWhere(k)),
          },
        },
        select: {
          customerId: true,
          status: true,
          expiresAt: true,
          voucherCampaign: {
            select: { template: true, autoCreditTrigger: true },
          },
        },
      }),
    ]);

    const lastPurchase = new Map<string, Date>();
    const bump = (id: string | null, at: Date | null | undefined) => {
      if (!id || !at) return;
      const cur = lastPurchase.get(id);
      if (!cur || at > cur) lastPurchase.set(id, at);
    };
    for (const o of orders) bump(o.customerId, o._max.placedAt);
    for (const r of receipts) {
      bump(r.customerId, r._max.soldAt);
      bump(r.customerId, r._max.businessDate);
    }

    const byMember = new Map<string, Record<AwardKind, VoucherLike[]>>();
    for (const v of vouchers) {
      const campaign = v.voucherCampaign;
      if (!campaign) continue;
      const kinds: AwardKind[] = [];
      if (
        campaign.template === 'WELCOME' ||
        campaign.autoCreditTrigger === 'NEW_MEMBER'
      ) {
        kinds.push('welcome');
      }
      if (
        campaign.template === 'BIRTHDAY' ||
        campaign.autoCreditTrigger === 'BIRTHDAY'
      ) {
        kinds.push('birthday');
      }
      if (
        campaign.template === 'REFERRAL' ||
        campaign.autoCreditTrigger === 'REFERRAL_PURCHASE' ||
        campaign.autoCreditTrigger === 'REFERRAL_COUNT'
      ) {
        kinds.push('referral');
      }
      if (!byMember.has(v.customerId)) {
        byMember.set(v.customerId, { welcome: [], birthday: [], referral: [] });
      }
      for (const kind of kinds) byMember.get(v.customerId)![kind].push(v);
    }

    for (const id of chunk) {
      const last = lastPurchase.get(id) ?? null;
      const mine = byMember.get(id);
      const referral = summarizeAward(mine?.referral ?? [], now);
      out.set(id, {
        lastPurchaseAt: last,
        activity: !last
          ? 'never'
          : last.getTime() >= cutoff
            ? 'active'
            : 'lapsed',
        awards: {
          welcome: summarizeAward(mine?.welcome ?? [], now).state,
          birthday: summarizeAward(mine?.birthday ?? [], now).state,
          referral: {
            earned: referral.earned,
            used: referral.used,
            available: referral.available,
          },
        },
      });
    }
  }
  return out;
}
