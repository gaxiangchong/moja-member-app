import {
  DEFAULT_PICKUP_RULES,
  evaluateInStoreNow,
  evaluatePickupDay,
  evaluateStoreNow,
  hoursForWeekday,
  needsPreorder,
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
      '19:00',
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
            start: '21:30',
          },
        ],
      }),
    ).toThrow(PickupRulesError);
  });
});

describe('collection windows that stay open until they end', () => {
  const monday = '2026-10-05';
  const at = (hhmm: string) =>
    // Kuala Lumpur is UTC+8 all year.
    new Date(
      `${monday}T${String((Number(hhmm.slice(0, 2)) + 24 - 8) % 24).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`,
    );
  const slot = (start: string, now: string) =>
    evaluatePickupDay({
      rules: DEFAULT_PICKUP_RULES,
      date: monday,
      now: at(now),
    }).slots.find((s) => s.start === start)!;

  it('offers 7pm – 9pm even after 7pm, while the shop is still open', () => {
    expect(slot('19:00', '19:57').available).toBe(true);
    expect(slot('19:00', '20:59').available).toBe(true);
  });

  it('closes it once the window has ended', () => {
    const late = slot('19:00', '21:00');
    expect(late.available).toBe(false);
    expect(late.reason).toContain('ended');
  });

  it('still needs lead time for the other slots, so 4pm – 7pm is closed at 5pm', () => {
    const four = slot('16:00', '17:00');
    expect(four.available).toBe(false);
    expect(four.reason).toContain('started');
    expect(slot('16:00', '13:00').available).toBe(true);
  });

  it('labels the third slot 4pm – 7pm', () => {
    expect(
      DEFAULT_PICKUP_RULES.slots.find((s) => s.start === '16:00')?.label,
    ).toBe('4pm – 7pm');
  });

  it('a slot with no end time still closes when it starts', () => {
    const rules = {
      ...DEFAULT_PICKUP_RULES,
      slots: DEFAULT_PICKUP_RULES.slots.map((s) =>
        s.start === '19:00' ? { ...s, endTime: null } : s,
      ),
    };
    const quote = evaluatePickupDay({
      rules,
      date: monday,
      now: at('19:30'),
    });
    expect(quote.slots.find((s) => s.start === '19:00')?.available).toBe(false);
  });

  it('refuses an end before the start, or after closing time', () => {
    const withEnd = (endTime: string) =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        slots: [{ ...DEFAULT_PICKUP_RULES.slots[3], endTime }],
      });
    expect(() => withEnd('18:00')).toThrow(PickupRulesError);
    expect(() => withEnd('22:00')).toThrow(PickupRulesError);
    expect(withEnd('21:00').slots[0].endTime).toBe('21:00');
  });
});

