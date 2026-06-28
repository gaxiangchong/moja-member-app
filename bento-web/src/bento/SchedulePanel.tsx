import { useMemo, useState } from 'react';
import { scheduleBentoSubscription } from '../api';
import { PickupReminderNotification } from './PickupReminderNotification';
import type { DayMealSelection } from './MealSchedulePicker';
import { MealSchedulePicker } from './MealSchedulePicker';
import type { BentoSubscription } from './types';

type Props = {
  subscription: BentoSubscription;
  onScheduled: () => void;
};

function buildSlotsFromSelections(selections: DayMealSelection[]) {
  return selections
    .filter((s) => s.includeLunch || s.includeDinner)
    .map((s) => ({
      date: s.date,
      includeLunch: s.includeLunch,
      includeDinner: s.includeDinner,
    }));
}

export function SchedulePanel({ subscription, onScheduled }: Props) {
  const sched = subscription.scheduling;
  const [selections, setSelections] = useState<DayMealSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const lunchScheduled = useMemo(
    () => selections.filter((s) => s.includeLunch).length,
    [selections],
  );
  const dinnerScheduled = useMemo(
    () => selections.filter((s) => s.includeDinner).length,
    [selections],
  );

  const canSave =
    sched &&
    lunchScheduled <= subscription.lunchCredits &&
    dinnerScheduled <= subscription.dinnerCredits &&
    (lunchScheduled > 0 || dinnerScheduled > 0);

  const save = async () => {
    if (!sched || !canSave) return;
    setLoading(true);
    setError(null);
    try {
      await scheduleBentoSubscription(subscription.id, {
        slots: buildSlotsFromSelections(selections),
      });
      setConfirmed(true);
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save schedule');
    } finally {
      setLoading(false);
    }
  };

  if (!sched) {
    return <p className="err">Scheduling is not available for this subscription.</p>;
  }

  if (confirmed) {
    return (
      <section className="section schedulePanel">
        <h2>Pickup reminder</h2>
        <PickupReminderNotification justConfirmed />
      </section>
    );
  }

  return (
    <section className="section schedulePanel">
      <h2>Schedule your pickups</h2>
      <p className="caption">
        Plan: <strong>{subscription.package.label}</strong> — tick lunch and/or dinner for each
        day you want a meal.
      </p>

      <MealSchedulePicker
        earliestDate={sched.earliestDate}
        windowEndDate={sched.windowEndDate}
        allowLunch={sched.allowLunch}
        allowDinner={sched.allowDinner}
        lunchCredits={subscription.lunchCredits}
        dinnerCredits={subscription.dinnerCredits}
        selections={selections}
        onChange={setSelections}
      />

      {error && <p className="err">{error}</p>}
      <button
        type="button"
        className="btnPrimary"
        disabled={loading || !canSave}
        onClick={() => void save()}
      >
        {loading ? 'Saving…' : 'Confirm pickup schedule'}
      </button>
    </section>
  );
}
