import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';

/** Resource key used for the receipts row in salesplay_sync_state. */
const RECEIPTS_RESOURCE = 'receipts';
const CREDIT_NOTES_RESOURCE = 'credit_notes';

/** How often the reconcile scheduler wakes to check whether a pull is due. */
const RECONCILE_POLL_MS = 60 * 60 * 1000; // hourly
/** Safety cap on pages per run so a bad cursor can never loop forever. */
const MAX_PAGES_PER_RUN = 500;

export type PullSummary = {
  resource: string;
  pagesFetched: number;
  itemsSeen: number;
  itemsIngested: number;
  stoppedReason: 'exhausted' | 'page_cap' | 'not_configured' | 'fetch_error';
};

export type PosSyncHealth = {
  configured: boolean;
  pullEnabled: boolean;
  reconcileEnabled: boolean;
  lastWebhookAt: string | null;
  lastPulledAt: string | null;
  receiptsToday: number;
  creditNotesToday: number;
  unmatchedReceiptsToday: number;
  onlineSettlementReceiptsToday: number;
  totalReceipts: number;
};

/**
 * Pulls SalesPlay receipts / credit notes over the REST API to (a) backfill
 * history and (b) reconcile nightly so any webhook SalesPlay failed to deliver
 * is still captured. Webhooks remain the primary, real-time path; this is the
 * integrity net.
 *
 * All ingestion routes through {@link SalesplayWebhookService.ingestReceipt} /
 * `ingestCreditNote`, which are idempotent by SalesPlay id, so pull and webhook
 * can overlap freely without double-counting.
 *
 * Enabled independently of webhooks via `SALESPLAY_PULL_ENABLED` (backfill /
 * manual) and `SALESPLAY_RECONCILE_ENABLED` (the scheduled loop). Both default
 * off so nothing calls the SalesPlay API until deliberately switched on.
 */
