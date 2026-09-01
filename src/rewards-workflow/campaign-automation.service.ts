import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignBuilderService } from './campaign-builder.service';

const NEW_MEMBER = 'NEW_MEMBER';
const BIRTHDAY = 'BIRTHDAY';
const REFERRAL_COUNT = 'REFERRAL_COUNT';
const INACTIVE_DAYS = 'INACTIVE_DAYS';
const MIN_PURCHASE = 'MIN_PURCHASE';

/**
 * Auto-issues VoucherCampaign vouchers when a campaign's `autoCreditTrigger`
 * condition is met (new member, birthday, referral count, inactivity, min
 * purchase). Previously `autoCreditTrigger`/`autoCreditThreshold` were stored
 * but nothing ever acted on them — this is that missing automation.
 *
 * Idempotent per customer+campaign: a customer who already holds a voucher
 * from a campaign (ever, regardless of its status) is never issued a second
 * one automatically, mirroring `issueToAllActive`'s dedup rule. An admin can
 * always manually re-issue via the "Issue to member" action if needed.
 */
@Injectable()
export class CampaignAutomationService {
  private readonly logger = new Logger(CampaignAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignBuilderService,
  ) {}

  async runNewMemberTrigger(customerId: string): Promise<void> {
    await this.issueMatchingCampaigns(NEW_MEMBER, customerId, {
      reason: 'auto_new_member',
    });
  }

  /** Call after an order is finalized, with its total, to fire MIN_PURCHASE campaigns. */
  async runMinPurchaseTrigger(
    customerId: string,
    orderTotalCents: number,
  ): Promise<void> {
    await this.issueMatchingCampaigns(MIN_PURCHASE, customerId, {
      thresholdCheck: (t) => t != null && orderTotalCents >= t,
      reason: 'auto_min_purchase',
    });
  }

  /** Call after a referrer is credited for a referral's first order. */
  async runReferralCountTrigger(referrerCustomerId: string): Promise<void> {
    const referralCount = await this.prisma.customer.count({
      where: { referredByCustomerId: referrerCustomerId },
    });
    await this.issueMatchingCampaigns(REFERRAL_COUNT, referrerCustomerId, {
      thresholdCheck: (t) => t != null && referralCount >= t,
      reason: 'auto_referral_count',
    });
  }

  /** Daily sweep for the two trigger types that aren't tied to a single request: birthdays and inactivity. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailySweep(): Promise<void> {
    await this.runBirthdaySweep().catch((err) =>
      this.logger.error(
        `Birthday campaign sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    await this.runInactiveDaysSweep().catch((err) =>
      this.logger.error(
        `Inactive-days campaign sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  private async runBirthdaySweep(): Promise<void> {
    const hasActiveCampaign = await this.prisma.voucherCampaign.count({
      where: { autoCreditTrigger: BIRTHDAY, isActive: true },
    });
    if (hasActiveCampaign === 0) return;

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const customers = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customers
      WHERE birthday IS NOT NULL
        AND status = 'ACTIVE'
        AND EXTRACT(MONTH FROM birthday::date) = ${month}
        AND EXTRACT(DAY FROM birthday::date) = ${day}
    `;
    for (const c of customers) {
      await this.issueMatchingCampaigns(BIRTHDAY, c.id, {
        reason: 'auto_birthday',
      });
    }
  }

  private async runInactiveDaysSweep(): Promise<void> {
    const campaigns = await this.prisma.voucherCampaign.findMany({
      where: {
        autoCreditTrigger: INACTIVE_DAYS,
        isActive: true,
        autoCreditThreshold: { not: null },
      },
    });
    for (const campaign of campaigns) {
      const days = campaign.autoCreditThreshold ?? 0;
      if (days <= 0) continue;
      const cutoff = new Date(Date.now() - days * 86_400_000);
      const candidates = await this.prisma.customer.findMany({
        where: {
          status: CustomerStatus.ACTIVE,
          OR: [
            { lastLoginAt: { lt: cutoff } },
            { lastLoginAt: null, createdAt: { lt: cutoff } },
          ],
        },
        select: { id: true },
      });
      for (const c of candidates) {
        await this.issueOne(campaign.id, c.id, 'auto_inactive_days');
      }
    }
  }

  /** Issues every active, in-window campaign matching `criteria` to one customer, skipping any already held. */
  private async issueMatchingCampaigns(
    criteria: string,
    customerId: string,
    opts: {
      thresholdCheck?: (threshold: number | null) => boolean;
      reason: string;
    },
  ): Promise<void> {
    const now = new Date();
    const campaigns = await this.prisma.voucherCampaign.findMany({
      where: {
        autoCreditTrigger: criteria,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
    for (const campaign of campaigns) {
      if (
        opts.thresholdCheck &&
        !opts.thresholdCheck(campaign.autoCreditThreshold)
      ) {
        continue;
      }
      await this.issueOne(campaign.id, customerId, opts.reason);
    }
  }

  private async issueOne(
    campaignId: string,
    customerId: string,
    reason: string,
  ): Promise<void> {
    const already = await this.prisma.voucher.findFirst({
      where: { customerId, voucherCampaignId: campaignId },
      select: { id: true },
    });
    if (already) return;
    try {
      await this.campaigns.issueVoucherToCustomer(
        customerId,
        campaignId,
        null,
        reason,
      );
      this.logger.log(
        `Auto-issued campaign ${campaignId} (${reason}) to customer ${customerId}.`,
      );
    } catch (err) {
      this.logger.warn(
        `Auto-issue failed for campaign ${campaignId} → customer ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
