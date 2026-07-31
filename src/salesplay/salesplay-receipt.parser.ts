/**
 * Defensive parsing of SalesPlay receipt / credit-note webhook payloads.
 *
 * SalesPlay does not publish the receipt JSON schema, so every field is looked
 * up across a list of plausible keys and the raw payload is always persisted
 * alongside the parsed result. Once real payloads are observed the candidate
 * key lists here can be tightened — nothing else needs to change.
 *
 * Monetary values are reported by SalesPlay in the major currency unit (RM),
 * matching what we send in `online_orders` (see salesplay.service.ts), so they
 * are converted to integer cents here.
 */

const MYT_OFFSET_MINUTES = 8 * 60; // Asia/Kuala_Lumpur is UTC+8, no DST.

export type ParsedReceiptLine = {
  productCode: string | null;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type ParsedReceipt = {
  salesplayReceiptId: string;
  receiptNumber: string | null;
  shopId: string | null;
  terminal: string | null;
  /** UTC instant of the sale, derived from the receipt's MYT wall-clock. */
  soldAt: Date | null;
  /** MYT calendar date (UTC midnight of that date) the sale books against. */
  businessDate: Date;
  grossCents: number;
  discountCents: number;
  taxCents: number;
  netCents: number;
  paymentType: string | null;
  /** SalesPlay receipt_type (e.g. "SALE", "REFUND"); null when absent. */
  receiptType: string | null;
  /** True when SalesPlay marks the receipt as deleted. */
  isDeleted: boolean;
  lines: ParsedReceiptLine[];
  /** References that may tie this receipt back to one of our online orders. */
  onlineOrderRefs: {
    systemUniqueId: string | null;
    orderReferenceId: string | null;
    orderReferenceNumber: string | null;
  };
  /** Identity hints used to match the receipt to a member. */
  customerHints: {
    salesplayCustomerId: string | null;
    phone: string | null;
  };
};

export type ParsedCreditNote = {
  salesplayCreditNoteId: string;
  salesplayReceiptId: string | null;
  businessDate: Date;
  amountCents: number;
  reason: string | null;
  customerHints: {
    salesplayCustomerId: string | null;
    phone: string | null;
  };
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** First present, non-empty string among the given keys. */
export function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** First present numeric value (accepts numeric strings) among the given keys. */
export function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function rmToCents(rm: number | null): number {
  if (rm == null) return 0;
  return Math.round(rm * 100);
}

/**
 * Parses a "YYYY-MM-DD[ T]HH:mm:ss" wall-clock string as Asia/Kuala_Lumpur and
 * returns the corresponding UTC instant. Returns null if unparseable.
 */
export function parseMytInstant(value: string | null): Date | null {
  if (!value) return null;
  const m = value.match(
    /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  return new Date(utcMs - MYT_OFFSET_MINUTES * 60 * 1000);
}

/** MYT calendar date (as UTC midnight) for a given UTC instant. */
export function mytBusinessDate(instant: Date): Date {
  const shifted = new Date(instant.getTime() + MYT_OFFSET_MINUTES * 60 * 1000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

const RECEIPT_DATE_KEYS = [
  'receipt_date_time',
  'receipt_date',
  'order_date_time',
  'order_date',
  'created_at',
  'date_time',
  'date',
  'transaction_date',
];

function parseLines(receipt: Record<string, unknown>): ParsedReceiptLine[] {
  const rawLines =
    // line_products is the live API's name (per the SalesPlay docs sample).
    (['line_products', 'order_items', 'items', 'receipt_items', 'line_items', 'products'] as const)
      .map((k) => receipt[k])
      .find((v) => Array.isArray(v)) ?? [];
  if (!Array.isArray(rawLines)) return [];

  const lines: ParsedReceiptLine[] = [];
  for (const raw of rawLines) {
    const line = asRecord(raw);
    if (!line) continue;
    const name =
      pickString(line, ['product_name', 'name', 'item_name', 'title']) ??
      'Item';
    const qty = pickNumber(line, ['product_qty', 'qty', 'quantity', 'count']) ?? 1;
    const unit = pickNumber(line, [
      'product_unit_price',
      'unit_price',
      'price',
      'rate',
    ]);
    const lineTotal = pickNumber(line, [
      'product_price',
      'line_total',
      'total',
      'amount',
    ]);
    const unitCents = rmToCents(unit);
    const lineTotalCents =
      lineTotal != null ? rmToCents(lineTotal) : unitCents * Math.round(qty);
    lines.push({
      productCode: pickString(line, [
        'product_code',
        'product_id',
        'code',
        'sku',
      ]),
      name,
      qty: Math.round(qty),
      unitPriceCents: unitCents,
      lineTotalCents,
    });
  }
  return lines;
}

/**
 * Parses a receipt record. Returns null when no stable receipt id is present
 * (nothing we can idempotently key on).
 */
export function parseReceipt(raw: unknown): ParsedReceipt | null {
  const receipt = asRecord(raw);
  if (!receipt) return null;

  const salesplayReceiptId = pickString(receipt, [
    'receipt_id',
    'id',
    'receipt_number',
    'receipt_no',
    'invoice_number',
  ]);
  if (!salesplayReceiptId) return null;

  const soldAt = parseMytInstant(pickString(receipt, RECEIPT_DATE_KEYS));
  const businessDate = mytBusinessDate(soldAt ?? new Date());

  const net = pickNumber(receipt, [
    // total_money is the live API's name (per the SalesPlay docs sample).
    'total_money',
    'total',
    'total_amount',
    'net_amount',
    'grand_total',
    'amount',
    'total_price',
    'order_total',
  ]);
  const gross = pickNumber(receipt, ['gross_amount', 'subtotal', 'sub_total']);
  const discount = pickNumber(receipt, [
    'discount',
    'discount_amount',
    'total_discount',
  ]);
  const tax = pickNumber(receipt, ['tax', 'tax_amount', 'total_tax', 'gst']);

  const netCents = rmToCents(net);

  return {
    salesplayReceiptId,
    receiptNumber: pickString(receipt, ['receipt_number', 'receipt_no']),
    shopId: pickString(receipt, ['shop_id', 'shop', 'store_id', 'location_id']),
    terminal: pickString(receipt, ['terminal', 'terminal_id', 'register']),
    soldAt,
    businessDate,
    grossCents: gross != null ? rmToCents(gross) : netCents,
    discountCents: rmToCents(discount),
    taxCents: rmToCents(tax),
    netCents,
    paymentType: pickString(receipt, [
      'payment_type',
      'payment_method',
      'tender_type',
      'pay_type',
    ]),
    receiptType: pickString(receipt, ['receipt_type']),
    isDeleted:
      receipt['receipt_delete_status'] === true ||
      receipt['receipt_delete_status'] === 'true',
    lines: parseLines(receipt),
    onlineOrderRefs: {
      systemUniqueId: pickString(receipt, [
        'system_unique_id',
        'online_order_id',
        'external_id',
      ]),
      orderReferenceId: pickString(receipt, [
        'order_reference_id',
        'reference_id',
        'external_reference',
      ]),
      orderReferenceNumber: pickString(receipt, [
        'order_reference_number',
        'reference_number',
        'external_reference_number',
      ]),
    },
    customerHints: {
      salesplayCustomerId: pickString(receipt, [
        'customer_id',
        'customer',
        'customer_uid',
      ]),
      phone: pickString(receipt, [
        'customer_code',
        'customer_mobile',
        'mobile_no',
        'phone_number',
        'telephone',
      ]),
    },
  };
}

/**
 * Parses a credit-note (refund/void) record. Null when no stable id present.
 *
 * Live SalesPlay `/credit_note_and_refund` (and `credit_note.update` webhooks)
 * return receipt-shaped objects: `receipt_number`, `refund_for`, `total_money`
 * — the same field names as GET /receipts — not a separate credit_note_* schema.
 * Keep the speculative credit_note_* keys as fallbacks for older guesses / tests.
 */
export function parseCreditNote(raw: unknown): ParsedCreditNote | null {
  const note = asRecord(raw);
  if (!note) return null;

  const salesplayCreditNoteId = pickString(note, [
    'credit_note_id',
    'credit_note_number',
    'cn_number',
    // Live API id for cash refunds / credit notes (developer.salesplay.com).
    'receipt_number',
    'id',
  ]);
  if (!salesplayCreditNoteId) return null;

  const soldAt = parseMytInstant(pickString(note, RECEIPT_DATE_KEYS));
  const amount = pickNumber(note, [
    // total_money is the live API's name (same as receipts).
    'total_money',
    'total',
    'total_amount',
    'net_amount',
    'amount',
    'refund_amount',
  ]);

  return {
    salesplayCreditNoteId,
    // refund_for is the original SALE receipt number on the live API.
    // Do not treat this note's own receipt_number as the parent sale.
    salesplayReceiptId: pickString(note, [
      'refund_for',
      'original_receipt_id',
      'reference_receipt_id',
      'receipt_id',
    ]),
    businessDate: mytBusinessDate(soldAt ?? new Date()),
    amountCents: rmToCents(amount),
    reason: pickString(note, ['reason', 'note', 'remark', 'comment']),
    customerHints: {
      salesplayCustomerId: pickString(note, [
        'customer_id',
        'customer',
        'customer_uid',
      ]),
      phone: pickString(note, [
        'customer_code',
        'customer_mobile',
        'mobile_no',
        'phone_number',
        'telephone',
      ]),
    },
  };
}
