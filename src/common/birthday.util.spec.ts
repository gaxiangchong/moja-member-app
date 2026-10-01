import { birthdayVoucherExpiry, nextBirthday } from './birthday.util';

/** Stored birthdays are date-only columns, so they arrive as UTC midnight. */
const bday = (month: number, day: number) =>
  new Date(Date.UTC(1990, month - 1, day));

describe('nextBirthday', () => {
  // 2026-10-01 08:00 in Malaysia.
  const now = new Date('2026-10-01T00:00:00Z');

  it('counts days to a birthday later this year', () => {
    expect(nextBirthday(bday(10, 21), now)).toMatchObject({
      year: 2026,
      daysUntil: 20,
    });
  });

  it('treats today as day zero, not a missed birthday', () => {
    expect(nextBirthday(bday(10, 1), now)).toMatchObject({
      year: 2026,
      daysUntil: 0,
    });
  });

  it('rolls to next year once the birthday has passed', () => {
    expect(nextBirthday(bday(9, 30), now)).toMatchObject({
      year: 2027,
      daysUntil: 364,
    });
  });

  it('looks across the new year for a January birthday in December', () => {
    const december = new Date('2026-12-20T04:00:00Z');
    expect(nextBirthday(bday(1, 5), december)).toMatchObject({
      year: 2027,
      daysUntil: 16,
    });
  });

  it("uses Malaysia's date, not the server's UTC date", () => {
    // 20:00 UTC on 30 Sep is already 04:00 on 1 Oct in Kuala Lumpur.
    const lateEvening = new Date('2026-09-30T20:00:00Z');
    // Their birthday is "today" in Malaysia, though UTC still says yesterday.
    expect(nextBirthday(bday(10, 1), lateEvening).daysUntil).toBe(0);
    // And 30 Sep has already gone there.
    expect(nextBirthday(bday(9, 30), lateEvening).year).toBe(2027);
  });
});

describe('birthdayVoucherExpiry', () => {
  const now = new Date('2026-10-01T00:00:00Z');

  it('lasts until the end of the Malaysian day N days after the birthday', () => {
    // Birthday 21 Oct + 7 days = 28 Oct, ending 23:59:59 MYT = 15:59:59 UTC.
    expect(birthdayVoucherExpiry(bday(10, 21), 7, now).toISOString()).toBe(
      '2026-10-28T15:59:59.000Z',
    );
  });

  it('defaults to 7 days when no valid number is configured', () => {
    expect(birthdayVoucherExpiry(bday(10, 21), 0, now).toISOString()).toBe(
      '2026-10-28T15:59:59.000Z',
    );
  });

  it('expires after the next birthday for someone whose birthday just passed', () => {
    const expiry = birthdayVoucherExpiry(bday(9, 30), 7, now);
    expect(expiry.getUTCFullYear()).toBe(2027);
  });
});
