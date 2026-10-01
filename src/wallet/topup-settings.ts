/**
 * Credit top-up settings the admin controls: whether members can top up, how
 * much, and the bonus they earn for topping up more ("top up RM100, get RM20
 * extra").
 *
 * All amounts are in sen (RM1 = 100).
 */

/** One bonus offer: top up at least `topUpCents`, receive `bonusCents` extra. */
export type TopUpTier = { topUpCents: number; bonusCents: number };

export type WalletTopUpSettings = {
  /**
   * Members can only top up while this is on. Off by default so a fresh
   * deployment never starts selling credit by accident.
   */
  enabled: boolean;
  minTopUpCents: number;
  maxTopUpCents: number;
  /** Ascending by `topUpCents`, and the bonus rises with the top-up. */
  tiers: TopUpTier[];
};

export const DEFAULT_WALLET_TOPUP_SETTINGS: WalletTopUpSettings = {
  enabled: false,
  minTopUpCents: 1_000, // RM10
  maxTopUpCents: 100_000, // RM1,000
  tiers: [],
};

/** Hard limits, whatever the admin types. */
export const ABSOLUTE_MIN_TOPUP_CENTS = 100; // RM1 — what the payment provider accepts
export const ABSOLUTE_MAX_TOPUP_CENTS = 1_000_000; // RM10,000
export const MAX_TOPUP_TIERS = 12;

export class WalletTopUpSettingsError extends Error {}

function wholeNumber(value: unknown, label: string): number {
  const n =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new WalletTopUpSettingsError(
      `${label} must be a whole number of sen.`,
    );
  }
  return n;
}

const rm = (cents: number) => `RM${(cents / 100).toFixed(2)}`;

/** Validates admin input. Throws a message the admin can act on. */
export function normalizeWalletTopUpSettings(
  input: unknown,
): WalletTopUpSettings {
  if (!input || typeof input !== 'object') {
    throw new WalletTopUpSettingsError('Send the top-up settings.');
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.enabled !== 'boolean') {
    throw new WalletTopUpSettingsError('Choose whether top-ups are on or off.');
  }
  const minTopUpCents = wholeNumber(raw.minTopUpCents, 'The minimum top-up');
  const maxTopUpCents = wholeNumber(raw.maxTopUpCents, 'The maximum top-up');
  if (minTopUpCents < ABSOLUTE_MIN_TOPUP_CENTS) {
    throw new WalletTopUpSettingsError(
      `The minimum top-up cannot be below ${rm(ABSOLUTE_MIN_TOPUP_CENTS)}.`,
    );
  }
  if (maxTopUpCents > ABSOLUTE_MAX_TOPUP_CENTS) {
    throw new WalletTopUpSettingsError(
      `The maximum top-up cannot be above ${rm(ABSOLUTE_MAX_TOPUP_CENTS)}.`,
    );
  }
  if (minTopUpCents > maxTopUpCents) {
    throw new WalletTopUpSettingsError(
      'The minimum top-up cannot be more than the maximum.',
    );
  }

  const rawTiers = raw.tiers ?? [];
  if (!Array.isArray(rawTiers)) {
    throw new WalletTopUpSettingsError('Bonus tiers must be a list.');
  }
  if (rawTiers.length > MAX_TOPUP_TIERS) {
    throw new WalletTopUpSettingsError(
      `Use at most ${MAX_TOPUP_TIERS} bonus tiers.`,
    );
  }
  const tiers: TopUpTier[] = rawTiers
    .map((t, i) => {
      const row = (t ?? {}) as Record<string, unknown>;
      return {
        topUpCents: wholeNumber(row.topUpCents, `Tier ${i + 1} top-up amount`),
        bonusCents: wholeNumber(row.bonusCents, `Tier ${i + 1} bonus`),
      };
    })
    .sort((a, b) => a.topUpCents - b.topUpCents);

  tiers.forEach((tier, i) => {
    if (tier.topUpCents < minTopUpCents || tier.topUpCents > maxTopUpCents) {
      throw new WalletTopUpSettingsError(
        `A tier for ${rm(tier.topUpCents)} is outside the allowed top-up range (${rm(minTopUpCents)} to ${rm(maxTopUpCents)}).`,
      );
    }
    if (tier.bonusCents < 1) {
      throw new WalletTopUpSettingsError(
        `The bonus for ${rm(tier.topUpCents)} must be more than zero. Remove the tier for no bonus.`,
      );
    }
    // A bonus bigger than what was paid is almost certainly a typo (RM100 vs RM1000).
    if (tier.bonusCents > tier.topUpCents) {
      throw new WalletTopUpSettingsError(
        `The bonus for ${rm(tier.topUpCents)} (${rm(tier.bonusCents)}) is more than the top-up itself.`,
      );
    }
    const prev = tiers[i - 1];
    if (prev) {
      if (prev.topUpCents === tier.topUpCents) {
        throw new WalletTopUpSettingsError(
          `There are two tiers for ${rm(tier.topUpCents)}.`,
        );
      }
      if (tier.bonusCents <= prev.bonusCents) {
        throw new WalletTopUpSettingsError(
          `Topping up ${rm(tier.topUpCents)} should earn a bigger bonus than topping up ${rm(prev.topUpCents)}.`,
        );
      }
    }
  });

  return { enabled: raw.enabled, minTopUpCents, maxTopUpCents, tiers };
}

/**
 * The bonus for topping up `amountCents`: that of the highest tier the amount
 * reaches, or zero. Not pro-rata — RM150 with tiers at RM100 and RM200 earns the
 * RM100 tier's bonus, which is what "top up at least RM100" means.
 */
export function bonusForTopUp(amountCents: number, tiers: TopUpTier[]): number {
  let bonus = 0;
  for (const tier of tiers) {
    if (amountCents >= tier.topUpCents && tier.bonusCents > bonus) {
      bonus = tier.bonusCents;
    }
  }
  return bonus;
}
