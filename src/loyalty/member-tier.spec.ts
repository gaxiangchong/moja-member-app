import {
  purchasePoints,
  tierForPoints,
  tierPointsMultiplier,
} from './member-tier';

describe('tierForPoints', () => {
  it('keeps 500 and below on silver, and anyone under 1,000', () => {
    expect(tierForPoints(0)).toBe('silver');
    expect(tierForPoints(500)).toBe('silver');
    expect(tierForPoints(999)).toBe('silver');
  });

  it('starts gold at 1,000 and platinum at 2,000', () => {
    expect(tierForPoints(1000)).toBe('gold');
    expect(tierForPoints(1999)).toBe('gold');
    expect(tierForPoints(2000)).toBe('platinum');
  });
});

describe('purchasePoints', () => {
  it('leaves the base earn rate unchanged for silver', () => {
    expect(
      purchasePoints({ amountRm: 45, pointsPerRm: 1, balanceBefore: 500 }),
    ).toEqual({ points: 45, tier: 'silver', multiplier: 1 });
  });

  it('awards 1.5× to gold and 2× to platinum', () => {
    expect(tierPointsMultiplier('gold')).toBe(1.5);
    expect(tierPointsMultiplier('platinum')).toBe(2);
    expect(
      purchasePoints({ amountRm: 45, pointsPerRm: 1, balanceBefore: 1000 })
        .points,
    ).toBe(67);
    expect(
      purchasePoints({ amountRm: 45, pointsPerRm: 1, balanceBefore: 2000 })
        .points,
    ).toBe(90);
  });

  it('uses the tier from the balance before this purchase', () => {
    const earned = purchasePoints({
      amountRm: 20,
      pointsPerRm: 1,
      balanceBefore: 990,
    });
    expect(earned.tier).toBe('silver');
    expect(earned.points).toBe(20);
  });
});
