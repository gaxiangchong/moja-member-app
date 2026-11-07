import { ConfigService } from '@nestjs/config';
import { SalesplayWebhookService } from './salesplay-webhook.service';

/**
 * Focused coverage for credit_note.update ingest — live SalesPlay envelopes
 * use a `receipts` array (same shape as GET /credit_note_and_refund).
 */
describe('SalesplayWebhookService credit notes', () => {
  function buildService(overrides?: {
    posCreditNoteCreate?: jest.Mock;
    posCreditNoteFindUnique?: jest.Mock;
  }) {
    const config = {
      get: (key: string) =>
        key === 'SALESPLAY_WEBHOOK_TOKEN' ? 'secret' : undefined,
    } as unknown as ConfigService;

    const prisma = {
      salesplaySyncState: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      posCreditNote: {
        findUnique: overrides?.posCreditNoteFindUnique ?? jest.fn().mockResolvedValue(null),
        create:
          overrides?.posCreditNoteCreate ??
          jest.fn().mockResolvedValue({ id: 'cn-uuid' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const loyalty = { appendLedgerEntry: jest.fn() };
    const audit = { log: jest.fn() };

    const svc = new SalesplayWebhookService(
      config,
      prisma as never,
      loyalty as never,
      audit as never,
    );
    return { svc, prisma };
  }

  it('ingests credit_note.update payloads that use the receipts envelope', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cn-uuid' });
    const { svc, prisma } = buildService({ posCreditNoteCreate: create });

    await svc.handleWebhook('secret', {
      type: 'credit_note.update',
      receipts: [
        {
          receipt_number: '1-2207299',
          receipt_type: 'CASH_REFUND',
          refund_for: '1-2207203',
          receipt_date_time: '2026-07-19 15:10:00',
          total_money: '25.50',
          customer_id: '1000',
          note: 'Partial return',
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesplayCreditNoteId: '1-2207299',
          salesplayReceiptId: '1-2207203',
          amountCents: 2550,
          reason: 'Partial return',
          source: 'WEBHOOK',
        }),
      }),
    );
    expect(prisma.salesplaySyncState.upsert).toHaveBeenCalled();
  });

  it('still accepts a credit_notes array envelope', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cn-uuid' });
    const { svc } = buildService({ posCreditNoteCreate: create });

    await svc.handleWebhook('secret', {
      type: 'credit_note.update',
      credit_notes: [
        {
          credit_note_id: 'CN-1',
          receipt_id: 'R-1001',
          refund_amount: '10.00',
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesplayCreditNoteId: 'CN-1',
          salesplayReceiptId: 'R-1001',
          amountCents: 1000,
        }),
      }),
    );
  });
});
