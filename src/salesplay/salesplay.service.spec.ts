import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SalesplayService } from './salesplay.service';

/** Minimal ConfigService backed by a plain map. */
function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (values[k] == null) throw new Error(`missing ${k}`);
      return values[k];
    },
  } as unknown as ConfigService;
}

/** Prisma stub — these tests use the static-token path, which never hits it. */
const prismaStub = {
  appSetting: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(null),
  },
} as unknown as PrismaService;

const ENABLED = { SALESPLAY_ENABLED: '1', SALESPLAY_ACCESS_TOKEN: 'tok' };

/**
 * Stubs the GET-with-JSON-body transport. SalesPlay reads list filters from a
 * raw JSON body on GET requests (per its official Postman collection), so the
 * service bypasses fetch() — tests hook the transport method instead.
 */
function mockTransport(
  svc: SalesplayService,
  body: unknown,
  status = 200,
): jest.SpyInstance {
  return jest
    .spyOn(
      svc as unknown as {
        getWithJsonBody: (
          ...args: unknown[]
        ) => Promise<{ status: number; text: string }>;
      },
      'getWithJsonBody',
    )
    .mockResolvedValue({ status, text: JSON.stringify(body) });
}

describe('SalesplayService.getReceiptsPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns empty when SalesPlay is not configured (no API call)', async () => {
    const svc = new SalesplayService(configWith({}), prismaStub);
    const spy = mockTransport(svc, {});
    expect(await svc.getReceiptsPage({})).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('extracts items and forward cursor from a { receipts, next_cursor } envelope', async () => {
    const svc = new SalesplayService(configWith(ENABLED), prismaStub);
    mockTransport(svc, {
      receipts: [{ receipt_id: 'R1' }, { receipt_id: 'R2' }],
      next_cursor: 'CURSOR-2',
    });
    const page = await svc.getReceiptsPage({});
    expect(page).toEqual({
      items: [{ receipt_id: 'R1' }, { receipt_id: 'R2' }],
      nextCursor: 'CURSOR-2',
    });
  });

  it('handles a { success: { receipts }, paging: { next } } envelope', async () => {
    const svc = new SalesplayService(configWith(ENABLED), prismaStub);
    mockTransport(svc, {
      success: { receipts: [{ receipt_id: 'R3' }] },
      paging: { next: 'C3' },
    });
    const page = await svc.getReceiptsPage({});
    expect(page?.items).toHaveLength(1);
    expect(page?.nextCursor).toBe('C3');
  });

  it('treats a missing cursor as the last page', async () => {
    const svc = new SalesplayService(configWith(ENABLED), prismaStub);
    mockTransport(svc, { receipts: [{ receipt_id: 'R4' }] });
    const page = await svc.getReceiptsPage({});
    expect(page?.nextCursor).toBeNull();
  });

  it('returns null (not throw) on an HTTP error', async () => {
    const svc = new SalesplayService(configWith(ENABLED), prismaStub);
    mockTransport(svc, { error: 'nope' }, 500);
    expect(await svc.getReceiptsPage({})).toBeNull();
  });

  it('sends the filters in the JSON body of the request', async () => {
    const svc = new SalesplayService(
      configWith({ ...ENABLED, SALESPLAY_SHOP_ID: 'SHOP-9' }),
      prismaStub,
    );
    const spy = mockTransport(svc, { receipts: [] });
    await svc.getReceiptsPage({
      cursor: 'CUR',
      fromDate: '2026-01-01 00:00:00',
      limit: 100,
    });
    const [url, , body] = spy.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
    ];
    expect(url).toContain('/receipts');
    expect(body.limit).toBe('100');
    expect(body.cursor).toBe('CUR');
    expect(body.created_at_min).toBe('2026-01-01 00:00:00');
    expect(body.shop_id).toBe('SHOP-9');
    expect(typeof body.created_at_max).toBe('string');
  });

  it('pulls credit notes from /credit_note_and_refund', async () => {
    const svc = new SalesplayService(configWith(ENABLED), prismaStub);
    const spy = mockTransport(svc, { credit_notes: [] });
    await svc.getCreditNotesPage({});
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain('/credit_note_and_refund');
  });
});

describe('SalesplayService.pushOnlineOrder', () => {
  afterEach(() => jest.restoreAllMocks());

  const ONLINE_ENABLED = { ...ENABLED, SALESPLAY_SHOP_ID: 'SHOP-1' };

  const orderInput = (
    lines: {
      productId: string;
      salesplayProductCode?: string | null;
    }[],
  ) => ({
    orderId: 'order-1',
    orderNumber: 1001,
    totalCents: 16800,
    placedAt: new Date('2026-07-01T04:00:00Z'),
    fulfillmentSummaryLines: [],
    lines: lines.map((l) => ({
      productId: l.productId,
      name: 'Burnt Basque Cheesecake',
      variantLabel: null,
      unitPriceCents: 16800,
      qty: 1,
      salesplayProductCode: l.salesplayProductCode,
    })),
    customer: { displayName: 'Test Member', phoneE164: '+60123456789', email: null },
  });

  function mockFetch() {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ success: { system_unique_id: 'SP-1' } }),
    } as unknown as Response);
    return spy;
  }

  it('sends the mapped SalesPlay product code as product_code', async () => {
    const svc = new SalesplayService(configWith(ONLINE_ENABLED), prismaStub);
    const spy = mockFetch();
    await svc.pushOnlineOrder(
      orderInput([{ productId: 'wc-basque', salesplayProductCode: 'SP-BASQUE' }]),
    );
    const payload = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(payload.order_items[0].product_code).toBe('SP-BASQUE');
  });

  it('falls back to the catalog product id when no SalesPlay code is mapped', async () => {
    const svc = new SalesplayService(configWith(ONLINE_ENABLED), prismaStub);
    const spy = mockFetch();
    await svc.pushOnlineOrder(
      orderInput([{ productId: 'wc-basque', salesplayProductCode: null }]),
    );
    const payload = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(payload.order_items[0].product_code).toBe('wc-basque');
  });
});
