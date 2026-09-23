import {
  DEFAULT_PICKUP_RULES,
  evaluatePickupDay,
  evaluateStoreNow,
  normalizePickupRules,
  PickupRulesError,
  zonedWallToUtc,
  type ShopPickupRules,
} from './pickup-rules';

describe('zonedWallToUtc', () => {
  it('treats 11:00 in Kuala Lumpur as 03:00 UTC', () => {
    expect(
      zonedWallToUtc('2026-09-26', '11:00', 'Asia/Kuala_Lumpur').toISOString(),
    ).toBe('2026-09-26T03:00:00.000Z');
  });
});

describe('evaluatePickupDay', () => {
  const saturday = '2026-09-26';
  // 08:00 in Kuala Lumpur, three hours before the 11:00 slot.
  const eightAmKl = new Date('2026-09-26T00:00:00.000Z');

  it('offers weekday slots and hides the Sunday window', () => {
    const quote = evaluatePickupDay({
      rules: DEFAULT_PICKUP_RULES,
      date: saturday,
      now: eightAmKl,
    });
    expect(quote.closed).toBe(false);
    expect(quote.slots.map((slot) => slot.start)).toEqual([
      '11:00',
      '14:00',
      '16:00',
    ]);
    expect(quote.slots.every((slot) => slot.available)).toBe(true);
    expect(quote.leadTimeMessage).toContain('2 hours');
  });

  it('closes a slot once it is inside the lead time', () => {
    // 09:30 KL is inside the 2-hour lead for 11:00, still outside it for 14:00.
    const quote = evaluatePickupDay({
      rules: DEFAULT_PICKUP_RULES,
      date: saturday,
      now: new Date('2026-09-26T01:30:00.000Z'),
    });
    const eleven = quote.slots.find((slot) => slot.start === '11:00');
    const two = quote.slots.find((slot) => slot.start === '14:00');
    expect(eleven?.available).toBe(false);
    expect(eleven?.reason).toContain('2 hours');
    expect(two?.available).toBe(true);
  });

  it('honours an earlier cut-off clock time', () => {
    const rules: ShopPickupRules = {
      ...DEFAULT_PICKUP_RULES,
      slots: DEFAULT_PICKUP_RULES.slots.map((slot) =>
        slot.start === '11:00' ? { ...slot, cutoffTime: '09:00' } : slot,
      ),
    };
    const before = evaluatePickupDay({
      rules,
      date: saturday,
      now: new Date('2026-09-26T00:30:00.000Z'),
    });
    const after = evaluatePickupDay({
      rules,
      date: saturday,
      now: new Date('2026-09-26T01:00:00.000Z'),
    });
    expect(before.slots.find((slot) => slot.start === '11:00')?.available).toBe(
      true,
    );
    const closed = after.slots.find((slot) => slot.start === '11:00');
    expect(closed?.available).toBe(false);
    expect(closed?.reason).toContain('9:00 AM');
  });

  it('marks a slot full when booked orders reach capacity', () => {
    const rules: ShopPickupRules = {
      ...DEFAULT_PICKUP_RULES,
      slots: DEFAULT_PICKUP_RULES.slots.map((slot) =>
        slot.start === '11:00' ? { ...slot, capacity: 2 } : slot,
      ),
    };
    const quote = evaluatePickupDay({
      rules,
      date: saturday,
      now: eightAmKl,
      bookedBySlot: { '11:00': 2 },
    });
    const eleven = quote.slots.find((slot) => slot.start === '11:00');
    expect(eleven?.available).toBe(false);
    expect(eleven?.reason).toBe('This slot is full.');
    expect(eleven?.remaining).toBe(0);
  });

  it('closes a listed holiday', () => {
    const quote = evaluatePickupDay({
      rules: { ...DEFAULT_PICKUP_RULES, closedDates: [saturday] },
      date: saturday,
      now: eightAmKl,
    });
    expect(quote.closed).toBe(true);
    expect(quote.slots).toEqual([]);
    expect(quote.closedReason).toContain('closed');
  });
});

describe('evaluateStoreNow', () => {
  it('refuses in-store orders before opening', () => {
    const result = evaluateStoreNow(
      DEFAULT_PICKUP_RULES,
      new Date('2026-09-26T00:00:00.000Z'),
    );
    expect(result.open).toBe(false);
    expect(result.reason).toContain('10:00 AM');
  });

  it('accepts in-store orders during opening hours', () => {
    const result = evaluateStoreNow(
      DEFAULT_PICKUP_RULES,
      new Date('2026-09-26T02:30:00.000Z'),
    );
    expect(result.open).toBe(true);
  });
});

describe('normalizePickupRules', () => {
  it('rejects a slot outside store hours', () => {
    expect(() =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        slots: [
          {
            ...DEFAULT_PICKUP_RULES.slots[0],
            start: '20:00',
          },
        ],
      }),
    ).toThrow(PickupRulesError);
  });
});
