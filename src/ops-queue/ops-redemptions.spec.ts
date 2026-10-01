import {
  COUNTER_UNDO_WINDOW_HOURS,
  MAX_COUNTER_REDEMPTIONS_PER_MEMBER_PER_DAY,
  startOfMalaysiaDay,
} from './ops-redemptions.service';

describe('startOfMalaysiaDay', () => {
  it('is midnight Malaysia time, which is 16:00 UTC the evening before', () => {
    expect(
      startOfMalaysiaDay(new Date('2026-10-01T10:00:00+08:00')).toISOString(),
    ).toBe('2026-09-30T16:00:00.000Z');
  });

  it('puts a sale just after midnight in Malaysia on the new day', () => {
    // 00:30 on 2 Oct in Kuala Lumpur is still 1 Oct in UTC.
    expect(
      startOfMalaysiaDay(new Date('2026-10-02T00:30:00+08:00')).toISOString(),
    ).toBe('2026-10-01T16:00:00.000Z');
  });

  it('keeps a late-evening sale on the same Malaysian day', () => {
    expect(
      startOfMalaysiaDay(new Date('2026-10-01T23:59:00+08:00')).toISOString(),
    ).toBe('2026-09-30T16:00:00.000Z');
  });
});

describe('counter redemption limits', () => {
  it('allows a handful a day and a same-shift undo window', () => {
    expect(MAX_COUNTER_REDEMPTIONS_PER_MEMBER_PER_DAY).toBe(3);
    expect(COUNTER_UNDO_WINDOW_HOURS).toBe(12);
  });
});
