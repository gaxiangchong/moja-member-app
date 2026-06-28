import { useCallback, useState } from 'react';

/**
 * Customer-side "cleared" purchase history. We never delete the real
 * subscription records (the business needs them for kitchen/sales reports) —
 * instead we remember which order IDs the customer has cleared from their own
 * view. Clearing is permanent (no un-hide) and only affects this browser; new
 * orders (new IDs) still appear normally.
 */
const HIDDEN_KEY = 'moja_bento_hidden_purchases';

export function getHiddenPurchaseIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function hidePurchaseIds(ids: string[]): void {
  try {
    const next = new Set(getHiddenPurchaseIds());
    for (const id of ids) next.add(id);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore storage errors */
  }
}

/** React hook: tracks the cleared set and exposes a permanent `hide` action. */
export function useHiddenPurchases() {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(getHiddenPurchaseIds()),
  );
  const hide = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    hidePurchaseIds(ids);
    setHidden((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);
  return { hidden, hide };
}
