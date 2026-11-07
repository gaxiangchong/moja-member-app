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

describe('SalesplayWebhookService loyalty integrity', () => {
  afterEach(() => jest.restoreAllMocks());

  function build(prismaPart: {
    posReceipt?: Record<string, unknown>;
    posCreditNote?: Record<string, unknown>;
    loyaltyLedgerEntry?: Record<string, unknown>;
    customer?: Record<string, unknown>;
  } = {}) {
    const prisma = {
      posReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        ...(prismaPart.posReceipt ?? {}),
      },
      posCreditNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        ...(prismaPart.posCreditNote ?? {}),
      },
      loyaltyLedgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        ...(prismaPart.loyaltyLedgerEntry ?? {}),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        ...(prismaPart.customer ?? {}),
      },
      customerOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
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
    customer_id: 'sp-cust',
    line_products: [
      { product_name: 'Cake', product_qty: 1, product_unit_price: 25.5 },
    ],
  };

  const creditNotePayload = {
    credit_note_id: 'CN-1',
    receipt_id: 'SP-1',
    refund_amount: '25.50',
    reason: 'Customer return',
    receipt_date: '2026-07-08',
    customer_id: 'sp-cust',
  };

  it('backfills missed loyalty when a receipt is already ingested', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'rcpt-uuid',
      customerId: 'cust-uuid',
      originOnlineOrderId: null,
    });
    const findFirst = jest.fn().mockResolvedValue(null);
    const { svc, loyalty, audit } = build({
      posReceipt: { findUnique },
      loyaltyLedgerEntry: { findFirst },
    });

    const created = await svc.ingestReceipt(salePayload, 'PULL');

    expect(created).toBe(false);
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
      customerId: 'cust-uuid',
      deltaPoints: 25,
      reason: 'salesplay_purchase',
      referenceType: 'pos_receipt',
      referenceId: 'rcpt-uuid',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'loyalty.salesplay_purchase' }),
    );
  });

  it('does not double-award when a salesplay_purchase ledger row already exists', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'rcpt-uuid',
      customerId: 'cust-uuid',
      originOnlineOrderId: null,
    });
    const findFirst = jest.fn().mockResolvedValue({ id: 'ledger-1' });
    const { svc, loyalty } = build({
      posReceipt: { findUnique },
      loyaltyLedgerEntry: { findFirst },
    });

    await svc.ingestReceipt(salePayload, 'WEBHOOK');

    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('claws back loyalty when a credit note refunds a matched sale', async () => {
    const creditCreate = jest.fn().mockResolvedValue({ id: 'cn-uuid' });
    const receiptFind = jest.fn().mockResolvedValue({
      id: 'rcpt-uuid',
      customerId: 'cust-uuid',
      originOnlineOrderId: null,
      netCents: 2550,
    });
    const findMany = jest.fn().mockResolvedValue([{ deltaPoints: 25 }]);
    const { svc, prisma, loyalty, audit } = build({
      posCreditNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: creditCreate,
      },
      posReceipt: { findUnique: receiptFind },
      loyaltyLedgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany,
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-uuid' }),
      },
    });

    const created = await svc.ingestCreditNote(creditNotePayload, 'WEBHOOK');

    expect(created).toBe(true);
    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith({
      customerId: 'cust-uuid',
      deltaPoints: -25,
      reason: 'salesplay_refund',
      referenceType: 'pos_credit_note',
      referenceId: 'cn-uuid',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'loyalty.salesplay_refund' }),
    );
    expect(
      (prisma as unknown as { posCreditNote: { create: jest.Mock } })
        .posCreditNote.create,
    ).toHaveBeenCalled();
  });

  it('caps clawback at remaining receipt points for a partial refund', async () => {
    const creditCreate = jest.fn().mockResolvedValue({ id: 'cn-uuid' });
    const { svc, loyalty } = build({
      posCreditNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: creditCreate,
      },
      posReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rcpt-uuid',
          customerId: 'cust-uuid',
          originOnlineOrderId: null,
          netCents: 5000,
        }),
      },
      loyaltyLedgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        // Prior full earn of 50, already clawed 40 by another refund.
        findMany: jest.fn().mockResolvedValue([
          { deltaPoints: 50 },
          { deltaPoints: -40 },
        ]),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-uuid' }),
      },
    });

    await svc.ingestCreditNote(
      { ...creditNotePayload, refund_amount: '25.00' },
      'PULL',
    );

    expect(loyalty.appendLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ deltaPoints: -10 }),
    );
  });

  it('does not re-claw when a salesplay_refund ledger row already exists', async () => {
    const { svc, loyalty } = build({
      posCreditNote: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cn-uuid',
          customerId: 'cust-uuid',
        }),
      },
      loyaltyLedgerEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ledger-refund' }),
      },
    });

    const created = await svc.ingestCreditNote(creditNotePayload, 'PULL');

    expect(created).toBe(false);
    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });

  it('skips clawback for credit notes tied to online-order settlements', async () => {
    const creditCreate = jest.fn().mockResolvedValue({ id: 'cn-uuid' });
    const { svc, loyalty } = build({
      posCreditNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: creditCreate,
      },
      posReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rcpt-uuid',
          customerId: 'cust-uuid',
          originOnlineOrderId: 'order-uuid',
          netCents: 2550,
        }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-uuid' }),
      },
    });

    await svc.ingestCreditNote(creditNotePayload, 'WEBHOOK');

    expect(loyalty.appendLedgerEntry).not.toHaveBeenCalled();
  });
});
