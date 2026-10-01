import { VoucherLifecycleStatus as S } from '@prisma/client';
import {
  activityWhere,
  awardFilterWhere,
  summarizeAward,
} from './customer-engagement';

const NOW = new Date('2026-10-01T00:00:00Z');
const FUTURE = new Date('2026-12-01T00:00:00Z');
const PAST = new Date('2026-08-01T00:00:00Z');

describe('summarizeAward', () => {
  it('is "none" for a member who was never given one', () => {
    expect(summarizeAward([], NOW)).toMatchObject({ state: 'none', earned: 0 });
  });

  it('is "available" while an unused voucher is still in date', () => {
    expect(
      summarizeAward([{ status: S.ACTIVE, expiresAt: FUTURE }], NOW).state,
    ).toBe('available');
    expect(
      summarizeAward([{ status: S.ACTIVE, expiresAt: null }], NOW).state,
    ).toBe('available');
  });

  it('counts a voucher mid-checkout as still available', () => {
    expect(
      summarizeAward([{ status: S.LOCKED, expiresAt: FUTURE }], NOW).state,
    ).toBe('available');
  });

  it('is "used" once spent', () => {
    expect(
      summarizeAward([{ status: S.USED, expiresAt: FUTURE }], NOW).state,
    ).toBe('used');
  });

  it('treats an unspent voucher past its date as expired, even if still ACTIVE', () => {
    expect(
      summarizeAward([{ status: S.ACTIVE, expiresAt: PAST }], NOW).state,
    ).toBe('expired');
  });

  it('treats a withdrawn voucher as expired, not as spent', () => {
    expect(
      summarizeAward([{ status: S.VOID, expiresAt: FUTURE }], NOW).state,
    ).toBe('expired');
  });

  it("prefers something spendable over last year's spent one", () => {
    // A member who used 2026's birthday voucher and has 2027's waiting.
    expect(
      summarizeAward(
        [
          { status: S.USED, expiresAt: PAST },
          { status: S.ACTIVE, expiresAt: FUTURE },
        ],
        NOW,
      ),
    ).toMatchObject({ state: 'available', earned: 2, used: 1, available: 1 });
  });

  it('counts referral vouchers earned, spent and waiting', () => {
    expect(
      summarizeAward(
        [
          { status: S.USED, expiresAt: PAST },
          { status: S.USED, expiresAt: PAST },
          { status: S.ACTIVE, expiresAt: FUTURE },
          { status: S.ACTIVE, expiresAt: PAST },
        ],
        NOW,
      ),
    ).toMatchObject({ earned: 4, used: 2, available: 1 });
  });
});

describe('member-list filters', () => {
  it('builds a different clause for each activity', () => {
    const active = activityWhere('active', 60, NOW);
    const lapsed = activityWhere('lapsed', 60, NOW);
    const never = activityWhere('never', 60, NOW);
    expect(active).toHaveProperty('OR');
    expect(lapsed).toHaveProperty('AND');
    expect(never).toHaveProperty('NOT');
    expect(JSON.stringify(active)).not.toEqual(JSON.stringify(lapsed));
  });

  it('measures "recently" back from now, in the number of days asked for', () => {
    const where = activityWhere('active', 30, NOW) as {
      OR: { orders: { some: { placedAt: { gte: Date } } } }[];
    };
    const cutoff = where.OR[0].orders.some.placedAt.gte;
    expect(cutoff.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('excludes cancelled, refunded and unpaid orders from "bought"', () => {
    expect(JSON.stringify(activityWhere('never', 60, NOW))).toContain(
      'pending_payment',
    );
  });

  it('matches a custom campaign by its trigger as well as its template', () => {
    const where = awardFilterWhere('birthday', 'issued', NOW);
    const text = JSON.stringify(where);
    expect(text).toContain('"template":"BIRTHDAY"');
    expect(text).toContain('"autoCreditTrigger":"BIRTHDAY"');
  });

  it('counts both referral triggers as referral awards', () => {
    const text = JSON.stringify(awardFilterWhere('referral', 'issued', NOW));
    expect(text).toContain('REFERRAL_PURCHASE');
    expect(text).toContain('REFERRAL_COUNT');
  });

  it('"expired" means given one, spent none, and none still usable', () => {
    const where = awardFilterWhere('welcome', 'expired', NOW) as {
      AND: unknown[];
    };
    expect(where.AND).toHaveLength(3);
  });
});
