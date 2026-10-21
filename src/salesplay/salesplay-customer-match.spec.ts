import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ProductStockService } from '../orders/product-stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopCatalogService } from '../shop-catalog/shop-catalog.service';
import { phoneCandidates } from './salesplay-customer-match';
import { parseReceipt } from './salesplay-receipt.parser';
import { SalesplayWebhookService } from './salesplay-webhook.service';

describe('phoneCandidates', () => {
  it.each([
    ['012-345 6789', '+60123456789'],
    ['0123456789', '+60123456789'],
    ['60123456789', '+60123456789'],
    ['+60 12-345 6789', '+60123456789'],
  ])('reads %s as %s', (raw, e164) => {
    expect(phoneCandidates(raw, 'MY')).toContain(e164);
  });

  it('ignores blanks and short codes', () => {
    expect(phoneCandidates('', 'MY')).toEqual([]);
    expect(phoneCandidates('1000', 'MY')).toEqual([]);
  });
});

describe('receipt customer hints', () => {
  it('reads the buyer from a nested customer object', () => {
    const parsed = parseReceipt({
      receipt_number: '1-1',
      total_money: '10.00',
      customer: { id: '77', mobile: '0123456789' },
    });
    expect(parsed!.customerHints).toEqual({
      salesplayCustomerId: '77',
      phone: '0123456789',
    });
  });
});

describe('SalesplayWebhookService receipt linking', () => {
  const member = { id: 'm1', salesplayCustomerId: null as string | null };

  function make(receipts: { id: string; rawPayload: unknown }[], alreadyAwarded = false) {
    const customerUpdate = jest.fn(async () => ({}));
    const receiptUpdate = jest.fn(async () => ({}));
    const appendLedgerEntry = jest.fn(async () => ({ balanceAfter: 10 }));
    let served = false;
    const prisma = {
      customer: {
        // By SalesPlay id: unknown. By phone: the member.
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) =>
          'phoneE164' in q.where ? member : null,
        ),
        update: customerUpdate,
      },
      posReceipt: {
        findMany: jest.fn(async () => {
          if (served) return [];
          served = true;
          return receipts.map((r) => ({
            ...r,
            receiptNumber: r.id,
            salesplayReceiptId: r.id,
          }));
        }),
        update: receiptUpdate,
      },
      loyaltyLedgerEntry: {
        findFirst: jest.fn(async () => (alreadyAwarded ? { id: 'l1' } : null)),
      },
    } as unknown as PrismaService;
    const loyalty = {
      getWalletSummary: jest.fn(async () => ({ lifetimeEarnedPoints: 0, pointsBalance: 0 })),
      appendLedgerEntry,
    } as unknown as LoyaltyService;
    const audit = { log: jest.fn(async () => undefined) } as unknown as AuditService;
    const config = {
      get: (k: string) => (k === 'PHONE_DEFAULT_REGION' ? 'MY' : k === 'LOYALTY_POINTS_PER_RM' ? '1' : undefined),
    } as unknown as ConfigService;
    const service = new SalesplayWebhookService(
      config,
      prisma,
      loyalty,
      audit,
      {} as ShopCatalogService,
      {} as ProductStockService,
    );
    return { service, customerUpdate, receiptUpdate, appendLedgerEntry };
  }

  const sale = (id: string, extra: Record<string, unknown>) => ({
    id,
    rawPayload: { receipt_number: id, receipt_type: 'SALE', total_money: '25.90', ...extra },
  });

  it('previews without changing anything', async () => {
    const { service, customerUpdate, receiptUpdate, appendLedgerEntry } = make([
      sale('r1', { customer_id: '1000', customer_mobile: '012-345 6789' }),
    ]);
    const r = await service.relinkUnmatchedReceipts({ dryRun: true });
    expect(r).toMatchObject({ scanned: 1, linked: 1, pointsAwarded: 25 });
    expect(customerUpdate).not.toHaveBeenCalled();
    expect(receiptUpdate).not.toHaveBeenCalled();
    expect(appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('links by phone, learns the SalesPlay id and awards the missed points', async () => {
    const { service, customerUpdate, receiptUpdate, appendLedgerEntry } = make([
      sale('r1', { customer_id: '1000', customer_mobile: '012-345 6789' }),
    ]);
    const r = await service.relinkUnmatchedReceipts({ dryRun: false });
    expect(r).toMatchObject({ linked: 1, pointsAwarded: 25 });
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { salesplayCustomerId: '1000' },
    });
    expect(receiptUpdate).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { customerId: 'm1' } });
    expect(appendLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ deltaPoints: 25, referenceType: 'pos_receipt', referenceId: 'r1' }),
    );
  });

  it('never awards a receipt that already has points', async () => {
    const { service, appendLedgerEntry } = make(
      [sale('r1', { customer_mobile: '0123456789' })],
      true,
    );
    const r = await service.relinkUnmatchedReceipts({ dryRun: false });
    expect(r.linked).toBe(1);
    expect(r.pointsAwarded).toBe(0);
    expect(appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('reports walk-ins and customers it still cannot find', async () => {
    const { service } = make([
      sale('r1', {}),
      sale('r2', { customer_id: '2000' }),
      sale('r3', { customer_id: '2000' }),
    ]);
    const r = await service.relinkUnmatchedReceipts({ dryRun: true });
    expect(r.noCustomerOnReceipt).toBe(1);
    expect(r.stillUnmatched).toBe(2);
    expect(r.unmatchedExamples).toEqual([{ hint: '2000', receipts: 2, lastReceipt: 'r3' }]);
  });
});
