import { describe, expect, it } from 'vitest';
import { allocateScheduleSelections } from './scheduleAllocation';
import type { BentoSubscription } from './types';

type Delivery = BentoSubscription['deliveries'][number];

function delivery(
  id: string,
  deliveryDate: string,
  lunchQty: number,
  dinnerQty = 0,
): Delivery {
  return {
    id,
    deliveryDate,
    includesLunch: lunchQty > 0,
    includesDinner: dinnerQty > 0,
    lunchQty,
    dinnerQty,
    status: 'SCHEDULED',
  };
}

function subscription(
  id: string,
  lunchCredits: number,
  dinnerCredits: number,
  deliveries: Delivery[] = [],
): BentoSubscription {
  return {
    id,
    mealOption:
      lunchCredits > 0 && dinnerCredits > 0
        ? 'BOTH'
        : lunchCredits > 0
          ? 'LUNCH'
          : 'DINNER',
    lunchVariant: 'NONVEG',
    dinnerVariant: 'NONVEG',
    riceType: 'WHITE',
    includeDrinkAddon: false,
    mealCreditsTotal: lunchCredits + dinnerCredits,
    lunchCredits,
    dinnerCredits,
    startDate: null,
    endDate: null,
    totalCents: 1000,
    totalRm: 10,
    status: 'ACTIVE',
    needsSchedule: deliveries.length === 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    package: {
      id: `package-${id}`,
      code: 'DAYS_7',
      label: 'Test',
      durationDays: 30,
      mealCredits: lunchCredits + dinnerCredits,
      pricePerMealCents: 1000,
      pricePerMealRm: 10,
      fixedCheckoutCents: null,
      isNewcomer: false,
      newcomerLunchOnly: false,
    },
    deliveries,
  };
}

describe('allocateScheduleSelections', () => {
  it('keeps existing pickups assigned to their original subscriptions', () => {
    const first = subscription('first', 2, 0, [
      delivery('a1', '2026-07-20', 1),
      delivery('a2', '2026-07-22', 1),
    ]);
    const second = subscription('second', 2, 0, [
      delivery('b1', '2026-07-21', 1),
      delivery('b2', '2026-07-23', 1),
    ]);

    const schedules = allocateScheduleSelections([first, second], [
      { date: '2026-07-20', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-21', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-22', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-23', lunchQty: 1, dinnerQty: 0 },
    ]);

    expect(schedules[0]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-20',
      '2026-07-22',
    ]);
    expect(schedules[1]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-21',
      '2026-07-23',
    ]);
  });

  it('assigns a replacement pickup to the plan whose credit was released', () => {
    const first = subscription('first', 2, 0, [
      delivery('a1', '2026-07-20', 1),
      delivery('a2', '2026-07-22', 1),
    ]);
    const second = subscription('second', 2, 0, [
      delivery('b1', '2026-07-21', 1),
      delivery('b2', '2026-07-23', 1),
    ]);

    const schedules = allocateScheduleSelections([first, second], [
      { date: '2026-07-20', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-21', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-23', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-24', lunchQty: 1, dinnerQty: 0 },
    ]);

    expect(schedules[0]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-20',
      '2026-07-24',
    ]);
    expect(schedules[1]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-21',
      '2026-07-23',
    ]);
  });

  it('does not assign meal slots to a plan without matching credits', () => {
    const lunchPlan = subscription('lunch', 2, 0);
    const dinnerPlan = subscription('dinner', 0, 2);

    const schedules = allocateScheduleSelections([lunchPlan, dinnerPlan], [
      { date: '2026-07-20', lunchQty: 1, dinnerQty: 1 },
      { date: '2026-07-21', lunchQty: 1, dinnerQty: 1 },
    ]);

    expect(schedules[0]!.slots.every((slot) => slot.dinnerQty === 0)).toBe(true);
    expect(schedules[1]!.slots.every((slot) => slot.lunchQty === 0)).toBe(true);
    expect(schedules[0]!.slots).toHaveLength(2);
    expect(schedules[1]!.slots).toHaveLength(2);
  });

  it('round-robins new group-buy pickups across equal plans', () => {
    const schedules = allocateScheduleSelections(
      [subscription('first', 2, 0), subscription('second', 2, 0)],
      [
        { date: '2026-07-20', lunchQty: 2, dinnerQty: 0 },
        { date: '2026-07-21', lunchQty: 2, dinnerQty: 0 },
      ],
    );

    expect(schedules[0]!.slots.map((slot) => slot.lunchQty)).toEqual([1, 1]);
    expect(schedules[1]!.slots.map((slot) => slot.lunchQty)).toEqual([1, 1]);
  });
});
