import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';

/** Each receipt pull reads at least this far back, so late receipts are not missed. */
const MIN_WINDOW_MS = 15 * 60 * 1000;
/** Overlap with the previous successful pull, to absorb clock skew. */
const OVERLAP_MS = 2 * 60 * 1000;
/** Window on the very first pull after boot (the hourly reconcile covers older gaps). */
const BOOT_WINDOW_MS = 30 * 60 * 1000;
/** Pages per pull — a 15-minute window should never need more than one. */
const MAX_PAGES_PER_TICK = 4;
const LIVE_PAGE_SIZE = 100;
/** Credit notes (refunds) are less urgent than sales: every Nth pull. */
const CREDIT_NOTE_EVERY_N_TICKS = 5;
/** Back-off ceiling when SalesPlay keeps failing. */
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_SEC = 120;
const MIN_INTERVAL_SEC = 60;
const MAX_INTERVAL_SEC = 300;

/** A member whose push failed is retried this often… */
const MEMBER_RETRY_EVERY_MS = 60 * 1000;
/** …this many times, then left for staff (ops "push to SalesPlay"). */
const MEMBER_MAX_ATTEMPTS = 10;
/** On boot, re-queue members from the last day that never reached SalesPlay. */
const BOOT_MEMBER_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type LiveSyncStatus = {
  receiptsEnabled: boolean;
  intervalSec: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  membersPendingPush: number;
};

/**
 * Keeps SalesPlay and the member app in step without hammering either.
 *
 * Members — event-driven, no polling. A new member is pushed to SalesPlay the
 * moment they register (CustomersService). Only when that push fails is the
 * member handed to {@link enqueueMemberPush}, which retries once a minute
 * until SalesPlay accepts them. When every push succeeds, nothing runs.
 *
 * Transactions — a light poll (default every 2 minutes, 1–5 configurable)
 * that pulls only receipts created in a short recent window, so purchases and
 * points reach the member app within minutes even when SalesPlay's webhook is
 * late or missing. Ingestion is idempotent by SalesPlay id, so overlapping
 * with the webhook and the hourly reconcile is safe. A self-scheduling timer
 * keeps at most one pull in flight, and it backs off while SalesPlay fails.
 *
 * Receipt polling is opt-in (`SALESPLAY_LIVE_SYNC_ENABLED=true`) and must run
 * on ONE instance. Member retries run wherever SalesPlay is configured.
 */
