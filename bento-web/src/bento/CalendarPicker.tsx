import { useMemo } from 'react';
import {
  availableDatesInWindow,
  filterMonFri,
  filterMonSat,
  isSunday,
  weekdayLabel,
  windowDates,
} from '../lib/dateUtils';

type Props = {
  durationDays: number;
  maxPickupDays: number;
  startDate: string;
  selectedDates: string[];
  onStartDateChange: (iso: string) => void;
  onSelectedDatesChange: (dates: string[]) => void;
};

export function CalendarPicker({
  durationDays,
  maxPickupDays,
  startDate,
  selectedDates,
  onStartDateChange,
  onSelectedDatesChange,
}: Props) {
  const window = useMemo(
    () => windowDates(startDate, durationDays),
    [startDate, durationDays],
  );

  const available = useMemo(
    () => availableDatesInWindow(startDate, durationDays),
    [startDate, durationDays],
  );

  const toggleDate = (iso: string) => {
    if (isSunday(iso)) return;
    if (selectedDates.includes(iso)) {
      onSelectedDatesChange(selectedDates.filter((d) => d !== iso));
    } else if (selectedDates.length < maxPickupDays) {
      onSelectedDatesChange([...selectedDates, iso].sort());
    }
  };

  const noneSelected = selectedDates.length === 0;

  return (
    <section className="section">
      <h2>Pickup schedule</h2>
      <p className="caption">
        Select up to {maxPickupDays} pickup day{maxPickupDays === 1 ? '' : 's'} within your plan window (Sundays closed).
      </p>

      <label className="fieldLabel" htmlFor="startDate">
        Start date
      </label>
      <input
        id="startDate"
        type="date"
        value={startDate}
        onChange={(e) => {
          const next = e.target.value;
          onStartDateChange(next);
          onSelectedDatesChange(availableDatesInWindow(next, durationDays));
        }}
        className="dateInput"
      />

      <div className="chipRow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="chip"
          onClick={() => onSelectedDatesChange([...available].slice(0, maxPickupDays))}
        >
          Fill up to limit
        </button>
        <button type="button" className="chip" onClick={() => onSelectedDatesChange(filterMonFri(window))}>
          Mon–Fri only
        </button>
        <button type="button" className="chip" onClick={() => onSelectedDatesChange(filterMonSat(window))}>
          Mon–Sat
        </button>
      </div>

      <ul className="dayGrid">
        {window.map((iso) => {
          const sunday = isSunday(iso);
          const checked = selectedDates.includes(iso);
          return (
            <li key={iso}>
              <label className={`dayCell${sunday ? ' dayCellOff' : ''}${checked ? ' dayCellOn' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={sunday}
                  onChange={() => toggleDate(iso)}
                />
                <span className="dayWd">{weekdayLabel(iso)}</span>
                <span className="dayNum">{iso.slice(8)}</span>
                {sunday && <span className="dayOffTag">Closed</span>}
              </label>
            </li>
          );
        })}
      </ul>

      {noneSelected && (
        <p className="warn" role="alert">
          You won&apos;t receive any bento boxes — please select at least one delivery day.
        </p>
      )}
    </section>
  );
}
