import {
  allowedPurchasePoints,
  classifyPurchasePoints,
} from './customer-purchase-history.service';

describe('allowedPurchasePoints', () => {
  it('gives floor(RM) × rate for each tier multiplier', () => {
    // RM 25.90 → 25 RM → silver 25, gold 37, platinum 50
    expect(allowedPurchasePoints(2590, 1)).toEqual([25, 37, 50]);
  });

  it('gives nothing under RM 1', () => {
    expect(allowedPurchasePoints(99, 1)).toEqual([0]);
  });
});

describe('classifyPurchasePoints', () => {
  const base = { eligible: true, amountCents: 2590, pointsPerRm: 1, pointsReversed: 0 };

  it('accepts any tier multiplier', () => {
    for (const pts of [25, 37, 50]) {
      expect(classifyPurchasePoints({ ...base, pointsEarned: pts })).toBe('ok');
    }
  });

  it('flags an eligible purchase with no points as missing', () => {
    expect(classifyPurchasePoints({ ...base, pointsEarned: 0 })).toBe('missing');
  });

  it('flags points the earn rule cannot produce', () => {
    expect(classifyPurchasePoints({ ...base, pointsEarned: 30 })).toBe('mismatch');
  });

  it('flags points awarded on a purchase that should not earn', () => {
    expect(
      classifyPurchasePoints({ ...base, eligible: false, pointsEarned: 25 }),
    ).toBe('mismatch');
  });

  it('treats a fully reversed award as reversed', () => {
    expect(
      classifyPurchasePoints({ ...base, pointsEarned: 25, pointsReversed: -25 }),
    ).toBe('reversed');
  });

  it('does not expect points below RM 1 or on ineligible purchases', () => {
    expect(
      classifyPurchasePoints({ ...base, amountCents: 50, pointsEarned: 0 }),
    ).toBe('not_eligible');
    expect(
      classifyPurchasePoints({ ...base, eligible: false, pointsEarned: 0 }),
    ).toBe('not_eligible');
  });
});
