import {
  isVoucherExpired,
  isVoucherNotYetValid,
} from './admin-instore-voucher.util';

describe('admin-instore-voucher.util', () => {
  const now = Date.parse('2026-08-12T00:00:00.000Z');

  describe('isVoucherExpired', () => {
    it('is false when expiresAt is null/undefined', () => {
      expect(isVoucherExpired(null, now)).toBe(false);
      expect(isVoucherExpired(undefined, now)).toBe(false);
    });

    it('is true when expiresAt is in the past or exactly now', () => {
      expect(isVoucherExpired(new Date('2026-08-11T23:59:59.000Z'), now)).toBe(
        true,
      );
      expect(isVoucherExpired(new Date(now), now)).toBe(true);
    });

    it('is false when expiresAt is still in the future', () => {
      expect(isVoucherExpired(new Date('2026-08-12T00:00:01.000Z'), now)).toBe(
        false,
      );
    });
  });

  describe('isVoucherNotYetValid', () => {
    it('is false without metadata.validFrom', () => {
      expect(isVoucherNotYetValid(null, now)).toBe(false);
      expect(isVoucherNotYetValid({}, now)).toBe(false);
      expect(isVoucherNotYetValid({ validFrom: '' }, now)).toBe(false);
    });

    it('is true when validFrom is still in the future (birthday window)', () => {
      expect(
        isVoucherNotYetValid(
          { validFrom: '2026-09-01T00:00:00.000Z' },
          now,
        ),
      ).toBe(true);
    });

    it('is false once validFrom has arrived', () => {
      expect(
        isVoucherNotYetValid(
          { validFrom: '2026-08-11T00:00:00.000Z' },
          now,
        ),
      ).toBe(false);
      expect(
        isVoucherNotYetValid(
          { validFrom: '2026-08-12T00:00:00.000Z' },
          now,
        ),
      ).toBe(false);
    });
  });
});
