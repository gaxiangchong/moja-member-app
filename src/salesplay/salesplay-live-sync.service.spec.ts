import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayLiveSyncService } from './salesplay-live-sync.service';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

const member = {
  id: 'c1',
  displayName: 'Ana',
  phoneE164: '+60123456789',
  email: null,
  referralCode: 'R1',
  memberTier: 'silver',
  status: 'ACTIVE',
  salesplayCustomerId: null as string | null,
};

function makeService(opts: {
  env?: Record<string, string>;
  pages?: ({ items: unknown[]; nextCursor: string | null } | null)[];
  pushResults?: { ok: boolean; customerId: string | null }[];
  customer?: typeof member | null;
}) {
  const pages = [...(opts.pages ?? [{ items: [], nextCursor: null }])];
  const getReceiptsPage = jest.fn(async () =>
    pages.length > 1 ? pages.shift()! : pages[0],
  );
  const pushResults = [...(opts.pushResults ?? [{ ok: true, customerId: 'sp-1' }])];
  const pushCustomer = jest.fn(async () =>
    pushResults.length > 1 ? pushResults.shift()! : pushResults[0],
  );
  const salesplay = {
    isConfigured: () => true,
    getReceiptsPage,
    getCreditNotesPage: jest.fn(async () => ({ items: [], nextCursor: null })),
    pushCustomer,
    formatSalesplayDateTime: (d: Date) => d.toISOString(),
  } as unknown as SalesplayService;
  const ingestReceipt = jest.fn(async () => true);
  const webhook = {
    ingestReceipt,
    ingestCreditNote: jest.fn(async () => true),
  } as unknown as SalesplayWebhookService;
  const update = jest.fn(async () => ({}));
  const prisma = {
    customer: {
      findUnique: jest.fn(async () =>
        opts.customer === undefined ? { ...member } : opts.customer,
      ),
      findMany: jest.fn(async () => []),
      update,
    },
  } as unknown as PrismaService;
  const service = new SalesplayLiveSyncService(
    configWith(opts.env ?? { SALESPLAY_LIVE_SYNC_ENABLED: 'true' }),
    prisma,
    salesplay,
    webhook,
  );
  return { service, getReceiptsPage, ingestReceipt, pushCustomer, update };
}

/** Make every queued member due now, then run one retry pass. */
async function retryNow(service: SalesplayLiveSyncService) {
  const queue = (service as unknown as {
    pendingMembers: Map<string, { nextAt: number }>;
  }).pendingMembers;
  for (const s of queue.values()) s.nextAt = 0;
  await service.runMemberRetries();
}

describe('SalesplayLiveSyncService', () => {
  afterEach(() => jest.useRealTimers());

  describe('receipt sync interval', () => {
    it('defaults to 2 minutes', () => {
      expect(makeService({}).service.intervalSec()).toBe(120);
    });

    it('is clamped to 1–5 minutes', () => {
      const fast = makeService({ env: { SALESPLAY_LIVE_SYNC_INTERVAL_SEC: '5' } });
      expect(fast.service.intervalSec()).toBe(60);
      const slow = makeService({ env: { SALESPLAY_LIVE_SYNC_INTERVAL_SEC: '900' } });
      expect(slow.service.intervalSec()).toBe(300);
    });
  });

  describe('receipts', () => {
    it('only reads a short recent window, never the full history', async () => {
      const { service, getReceiptsPage } = makeService({});
      const before = Date.now();
      await service.runTick();
      const first = (getReceiptsPage.mock.calls[0] as unknown[])[0] as { fromDate: string };
      expect(before - new Date(first.fromDate).getTime()).toBeLessThan(31 * 60 * 1000);

      await service.runTick();
      const next = (getReceiptsPage.mock.calls[1] as unknown[])[0] as { fromDate: string };
      expect(Date.now() - new Date(next.fromDate).getTime()).toBeLessThan(16 * 60 * 1000);
    });

    it('ingests every receipt across pages', async () => {
      const { service, ingestReceipt } = makeService({
        pages: [
          { items: [{ id: 1 }, { id: 2 }], nextCursor: 'c' },
          { items: [{ id: 3 }], nextCursor: null },
        ],
      });
      await service.runTick();
      expect(ingestReceipt).toHaveBeenCalledTimes(3);
      expect(service.getStatus().consecutiveFailures).toBe(0);
    });

    it('counts a SalesPlay failure so the poll backs off', async () => {
      const { service } = makeService({ pages: [null] });
      await service.runTick();
      await service.runTick();
      expect(service.getStatus().consecutiveFailures).toBe(2);
    });
  });

  describe('member pushes', () => {
    it('does nothing until a push fails', async () => {
      const { service, pushCustomer } = makeService({});
      await service.runMemberRetries();
      expect(pushCustomer).not.toHaveBeenCalled();
      expect(service.getStatus().membersPendingPush).toBe(0);
    });

    it('retries a failed member and stores the SalesPlay id', async () => {
      jest.useFakeTimers();
      const { service, pushCustomer, update } = makeService({});
      service.enqueueMemberPush('c1');
      expect(service.getStatus().membersPendingPush).toBe(1);

      await retryNow(service);
      expect(pushCustomer).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { salesplayCustomerId: 'sp-1' },
      });
      expect(service.getStatus().membersPendingPush).toBe(0);
      service.onModuleDestroy();
    });

    it('waits a minute between tries and gives up after 10', async () => {
      jest.useFakeTimers();
      const { service, pushCustomer } = makeService({
        pushResults: [{ ok: false, customerId: null }],
      });
      service.enqueueMemberPush('c1');
      await service.runMemberRetries(); // not due yet
      expect(pushCustomer).not.toHaveBeenCalled();

      for (let i = 0; i < 12; i++) await retryNow(service);
      expect(pushCustomer).toHaveBeenCalledTimes(10);
      expect(service.getStatus().membersPendingPush).toBe(0);
      service.onModuleDestroy();
    });

    it('drops a member who already reached SalesPlay another way', async () => {
      jest.useFakeTimers();
      const { service, pushCustomer } = makeService({
        customer: { ...member, salesplayCustomerId: 'sp-9' },
      });
      service.enqueueMemberPush('c1');
      await retryNow(service);
      expect(pushCustomer).not.toHaveBeenCalled();
      expect(service.getStatus().membersPendingPush).toBe(0);
      service.onModuleDestroy();
    });
  });
});
