import { useEffect, useState } from 'react';
import { fetchScheduleCapacity } from '../api';
import { addDaysUtc, earliestSchedulableDateIso, formatDateOnly, parseDateOnly } from '../lib/dateUtils';

type Props = {
  /** Tighter copy when nested inside the payment success banner. */
  variant?: 'banner' | 'inline';
};

const DEFAULT_CAPACITY = 50;

export function CapacityUrgencyNotice({ variant = 'inline' }: Props) {
  const [dailyCapacityPacks, setDailyCapacityPacks] = useState(DEFAULT_CAPACITY);

  useEffect(() => {
    let cancelled = false;
    const from = earliestSchedulableDateIso();
    const to = formatDateOnly(addDaysUtc(parseDateOnly(from), 120));
    void fetchScheduleCapacity(from, to)
      .then((data) => {
        if (!cancelled && data.dailyCapacityPacks > 0) {
          setDailyCapacityPacks(data.dailyCapacityPacks);
        }
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const className =
    variant === 'banner' ? 'capacityUrgencyNotice capacityUrgencyNoticeBanner' : 'capacityUrgencyNotice';

  return (
    <p className={className}>
      Our daily kitchen capacity is <strong>{dailyCapacityPacks} packs</strong>. Please reserve your
      pickup days <strong>as soon as possible</strong> — once a day is full, you may not be able to
      schedule meals for that date.
    </p>
  );
}
