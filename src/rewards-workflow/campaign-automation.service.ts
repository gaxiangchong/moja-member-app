import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CustomerStatus, Prisma, VoucherCampaign } from '@prisma/client';
import { shopCalendarYmd } from '../bento/bento-shop-date.util';
import { birthdayVoucherExpiry, nextBirthday } from '../common/birthday.util';
import { NON_REVENUE_ORDER_STATUSES } from '../orders/order-status';
import { PrismaService } from '../prisma/prisma.service';
import { birthdayCampaignWindow } from './birthday-voucher.rule';
import { CampaignBuilderService } from './campaign-builder.service';

const NEW_MEMBER = 'NEW_MEMBER';
const BIRTHDAY = 'BIRTHDAY';
const REFERRAL_PURCHASE = 'REFERRAL_PURCHASE';
const REFERRAL_COUNT = 'REFERRAL_COUNT';
const INACTIVE_DAYS = 'INACTIVE_DAYS';
const MIN_PURCHASE = 'MIN_PURCHASE';
const ALL_MEMBERS = 'ALL_MEMBERS';

/**
 * A member is given one birthday voucher a year. Their next one comes around
 * 365 days later, so 300 leaves slack for the lead-in without letting a changed
 * birthday date earn a second voucher in the same year.
 */
const BIRTHDAY_COOLDOWN_MS = 300 * 86_400_000;
/** Days since the last purchase before a member counts as lapsed, absent a campaign value. */
const WINBACK_DEFAULT_DAYS = 60;
/** Most members one all-members campaign is issued to per sweep. */
const ALL_MEMBERS_BATCH = 500;
const ALL_MEMBERS_MAX_BATCHES = 10;

export type AutomationSweepResult = {
  birthday: number;
  winback: number;
  allMembers: number;
};

/**
 * Issues campaign vouchers automatically — welcome, birthday, referral,
 * win-back, and "every member" campaigns — so an admin only has to create the
 * campaign and switch it on.
 *
 * Every automatic voucher carries an `issueKey` ("welcome", "birthday:2026",
 * "referral:<friend>", "winback:<last purchase date>"). A unique index on
 * (campaign, member, key) makes issuing idempotent at the database: a retry, an
 * overlapping sweep, or two servers running at once cannot hand a member the
 * same voucher twice. The checks in this file only avoid pointless work.
 *
 * A voucher that has been used (or withdrawn) is never re-issued for the same
 * key, which is what makes "once consumed, it is gone" hold.
 */
