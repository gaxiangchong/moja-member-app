export type TopUpTier = { topUpCents: number; bonusCents: number };

/**
 * The bonus for topping up `amountCents`: that of the highest tier the amount
 * reaches, or nothing. Mirrors the server's rule, which is the one that is
 * actually applied — this only lets the screen show what the member will get
 * before they pay.
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

/**
 * RM typed by a member → whole sen, or null when it is not a usable amount.
 * Accepts "100", "100.5" and "100.50"; rejects "1e3", "-5", "abc" and anything
 * with more than two decimals (a payment cannot be fractions of a sen).
 */
export function parseRmToCents(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}
