import { BentoDeliveryStatus } from '@prisma/client';

import {
  isImmutableScheduleDelivery,
  scheduleGateExemptDates,
  skippedDeliveryIdsToReclaim,
} from './bento-schedule-replace.util';
import { parseDateOnly } from './bento-weekly.util';

describe('bento-schedule-replace.util', () => {
  const skipped = {
    id: 'skip-1',
    deliveryDate: parseDateOnly('2026-09-20'),
    status: BentoDeliveryStatus.SKIPPED,
  };
  const delivered = {
    id: 'del-1',
    deliveryDate: parseDateOnly('2026-09-10'),
    status: BentoDeliveryStatus.DELIVERED,
  };
  const scheduled = {
    id: 'sch-1',
    deliveryDate: parseDateOnly('2026-09-12'),
    status: BentoDeliveryStatus.SCHEDULED,
  };

  it('does not exempt SKIPPED dates from schedule gates', () => {
    const dates = scheduleGateExemptDates([skipped, delivered, scheduled]);
    expect(dates.has('2026-09-20')).toBe(false);
    expect(dates.has('2026-09-10')).toBe(true);
    expect(dates.has('2026-09-12')).toBe(true);
  });

  it('treats SKIPPED days as reclaimable and DELIVERED as immutable', () => {
    expect(isImmutableScheduleDelivery(skipped, false)).toBe(false);
    expect(isImmutableScheduleDelivery(delivered, false)).toBe(true);
    expect(isImmutableScheduleDelivery(delivered, true)).toBe(true);
    expect(
      isImmutableScheduleDelivery(
        {
          id: 'future',
          deliveryDate: parseDateOnly('2099-01-15'),
          status: BentoDeliveryStatus.SCHEDULED,
        },
        false,
      ),
    ).toBe(false);
  });

  it('returns SKIPPED ids whose dates are in the incoming schedule', () => {
    expect(
      skippedDeliveryIdsToReclaim(
        [skipped, delivered, scheduled],
        new Set(['2026-09-20', '2026-09-12']),
      ),
    ).toEqual(['skip-1']);
    expect(
      skippedDeliveryIdsToReclaim(
        [skipped, delivered],
        new Set(['2026-09-12']),
      ),
    ).toEqual([]);
  });
});
