import type { PrismaService } from '../prisma/prisma.service';
import type { ReportingSettingsService } from './reporting-settings.service';
import { FinanceReportService } from './finance-report.service';
import type { UnifiedTransactionsResult } from './finance-report.types';

function makeService(queryRaw: jest.Mock) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const reporting = {
    getSalesStartDate: () => null,
  } as unknown as ReportingSettingsService;
  return new FinanceReportService(prisma, reporting);
}

describe('FinanceReportService.unifiedTransactionsToCsv', () => {
  it('emits a header and one row per transaction, escaping commas', () => {
    const svc = makeService(jest.fn());
    const payload: UnifiedTransactionsResult = {
      meta: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
        generatedAt: '2026-07-08T00:00:00.000Z',
        page: 1,
        pageSize: 50,
        total: 2,
        totalPages: 1,
      },
      totalsInFilter: { amountCents: 6000, count: 2 },
      transactions: [
        {
          channel: 'pos',
          id: 'r1',
          occurredAt: '2026-06-10T02:00:00.000Z',
          amountCents: 4590,
          paymentMethod: 'Cash',
          reference: '1001',
          customerId: null,
          customerName: null,
          customerPhone: null,
        },
        {
          channel: 'online_shop',
          id: 'o1',
          occurredAt: '2026-06-11T02:00:00.000Z',
          amountCents: 1410,
          paymentMethod: null,
          reference: '42',
          customerId: 'c1',
          customerName: 'Tan, Ah Kow',
          customerPhone: '+60123456789',
        },
      ],
    };
    const csv = svc.unifiedTransactionsToCsv(payload);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'channel,occurredAt,amountCents,paymentMethod,reference,customerId,customerName,customerPhone',
    );
    expect(lines[1]).toContain('pos,2026-06-10T02:00:00.000Z,4590,Cash,1001');
    // Name with a comma must be quoted.
    expect(lines[2]).toContain('"Tan, Ah Kow"');
  });
});

describe('FinanceReportService.getUnifiedTransactions', () => {
  it('maps rows and computes pagination meta', async () => {
    const rows = [
      {
        channel: 'pos',
        id: 'r1',
        occurred_at: new Date('2026-06-10T02:00:00.000Z'),
        amount_cents: 4590,
        payment_method: 'Cash',
        reference: '1001',
        customer_id: null,
        display_name: null,
        phone_e164: null,
      },
    ];
    const totals = [{ cnt: 3n, total: 12000n }];
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(totals);
    const svc = makeService(queryRaw);

    const result = await svc.getUnifiedTransactions({
      from: '2026-06-01',
      to: '2026-07-01',
      pageSize: 2,
      page: 1,
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      channel: 'pos',
      amountCents: 4590,
      paymentMethod: 'Cash',
    });
    expect(result.meta.total).toBe(3);
    expect(result.meta.totalPages).toBe(2); // ceil(3 / 2)
    expect(result.totalsInFilter).toEqual({ amountCents: 12000, count: 3 });
  });

  it('rejects an inverted date range', async () => {
    const svc = makeService(jest.fn());
    await expect(
      svc.getUnifiedTransactions({ from: '2026-07-01', to: '2026-06-01' }),
    ).rejects.toThrow();
  });
});
