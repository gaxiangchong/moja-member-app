import { ConfigService } from '@nestjs/config';
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

const ENABLED = { SALESPLAY_ENABLED: '1', SALESPLAY_ACCESS_TOKEN: 'tok' };

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe('SalesplayService.getReceiptsPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns empty when SalesPlay is not configured (no API call)', async () => {
    const svc = new SalesplayService(configWith({}));
    global.fetch = jest.fn();
    expect(await svc.getReceiptsPage({})).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('extracts items and forward cursor from a { receipts, next_cursor } envelope', async () => {
    mockFetchOnce({
      receipts: [{ receipt_id: 'R1' }, { receipt_id: 'R2' }],
      next_cursor: 'CURSOR-2',
    });
    const svc = new SalesplayService(configWith(ENABLED));
    const page = await svc.getReceiptsPage({});
    expect(page).toEqual({
      items: [{ receipt_id: 'R1' }, { receipt_id: 'R2' }],
      nextCursor: 'CURSOR-2',
    });
  });

  it('handles a { success: { receipts }, paging: { next } } envelope', async () => {
    mockFetchOnce({
      success: { receipts: [{ receipt_id: 'R3' }] },
      paging: { next: 'C3' },
    });
    const svc = new SalesplayService(configWith(ENABLED));
    const page = await svc.getReceiptsPage({});
    expect(page?.items).toHaveLength(1);
    expect(page?.nextCursor).toBe('C3');
  });

  it('treats a missing cursor as the last page', async () => {
    mockFetchOnce({ receipts: [{ receipt_id: 'R4' }] });
    const svc = new SalesplayService(configWith(ENABLED));
    const page = await svc.getReceiptsPage({});
    expect(page?.nextCursor).toBeNull();
  });

  it('returns null (not throw) on an HTTP error', async () => {
    mockFetchOnce({ error: 'nope' }, false, 500);
    const svc = new SalesplayService(configWith(ENABLED));
    expect(await svc.getReceiptsPage({})).toBeNull();
  });

  it('sends limit, cursor, and date params on the request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ receipts: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new SalesplayService(
      configWith({ ...ENABLED, SALESPLAY_SHOP_ID: 'SHOP-9' }),
    );
    await svc.getReceiptsPage({ cursor: 'CUR', fromDate: '2026-01-01', limit: 100 });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/receipts');
    expect(calledUrl).toContain('limit=100');
    expect(calledUrl).toContain('cursor=CUR');
    expect(calledUrl).toContain('date_from=2026-01-01');
    expect(calledUrl).toContain('shop_id=SHOP-9');
  });
});
