import {
  mytBusinessDate,
  parseCreditNote,
  parseMytInstant,
  parseReceipt,
} from './salesplay-receipt.parser';

describe('parseMytInstant', () => {
  it('parses a MYT wall-clock datetime as the correct UTC instant', () => {
    // 2026-07-08 14:30:00 MYT (UTC+8) === 2026-07-08 06:30:00 UTC.
    expect(parseMytInstant('2026-07-08 14:30:00')?.toISOString()).toBe(
      '2026-07-08T06:30:00.000Z',
    );
  });

  it('accepts a date-only value (midnight MYT)', () => {
    expect(parseMytInstant('2026-07-08')?.toISOString()).toBe(
      '2026-07-07T16:00:00.000Z',
    );
  });

  it('returns null for unparseable input', () => {
    expect(parseMytInstant('not-a-date')).toBeNull();
    expect(parseMytInstant(null)).toBeNull();
  });
});

describe('mytBusinessDate', () => {
  it('books a just-after-midnight-MYT sale on the new MYT day', () => {
    // 2026-07-08 00:30 MYT === 2026-07-07 16:30 UTC, still 8 Jul in MYT.
    const instant = new Date('2026-07-07T16:30:00.000Z');
    expect(mytBusinessDate(instant).toISOString()).toBe(
      '2026-07-08T00:00:00.000Z',
    );
  });

  it('books a late-evening-UTC sale on the correct MYT day', () => {
    // 2026-07-08 23:00 UTC === 2026-07-09 07:00 MYT.
    const instant = new Date('2026-07-08T23:00:00.000Z');
    expect(mytBusinessDate(instant).toISOString()).toBe(
      '2026-07-09T00:00:00.000Z',
    );
  });
});

describe('parseReceipt', () => {
  it('returns null when no stable receipt id is present', () => {
    expect(parseReceipt({ total: 10 })).toBeNull();
    expect(parseReceipt(null)).toBeNull();
    expect(parseReceipt([])).toBeNull();
  });

  it('parses amounts from RM into cents and derives the MYT business date', () => {
    const parsed = parseReceipt({
      receipt_id: 'R-1001',
      receipt_number: '1001',
      shop_id: 'SHOP-1',
      terminal: 'T1',
      receipt_date_time: '2026-07-08 09:15:00',
      total: '45.90',
      discount: 5,
      tax: '2.60',
      payment_type: 'Cash',
      order_items: [
        {
          product_code: 'CAKE-1',
          product_name: 'Chocolate Slice',
          product_qty: 2,
          product_unit_price: '20.00',
          product_price: '40.00',
        },
      ],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.salesplayReceiptId).toBe('R-1001');
    expect(parsed!.netCents).toBe(4590);
    expect(parsed!.discountCents).toBe(500);
    expect(parsed!.taxCents).toBe(260);
    expect(parsed!.paymentType).toBe('Cash');
    expect(parsed!.businessDate.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(parsed!.lines).toHaveLength(1);
    expect(parsed!.lines[0]).toMatchObject({
      productCode: 'CAKE-1',
      name: 'Chocolate Slice',
      qty: 2,
      unitPriceCents: 2000,
      lineTotalCents: 4000,
    });
  });

  it('extracts online-order references used for dedupe', () => {
    const parsed = parseReceipt({
      receipt_id: 'R-2002',
      total: 30,
      system_unique_id: 'SP-UNIQUE-9',
      order_reference_id: '11111111-1111-1111-1111-111111111111',
      order_reference_number: '42',
    });
    expect(parsed!.onlineOrderRefs).toEqual({
      systemUniqueId: 'SP-UNIQUE-9',
      orderReferenceId: '11111111-1111-1111-1111-111111111111',
      orderReferenceNumber: '42',
    });
  });

  it('falls back to unit price * qty when no line total is given', () => {
    const parsed = parseReceipt({
      receipt_id: 'R-3003',
      total: 15,
      items: [{ name: 'Bun', qty: 3, unit_price: '5.00' }],
    });
    expect(parsed!.lines[0].lineTotalCents).toBe(1500);
  });
});

describe('parseCreditNote', () => {
  it('parses a credit note with its original receipt reference', () => {
    const parsed = parseCreditNote({
      credit_note_id: 'CN-1',
      receipt_id: 'R-1001',
      refund_amount: '45.90',
      reason: 'Customer changed mind',
      receipt_date: '2026-07-08',
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.salesplayCreditNoteId).toBe('CN-1');
    expect(parsed!.salesplayReceiptId).toBe('R-1001');
    expect(parsed!.amountCents).toBe(4590);
    expect(parsed!.reason).toBe('Customer changed mind');
  });

  it('returns null without a stable credit note id', () => {
    expect(parseCreditNote({ amount: 10 })).toBeNull();
  });
});