@Injectable()
export class SalesplayPullService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesplayPullService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly salesplay: SalesplayService,
    private readonly webhook: SalesplayWebhookService,
    private readonly reportingSettings: ReportingSettingsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    if (!this.reconcileEnabled()) return;
    this.reconcileTimer = setInterval(() => {
      void this.runReconcileIfDue().catch((err) => {
        this.logger.error(
          `SalesPlay reconcile tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, RECONCILE_POLL_MS);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  private flagOn(name: string): boolean {
    const v = this.config.get<string>(name);
    return ['1', 'true', 'on', 'yes'].includes(String(v ?? '').toLowerCase());
  }

  pullEnabled(): boolean {
    return this.flagOn('SALESPLAY_PULL_ENABLED');
  }

  reconcileEnabled(): boolean {
    return this.flagOn('SALESPLAY_RECONCILE_ENABLED');
  }

  private reconcileIntervalHours(): number {
    const n = Number(this.config.get<string>('SALESPLAY_RECONCILE_INTERVAL_HOURS'));
    return Number.isFinite(n) && n > 0 ? n : 24;
  }

  /** Nightly reconcile: run only if enough time has passed since the last pull. */
  private async runReconcileIfDue(): Promise<void> {
    if (!this.reconcileEnabled() || this.running) return;
    const state = await this.prisma.salesplaySyncState.findUnique({
      where: { resource: RECEIPTS_RESOURCE },
      select: { lastPulledAt: true },
    });
    const last = state?.lastPulledAt?.getTime() ?? 0;
    const dueMs = this.reconcileIntervalHours() * 60 * 60 * 1000;
    if (Date.now() - last < dueMs) return;
    this.logger.log('SalesPlay reconcile is due; pulling recent records.');
    await this.reconcile();
  }

  /**
   * Reconciliation pull: fetch recent records (a lookback window, not the full
   * cursor) and ingest any the webhooks missed. Cheap and idempotent.
   */
  async reconcile(): Promise<{ receipts: PullSummary; creditNotes: PullSummary }> {
    const lookbackDays = this.reconcileLookbackDays();
    const fromDate = salesplayFromDateTime(
      new Date(Date.now() - lookbackDays * 86_400_000),
    );
    const receipts = await this.pullReceipts({ fromDate, persistCursor: false });
    const creditNotes = await this.pullCreditNotes({ fromDate });
    return { receipts, creditNotes };
  }

  private reconcileLookbackDays(): number {
    const n = Number(this.config.get<string>('SALESPLAY_RECONCILE_LOOKBACK_DAYS'));
    return Number.isFinite(n) && n > 0 ? n : 3;
  }

  /**
   * One-time historical backfill. Walks receipts (and credit notes) from the
   * sales reporting cutoff (`salesStartDate`) — or `SALESPLAY_BACKFILL_FROM` if
   * set — persisting the receipts cursor so it can resume.
   */
  async backfill(): Promise<{ receipts: PullSummary; creditNotes: PullSummary }> {
    const fromDate = this.backfillFromDate();
    this.logger.log(
      `SalesPlay backfill starting from ${fromDate ?? '(no cutoff — full history)'}.`,
    );
    const receipts = await this.pullReceipts({ fromDate, persistCursor: true });
    const creditNotes = await this.pullCreditNotes({ fromDate });
    return { receipts, creditNotes };
  }

  private backfillFromDate(): string | null {
    const override = this.config.get<string>('SALESPLAY_BACKFILL_FROM')?.trim();
    if (override) return `${override.slice(0, 10)} 00:00:00`;
    const cutoff = this.reportingSettings.getSalesStartDate();
    return cutoff ? salesplayFromDateTime(cutoff) : null;
  }

  private async pullReceipts(opts: {
    fromDate: string | null;
    persistCursor: boolean;
  }): Promise<PullSummary> {
    return this.pullResource(RECEIPTS_RESOURCE, opts, (raw) =>
      this.webhook.ingestReceipt(raw, 'PULL'),
    );
  }

  private async pullCreditNotes(opts: {
    fromDate: string | null;
  }): Promise<PullSummary> {
    // SalesPlay API v1.0 has no GET /credit_notes endpoint (the docs list only
    // the credit_note.update webhook), so pulling it just 404s. Off unless the
    // flag is set — flip it on if SalesPlay ever ships the endpoint.
    if (!this.flagOn('SALESPLAY_PULL_CREDIT_NOTES_ENABLED')) {
      return {
        resource: CREDIT_NOTES_RESOURCE,
        pagesFetched: 0,
        itemsSeen: 0,
        itemsIngested: 0,
        stoppedReason: 'not_configured',
      };
    }
    return this.pullResource(
      CREDIT_NOTES_RESOURCE,
      { ...opts, persistCursor: false },
      (raw) => this.webhook.ingestCreditNote(raw, 'PULL'),
    );
  }

  /**
   * Generic paginated pull for one resource. `ingest` returns true when the
   * record was newly stored. Guarded so overlapping runs cannot stack.
   */
  private async pullResource(
    resource: string,
    opts: { fromDate: string | null; persistCursor: boolean },
    ingest: (raw: unknown) => Promise<boolean>,
  ): Promise<PullSummary> {
    const summary: PullSummary = {
      resource,
      pagesFetched: 0,
      itemsSeen: 0,
      itemsIngested: 0,
      stoppedReason: 'exhausted',
    };

    if (!this.salesplay.isConfigured()) {
      summary.stoppedReason = 'not_configured';
      return summary;
    }
    if (this.running) return summary;
    this.running = true;
    try {
      let cursor: string | null = opts.persistCursor
        ? await this.loadCursor(resource)
        : null;

      for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
        const result =
          resource === CREDIT_NOTES_RESOURCE
            ? await this.salesplay.getCreditNotesPage({
                cursor,
                fromDate: opts.fromDate,
              })
            : await this.salesplay.getReceiptsPage({
                cursor,
                fromDate: opts.fromDate,
              });

        if (!result) {
          summary.stoppedReason = 'fetch_error';
          break;
        }
        summary.pagesFetched++;
        summary.itemsSeen += result.items.length;

        for (const raw of result.items) {
          try {
            if (await ingest(raw)) summary.itemsIngested++;
          } catch (err) {
            this.logger.error(
              `Pull ingest error (${resource}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        cursor = result.nextCursor;
        if (opts.persistCursor) await this.saveCursor(resource, cursor);
        if (!cursor) break;
        if (page === MAX_PAGES_PER_RUN - 1) summary.stoppedReason = 'page_cap';
      }

      await this.markPulled(resource);
      this.logger.log(
        `SalesPlay pull ${resource}: ${summary.itemsIngested} new / ${summary.itemsSeen} seen across ${summary.pagesFetched} page(s) (${summary.stoppedReason}).`,
      );
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async loadCursor(resource: string): Promise<string | null> {
    const row = await this.prisma.salesplaySyncState.findUnique({
      where: { resource },
      select: { cursor: true },
    });
    return row?.cursor ?? null;
  }

  private async saveCursor(resource: string, cursor: string | null): Promise<void> {
    await this.prisma.salesplaySyncState.upsert({
      where: { resource },
      create: { resource, cursor },
      update: { cursor },
    });
  }

  private async markPulled(resource: string): Promise<void> {
    await this.prisma.salesplaySyncState.upsert({
      where: { resource },
      create: { resource, lastPulledAt: new Date() },
      update: { lastPulledAt: new Date() },
    });
  }

  /** Data for the admin sync-health panel. */
  async getSyncHealth(): Promise<PosSyncHealth> {
    const [receiptState, todayStart] = [
      await this.prisma.salesplaySyncState.findUnique({
        where: { resource: RECEIPTS_RESOURCE },
        select: { lastWebhookAt: true, lastPulledAt: true },
      }),
      startOfTodayMyt(),
    ];

    const [
      receiptsToday,
      creditNotesToday,
      unmatchedReceiptsToday,
      onlineSettlementReceiptsToday,
      totalReceipts,
    ] = await Promise.all([
      this.prisma.posReceipt.count({ where: { businessDate: { gte: todayStart } } }),
      this.prisma.posCreditNote.count({
        where: { businessDate: { gte: todayStart } },
      }),
      this.prisma.posReceipt.count({
        where: {
          businessDate: { gte: todayStart },
          customerId: null,
          originOnlineOrderId: null,
        },
      }),
      this.prisma.posReceipt.count({
        where: {
          businessDate: { gte: todayStart },
          originOnlineOrderId: { not: null },
        },
      }),
      this.prisma.posReceipt.count(),
    ]);

    return {
      configured: this.salesplay.isConfigured(),
      pullEnabled: this.pullEnabled(),
      reconcileEnabled: this.reconcileEnabled(),
      lastWebhookAt: receiptState?.lastWebhookAt?.toISOString() ?? null,
      lastPulledAt: receiptState?.lastPulledAt?.toISOString() ?? null,
      receiptsToday,
      creditNotesToday,
      unmatchedReceiptsToday,
      onlineSettlementReceiptsToday,
      totalReceipts,
    };
  }
}

/**
 * "YYYY-MM-DD 00:00:00" for a Date (UTC calendar day) — SalesPlay's
 * created_at_min filter requires the full `Y-m-d H:i:s` 24-hour format.
 */
function salesplayFromDateTime(d: Date): string {
  return `${d.toISOString().slice(0, 10)} 00:00:00`;
}

/** UTC-midnight Date for the current Asia/Kuala_Lumpur calendar day. */
function startOfTodayMyt(): Date {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}
