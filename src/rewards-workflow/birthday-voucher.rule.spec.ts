import { BadRequestException } from '@nestjs/common';
import {
  assertBirthdayVoucherUsable,
  birthdayCampaignWindow,
  birthdayVoucherBlock,
  isBirthdayCampaign,
} from './birthday-voucher.rule';

const bday = (month: number, day: number) =>
  new Date(Date.UTC(1990, month - 1, day));
// 2026-10-01 08:00 in Malaysia.
const NOW = new Date('2026-10-01T00:00:00Z');

const BIRTHDAY = {
  template: 'BIRTHDAY',
  autoCreditTrigger: 'BIRTHDAY',
  autoCreditThreshold: 30,
  voucherValidDays: 7,
};

describe('which campaigns count as birthday campaigns', () => {
  it('matches the template or the trigger', () => {
    expect(isBirthdayCampaign({ template: 'BIRTHDAY' })).toBe(true);
    expect(isBirthdayCampaign({ autoCreditTrigger: 'BIRTHDAY' })).toBe(true);
    expect(isBirthdayCampaign({ template: 'WELCOME' })).toBe(false);
    expect(isBirthdayCampaign(null)).toBe(false);
  });

  it('defaults to 30 days ahead and 7 after when the campaign sets neither', () => {
    expect(birthdayCampaignWindow({})).toEqual({ leadDays: 30, afterDays: 7 });
    expect(
      birthdayCampaignWindow({ autoCreditThreshold: 14, voucherValidDays: 30 }),
    ).toEqual({ leadDays: 14, afterDays: 30 });
  });
});

describe('using a birthday voucher', () => {
  it('is refused when the birthday is months away, and says when it opens', () => {
    const block = birthdayVoucherBlock(BIRTHDAY, bday(12, 21), NOW);
    expect(block).toMatchObject({
      code: 'BIRTHDAY_OUTSIDE_WINDOW',
      opensOn: '2026-11-21',
    });
    expect(block?.message).toContain('2026-11-21');
  });

  it('is refused when no birthday is on file', () => {
    expect(birthdayVoucherBlock(BIRTHDAY, null, NOW)?.code).toBe(
      'BIRTHDAY_NOT_SET',
    );
  });

  it('is allowed inside the window', () => {
    expect(birthdayVoucherBlock(BIRTHDAY, bday(10, 20), NOW)).toBeNull();
  });

  it('never gets in the way of other kinds of voucher', () => {
    expect(
      birthdayVoucherBlock({ template: 'WELCOME' }, bday(12, 21), NOW),
    ).toBeNull();
    expect(birthdayVoucherBlock({ template: 'WELCOME' }, null, NOW)).toBeNull();
  });

  it('throws the 400 the apps show the member', () => {
    expect(() =>
      assertBirthdayVoucherUsable(BIRTHDAY, bday(12, 21), NOW),
    ).toThrow(BadRequestException);
    expect(() =>
      assertBirthdayVoucherUsable(BIRTHDAY, bday(10, 20), NOW),
    ).not.toThrow();
  });
});
