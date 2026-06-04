import { useMemo } from 'react';
import {
  BENTO_MIN_SCHEDULE_LEAD_DAYS,
  isDateSchedulable,
  isSunday,
  schedulableWindowDates,
  weekdayLabel,
} from '../lib/dateUtils';

export type DayMealSelection = {
  date: string;
  includeLunch: boolean;
  includeDinner: boolean;
};

type Props = {
  earliestDate: string;
  windowEndDate: string;
  allowLunch: boolean;
  allowDinner: boolean;
  lunchCredits: number;
  dinnerCredits: number;
  selections: DayMealSelection[];
  onChange: (next: DayMealSelection[]) => void;
};

function countMeals(selections: DayMealSelection[]) {
  let lunch = 0;
  let dinner = 0;
  for (const s of selections) {
    if (s.includeLunch) lunch++;
    if (s.includeDinner) dinner++;
  }
  return { lunch, dinner };
}

export function MealSchedulePicker({
  earliestDate,
  windowEndDate,
  allowLunch,
  allowDinner,
  lunchCredits,
  dinnerCredits,
  selections,
  onChange,
}: Props) {
  const windowDates = useMemo(
    () => schedulableWindowDates(earliestDate, windowEndDate),
    [earliestDate, windowEndDate],
  );

  const { lunch: lunchScheduled, dinner: dinnerScheduled } = useMemo(
    () => countMeals(selections),
    [selections],
  );

  const lunchRemaining = lunchCredits - lunchScheduled;
  const dinnerRemaining = dinnerCredits - dinnerScheduled;

  const getRow = (date: string) =>
    selections.find((s) => s.date === date) ?? {
      date,
      includeLunch: false,
      includeDinner: false,
    };

  const updateRow = (date: string, patch: Partial<DayMealSelection>) => {
    const row = getRow(date);
    const next = { ...row, ...patch, date };
    const others = selections.filter((s) => s.date !== date);
    onChange([...others, next].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const toggle = (
    date: string,
    field: 'includeLunch' | 'includeDinner',
    enabled: boolean,
  ) => {
    if (!enabled) return;
    const row = getRow(date);
    const turningOn = !row[field];
    if (turningOn) {
      if (field === 'includeLunch' && lunchRemaining <= 0) return;
      if (field === 'includeDinner' && dinnerRemaining <= 0) return;
    }
    updateRow(date, { [field]: !row[field] });
  };

  return (
    <section className="mealSchedule">
      <div className="mealCreditsSummary">
        {allowLunch && (
          <p>
            <strong>Lunch:</strong> {lunchScheduled} of {lunchCredits} scheduled
            {lunchRemaining > 0 && (
              <span className="remaining"> · {lunchRemaining} left to pick</span>
            )}
            {lunchRemaining === 0 && lunchCredits > 0 && (
              <span className="remaining done"> · all scheduled</span>
            )}
          </p>
        )}
        {allowDinner && (
          <p>
            <strong>Dinner:</strong> {dinnerScheduled} of {dinnerCredits} scheduled
            {dinnerRemaining > 0 && (
              <span className="remaining"> · {dinnerRemaining} left to pick</span>
            )}
            {dinnerRemaining === 0 && dinnerCredits > 0 && (
              <span className="remaining done"> · all scheduled</span>
            )}
          </p>
        )}
      </div>

      <p className="caption">
        Pickup dates must be at least {BENTO_MIN_SCHEDULE_LEAD_DAYS} days ahead (earliest{' '}
        {earliestDate}) so we can prepare ingredients. Sundays are closed.
      </p>

      <ul className="mealScheduleList">
        {windowDates.map((iso) => {
          const sunday = isSunday(iso);
          const schedulable = isDateSchedulable(iso);
          const row = getRow(iso);
          const lunchDisabled =
            !allowLunch || !schedulable || sunday || (!row.includeLunch && lunchRemaining <= 0);
          const dinnerDisabled =
            !allowDinner ||
            !schedulable ||
            sunday ||
            (!row.includeDinner && dinnerRemaining <= 0);

          return (
            <li
              key={iso}
              className={`mealScheduleRow${sunday || !schedulable ? ' mealScheduleRowOff' : ''}`}
            >
              <div className="mealScheduleDate">
                <span className="dayWd">{weekdayLabel(iso)}</span>
                <span className="dayNum">{iso}</span>
                {sunday && <span className="dayOffTag">Closed</span>}
                {!sunday && !schedulable && (
                  <span className="dayOffTag">Too soon</span>
                )}
              </div>
              <div className="mealScheduleChecks">
                <label className={lunchDisabled ? 'checkDisabled' : ''}>
                  <input
                    type="checkbox"
                    checked={row.includeLunch}
                    disabled={lunchDisabled}
                    onChange={() => toggle(iso, 'includeLunch', !lunchDisabled)}
                  />
                  Lunch
                </label>
                <label className={dinnerDisabled ? 'checkDisabled' : ''}>
                  <input
                    type="checkbox"
                    checked={row.includeDinner}
                    disabled={dinnerDisabled}
                    onChange={() => toggle(iso, 'includeDinner', !dinnerDisabled)}
                  />
                  Dinner
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
