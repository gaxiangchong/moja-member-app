import { parseDateOnly } from '../lib/dateUtils';
import type { ScheduleRules } from '../api';

export type { ScheduleRules };

export const DEFAULT_SCHEDULE_RULES: ScheduleRules = {
  minScheduleLeadDays: 2,
  earliestPickupDate: null,
  earliestSchedulableDate: '',
  closedWeekdays: [0],
  closedDates: [],
};

export function makeScheduleHelpers(rules: ScheduleRules) {
  const closedWeekdays = new Set(rules.closedWeekdays);
  const closedDates = new Set(rules.closedDates);
  const earliestIso = rules.earliestSchedulableDate;
  const earliest = earliestIso ? parseDateOnly(earliestIso) : null;

  const isWeekdayClosed = (iso: string): boolean =>
    closedWeekdays.has(parseDateOnly(iso).getUTCDay());

  const isDateClosed = (iso: string): boolean =>
    isWeekdayClosed(iso) || closedDates.has(iso);

  const isDateSchedulable = (iso: string): boolean => {
    if (isDateClosed(iso)) return false;
    if (!earliest) return true;
    return parseDateOnly(iso) >= earliest;
  };

  const filterSchedulableDates = (dates: string[]): string[] =>
    dates.filter(isDateSchedulable);

  return {
    isWeekdayClosed,
    isDateClosed,
    isDateSchedulable,
    filterSchedulableDates,
    earliestSchedulableDateIso: earliestIso || null,
  };
}

export type ScheduleHelpers = ReturnType<typeof makeScheduleHelpers>;
