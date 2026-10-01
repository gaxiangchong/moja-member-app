import {
  bonusForTopUp,
  DEFAULT_WALLET_TOPUP_SETTINGS,
  normalizeWalletTopUpSettings,
  WalletTopUpSettingsError,
  type TopUpTier,
} from './topup-settings';

// Top up RM50 → RM5 extra, RM100 → RM20 extra, RM200 → RM50 extra.
const TIERS: TopUpTier[] = [
  { topUpCents: 5_000, bonusCents: 500 },
  { topUpCents: 10_000, bonusCents: 2_000 },
  { topUpCents: 20_000, bonusCents: 5_000 },
];

describe('the bonus for a top-up', () => {
  it('is nothing below the first tier', () => {
    expect(bonusForTopUp(4_999, TIERS)).toBe(0);
    expect(bonusForTopUp(1_000, TIERS)).toBe(0);
  });

  it('is RM20 for exactly RM100 — the example in the brief', () => {
    expect(bonusForTopUp(10_000, TIERS)).toBe(2_000);
  });

  it('uses the highest tier reached, not a share of it', () => {
    // RM150 reaches RM100's tier but not RM200's.
    expect(bonusForTopUp(15_000, TIERS)).toBe(2_000);
    expect(bonusForTopUp(19_999, TIERS)).toBe(2_000);
  });

  it('keeps the top tier for anything above it', () => {
    expect(bonusForTopUp(20_000, TIERS)).toBe(5_000);
    expect(bonusForTopUp(100_000, TIERS)).toBe(5_000);
  });

  it('is nothing at all when there are no tiers', () => {
    expect(bonusForTopUp(10_000, [])).toBe(0);
  });
});

describe('top-up settings', () => {
  const valid = {
    enabled: true,
    minTopUpCents: 1_000,
    maxTopUpCents: 100_000,
    tiers: TIERS,
  };
  const reject = (patch: Record<string, unknown>, message: RegExp) =>
    expect(() => normalizeWalletTopUpSettings({ ...valid, ...patch })).toThrow(
      message,
    );

  it('is off by default, so a new deployment never sells credit by accident', () => {
    expect(DEFAULT_WALLET_TOPUP_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_WALLET_TOPUP_SETTINGS.tiers).toEqual([]);
  });

  it('accepts a good offer', () => {
    expect(normalizeWalletTopUpSettings(valid)).toEqual(valid);
  });

  it('sorts the tiers, so the order they were typed in does not matter', () => {
    const out = normalizeWalletTopUpSettings({
      ...valid,
      tiers: [TIERS[2], TIERS[0], TIERS[1]],
    });
    expect(out.tiers).toEqual(TIERS);
  });

  it('accepts form-style numbers as text', () => {
    expect(
      normalizeWalletTopUpSettings({
        ...valid,
        minTopUpCents: '1000',
        tiers: [{ topUpCents: '10000', bonusCents: '2000' }],
      }).tiers,
    ).toEqual([{ topUpCents: 10_000, bonusCents: 2_000 }]);
  });

  it('needs an explicit on/off', () => {
    reject({ enabled: undefined }, /on or off/);
    reject({ enabled: 'yes' }, /on or off/);
  });

  it('keeps the range sensible', () => {
    reject({ minTopUpCents: 50 }, /below RM1\.00/);
    reject({ maxTopUpCents: 2_000_000 }, /above RM10000\.00/);
    reject(
      { minTopUpCents: 50_000, maxTopUpCents: 10_000 },
      /more than the maximum/,
    );
    reject({ minTopUpCents: 10.5 }, /whole number/);
  });

  it('rejects a tier outside the range members can top up', () => {
    reject(
      { tiers: [{ topUpCents: 500, bonusCents: 50 }] },
      /outside the allowed/,
    );
    reject(
      { tiers: [{ topUpCents: 500_000, bonusCents: 5_000 }] },
      /outside the allowed/,
    );
  });

  it('rejects a bonus that is zero, negative, or more than the top-up (a likely typo)', () => {
    reject(
      { tiers: [{ topUpCents: 10_000, bonusCents: 0 }] },
      /more than zero/,
    );
    reject(
      { tiers: [{ topUpCents: 10_000, bonusCents: -5 }] },
      /more than zero/,
    );
    // RM100 top-up with a RM2,000 bonus.
    reject(
      { tiers: [{ topUpCents: 10_000, bonusCents: 200_000 }] },
      /more than the top-up itself/,
    );
  });

  it('rejects two tiers for the same amount', () => {
    reject(
      {
        tiers: [
          { topUpCents: 10_000, bonusCents: 1_000 },
          { topUpCents: 10_000, bonusCents: 2_000 },
        ],
      },
      /two tiers/,
    );
  });

  it('rejects a bigger top-up that earns no more than a smaller one', () => {
    reject(
      {
        tiers: [
          { topUpCents: 10_000, bonusCents: 2_000 },
          { topUpCents: 20_000, bonusCents: 2_000 },
        ],
      },
      /bigger bonus/,
    );
  });

  it('limits how many tiers there can be', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      topUpCents: 1_000 + i * 1_000,
      bonusCents: 10 + i,
    }));
    reject({ tiers: many }, /at most 12/);
  });

  it('throws an error type the API turns into a clear 400', () => {
    expect(() => normalizeWalletTopUpSettings(null)).toThrow(
      WalletTopUpSettingsError,
    );
  });
});
