import { parseDateOnly } from './bento-weekly.util';
import { totalMealsAfterScheduleReplace } from './bento-schedule-credits.util';

describe('totalMealsAfterScheduleReplace', () => {
  it('counts only proposed rows when nothing is preserved', () => {
    const total = totalMealsAfterScheduleReplace({
      preservedDeliveries: [],
      proposedRows: [
        {
          deliveryDate: parseDateOnly('2026-08-01'),
          lunchQty: 1,
          dinnerQty: 1,
        },
        {
          deliveryDate: parseDateOnly('2026-08-02'),
          lunchQty: 1,
          dinnerQty: 0,
        },
      ],
      immutableDates: new Set(),
    });
    expect(total).toBe(3);
  });

  it('adds preserved delivered meals when the client omits them', () => {
    // Concrete abuse path: 2 delivered + payload of 5 new meals on a 5-credit plan.
    const total = totalMealsAfterScheduleReplace({
      preservedDeliveries: [
        { lunchQty: 1, dinnerQty: 0 },
        { lunchQty: 0, dinnerQty: 1 },
      ],
      proposedRows: [
        {
          deliveryDate: parseDateOnly('2026-08-10'),
          lunchQty: 2,
          dinnerQty: 3,
        },
      ],
      immutableDates: new Set(['2026-07-01', '2026-07-02']),
    });
    expect(total).toBe(7);
  });

  it('does not double-count immutable dates that are also in the payload', () => {
    // Normal UI path resubmits delivered days; those rows are kept as-is.
    const total = totalMealsAfterScheduleReplace({
      preservedDeliveries: [{ lunchQty: 1, dinnerQty: 1 }],
      proposedRows: [
        {
          deliveryDate: parseDateOnly('2026-07-01'),
          lunchQty: 1,
          dinnerQty: 1,
        },
        {
          deliveryDate: parseDateOnly('2026-08-10'),
          lunchQty: 1,
          dinnerQty: 0,
        },
      ],
      immutableDates: new Set(['2026-07-01']),
    });
    expect(total).toBe(3);
  });
});
