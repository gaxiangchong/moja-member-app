import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuditService } from '../audit/audit.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';

function configWith(values: Record<string, string> = {}): ConfigService {
  return {
    get: (k: string) => values[k],
  } as unknown as ConfigService;
}

describe('SalesplayWebhookService.ingestReceipt', () => {
  afterEach(() => jest.restoreAllMocks());

  function build(prismaPart: {
    posReceipt?: Record<string, unknown>;
    loyaltyLedgerEntry?: Record<string, unknown>;
  } = {}) {
    const prisma = {
      posReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        ...(prismaPart.posReceipt ?? {}),
      },
      loyaltyLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        ...(prismaPart.loyaltyLedgerEntry ?? {}),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const loyalty = {
      appendLedgerEntry: jest.fn().mockResolvedValue({ balanceAfter: 0 }),
    } as unknown as LoyaltyService;
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const svc = new SalesplayWebhookService(
      configWith({ LOYALTY_POINTS_PER_RM: '1' }),
      prisma,
      loyalty,
      audit,
    );
    return { svc, prisma, loyalty, audit };
  }

  const salePayload = {
    receipt_id: 'SP-1',
    receipt_type: 'SALE',
    receipt_delete_status: false,
    total_money: 25.5,
    line_products: [{ product_name: 'Cake', product_qty: 1, product_unit_price: 25.5 }],
  };

  it('does not persist a deleted receipt on first sight', async () => {
    const { svc, prisma } = build({});
    const created = await svc.ingestReceipt(
      { ...salePayload, receipt_delete_status: true },
      'WEBHOOK',
    );
    expect(created).toBe(false);
    expect(
      (prisma as unknown as { posReceipt: { create: jest.Mock } }).posReceipt
        .create,
    ).not.toHaveBeenCalled();
  });

  it('does not persist an explicit REFUND receipt type', async () => {
    const { svc, prisma } = build({});
    const created = await svc.ingestReceipt(
      { ...salePayload, receipt_type: 'REFUND' },
      'PULL',
    );
    expect(created).toBe(false);
    expect(
      (prisma as unknown as { posReceipt: { create: jest.Mock } }).posReceipt
        .create,
    ).not.toHaveBeenCalled();
  });

  it('removes a previously ingested sale when a later delete arrives', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'rcpt-uuid',
      customerId: 'cust-uuid',
    });
    const findMany = jest
      .fn()
      .mockResolvedValue([{ deltaPoints: 25 }, { deltaPoints: -25 }]);
    const { svc, prisma, loyalty, audit } = build({
      posReceipt: { findUnique },
      loyaltyLedgerEntry: { findMany },
    });

    const created = await svc.ingestReceipt(
      { ...salePayload, receipt_delete_status: true },
      'WEBHOOK',
    );

    expect(created).toBe(false);
    // Net points already zero — no further clawback call required.
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
    expect(
      (prisma as unknown as { posReceipt: { delete: jest.Mock } }).posReceipt
        .delete,
    ).toHaveBeenCalledWith({ where: { id: 'rcpt-uuid' } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.receipt_voided' }),
    );
  });

  it('claws back awarded points when voiding a member sale', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'rcpt-uuid',
      customerId: 'cust-uuid',
    });
    const findMany = jest.fn().mockResolvedValue([{ deltaPoints: 25 }]);
    const { svc, loyalty } = build({
      posReceipt: { findUnique },
      loyaltyLedgerEntry: { findMany },
    });

    await svc.ingestReceipt(
      { ...salePayload, receipt_delete_status: true },
      'WEBHOOK',
    );

    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
      customerId: 'cust-uuid',
      deltaPoints: -25,
      reason: 'salesplay_purchase_void',
      referenceType: 'pos_receipt',
      referenceId: 'rcpt-uuid',
    });
  });
});
