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
    scheduling: {
      minLeadDays: 1,
      earliestDate: '2026-07-01',
      windowEndDate: '2026-12-31',
      allowLunch: true,
      allowDinner: true,
      lunchScheduled: deliveries.reduce((total, row) => total + row.lunchQty, 0),
      dinnerScheduled: deliveries.reduce(
        (total, row) => total + row.dinnerQty,
        0,
      ),
    },
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

  it('lets a BOTH-split plan spend its pooled credits on all lunches', () => {
    // Checkout still seeds lunchCredits/dinnerCredits as a half/half split for
    // mealOption BOTH, but scheduling treats them as one flexible pool.
    const plan = subscription('pooled', 1, 2);

    const schedules = allocateScheduleSelections([plan], [
      { date: '2026-07-20', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-21', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-22', lunchQty: 1, dinnerQty: 0 },
    ]);

    expect(schedules[0]!.slots).toEqual([
      {
        date: '2026-07-20',
        includeLunch: true,
        includeDinner: false,
        lunchQty: 1,
        dinnerQty: 0,
      },
      {
        date: '2026-07-21',
        includeLunch: true,
        includeDinner: false,
        lunchQty: 1,
        dinnerQty: 0,
      },
      {
        date: '2026-07-22',
        includeLunch: true,
        includeDinner: false,
        lunchQty: 1,
        dinnerQty: 0,
      },
    ]);
  });

  it('does not move dinners onto another plan when order would change under round-robin', () => {
    // Subscription order is reversed vs date order — blind index round-robin
    // would swap ownership; ownership preservation must keep each plan's days.
    const first = subscription('first', 0, 2, [
      delivery('a1', '2026-07-20', 0, 1),
      delivery('a2', '2026-07-22', 0, 1),
    ]);
    const second = subscription('second', 0, 2, [
      delivery('b1', '2026-07-21', 0, 1),
      delivery('b2', '2026-07-23', 0, 1),
    ]);

    const schedules = allocateScheduleSelections([second, first], [
      { date: '2026-07-20', lunchQty: 0, dinnerQty: 1 },
      { date: '2026-07-21', lunchQty: 0, dinnerQty: 1 },
      { date: '2026-07-22', lunchQty: 0, dinnerQty: 1 },
      { date: '2026-07-23', lunchQty: 0, dinnerQty: 1 },
    ]);

    expect(schedules[0]!.subscriptionId).toBe('second');
    expect(schedules[0]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-21',
      '2026-07-23',
    ]);
    expect(schedules[1]!.subscriptionId).toBe('first');
    expect(schedules[1]!.slots.map((slot) => slot.date)).toEqual([
      '2026-07-20',
      '2026-07-22',
    ]);
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

  it('assigns new pickups only within each plan scheduling window', () => {
    const latePlan = subscription('late', 1, 0);
    latePlan.scheduling!.earliestDate = '2026-07-22';
    const earlyPlan = subscription('early', 1, 0);
    earlyPlan.scheduling!.windowEndDate = '2026-07-21';

    const schedules = allocateScheduleSelections([latePlan, earlyPlan], [
      { date: '2026-07-20', lunchQty: 1, dinnerQty: 0 },
      { date: '2026-07-23', lunchQty: 1, dinnerQty: 0 },
    ]);

    expect(schedules[0]!.slots.map((slot) => slot.date)).toEqual(['2026-07-23']);
    expect(schedules[1]!.slots.map((slot) => slot.date)).toEqual(['2026-07-20']);
  });

  it('rejects selections that exceed the combined pooled credit total', () => {
    expect(() =>
      allocateScheduleSelections(
        [subscription('small', 1, 1), subscription('tiny', 1, 0)],
        [
          { date: '2026-07-20', lunchQty: 2, dinnerQty: 0 },
          { date: '2026-07-21', lunchQty: 2, dinnerQty: 0 },
        ],
      ),
    ).toThrow(/exceed available meal credits/);
  });
});
