import { useEffect, useState } from 'react';
import { fetchMyBentoSubscriptions, fetchWeeklyOptInStatus } from '../api';
import type { WeeklyMenuPayload } from '../api';
import { SchedulePanel } from './SchedulePanel';
import { WeeklyMenuOptIn } from './WeeklyMenuOptIn';
import type { BentoSubscription } from './types';
import { formatRm } from './types';

function dietLabel(v: string) {
  return v === 'VEG' ? 'Vegetarian' : 'Regular';
}

export function MySubscriptions() {
  const [items, setItems] = useState<BentoSubscription[]>([]);
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void fetchMyBentoSubscriptions()
      .then(async (subs) => {
        setItems(subs);
        const needsSchedule = subs.some((s) => s.needsSchedule);
        if (needsSchedule) {
          const weekly = await fetchWeeklyOptInStatus();
          setWeeklyMenu(weekly.showPrompt ? weekly : null);
        } else {
          setWeeklyMenu(null);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const visibleItems = items.filter(
    (sub) => !['CANCELLED', 'EXPIRED', 'TERMINATED', 'DELETED', 'INACTIVE', 'REFUNDED'].includes(sub.status),
  );
  const needsSchedule = visibleItems.find((s) => s.needsSchedule);

  if (loading) return <p className="caption">Loading your bento orders…</p>;
  if (error) return <p className="err">{error}</p>;

  if (weeklyMenu) {
    return (
      <WeeklyMenuOptIn
        data={weeklyMenu}
        onDone={() => {
          setWeeklyMenu(null);
          load();
        }}
      />
    );
  }

  return (
    <>
      {needsSchedule && (
        <SchedulePanel subscription={needsSchedule} onScheduled={load} />
      )}

      {visibleItems.length === 0 && !needsSchedule ? (
        <section className="section">
          <h2>My Bento</h2>
          <p className="caption">No active Bento subscriptions yet. Head to Order to get started.</p>
        </section>
      ) : (
        <section className="section">
          <h2>My Bento</h2>
          <ul className="subList">
            {visibleItems.map((sub) => (
              <li key={sub.id} className="subCard">
                <div className="subHead">
                  <strong>{sub.package.label}</strong>
                  <span className={`statusPill status-${sub.status}`}>
                    {sub.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="caption">
                  {sub.mealOption}
                  {sub.mealOption !== 'DINNER' && ` · Lunch: ${dietLabel(sub.lunchVariant)}`}
                  {sub.mealOption !== 'LUNCH' && ` · Dinner: ${dietLabel(sub.dinnerVariant)}`}
                  {' · '}
                  {sub.riceType === 'BROWN' ? 'Brown rice' : 'White rice'}
                  {sub.includeDrinkAddon ? ' · Drinks included' : ''}
                </p>
                <p>
                  {formatRm(sub.totalCents)} · {sub.mealCreditsTotal} meals in plan
                  {sub.deliveries.length > 0 ? ` · ${sub.deliveries.length} pickup days` : ''}
                </p>
                {sub.needsSchedule && (
                  <p className="warn">Schedule your pickup days above.</p>
                )}
                {sub.startDate && sub.endDate && (
                  <p className="caption">
                    {sub.startDate} → {sub.endDate}
                  </p>
                )}
                {sub.deliveries.length > 0 && (
                  <details>
                    <summary>Pickup days ({sub.deliveries.length})</summary>
                    <ul className="deliveryMini">
                      {sub.deliveries.map((d) => (
                        <li key={d.id}>
                          {d.deliveryDate}
                          {d.includesLunch && d.includesDinner
                            ? ' · Lunch & dinner'
                            : d.includesLunch
                              ? ' · Lunch'
                              : ' · Dinner'}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btnSecondary" onClick={load}>
            Refresh
          </button>
        </section>
      )}
    </>
  );
}