describe('opening hours decide which pickup times are offered', () => {
  const monday = '2026-10-05';
  const sunday = '2026-10-04';
  const at = (ymd: string, hhmm: string) =>
    new Date(
      `${ymd}T${String((Number(hhmm.slice(0, 2)) + 24 - 8) % 24).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`,
    );
  const slotsOn = (
    rules: typeof DEFAULT_PICKUP_RULES,
    date: string,
  ): string[] =>
    evaluatePickupDay({
      rules,
      date,
      now: at('2026-09-30', '09:00'),
    }).slots.map((s) => s.start);

  it('offers every slot that fits the default hours', () => {
    expect(slotsOn(DEFAULT_PICKUP_RULES, monday)).toEqual([
      '11:00',
      '14:00',
      '16:00',
      '19:00',
    ]);
  });

  it('drops the evening slot on a day that closes earlier', () => {
    const rules = normalizePickupRules({
      ...DEFAULT_PICKUP_RULES,
      weekdayHours: { 1: { open: '10:00', close: '18:00' } },
    });
    expect(slotsOn(rules, monday)).toEqual(['11:00', '14:00']);
  });

  it('refuses a slot that fits none of the days it is offered on, naming a day', () => {
    expect(() =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        weekdayHours: { 1: { open: '10:00', close: '18:00' } },
        slots: [
          {
            start: '19:00',
            endTime: '21:00',
            label: 'Evening',
            weekdays: [1],
            leadMinutes: 0,
            cutoffTime: null,
            capacity: null,
          },
        ],
      }),
    ).toThrow(/Monday/);
  });

  it('keeps a slot that still fits some of its days', () => {
    const rules = normalizePickupRules({
      ...DEFAULT_PICKUP_RULES,
      weekdayHours: { 1: { open: '10:00', close: '18:00' } },
    });
    // 7pm – 9pm is offered Tue – Sat, but not on Monday.
    expect(slotsOn(rules, monday)).toEqual(['11:00', '14:00']);
    expect(slotsOn(rules, '2026-10-06')).toContain('19:00');
  });

  it('later hours bring a later slot into reach', () => {
    const rules = normalizePickupRules({
      ...DEFAULT_PICKUP_RULES,
      weekdayHours: { 0: { open: '10:00', close: '15:00' } },
      slots: [
        ...DEFAULT_PICKUP_RULES.slots,
        {
          start: '13:00',
          endTime: '15:00',
          label: '1pm – 3pm',
          weekdays: [0],
          leadMinutes: 120,
          cutoffTime: null,
          capacity: null,
        },
      ],
    });
    expect(slotsOn(rules, sunday)).toEqual(['10:00', '13:00']);
  });

  it('shows that day’s hours in the quote, and uses them for "open now"', () => {
    const rules = normalizePickupRules({
      ...DEFAULT_PICKUP_RULES,
      weekdayHours: { 0: { open: '09:00', close: '15:00' } },
    });
    const quote = evaluatePickupDay({
      rules,
      date: sunday,
      now: at('2026-09-30', '09:00'),
    });
    expect([quote.openTime, quote.closeTime]).toEqual(['09:00', '15:00']);
    // Sunday 16:00 is after Sunday's 15:00 close, though weekdays run to 21:00.
    expect(evaluateStoreNow(rules, at(sunday, '16:00')).open).toBe(false);
    expect(evaluateStoreNow(rules, at(sunday, '14:00')).open).toBe(true);
    expect(evaluateStoreNow(rules, at(monday, '16:00')).open).toBe(true);
  });

  it('rejects an opening time that is not before closing', () => {
    expect(() =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        weekdayHours: { 2: { open: '18:00', close: '10:00' } },
      }),
    ).toThrow(PickupRulesError);
  });

  it('a closed weekday needs no hours', () => {
    const rules = normalizePickupRules({
      ...DEFAULT_PICKUP_RULES,
      closedWeekdays: [0],
      slots: DEFAULT_PICKUP_RULES.slots.filter((s) => s.start !== '10:00'),
    });
    expect(hoursForWeekday(rules, 0)).toBeNull();
    expect(
      evaluatePickupDay({ rules, date: sunday, now: at('2026-09-30', '09:00') })
        .closed,
    ).toBe(true);
  });
});

