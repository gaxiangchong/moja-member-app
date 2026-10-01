import type { Prisma } from '@prisma/client';
import { ORDER_STATUS } from './order-status';

/**
 * How long a finished order stays on the member's Orders page. Older ones drop
 * off the list (they are never deleted — finance and support still need them).
 */
export const DEFAULT_ORDER_HISTORY_DAYS = 7;
export const MIN_ORDER_HISTORY_DAYS = 1;
export const MAX_ORDER_HISTORY_DAYS = 365;

export type MemberOrdersSettings = {
  /** Finished orders are listed for this many days after they finished. */
  historyDays: number;
};

export class MemberOrdersSettingsError extends Error {}

export const DEFAULT_MEMBER_ORDERS_SETTINGS: MemberOrdersSettings = {
  historyDays: DEFAULT_ORDER_HISTORY_DAYS,
};

/** Validates admin input; throws with a message the admin can act on. */
export function normalizeMemberOrdersSettings(
  input: unknown,
): MemberOrdersSettings {
  const raw =
    input && typeof input === 'object'
      ? (input as { historyDays?: unknown }).historyDays
      : undefined;
  const days = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof days !== 'number' || !Number.isInteger(days)) {
    throw new MemberOrdersSettingsError(
      'Enter the number of days as a whole number.',
    );
  }
  if (days < MIN_ORDER_HISTORY_DAYS || days > MAX_ORDER_HISTORY_DAYS) {
    throw new MemberOrdersSettingsError(
      `Days must be between ${MIN_ORDER_HISTORY_DAYS} and ${MAX_ORDER_HISTORY_DAYS}.`,
    );
  }
  return { historyDays: days };
}

/** Orders that are still being worked on — never hidden, however old. */
const STILL_OPEN: string[] = [
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
];

/**
 * Which of a member's orders appear on their Orders page.
 *
 *  - An order that is still open is always shown. A cake ordered ten days ahead
 *    must not vanish because it was placed more than a week ago.
 *  - A finished order (collected, cancelled, refunded) is shown for
 *    `historyDays` after it finished, not after it was placed.
 */
export function visibleOrdersWhere(
  customerId: string,
  historyDays: number,
  now: Date = new Date(),
): Prisma.CustomerOrderWhereInput {
  const cutoff = new Date(now.getTime() - historyDays * 86_400_000);
  return {
    customerId,
    OR: [
      { status: { in: STILL_OPEN } },
      { completedAt: { gte: cutoff } },
      { cancelledAt: { gte: cutoff } },
      // Finished without either timestamp (older records): judge by when it was placed.
      { completedAt: null, cancelledAt: null, placedAt: { gte: cutoff } },
    ],
  };
}
