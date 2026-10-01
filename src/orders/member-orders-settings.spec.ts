import {
  DEFAULT_ORDER_HISTORY_DAYS,
  MAX_ORDER_HISTORY_DAYS,
  MemberOrdersSettingsError,
  normalizeMemberOrdersSettings,
  visibleOrdersWhere,
} from './member-orders-settings';

describe('orders-page history setting', () => {
  it('defaults to seven days', () => {
    expect(DEFAULT_ORDER_HISTORY_DAYS).toBe(7);
  });

  it('accepts a whole number of days, typed or as a form string', () => {
    expect(normalizeMemberOrdersSettings({ historyDays: 7 })).toEqual({
      historyDays: 7,
    });
    expect(normalizeMemberOrdersSettings({ historyDays: '30' })).toEqual({
      historyDays: 30,
    });
    expect(
      normalizeMemberOrdersSettings({ historyDays: MAX_ORDER_HISTORY_DAYS }),
    ).toEqual({ historyDays: 365 });
  });

  it.each([
    ['none', {}],
    ['zero', { historyDays: 0 }],
    ['negative', { historyDays: -3 }],
    ['too many', { historyDays: 366 }],
    ['fractional', { historyDays: 2.5 }],
    ['text', { historyDays: 'a week' }],
    ['empty text', { historyDays: '' }],
    ['no body', null],
  ])('rejects %s', (_name, input) => {
    expect(() => normalizeMemberOrdersSettings(input)).toThrow(
      MemberOrdersSettingsError,
    );
  });
});

describe('which orders stay on the Orders page', () => {
  const NOW = new Date('2026-10-10T00:00:00Z');
  const where = visibleOrdersWhere('member-1', 7, NOW) as {
    customerId: string;
    OR: Record<string, unknown>[];
  };
  const cutoff = new Date('2026-10-03T00:00:00Z');

  it('is only ever this member’s orders', () => {
    expect(where.customerId).toBe('member-1');
  });

  it('always keeps an order that is still open, however old', () => {
    const open = where.OR[0] as { status: { in: string[] } };
    expect(open.status.in).toEqual(
      expect.arrayContaining([
        'pending_payment',
        'placed',
        'preparing',
        'ready',
      ]),
    );
    // Finished states are not in that list.
    expect(open.status.in).not.toContain('completed');
    expect(open.status.in).not.toContain('cancelled');
  });

  it('keeps a finished order for the number of days after it finished', () => {
    expect(where.OR[1]).toEqual({ completedAt: { gte: cutoff } });
    expect(where.OR[2]).toEqual({ cancelledAt: { gte: cutoff } });
  });

  it('falls back to the placed date for old records with no finish time', () => {
    expect(where.OR[3]).toEqual({
      completedAt: null,
      cancelledAt: null,
      placedAt: { gte: cutoff },
    });
  });

  it('moves the cutoff with the number of days', () => {
    const fortnight = visibleOrdersWhere('m', 14, NOW) as {
      OR: { completedAt?: { gte: Date } }[];
    };
    expect(fortnight.OR[1].completedAt?.gte.toISOString()).toBe(
      '2026-09-26T00:00:00.000Z',
    );
  });
});
