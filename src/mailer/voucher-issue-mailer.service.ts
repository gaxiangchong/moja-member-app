import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoucherCampaign, VoucherLifecycleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { MailerService } from './mailer.service';
import { renderCampaignEmail, voucherIssuedEmail } from './mailer-templates';

/** How often queued "you've got a voucher" emails are picked up. */
const POLL_MS = 30_000;
/** Emails per tick; the rest wait for the next one. */
const BATCH = 25;
/** Pause between sends — Resend free tier allows ~2 req/s. */
const SEND_GAP_MS = 600;
/** Older than this and the news is stale: skip instead of sending late. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** A SENDING claim older than this was a crashed run; it may go again. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

export const ISSUE_EMAIL = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

/** "RM 5.00 off" / "15% off" / … — what the voucher is worth, in words. */
export function voucherValueLabel(c: VoucherCampaign): string | null {
  const rm = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;
  switch (c.voucherType) {
    case 'FIXED_AMOUNT':
      return c.fixedAmountOff ? `${rm(c.fixedAmountOff)} off` : null;
    case 'PERCENTAGE':
      return c.percentageOff ? `${c.percentageOff}% off` : null;
    case 'DELIVERY_DISCOUNT':
      return c.deliveryDiscountAmount
        ? `${rm(c.deliveryDiscountAmount)} off delivery`
        : 'Delivery discount';
    case 'WALLET_TOPUP_CODE':
      return c.walletCreditAmount
        ? `${rm(c.walletCreditAmount)} wallet credit`
        : null;
    case 'FREE_ITEM':
      return 'Free item';
    default:
      return null;
  }
}

/**
 * Sends the email queued when a voucher campaign with `emailOnIssue` issues a
 * voucher (see CampaignBuilderService.issueVoucherToCustomer). Sending here,
 * after the fact, means a voucher issued inside a transaction that rolled
 * back never gets an email, and bulk issues respect the send rate. Consent is
 * checked again at send time, so an unsubscribe in between wins.
 */
@Injectable()
export class VoucherIssueMailerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VoucherIssueMailerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.sendPending().catch((err) => {
        this.logger.error(
          `Voucher email tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, POLL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Send one batch of queued voucher emails. Returns how many went out. */
  async sendPending(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      // Too old to be news: drop rather than surprise the member days later.
      await this.prisma.voucher.updateMany({
        where: {
          issueEmailStatus: ISSUE_EMAIL.PENDING,
          createdAt: { lt: new Date(now.getTime() - MAX_AGE_MS) },
        },
        data: { issueEmailStatus: ISSUE_EMAIL.SKIPPED, issueEmailAt: now },
      });
      // Nothing can be sent yet; leave the queue for when email is set up.
      if (!this.email.isConfigured()) return 0;

      const due = await this.prisma.voucher.findMany({
        where: {
          OR: [
            { issueEmailStatus: ISSUE_EMAIL.PENDING },
            {
              issueEmailStatus: ISSUE_EMAIL.SENDING,
              issueEmailAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        select: { id: true, issueEmailStatus: true },
      });

      let sent = 0;
      for (const row of due) {
        // Claim it first so a second instance never sends the same email.
        const claimed = await this.prisma.voucher.updateMany({
          where: { id: row.id, issueEmailStatus: row.issueEmailStatus },
          data: { issueEmailStatus: ISSUE_EMAIL.SENDING, issueEmailAt: now },
        });
        if (claimed.count === 0) continue;
        const status = await this.sendOne(row.id);
        await this.prisma.voucher.update({
          where: { id: row.id },
          data: { issueEmailStatus: status, issueEmailAt: new Date() },
        });
        if (status === ISSUE_EMAIL.SENT) {
          sent += 1;
          await sleep(SEND_GAP_MS);
        }
      }
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async sendOne(voucherId: string): Promise<string> {
    const v = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        voucherCampaign: true,
        customer: {
          select: {
            id: true,
            email: true,
            displayName: true,
            marketingConsent: true,
            status: true,
          },
        },
      },
    });
    const to = v?.customer.email?.trim().toLowerCase();
    if (
      !v ||
      !v.voucherCampaign ||
      !to ||
      !v.customer.marketingConsent ||
      v.customer.status !== 'ACTIVE' ||
      // Withdrawn or already used before the email went out.
      v.status !== VoucherLifecycleStatus.ACTIVE ||
      !v.visibleInWallet
    ) {
      return ISSUE_EMAIL.SKIPPED;
    }

    const content = voucherIssuedEmail({
      title: v.name,
      valueLabel: voucherValueLabel(v.voucherCampaign),
      minSpendSen: v.voucherCampaign.minSpend,
      expiresAt: v.expiresAt,
      appUrl: this.appUrl(),
    });
    const rendered = renderCampaignEmail({
      subject: content.subject,
      preheader: content.preheader,
      bodyHtml: content.bodyHtml,
      recipientName: v.customer.displayName,
      unsubscribeUrl: this.mailer.unsubscribeUrl(v.customer.id),
      brandName: this.mailer.brandName(),
    });
    const ok = await this.email.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: this.mailer.marketingFrom(),
    });
    if (!ok) {
      this.logger.warn(`Voucher email to customer ${v.customer.id} failed.`);
    }
    return ok ? ISSUE_EMAIL.SENT : ISSUE_EMAIL.FAILED;
  }

  private appUrl(): string | null {
    const url = this.config.get<string>('MEMBER_APP_PUBLIC_URL')?.trim();
    return url ? url.replace(/\/$/, '') : null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
