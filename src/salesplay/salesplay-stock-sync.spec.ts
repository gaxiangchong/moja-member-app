import { SalesplayWebhookService } from './salesplay-webhook.service';

const index = new Map([
  ['30002-105', { productId: 'strawberry-shortcake', variantLabel: '6 inch' }],
  ['30002-106', { productId: 'strawberry-shortcake', variantLabel: '8 inch' }],
  ['30002-107', { productId: 'strawberry-shortcake', variantLabel: 'Slice' }],
  ['60003', { productId: 'brownie', variantLabel: null }],
]);

const DAY = new Date('2026-11-03T00:00:00.000Z');

function makeService(receipt: unknown = null) {
  const decrementForPosSale = jest.fn().mockResolvedValue(undefined);
  const restockForPosRefund = jest.fn().mockResolvedValue(undefined);
  const svc = Object.create(SalesplayWebhookService.prototype) as Record<
    string,
    unknown
  >;
  svc.logger = { log: jest.fn(), error: jest.fn() };
  svc.shopCatalog = { salesplayCodeIndex: () => Promise.resolve(index) };
  svc.productStock = { decrementForPosSale, restockForPosRefund };
  svc.prisma = {
    posReceipt: { findUnique: jest.fn().mockResolvedValue(receipt) },
  };
  const call = (method: string, ...args: unknown[]) =>
    (svc[method] as (...a: unknown[]) => Promise<void>).apply(
      svc,
      args,
    ) as Promise<void>;
  return { call, decrementForPosSale, restockForPosRefund };
}

describe('SalesPlay till sales and kitchen stock per size', () => {
  it('takes each line off its own size', async () => {
    const { call, decrementForPosSale } = makeService();
    await call(
      'maybeDecrementStock',
      {
        salesplayReceiptId: 'r1',
        isDeleted: false,
        receiptType: 'SALE',
        businessDate: DAY,
        lines: [
          { productCode: '30002-105', qty: 1 },
          { productCode: '30002-107', qty: 2 },
          { productCode: '30002-107', qty: 1 },
          { productCode: '60003', qty: 1 },
          { productCode: 'DRINK-1', qty: 4 },
        ],
      },
      null,
    );
    expect(decrementForPosSale).toHaveBeenCalledWith(
      [
        { productId: 'strawberry-shortcake', variantLabel: '6 inch', qty: 1 },
        { productId: 'strawberry-shortcake', variantLabel: 'Slice', qty: 3 },
        { productId: 'brownie', variantLabel: '', qty: 1 },
      ],
      '2026-11-03',
    );
  });

  it('puts stock back for a full refund on the same day', async () => {
    const { call, restockForPosRefund } = makeService({
      netCents: 12800,
      businessDate: DAY,
      originOnlineOrderId: null,
      lines: [{ productCode: '30002-106', qty: 1 }],
    });
    await call('maybeRestockForRefund', {
      salesplayCreditNoteId: 'cn1',
      salesplayReceiptId: 'r1',
      businessDate: DAY,
      amountCents: 12800,
    });
    expect(restockForPosRefund).toHaveBeenCalledWith(
      [{ productId: 'strawberry-shortcake', variantLabel: '8 inch', qty: 1 }],
      '2026-11-03',
    );
  });

  it('leaves stock alone for a partial or next-day refund', async () => {
    const receipt = {
      netCents: 12800,
      businessDate: DAY,
      originOnlineOrderId: null,
      lines: [{ productCode: '30002-106', qty: 1 }],
    };
    const partial = makeService(receipt);
    await partial.call('maybeRestockForRefund', {
      salesplayCreditNoteId: 'cn1',
      salesplayReceiptId: 'r1',
      businessDate: DAY,
      amountCents: 5000,
    });
    expect(partial.restockForPosRefund).not.toHaveBeenCalled();

    const nextDay = makeService(receipt);
    await nextDay.call('maybeRestockForRefund', {
      salesplayCreditNoteId: 'cn2',
      salesplayReceiptId: 'r1',
      businessDate: new Date('2026-11-04T00:00:00.000Z'),
      amountCents: 12800,
    });
    expect(nextDay.restockForPosRefund).not.toHaveBeenCalled();
  });
});
