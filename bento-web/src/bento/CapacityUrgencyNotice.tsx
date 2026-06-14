import { useEffect, useState } from 'react';
import { fetchScheduleCapacity } from '../api';
import { addDaysUtc, earliestSchedulableDateIso, formatDateOnly, parseDateOnly } from '../lib/dateUtils';
import { useI18n } from '../lib/i18n/context';

type Props = {
  variant?: 'banner' | 'inline';
};

const DEFAULT_CAPACITY = 50;

export function CapacityUrgencyNotice({ variant = 'inline' }: Props) {
  const { t } = useI18n();
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
      {t('capacity.urgency', { count: dailyCapacityPacks })}
    </p>
  );
}