describe('pre-order notice for made-to-order categories', () => {
  // Saturday 31 Oct 2026, 10:00 in Kuala Lumpur.
  const now = new Date('2026-10-31T02:00:00.000Z');
  const rules = DEFAULT_PICKUP_RULES;

  it('applies only when the cart holds a pre-order category', () => {
    expect(needsPreorder(rules, ['whole_cakes', 'drinks'])).toBe(true);
    expect(needsPreorder(rules, ['cake_slices', 'drinks'])).toBe(false);
    expect(needsPreorder({ ...rules, preorderDays: 0 }, ['whole_cakes'])).toBe(
      false,
    );
  });

  it('closes today and tomorrow for a cake order and opens two days out', () => {
    for (const date of ['2026-10-31', '2026-11-01']) {
      const quote = evaluatePickupDay({ rules, date, now, preorder: true });
      expect(quote.closed).toBe(true);
      expect(quote.closedReason).toContain("2 days' notice");
      expect(quote.closedReason).toContain('2 Nov');
    }
    const ok = evaluatePickupDay({
      rules,
      date: '2026-11-02',
      now,
      preorder: true,
    });
    expect(ok.closed).toBe(false);
    expect(ok.minDate).toBe('2026-11-02');
    expect(ok.preorderDays).toBe(2);
    expect(ok.slots.some((slot) => slot.available)).toBe(true);
  });

  it('leaves other orders bookable today', () => {
    const quote = evaluatePickupDay({ rules, date: '2026-10-31', now });
    expect(quote.closed).toBe(false);
    expect(quote.minDate).toBe('2026-10-31');
    expect(quote.preorderDays).toBe(0);
  });

  it('fills in the default for rules saved before the setting existed', () => {
    const old: Partial<ShopPickupRules> = { ...DEFAULT_PICKUP_RULES };
    delete old.preorderDays;
    delete old.preorderCategories;
    const normalized = normalizePickupRules(old);
    expect(normalized.preorderDays).toBe(2);
    expect(normalized.preorderCategories).toEqual(['whole_cakes']);
  });

  it('keeps an admin choice of categories, including none', () => {
    expect(
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        preorderCategories: ['cookies', 'whole_cakes', 'cookies'],
      }).preorderCategories,
    ).toEqual(['cookies', 'whole_cakes']);
    expect(
      normalizePickupRules({ ...DEFAULT_PICKUP_RULES, preorderCategories: [] })
        .preorderCategories,
    ).toEqual([]);
  });

  it('rejects notice longer than the booking window', () => {
    expect(() =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        maxAdvanceDays: 3,
        preorderDays: 5,
      }),
    ).toThrow(PickupRulesError);
    expect(() =>
      normalizePickupRules({ ...DEFAULT_PICKUP_RULES, preorderDays: 1.5 }),
    ).toThrow(PickupRulesError);
  });
});

describe('in-store today window', () => {
  // Monday 2 Nov 2026 in Kuala Lumpur; default hours 10:00–21:00.
  const at = (hhmm: string) =>
    zonedWallToUtc('2026-11-02', hhmm, 'Asia/Kuala_Lumpur');

  it('is open during the day, ready after the prep time', () => {
    const window = evaluateInStoreNow(DEFAULT_PICKUP_RULES, at('15:10'));
    expect(window).toMatchObject({
      open: true,
      today: '2026-11-02',
      readyAt: '15:40',
    });
  });

  it('closes the cut-off before closing time', () => {
    expect(evaluateInStoreNow(DEFAULT_PICKUP_RULES, at('20:29')).open).toBe(
      true,
    );
    const late = evaluateInStoreNow(DEFAULT_PICKUP_RULES, at('20:30'));
    expect(late.open).toBe(false);
    expect(late.reason).toContain('8:30 PM');
  });

  it('is closed before opening and when switched off', () => {
    expect(evaluateInStoreNow(DEFAULT_PICKUP_RULES, at('09:00')).open).toBe(
      false,
    );
    const off: ShopPickupRules = {
      ...DEFAULT_PICKUP_RULES,
      inStore: { ...DEFAULT_PICKUP_RULES.inStore, enabled: false },
    };
    expect(evaluateInStoreNow(off, at('15:00')).open).toBe(false);
  });

  it('fills in defaults and validates minutes', () => {
    const old: Partial<ShopPickupRules> = { ...DEFAULT_PICKUP_RULES };
    delete old.inStore;
    expect(normalizePickupRules(old).inStore).toEqual(
      DEFAULT_PICKUP_RULES.inStore,
    );
    expect(() =>
      normalizePickupRules({
        ...DEFAULT_PICKUP_RULES,
        inStore: { ...DEFAULT_PICKUP_RULES.inStore, prepMinutes: -5 },
      }),
    ).toThrow(PickupRulesError);
  });
});