@Injectable()
export class SalesplayLiveSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SalesplayLiveSyncService.name);
  private receiptTimer: NodeJS.Timeout | null = null;
  private memberTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private tickCount = 0;
  private lastSuccessStartedAt: number | null = null;
  private lastErrorAt: number | null = null;
  private consecutiveFailures = 0;
  /** customerId → retry state for members SalesPlay has not accepted yet. */
  private readonly pendingMembers = new Map<
    string,
    { attempts: number; nextAt: number }
  >();
  private memberRunInFlight = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly salesplay: SalesplayService,
    private readonly webhook: SalesplayWebhookService,
  ) {}

  receiptsEnabled(): boolean {
    const v = this.config.get<string>('SALESPLAY_LIVE_SYNC_ENABLED');
    return ['1', 'true', 'on', 'yes'].includes(String(v ?? '').toLowerCase());
  }

  /** Seconds between receipt pulls; default 120, clamped to 60–300. */
  intervalSec(): number {
    const n = Number(this.config.get<string>('SALESPLAY_LIVE_SYNC_INTERVAL_SEC'));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_SEC;
    return Math.min(Math.max(Math.floor(n), MIN_INTERVAL_SEC), MAX_INTERVAL_SEC);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || !this.salesplay.isConfigured()) return;
    void this.requeueUnsyncedMembers().catch((err) =>
      this.logger.error(
        `Could not re-queue unsynced members: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    if (this.receiptsEnabled()) {
      this.logger.log(`SalesPlay receipt sync every ${this.intervalSec()}s.`);
      this.scheduleReceipts(this.intervalSec() * 1000);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.receiptTimer) clearTimeout(this.receiptTimer);
    if (this.memberTimer) clearTimeout(this.memberTimer);
  }

  getStatus(): LiveSyncStatus {
    return {
      receiptsEnabled: this.receiptsEnabled(),
      intervalSec: this.intervalSec(),
      lastSuccessAt: this.lastSuccessStartedAt
        ? new Date(this.lastSuccessStartedAt).toISOString()
        : null,
      lastErrorAt: this.lastErrorAt ? new Date(this.lastErrorAt).toISOString() : null,
      consecutiveFailures: this.consecutiveFailures,
      membersPendingPush: this.pendingMembers.size,
    };
  }

  // ── Members: retry only what failed ───────────────────────────────────

  /**
   * Called when pushing a member to SalesPlay failed. The member is retried
   * in the background (latest profile each time) until SalesPlay accepts them.
   */
  enqueueMemberPush(customerId: string): void {
    if (this.stopped || !this.salesplay.isConfigured()) return;
    if (!this.pendingMembers.has(customerId)) {
      this.pendingMembers.set(customerId, {
        attempts: 0,
        nextAt: Date.now() + MEMBER_RETRY_EVERY_MS,
      });
      this.logger.warn(`Member ${customerId} queued for SalesPlay retry.`);
    }
    this.scheduleMembers();
  }

  private scheduleMembers(): void {
    if (this.stopped || this.memberTimer || this.pendingMembers.size === 0) return;
    const nextAt = Math.min(...[...this.pendingMembers.values()].map((m) => m.nextAt));
    this.memberTimer = setTimeout(() => {
      this.memberTimer = null;
      void this.runMemberRetries().finally(() => this.scheduleMembers());
    }, Math.max(nextAt - Date.now(), 1000));
    this.memberTimer.unref?.();
  }

  /** Retries every queued member that is due. Public for tests; never throws. */
  async runMemberRetries(): Promise<void> {
    if (this.memberRunInFlight) return;
    this.memberRunInFlight = true;
    try {
      const now = Date.now();
      for (const [id, state] of [...this.pendingMembers]) {
        if (state.nextAt > now) continue;
        state.attempts++;
        const done = await this.pushMember(id).catch((err) => {
          this.logger.error(
            `SalesPlay member retry error for ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return false;
        });
        if (done) {
          this.pendingMembers.delete(id);
        } else if (state.attempts >= MEMBER_MAX_ATTEMPTS) {
          this.pendingMembers.delete(id);
          this.logger.error(
            `Gave up pushing member ${id} to SalesPlay after ${state.attempts} tries; use "push to SalesPlay" on the member desk.`,
          );
        } else {
          state.nextAt = Date.now() + MEMBER_RETRY_EVERY_MS;
        }
      }
    } finally {
      this.memberRunInFlight = false;
    }
  }

  /** True when SalesPlay has the member (or there is nothing left to push). */
  private async pushMember(customerId: string): Promise<boolean> {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        phoneE164: true,
        email: true,
        referralCode: true,
        memberTier: true,
        status: true,
        salesplayCustomerId: true,
      },
    });
    if (!c || c.salesplayCustomerId || c.status === CustomerStatus.SUSPENDED) return true;
    const { ok, customerId: salesplayCustomerId } = await this.salesplay.pushCustomer({
      id: c.id,
      displayName: c.displayName,
      phoneE164: c.phoneE164,
      email: c.email,
      code: c.referralCode,
      memberTier: c.memberTier,
    });
    if (salesplayCustomerId) {
      await this.prisma.customer.update({
        where: { id: c.id },
        data: { salesplayCustomerId },
      });
    }
    if (ok) this.logger.log(`Member ${c.id} pushed to SalesPlay on retry.`);
    return ok;
  }

  /**
   * The queue lives in memory, so a restart would forget it. On boot, members
   * from the last day still missing a SalesPlay id are queued again.
   */
  private async requeueUnsyncedMembers(): Promise<void> {
    const rows = await this.prisma.customer.findMany({
      where: {
        salesplayCustomerId: null,
        status: { not: CustomerStatus.SUSPENDED },
        createdAt: { gte: new Date(Date.now() - BOOT_MEMBER_LOOKBACK_MS) },
      },
      select: { id: true },
      take: 200,
    });
    for (const r of rows) this.enqueueMemberPush(r.id);
  }

  // ── Transactions: light recent-window poll ────────────────────────────

  private scheduleReceipts(delayMs: number): void {
    if (this.stopped) return;
    this.receiptTimer = setTimeout(() => {
      void this.runTick().finally(() => {
        const base = this.intervalSec() * 1000;
        const delay =
          this.consecutiveFailures > 0
            ? Math.min(base * 2 ** this.consecutiveFailures, MAX_BACKOFF_MS)
            : base;
        this.scheduleReceipts(delay);
      });
    }, delayMs);
    // Never keep the process alive just for this timer.
    this.receiptTimer.unref?.();
  }

  /** One receipt pull. Public for tests; never throws. */
  async runTick(): Promise<void> {
    const startedAt = Date.now();
    this.tickCount++;
    try {
      const fromMs = Math.min(
        startedAt - MIN_WINDOW_MS,
        this.lastSuccessStartedAt !== null
          ? this.lastSuccessStartedAt - OVERLAP_MS
          : startedAt - BOOT_WINDOW_MS,
      );
      const fromDate = this.salesplay.formatSalesplayDateTime(new Date(fromMs));

      const receiptsOk = await this.pullWindow('receipts', fromDate);
      const notesOk =
        this.tickCount % CREDIT_NOTE_EVERY_N_TICKS === 0
          ? await this.pullWindow('credit_notes', fromDate)
          : true;

      if (receiptsOk && notesOk) {
        this.lastSuccessStartedAt = startedAt;
        this.consecutiveFailures = 0;
      } else {
        this.markFailure();
      }
    } catch (err) {
      this.markFailure();
      this.logger.error(
        `SalesPlay receipt sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private markFailure(): void {
    this.consecutiveFailures++;
    this.lastErrorAt = Date.now();
  }

  /** Pulls one resource for the window. Returns false when SalesPlay failed. */
  private async pullWindow(
    resource: 'receipts' | 'credit_notes',
    fromDate: string,
  ): Promise<boolean> {
    let cursor: string | null = null;
    let ingested = 0;
    for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
      const query = { cursor, fromDate, limit: LIVE_PAGE_SIZE };
      const result =
        resource === 'receipts'
          ? await this.salesplay.getReceiptsPage(query)
          : await this.salesplay.getCreditNotesPage(query);
      if (!result) return false;

      for (const raw of result.items) {
        try {
          const isNew =
            resource === 'receipts'
              ? await this.webhook.ingestReceipt(raw, 'PULL')
              : await this.webhook.ingestCreditNote(raw, 'PULL');
          if (isNew) ingested++;
        } catch (err) {
          this.logger.error(
            `Receipt sync ingest error (${resource}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    if (ingested > 0) {
      this.logger.log(`SalesPlay receipt sync: ${ingested} new ${resource}.`);
    }
    return true;
  }
}
