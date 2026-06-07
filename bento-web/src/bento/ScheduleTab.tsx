import { useEffect, useState } from 'react';
import { fetchMyBentoSubscriptions } from '../api';
import type { MemberProfile } from '../api';
import type { BentoSubscription } from './types';
import { CalendarScheduler } from './CalendarScheduler';

const INACTIVE = ['CANCELLED', 'EXPIRED', 'TERMINATED', 'DELETED', 'INACTIVE'];

type Props = {
  profile: MemberProfile | null;
};

export function ScheduleTab({ profile }: Props) {
  const [subs, setSubs] = useState<BentoSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void fetchMyBentoSubscriptions()
      .then(setSubs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <p className="caption" style={{ padding: '20px 16px' }}>Loading…</p>;
  if (error) return <p className="err" style={{ padding: '20px 16px' }}>{error}</p>;

  const active = subs.filter((s) => !INACTIVE.includes(s.status));

  if (active.length === 0) {
    return (
      <section className="section">
        <h2>Schedule</h2>
        <p className="caption">No active plan yet — order a package first.</p>
      </section>
    );
  }

  // All active subscriptions go into one unified calendar
  return (
    <CalendarScheduler
      subscriptions={active}
      onScheduled={load}
      kitchenPickupId={profile?.kitchenPickupId ?? null}
    />
  );
}
