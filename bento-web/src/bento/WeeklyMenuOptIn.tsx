import { useState } from 'react';
import { setWeeklyOptIn, type WeeklyMenuPayload } from '../api';

type Props = {
  data: WeeklyMenuPayload;
  onDone: (optedIn: boolean) => void;
};

export function WeeklyMenuOptIn({ data, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (optedIn: boolean) => {
    setLoading(true);
    setError(null);
    try {
      await setWeeklyOptIn(optedIn);
      onDone(optedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your choice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="weeklyGate">
      <header className="topBar">
        <h1>This week&apos;s menu</h1>
        <p className="caption">
          Week of {data.menu.weekStart} — {data.menu.weekEnd}
        </p>
      </header>

      <section className="section">
        <p className="caption">
          Thanks for your purchase! Review this week&apos;s dishes, then choose whether to opt in
          before you schedule pickup days.
        </p>
        <ul className="weeklyMenuList">
          {data.menu.days.map((day) => (
            <li key={day.date} className={day.isSunday ? 'weeklyDayOff' : ''}>
              <div className="weeklyDayHead">
                <strong>
                  {day.weekday} {day.date.slice(8)}
                </strong>
                {day.isSunday && <span className="dayOffTag">Kitchen closed</span>}
              </div>
              {!day.isSunday && (
                <>
                  <p className="weeklyMeal">
                    <span className="weeklyMealLabel">Lunch</span> {day.lunch.dish}
                  </p>
                  <p className="weeklyMeal">
                    <span className="weeklyMealLabel">Dinner</span> {day.dinner.dish}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="err">{error}</p>}

      <div className="weeklyOptActions">
        <button
          type="button"
          className="btnPrimary"
          disabled={loading}
          onClick={() => void respond(true)}
        >
          {loading ? 'Saving…' : 'Yes, opt in this week'}
        </button>
        <button
          type="button"
          className="btnSecondary"
          disabled={loading}
          onClick={() => void respond(false)}
        >
          Not this week
        </button>
      </div>
    </div>
  );
}
