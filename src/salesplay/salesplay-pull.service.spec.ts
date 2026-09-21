import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';
import { SalesplayPullService } from './salesplay-pull.service';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (k: string) => values[k],
  } as unknown as ConfigService;
}

describe('SalesplayPullService.pullReceipts', () => {
  afterEach(() => jest.restoreAllMocks());

  function build(opts: {
    getReceiptsPage: jest.Mock;
    markPulled?: jest.Mock;
    upsert?: jest.Mock;
  }) {
    const upsert = opts.upsert ?? jest.fn().mockResolvedValue({});
    const prisma = {
      salesplaySyncState: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    } as unknown as PrismaService;
    const salesplay = {
      isConfigured: () => true,
      getReceiptsPage: opts.getReceiptsPage,
      getCreditNotesPage: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as SalesplayService;
    const webhook = {
      ingestReceipt: jest.fn().mockResolvedValue(false),
      ingestCreditNote: jest.fn().mockResolvedValue(false),
    } as unknown as SalesplayWebhookService;
    const reporting = {
      getSalesStartDate: () => null,
    } as unknown as ReportingSettingsService;

    const svc = new SalesplayPullService(
      configWith({ SALESPLAY_PULL_CREDIT_NOTES_ENABLED: '0' }),
      prisma,
      salesplay,
      webhook,
      reporting,
    );
    return { svc, upsert, webhook };
  }

  it('does not stamp lastPulledAt when the first page fetch fails', async () => {
    const { svc, upsert } = build({
      getReceiptsPage: jest.fn().mockResolvedValue(null),
    });

    const summary = await (
      svc as unknown as {
        pullReceipts: (o: {
          fromDate: string | null;
          persistCursor: boolean;
        }) => Promise<{ stoppedReason: string; pagesFetched: number }>;
      }
    ).pullReceipts({ fromDate: '2026-07-01 00:00:00', persistCursor: false });

    expect(summary.stoppedReason).toBe('fetch_error');
    expect(summary.pagesFetched).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stamps lastPulledAt after a successful exhausted pull', async () => {
    const { svc, upsert } = build({
      getReceiptsPage: jest.fn().mockResolvedValue({
        items: [{ receipt_id: 'R1' }],
        nextCursor: null,
      }),
    });

    const summary = await (
      svc as unknown as {
        pullReceipts: (o: {
          fromDate: string | null;
          persistCursor: boolean;
        }) => Promise<{ stoppedReason: string; pagesFetched: number }>;
      }
    ).pullReceipts({ fromDate: '2026-07-01 00:00:00', persistCursor: false });

    expect(summary.stoppedReason).toBe('exhausted');
    expect(summary.pagesFetched).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resource: 'receipts' },
        update: expect.objectContaining({ lastPulledAt: expect.any(Date) }),
      }),
    );
  });
});