@Injectable()
export class CampaignAutomationService {
  private readonly logger = new Logger(CampaignAutomationService.name);
  private dailySweepRunning = false;
  private allMembersSweepRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignBuilderService,
  ) {}

  // ---------------------------------------------------------------------
  // Event triggers — called from the request that caused them
  // ---------------------------------------------------------------------

  /**
   * First login (PIN set). Issues welcome vouchers, plus any "every member"
   * campaign that is running, so a member who joins mid-campaign gets it too.
   */
  async runNewMemberTrigger(customerId: string): Promise<void> {
    for (const campaign of await this.activeCampaigns(NEW_MEMBER)) {
      await this.issueOne(campaign, customerId, 'auto_new_member', 'welcome', {
        oncePerCampaign: true,
      });
    }
    for (const campaign of await this.activeCampaigns(ALL_MEMBERS)) {
      await this.issueOne(
        campaign,
        customerId,
        'auto_all_members',
        'campaign',
        {
          oncePerCampaign: true,
        },
      );
    }
  }

  /**
   * A member saved a new birthday. A voucher they already hold follows the
   * birthday they have now (its expiry is re-anchored), and one they do not yet
   * hold is issued if the new date is inside the window. Order matters: moving
   * the date first means the voucher they hold is recognised, so changing the
   * birthday can never earn a second one.
   */
  async onBirthdayChanged(customerId: string): Promise<void> {
    await this.reanchorBirthdayVouchers(customerId);
    await this.runBirthdayTrigger(customerId);
  }

  /**
   * Points a member's unused birthday vouchers at their current birthday. An
   * expiry fixed from the old date would otherwise cut a corrected, later
   * birthday short — or keep a voucher alive after the date moved away. Whether
   * it can be used today is still decided by the window at redemption.
   */
  private async reanchorBirthdayVouchers(customerId: string): Promise<void> {
    const member = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { birthday: true },
    });
    if (!member?.birthday) return;
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        customerId,
        status: 'ACTIVE',
        voucherCampaign: {
          OR: [{ template: 'BIRTHDAY' }, { autoCreditTrigger: BIRTHDAY }],
        },
      },
      include: { voucherCampaign: true },
    });
    for (const voucher of vouchers) {
      const { afterDays } = birthdayCampaignWindow(voucher.voucherCampaign!);
      const expiresAt = birthdayVoucherExpiry(member.birthday, afterDays);
      if (voucher.expiresAt?.getTime() === expiresAt.getTime()) continue;
      await this.prisma.voucher.updateMany({
        // Not one a checkout has locked in the meantime.
        where: { id: voucher.id, status: 'ACTIVE' },
        data: { expiresAt },
      });
    }
  }

  /**
   * Birthday set or changed. The daily sweep would catch it by tomorrow; this
   * makes the voucher appear the moment a member inside the window saves it.
   */
  async runBirthdayTrigger(customerId: string): Promise<number> {
    const campaigns = await this.activeCampaigns(BIRTHDAY);
    if (campaigns.length === 0) return 0;
    const member = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true, birthday: true },
    });
    if (!member?.birthday || member.status !== CustomerStatus.ACTIVE) return 0;
    return this.issueBirthdayVouchers(campaigns, [member], [member.id]);
  }

  /** After an order is finalized, with its total, to fire MIN_PURCHASE campaigns. */
  async runMinPurchaseTrigger(
    customerId: string,
    orderTotalCents: number,
  ): Promise<void> {
    for (const campaign of await this.activeCampaigns(MIN_PURCHASE)) {
      const threshold = campaign.autoCreditThreshold;
      if (threshold == null || orderTotalCents < threshold) continue;
      // Once per member per campaign, as it always has been.
      await this.issueOne(
        campaign,
        customerId,
        'auto_min_purchase',
        'min_purchase',
        { oncePerCampaign: true },
      );
    }
  }

  /**
   * A referred friend has just made their first paid order. The referrer earns
   * one voucher per qualifying friend, provided that first order reached the
   * campaign's minimum (RM30 by default, set by the admin) and the referrer has
   * not already earned the campaign's per-member maximum.
   *
   * `qualifyingSpendCents` is what the friend paid for goods — delivery
   * excluded, since a delivery fee is not a purchase.
   */
  async runReferralPurchaseTrigger(
    referrerId: string,
    refereeId: string,
    qualifyingSpendCents: number,
  ): Promise<number> {
    const campaigns = await this.activeCampaigns(REFERRAL_PURCHASE);
    if (campaigns.length === 0) return 0;
    const referrer = await this.prisma.customer.findUnique({
      where: { id: referrerId },
      select: { status: true },
    });
    if (referrer?.status !== CustomerStatus.ACTIVE) return 0;

    let issued = 0;
    for (const campaign of campaigns) {
      const minimum = campaign.qualifyingMinSpend ?? 0;
      if (qualifyingSpendCents < minimum) {
        this.logger.log(
          `Referral voucher not earned: friend ${refereeId} spent ${qualifyingSpendCents} sen, ` +
            `campaign ${campaign.id} needs ${minimum}.`,
        );
        continue;
      }
      const cap = campaign.autoCreditThreshold;
      if (cap != null && cap > 0) {
        const earned = await this.prisma.voucher.count({
          where: {
            voucherCampaignId: campaign.id,
            customerId: referrerId,
            issueKey: { startsWith: 'referral:' },
          },
        });
        if (earned >= cap) continue;
      }
      if (
        await this.issueOne(
          campaign,
          referrerId,
          'auto_referral_purchase',
          `referral:${refereeId}`,
        )
      ) {
        issued++;
      }
    }
    return issued;
  }

  /**
   * Milestone referral campaigns ("refer 3 friends who buy"). Counts only
   * friends who have actually bought, not everyone who typed a referral code.
   */
  async runReferralCountTrigger(referrerCustomerId: string): Promise<void> {
    const campaigns = await this.activeCampaigns(REFERRAL_COUNT);
    if (campaigns.length === 0) return;
    const referralCount = await this.prisma.customer.count({
      where: {
        referredByCustomerId: referrerCustomerId,
        orders: { some: { status: { notIn: NON_REVENUE_ORDER_STATUSES } } },
      },
    });
    for (const campaign of campaigns) {
      const threshold = campaign.autoCreditThreshold;
      if (threshold == null || referralCount < threshold) continue;
      await this.issueOne(
        campaign,
        referrerCustomerId,
        'auto_referral_count',
        'referral_count',
        { oncePerCampaign: true },
      );
    }
  }

  // ---------------------------------------------------------------------
  // Scheduled sweeps — triggers that are not tied to a single request
  // ---------------------------------------------------------------------

  /** Birthdays and win-back, once a morning Malaysian time. */
  @Cron('0 9 * * *', { timeZone: 'Asia/Kuala_Lumpur' })
  async runDailySweep(): Promise<
    Pick<AutomationSweepResult, 'birthday' | 'winback'>
  > {
    if (this.dailySweepRunning) return { birthday: 0, winback: 0 };
    this.dailySweepRunning = true;
    try {
      const birthday = await this.runBirthdaySweep().catch((err) =>
        this.sweepFailed('Birthday', err),
      );
      const winback = await this.runWinbackSweep().catch((err) =>
        this.sweepFailed('Win-back', err),
      );
      return { birthday, winback };
    } finally {
      this.dailySweepRunning = false;
    }
  }

  /** "Every member" campaigns, so a campaign reaches members who joined after it started. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runAllMembersSweep(): Promise<number> {
    if (this.allMembersSweepRunning) return 0;
    this.allMembersSweepRunning = true;
    try {
      return await this.issueAllMembersCampaigns();
    } catch (err) {
      return this.sweepFailed('All-members', err);
    } finally {
      this.allMembersSweepRunning = false;
    }
  }

  /** Runs every sweep immediately (admin "Run now"); safe, because issuing is idempotent. */
  async runAllNow(): Promise<AutomationSweepResult> {
    const daily = await this.runDailySweep();
    const allMembers = await this.runAllMembersSweep();
    return { ...daily, allMembers };
  }

  private sweepFailed(name: string, err: unknown): number {
    this.logger.error(
      `${name} campaign sweep failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }

  private async runBirthdaySweep(): Promise<number> {
    const campaigns = await this.activeCampaigns(BIRTHDAY);
    if (campaigns.length === 0) return 0;
    const members = await this.prisma.customer.findMany({
      where: { status: CustomerStatus.ACTIVE, birthday: { not: null } },
      select: { id: true, birthday: true },
    });
    return this.issueBirthdayVouchers(campaigns, members);
  }

  /**
   * One voucher per member per birthday year. The key is the year of the
   * *upcoming* birthday, so a member in December with a January birthday is
   * issued for next year, and editing the date later in the same year cannot
   * earn a second voucher for it.
   */
  private async issueBirthdayVouchers(
    campaigns: VoucherCampaign[],
    members: { id: string; birthday: Date | null }[],
    onlyMemberIds?: string[],
  ): Promise<number> {
    let issued = 0;
    for (const campaign of campaigns) {
      if (!(await this.hasCapacity(campaign))) continue;
      const { leadDays } = birthdayCampaignWindow(campaign);
      const have = await this.existingKeys(
        campaign.id,
        'birthday:',
        onlyMemberIds,
      );
      // Vouchers from this campaign handed out by hand (no key) still count: a
      // member who was given one for this birthday must not get a second.
      const lastVoucher = await this.latestVoucher(campaign.id, onlyMemberIds);
      for (const member of members) {
        if (!member.birthday) continue;
        const next = nextBirthday(member.birthday);
        if (next.daysUntil > leadDays) continue;
        const key = `birthday:${next.year}`;
        if (have.has(`${member.id}|${key}`)) continue;
        const last = lastVoucher.get(member.id);
        if (last) {
          // The window for this birthday opens lead-days before it; a voucher
          // that is still good from then on already covers it.
          const windowStart = Date.UTC(
            next.year,
            next.month,
            next.day - leadDays,
          );
          if (last.expiresAt === null || last.expiresAt >= windowStart)
            continue;
          // One birthday voucher a year, whatever date the member gives. Without
          // this, moving the birthday into a different window would earn another.
          if (Date.now() - last.issuedAt < BIRTHDAY_COOLDOWN_MS) continue;
        }
        if (await this.issueOne(campaign, member.id, 'auto_birthday', key)) {
          issued++;
        }
      }
    }
    return issued;
  }

  /**
   * Members who bought before but not for N days. One voucher per lapse: the
   * key is the date of their last purchase, so they are asked once, and if they
   * come back and lapse again later they are asked again. Members who have
   * never bought are not "won back" — they were never won.
   */
  private async runWinbackSweep(): Promise<number> {
    const campaigns = await this.activeCampaigns(INACTIVE_DAYS);
    let issued = 0;
    for (const campaign of campaigns) {
      if (!(await this.hasCapacity(campaign))) continue;
      const days =
        campaign.autoCreditThreshold && campaign.autoCreditThreshold > 0
          ? campaign.autoCreditThreshold
          : WINBACK_DEFAULT_DAYS;
      const cutoff = new Date(Date.now() - days * 86_400_000);
      const lapsed = await this.lapsedMembers(cutoff);
      const have = await this.existingKeys(campaign.id, 'winback:');
      for (const member of lapsed) {
        const key = `winback:${shopCalendarYmd(member.lastPurchaseAt)}`;
        if (have.has(`${member.id}|${key}`)) continue;
        if (await this.issueOne(campaign, member.id, 'auto_winback', key)) {
          issued++;
        }
      }
    }
    return issued;
  }

  private async issueAllMembersCampaigns(): Promise<number> {
    let issued = 0;
    for (const campaign of await this.activeCampaigns(ALL_MEMBERS)) {
      let remaining = Number.POSITIVE_INFINITY;
      if (campaign.totalRedemptionCap) {
        const already = await this.prisma.voucher.count({
          where: { voucherCampaignId: campaign.id },
        });
        remaining = campaign.totalRedemptionCap - already;
      }
      for (
        let batch = 0;
        batch < ALL_MEMBERS_MAX_BATCHES && remaining > 0;
        batch++
      ) {
        // Anyone who has ever held one — used, expired, or withdrawn — is
        // excluded, so a consumed voucher stays gone.
        const members = await this.prisma.customer.findMany({
          where: {
            status: CustomerStatus.ACTIVE,
            vouchersV2: { none: { voucherCampaignId: campaign.id } },
          },
          select: { id: true },
          take: Math.min(ALL_MEMBERS_BATCH, remaining),
        });
        if (members.length === 0) break;
        let issuedInBatch = 0;
        for (const member of members) {
          if (
            await this.issueOne(
              campaign,
              member.id,
              'auto_all_members',
              'campaign',
            )
          ) {
            issued++;
            issuedInBatch++;
            remaining--;
          }
        }
        // Nothing went out (e.g. every attempt errored): stop rather than
        // re-read the same members forever.
        if (issuedInBatch === 0) break;
      }
    }
    return issued;
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  /**
   * Active campaigns for a trigger whose window includes now. Campaigns linked
   * to a points reward are never included (see below).
   */
  private activeCampaigns(trigger: string): Promise<VoucherCampaign[]> {
    const now = new Date();
    return this.prisma.voucherCampaign.findMany({
      where: {
        autoCreditTrigger: trigger,
        isActive: true,
        // A campaign that backs a points reward is only ever issued when a member
        // redeems that reward. Pushing it to members automatically would hand
        // out the reward for free, whatever trigger it was saved with.
        rewards: { none: {} },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    });
  }

  private async hasCapacity(campaign: VoucherCampaign): Promise<boolean> {
    if (!campaign.totalRedemptionCap) return true;
    const issued = await this.prisma.voucher.count({
      where: { voucherCampaignId: campaign.id },
    });
    return issued < campaign.totalRedemptionCap;
  }

  /**
   * Per member, when they were last given a live (not withdrawn) voucher from a
   * campaign and when it stops being valid (`null` = never). Members with none
   * are absent from the map.
   */
  private async latestVoucher(
    campaignId: string,
    memberIds?: string[],
  ): Promise<Map<string, { issuedAt: number; expiresAt: number | null }>> {
    const rows = await this.prisma.voucher.findMany({
      where: {
        voucherCampaignId: campaignId,
        status: { not: 'VOID' },
        ...(memberIds ? { customerId: { in: memberIds } } : {}),
      },
      select: { customerId: true, expiresAt: true, createdAt: true },
    });
    const out = new Map<
      string,
      { issuedAt: number; expiresAt: number | null }
    >();
    for (const r of rows) {
      const expires = r.expiresAt ? r.expiresAt.getTime() : null;
      const issued = r.createdAt.getTime();
      const cur = out.get(r.customerId);
      if (!cur) {
        out.set(r.customerId, { issuedAt: issued, expiresAt: expires });
        continue;
      }
      out.set(r.customerId, {
        issuedAt: Math.max(cur.issuedAt, issued),
        expiresAt:
          cur.expiresAt === null || expires === null
            ? null
            : Math.max(cur.expiresAt, expires),
      });
    }
    return out;
  }

  /** `memberId|issueKey` for vouchers already issued, to skip needless work. */
  private async existingKeys(
    campaignId: string,
    prefix: string,
    memberIds?: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.voucher.findMany({
      where: {
        voucherCampaignId: campaignId,
        issueKey: { startsWith: prefix },
        ...(memberIds ? { customerId: { in: memberIds } } : {}),
      },
      select: { customerId: true, issueKey: true },
    });
    return new Set(rows.map((r) => `${r.customerId}|${r.issueKey}`));
  }

  /**
   * Active members whose most recent purchase — online order or in-store
   * receipt — is older than `cutoff`. Cancelled, refunded and unpaid orders do
   * not count as purchases.
   */
  private lapsedMembers(
    cutoff: Date,
  ): Promise<{ id: string; lastPurchaseAt: Date }[]> {
    return this.prisma.$queryRaw<{ id: string; lastPurchaseAt: Date }[]>`
      SELECT c.id AS "id", lp.last_purchase_at AS "lastPurchaseAt"
      FROM customers c
      JOIN (
        SELECT customer_id, MAX(purchased_at) AS last_purchase_at
        FROM (
          SELECT customer_id, placed_at AS purchased_at
          FROM customer_orders
          WHERE status NOT IN (${Prisma.join(NON_REVENUE_ORDER_STATUSES)})
          UNION ALL
          SELECT customer_id, COALESCE(sold_at, business_date::timestamp)
          FROM pos_receipts
          WHERE customer_id IS NOT NULL
        ) purchases
        GROUP BY customer_id
      ) lp ON lp.customer_id = c.id
      WHERE c.status = 'ACTIVE' AND lp.last_purchase_at < ${cutoff}
    `;
  }

  /**
   * Issues one voucher unless it was already issued for this `issueKey`.
   * Returns whether a new voucher was created. `oncePerCampaign` additionally
   * refuses when the member holds any voucher from the campaign — the rule
   * welcome and milestone campaigns have always had.
   */
  private async issueOne(
    campaign: Pick<VoucherCampaign, 'id'>,
    customerId: string,
    reason: string,
    issueKey: string,
    opts: { oncePerCampaign?: boolean } = {},
  ): Promise<boolean> {
    if (opts.oncePerCampaign) {
      const already = await this.prisma.voucher.findFirst({
        where: { customerId, voucherCampaignId: campaign.id },
        select: { id: true },
      });
      if (already) return false;
    }
    try {
      await this.campaigns.issueVoucherToCustomer(
        customerId,
        campaign.id,
        null,
        reason,
        undefined,
        issueKey,
      );
      this.logger.log(
        `Auto-issued campaign ${campaign.id} (${issueKey}) to customer ${customerId}.`,
      );
      return true;
    } catch (err) {
      // P2002 is the unique index doing its job: already issued, nothing to do.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      this.logger.warn(
        `Auto-issue failed for campaign ${campaign.id} → customer ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }
}
