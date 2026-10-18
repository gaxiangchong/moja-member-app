import {
  daysBetween,
  earlyOrderDiscountCents,
  normalizeEarlyOrderDiscount,
  type EarlyOrderDiscountSettings,
} from './early-order-discount';

const ON: EarlyOrderDiscountSettings = {
  enabled: true,
  percent: 5,
  minDaysAhead: 2,
};
const cake = (amountCents: number) => ({ amountCents, isWholeCake: true });
const other = (amountCents: number) => ({ amountCents, isWholeCake: false });

const discount = (
  over: Partial<Parameters<typeof earlyOrderDiscountCents>[0]> = {},
) =>
  earlyOrderDiscountCents({
    settings: ON,
    lines: [cake(10000)],
    scheduledDate: '2026-10-20',
    today: '2026-10-18',
    otherDiscountCents: 0,
    ...over,
  });

describe('early-order discount', () => {
  it('gives 5% off a whole cake collected two days later', () => {
    expect(discount()).toBe(500);
  });

  it('gives nothing for a collection the next day', () => {
    expect(discount({ scheduledDate: '2026-10-19' })).toBe(0);
  });

  it('gives nothing for a same-day collection', () => {
    expect(discount({ scheduledDate: '2026-10-18' })).toBe(0);
  });

  it('counts calendar days across a month end', () => {
    expect(daysBetween('2026-10-30', '2026-11-01')).toBe(2);
    expect(discount({ today: '2026-10-30', scheduledDate: '2026-11-01' })).toBe(
      500,
    );
  });

  it('only discounts whole cakes, not the rest of the order', () => {
    expect(discount({ lines: [cake(10000), other(4000)] })).toBe(500);
  });

  it('gives nothing when the order has no whole cake', () => {
    expect(discount({ lines: [other(4000)] })).toBe(0);
  });

  it('works on the cakes after their share of a voucher', () => {
    // RM10 voucher over RM200 (RM100 cake + RM100 other): the cake carries RM5.
    expect(
      discount({
        lines: [cake(10000), other(10000)],
        otherDiscountCents: 1000,
      }),
    ).toBe(475);
  });

  it('never takes the order below zero with a big voucher', () => {
    expect(discount({ lines: [cake(1000)], otherDiscountCents: 1000 })).toBe(0);
  });

  it('rounds down to the sen', () => {
    expect(discount({ lines: [cake(8999)] })).toBe(449);
  });

  it('gives nothing without a collection day (parcels)', () => {
    expect(discount({ scheduledDate: null })).toBe(0);
  });

  it('gives nothing while switched off', () => {
    expect(discount({ settings: { ...ON, enabled: false } })).toBe(0);
  });

  it('follows the admin settings', () => {
    expect(
      discount({
        settings: { enabled: true, percent: 10, minDaysAhead: 3 },
        scheduledDate: '2026-10-21',
      }),
    ).toBe(1000);
    expect(
      discount({
        settings: { enabled: true, percent: 10, minDaysAhead: 3 },
        scheduledDate: '2026-10-20',
      }),
    ).toBe(0);
  });
});

describe('early-order discount settings', () => {
  it('accepts valid settings, including numbers typed as text', () => {
    expect(
      normalizeEarlyOrderDiscount({
        enabled: true,
        percent: '5',
        minDaysAhead: '2',
      }),
    ).toEqual(ON);
  });

  it('refuses a percent outside 1–50', () => {
    expect(() =>
      normalizeEarlyOrderDiscount({
        enabled: true,
        percent: 0,
        minDaysAhead: 2,
      }),
    ).toThrow(/between 1 and 50/);
    expect(() =>
      normalizeEarlyOrderDiscount({
        enabled: true,
        percent: 80,
        minDaysAhead: 2,
      }),
    ).toThrow(/between 1 and 50/);
  });

  it('refuses fractional or out-of-range days', () => {
    expect(() =>
      normalizeEarlyOrderDiscount({
        enabled: true,
        percent: 5,
        minDaysAhead: 1.5,
      }),
    ).toThrow(/Days ahead/);
    expect(() =>
      normalizeEarlyOrderDiscount({
        enabled: true,
        percent: 5,
        minDaysAhead: 0,
      }),
    ).toThrow(/Days ahead/);
  });
});
