import { useEffect, useState } from 'react';
import { fetchMyBentoSubscriptions } from '../api';
import type { MemberProfile } from '../api';
import type { BentoSubscription } from './types';
import { CalendarScheduler } from './CalendarScheduler';
import { useI18n } from '../lib/i18n/context';

const INACTIVE = ['CANCELLED', 'EXPIRED', 'TERMINATED', 'DELETED', 'INACTIVE'];

type Props = {
  profile: MemberProfile | null;
};

export function ScheduleTab({ profile }: Props) {
  const { t } = useI18n();
  const [subs, setSubs] = useState<BentoSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void fetchMyBentoSubscriptions()
      .then(setSubs)
      .catch((err) => setError(err instanceof Error ? err.message : t('schedule.loadError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <p className="caption" style={{ padding: '20px 16px' }}>{t('common.loading')}</p>;
  }
  if (error) return <p className="err" style={{ padding: '20px 16px' }}>{error}</p>;

  const active = subs.filter((s) => !INACTIVE.includes(s.status));

  if (active.length === 0) {
    return (
      <section className="section">
        <h2>{t('schedule.title')}</h2>
        <p className="caption">{t('schedule.noPlan')}</p>
      </section>
    );
  }

  return (
    <CalendarScheduler
      subscriptions={active}
      onScheduled={load}
      kitchenPickupId={profile?.kitchenPickupId ?? null}
    />
  );
}
