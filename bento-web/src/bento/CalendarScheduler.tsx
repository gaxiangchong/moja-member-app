import { useEffect, useMemo, useState } from 'react';
import { fetchScheduleCapacity, fetchScheduleRules, scheduleBentoSubscription } from '../api';
import { isPickupDateLocked } from '../lib/pickupLock';
import { useI18n } from '../lib/i18n/context';
import {
  addDaysUtc,
  formatDateOnly,
  parseDateOnly,
  schedulableWindowDates,
  todayUtc,
} from '../lib/dateUtils';
import { PickupReminderNotification } from './PickupReminderNotification';
import { PickupPackColorSummary } from './PickupPackColorSummary';
import { CapacityUrgencyNotice } from './CapacityUrgencyNotice';
import { buildUpcomingPickupSummaries } from './pickupPackSummary';
import {
  DEFAULT_SCHEDULE_RULES,
  makeScheduleHelpers,
  type ScheduleHelpers,
} from './scheduleRules';
import { allCreditsScheduled } from './scheduleCredits';
import type { BentoSubscription } from './types';

type Props = {
  subscriptions: BentoSubscription[];
  onScheduled: () => void;
  kitchenPickupId?: string | null;
};

/** Internal selection — quantity per meal per day. */
type DaySelection = {
  date: string;
  lunchQty: number;
  dinnerQty: number;
};

type SheetTarget =
  | { kind: 'single'; date: string }
  | { kind: 'range'; dates: string[]; from: string; to: string };

type ScheduleViewMode = 'calendar' | 'list';

type DayCapacity = {
  remainingPacks: number;
  isFull: boolean;
};

/** Max lunch + dinner packs this customer can place on a day (global kitchen limit). */
function maxTotalPacksOnDay(
  row: DaySelection,
  capacity: DayCapacity | undefined,
): number {
  const current = row.lunchQty + row.dinnerQty;
  if (!capacity) return current + 999;
  return current + capacity.remainingPacks;
}

// ── date helpers ───────────────────────────────────────────────────────────

function getMonthGrid(year: number, month: number): (string | null)[] {
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = new Array(firstDow).fill(null);
  for (let d = 1; d <= lastDate; d++)
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isPast(iso: string): boolean {
  return parseDateOnly(iso) < todayUtc();
}

function allDatesInRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  while (cur <= end) { out.push(formatDateOnly(cur)); cur = addDaysUtc(cur, 1); }
  return out;
}

/**
 * Auto-fill eligible days from the pooled credit balance — a lunch and a
 * dinner per set per day until the credits run out. Members can freely
 * reassign any meal to lunch or dinner afterwards.
 */
function buildAutoFill(
  windowDates: string[],
  totalCredits: number,
  maxQtyPerDay: number,
  isSchedulable: (iso: string) => boolean,
): DaySelection[] {
  const eligible = windowDates.filter((d) => isSchedulable(d));
  const result: DaySelection[] = [];
  let left = totalCredits;
  for (const date of eligible) {
    if (left <= 0) break;
    const lunchQty = Math.min(maxQtyPerDay, left);
    left -= lunchQty;
    const dinnerQty = Math.min(maxQtyPerDay, left);
    left -= dinnerQty;
    if (lunchQty > 0 || dinnerQty > 0) {
      result.push({ date, lunchQty, dinnerQty });
    }
  }
  return result;
}

/** Merge deliveries from all subscriptions, counting qty per date. */
function mergeDeliveries(subs: BentoSubscription[]): DaySelection[] {
  const map = new Map<string, DaySelection>();
  for (const sub of subs) {
    for (const d of sub.deliveries) {
      const ex = map.get(d.deliveryDate) ?? { date: d.deliveryDate, lunchQty: 0, dinnerQty: 0 };
      ex.lunchQty  += d.lunchQty  ?? (d.includesLunch  ? 1 : 0);
      ex.dinnerQty += d.dinnerQty ?? (d.includesDinner ? 1 : 0);
      map.set(d.deliveryDate, ex);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── component ──────────────────────────────────────────────────────────────

export function CalendarScheduler({ subscriptions, onScheduled, kitchenPickupId }: Props) {
  const { t, shortDate, fullDate, monthLabel, calendarDayHeaders } = useI18n();
  const N = subscriptions.length; // total sets

  const [scheduleHelpers, setScheduleHelpers] = useState<ScheduleHelpers>(() =>
    makeScheduleHelpers(DEFAULT_SCHEDULE_RULES),
  );

  useEffect(() => {
    let cancelled = false;
    void fetchScheduleRules()
      .then((rules) => {
        if (!cancelled) setScheduleHelpers(makeScheduleHelpers(rules));
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDateSchedulable = scheduleHelpers.isDateSchedulable;
  const isDateClosed = scheduleHelpers.isDateClosed;

  // ── Aggregate across all subscriptions ──────────────────────────────────
  // Meal credits are one flexible pool: any credit can become a lunch or a
  // dinner, so all limits below are on the combined total.
  const totalCredits = subscriptions.reduce(
    (s, sub) => s + sub.lunchCredits + sub.dinnerCredits,
    0,
  );

  const [showScheduler, setShowScheduler] = useState(
    () => !allCreditsScheduled(subscriptions),
  );

  const combinedWindow = useMemo(() => {
    const fallbackEarliest =
      scheduleHelpers.earliestSchedulableDateIso ?? formatDateOnly(todayUtc());
    const earlyDates = subscriptions.map(
      (s) => s.scheduling?.earliestDate ?? fallbackEarliest,
    );
    const endDates   = subscriptions.map(s =>
      s.scheduling?.windowEndDate ?? s.endDate ?? formatDateOnly(addDaysUtc(todayUtc(), 30)),
    );
    return {
      earliestDate:  [...earlyDates].sort()[0]!,
      windowEndDate: [...endDates].sort().reverse()[0]!,
    };
  }, [subscriptions, scheduleHelpers.earliestSchedulableDateIso]);

  const windowDates = useMemo(
    () => schedulableWindowDates(combinedWindow.earliestDate, combinedWindow.windowEndDate),
    [combinedWindow],
  );
  const windowSet = useMemo(() => new Set(windowDates), [windowDates]);

  const displayStart = useMemo(() => {
    const pastDates = subscriptions.flatMap(s => s.deliveries.map(d => d.deliveryDate)).sort();
    return ([combinedWindow.earliestDate, ...pastDates].sort()[0])!;
  }, [subscriptions, combinedWindow]);

  const displaySet = useMemo(
    () => new Set(allDatesInRange(displayStart, combinedWindow.windowEndDate)),
    [displayStart, combinedWindow.windowEndDate],
  );

  // ── Selections (qty per day) ─────────────────────────────────────────────
  const [selections, setSelections] = useState<DaySelection[]>(() => {
    const merged = mergeDeliveries(subscriptions);
    if (merged.length > 0) return merged;
    return buildAutoFill(windowDates, totalCredits, N, isDateSchedulable);
  });

  const [rangeStart, setRangeStart]   = useState<string | null>(null);
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [changedSinceSave, setChangedSinceSave] = useState(false);

  const [viewYear, setViewYear]   = useState(() => todayUtc().getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => todayUtc().getUTCMonth() + 1);
  const [viewMode, setViewMode]   = useState<ScheduleViewMode>('calendar');
  const [capacityByDate, setCapacityByDate] = useState<Map<string, DayCapacity>>(new Map());
  const [dailyCapacityPacks, setDailyCapacityPacks] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchScheduleCapacity(displayStart, combinedWindow.windowEndDate)
      .then((data) => {
        if (cancelled) return;
        setDailyCapacityPacks(data.dailyCapacityPacks);
        const map = new Map<string, DayCapacity>();
        for (const day of data.days) {
          map.set(day.date, {
            remainingPacks: day.remainingPacks,
            isFull: day.isFull,
          });
        }
        setCapacityByDate(map);
      })
      .catch(() => {
        if (!cancelled) {
          setCapacityByDate(new Map());
          setDailyCapacityPacks(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [displayStart, combinedWindow.windowEndDate, subscriptions]);

  useEffect(() => {
    const merged = mergeDeliveries(subscriptions);
    if (merged.length > 0 && !changedSinceSave) {
      setSelections(merged);
    }
  }, [subscriptions, changedSinceSave]);

  // ── Credit counters (pooled) ─────────────────────────────────────────────
  const todayIso       = formatDateOnly(todayUtc());
  const lunchConsumed  = selections.filter(s => s.date <  todayIso).reduce((n, s) => n + s.lunchQty,  0);
  const dinnerConsumed = selections.filter(s => s.date <  todayIso).reduce((n, s) => n + s.dinnerQty, 0);
  const lunchUpcoming  = selections.filter(s => s.date >= todayIso).reduce((n, s) => n + s.lunchQty,  0);
  const dinnerUpcoming = selections.filter(s => s.date >= todayIso).reduce((n, s) => n + s.dinnerQty, 0);
  const creditsConsumed   = lunchConsumed + dinnerConsumed;
  const creditsUpcoming   = lunchUpcoming + dinnerUpcoming;
  const creditsUnscheduled = totalCredits - creditsConsumed - creditsUpcoming;
  const anyUnscheduled = creditsUnscheduled > 0;

  const anyNeedsSchedule = subscriptions.some(s => s.needsSchedule);
  const hasSavedSchedule = subscriptions.some((s) => s.deliveries.length > 0);
  const allMealsScheduled = !anyUnscheduled;
  const canShowNotification =
    allMealsScheduled && !showScheduler && (scheduleConfirmed || hasSavedSchedule);
  // Show the pickup code / QR as soon as there's at least one upcoming pickup,
  // even if the plan isn't fully scheduled yet (e.g. a 30-meal plan with only a
  // few days booked so far). Hidden while actively editing to avoid a stale card.
  const hasUpcomingPickup = lunchUpcoming > 0 || dinnerUpcoming > 0;
  const showPickupInfo =
    !isEditingSchedule &&
    (scheduleConfirmed || (hasSavedSchedule && hasUpcomingPickup));
  const incompleteSummary = t('rhythm.mealsCount', { count: creditsUnscheduled });

  useEffect(() => {
    if (!allMealsScheduled) {
      setShowScheduler(true);
      return;
    }
    if (hasSavedSchedule && !changedSinceSave && !isEditingSchedule) {
      setShowScheduler(false);
    }
  }, [allMealsScheduled, hasSavedSchedule, changedSinceSave, isEditingSchedule]);

  const getRow = (date: string): DaySelection =>
    selections.find(s => s.date === date) ?? { date, lunchQty: 0, dinnerQty: 0 };

  const listDates = useMemo(
    () => allDatesInRange(displayStart, combinedWindow.windowEndDate),
    [displayStart, combinedWindow.windowEndDate],
  );

  const isDayInteractive = (iso: string): boolean => {
    if (!windowSet.has(iso) || isDateClosed(iso) || isPast(iso) || isPickupDateLocked(iso) || !isDateSchedulable(iso)) {
      return false;
    }
    const row = getRow(iso);
    if (row.lunchQty > 0 || row.dinnerQty > 0) return true;
    return !capacityByDate.get(iso)?.isFull;
  };

  const dayStatusLabel = (iso: string): string | null => {
    if (isDateClosed(iso)) return t('schedule.status.closed');
    if (isPast(iso)) return t('schedule.status.past');
    if (!windowSet.has(iso)) return t('schedule.status.outside');
    if (!isDateSchedulable(iso)) return t('schedule.status.tooSoon');
    if (isPickupDateLocked(iso)) return t('schedule.status.confirmed');
    const row = getRow(iso);
    if (capacityByDate.get(iso)?.isFull && row.lunchQty === 0 && row.dinnerQty === 0) {
      return t('schedule.status.full');
    }
    return null;
  };

  // ── Qty updater ──────────────────────────────────────────────────────────
  const setQty = (dates: string[], lunchQty: number | null, dinnerQty: number | null) => {
    if (dates.some((date) => isPickupDateLocked(date))) return;
    setChangedSinceSave(true);
    setSelections(prev => {
      const outside = prev.filter(s => !dates.includes(s.date));
      const updated = dates.map(date => {
        const cur = prev.find(s => s.date === date) ?? { date, lunchQty: 0, dinnerQty: 0 };
        let nextLunch = lunchQty !== null ? Math.max(0, lunchQty) : cur.lunchQty;
        let nextDinner = dinnerQty !== null ? Math.max(0, dinnerQty) : cur.dinnerQty;
        const maxTotal = maxTotalPacksOnDay(cur, capacityByDate.get(date));
        while (nextLunch + nextDinner > maxTotal) {
          if (dinnerQty !== null && nextDinner > cur.dinnerQty) nextDinner--;
          else if (lunchQty !== null && nextLunch > cur.lunchQty) nextLunch--;
          else if (nextDinner > 0) nextDinner--;
          else if (nextLunch > 0) nextLunch--;
          else break;
        }
        return {
          date,
          lunchQty: nextLunch,
          dinnerQty: nextDinner,
        };
      });
      return [...outside, ...updated]
        .filter(s => s.lunchQty > 0 || s.dinnerQty > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  // ── Clear all future selections ──────────────────────────────────────────
  const clearAll = () => {
    setChangedSinceSave(true);
    setRangeStart(null);
    setSelections((prev) =>
      prev.filter((s) => isPast(s.date) || isPickupDateLocked(s.date)),
    );
  };

  // ── Tap handler (range selection) ────────────────────────────────────────
  const handleDayTap = (iso: string) => {
    if (!isDayInteractive(iso)) return;
    if (rangeStart === null) {
      setRangeStart(iso);
    } else if (rangeStart === iso) {
      setRangeStart(null);
      setSheetTarget({ kind: 'single', date: iso });
    } else {
      const from = rangeStart < iso ? rangeStart : iso;
      const to   = rangeStart < iso ? iso : rangeStart;
      const dates = windowDates.filter(d =>
        d >= from && d <= to && isDayInteractive(d),
      );
      setRangeStart(null);
      setSheetTarget(dates.length <= 1
        ? { kind: 'single', date: dates[0] ?? iso }
        : { kind: 'range', dates, from, to });
    }
  };

  // ── Month nav ────────────────────────────────────────────────────────────
  const dispStart = parseDateOnly(displayStart);
  const dispEnd   = parseDateOnly(combinedWindow.windowEndDate);
  const canGoPrev = new Date(Date.UTC(viewYear, viewMonth - 1, 1)) >
    new Date(Date.UTC(dispStart.getUTCFullYear(), dispStart.getUTCMonth(), 1));
  const canGoNext = new Date(Date.UTC(viewYear, viewMonth - 1, 1)) <
    new Date(Date.UTC(dispEnd.getUTCFullYear(), dispEnd.getUTCMonth(), 1));
  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  // ── Save (round-robin distribution across subscriptions) ─────────────────
  const persistSchedule = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const sorted = [...selections].sort((a, b) => a.date.localeCompare(b.date));

      const lunchSlots: string[] = [];
      const dinnerSlots: string[] = [];
      for (const sel of sorted) {
        for (let i = 0; i < sel.lunchQty;  i++) lunchSlots.push(sel.date);
        for (let i = 0; i < sel.dinnerQty; i++) dinnerSlots.push(sel.date);
      }

      for (let si = 0; si < N; si++) {
        const sub = subscriptions[si]!;
        const myLunch  = lunchSlots.filter((_,  idx) => idx % N === si);
        const myDinner = dinnerSlots.filter((_, idx) => idx % N === si);

        // Count quantity per date so a single plan can place several meals/day.
        const dateMap = new Map<string, { lunchQty: number; dinnerQty: number }>();
        myLunch.forEach(d => {
          const e = dateMap.get(d) ?? { lunchQty: 0, dinnerQty: 0 };
          e.lunchQty += 1; dateMap.set(d, e);
        });
        myDinner.forEach(d => {
          const e = dateMap.get(d) ?? { lunchQty: 0, dinnerQty: 0 };
          e.dinnerQty += 1; dateMap.set(d, e);
        });

        const slots = [...dateMap.entries()]
          .map(([date, m]) => ({
            date,
            includeLunch: m.lunchQty > 0,
            includeDinner: m.dinnerQty > 0,
            lunchQty: m.lunchQty,
            dinnerQty: m.dinnerQty,
          }))
          .filter(s => s.lunchQty > 0 || s.dinnerQty > 0);

        await scheduleBentoSubscription(sub.id, { slots });
      }

      setChangedSinceSave(false);
      onScheduled();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('schedule.errorSave'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const finishToNotification = () => {
    setScheduleConfirmed(true);
    setIsEditingSchedule(false);
    setShowScheduler(false);
    setShowIncompleteWarning(false);
  };

  const handleConfirm = async () => {
    if (anyUnscheduled) {
      if (changedSinceSave) {
        const ok = await persistSchedule();
        if (!ok) return;
      }
      setShowIncompleteWarning(true);
      setShowScheduler(true);
      return;
    }

    if (changedSinceSave || anyNeedsSchedule || isEditingSchedule) {
      const ok = await persistSchedule();
      if (!ok) return;
    }
    finishToNotification();
  };

  const hasFutureSelections = lunchUpcoming > 0 || dinnerUpcoming > 0;
  const canConfirmSchedule =
    hasFutureSelections &&
    (anyNeedsSchedule || changedSinceSave || isEditingSchedule);
  const confirmDayCount = selections.filter((s) => s.date >= todayIso).length;

  const cancelEditing = () => {
    if (!allMealsScheduled) {
      setShowIncompleteWarning(true);
      return;
    }
    const merged = mergeDeliveries(subscriptions);
    if (merged.length > 0) {
      setSelections(merged);
    }
    setChangedSinceSave(false);
    setIsEditingSchedule(false);
    setShowScheduler(false);
    setError(null);
  };

  // ── Sheet qty limits for the open day/range ───────────────────────────────
  const sheetRow = sheetTarget?.kind === 'single' ? getRow(sheetTarget.date) : null;
  const sheetCapacity = sheetTarget?.kind === 'single'
    ? capacityByDate.get(sheetTarget.date)
    : undefined;
  const sheetMaxTotalPacks = sheetRow
    ? maxTotalPacksOnDay(sheetRow, sheetCapacity)
    : 999;
  // Credits left in the shared pool (not yet consumed or booked upcoming).
  const poolLeft = Math.max(0, totalCredits - creditsConsumed - creditsUpcoming);
  // Per-day quantity is bounded by the pooled remaining credits and kitchen
  // capacity only (no fixed per-day cap) so a plan can pick up meals to share.
  const maxLunchQty  = Math.min(
    (sheetRow ? sheetRow.lunchQty : 0) + poolLeft,
    sheetRow ? sheetMaxTotalPacks - sheetRow.dinnerQty : Number.MAX_SAFE_INTEGER,
  );
  const maxDinnerQty = Math.min(
    (sheetRow ? sheetRow.dinnerQty : 0) + poolLeft,
    sheetRow ? sheetMaxTotalPacks - sheetRow.lunchQty : Number.MAX_SAFE_INTEGER,
  );

  const cells = getMonthGrid(viewYear, viewMonth);

  const pickupSummaries = useMemo(
    () => buildUpcomingPickupSummaries(subscriptions, todayIso),
    [subscriptions, todayIso],
  );

  const nextPickupSummary = pickupSummaries[0] ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <section className="section">
        <h2 style={{ margin: '0 0 4px' }}>
          {canShowNotification
            ? t('schedule.pickupReminder')
            : isEditingSchedule
              ? t('schedule.changePickup')
              : t('schedule.title')}
        </h2>
        {(isEditingSchedule || showScheduler) && (
          <p className="caption calLockPolicy">{t('schedule.lockPolicy')}</p>
        )}
        {isEditingSchedule && (
          <p className="caption" style={{ marginBottom: 12 }}>
            {t('schedule.editHint')}
          </p>
        )}
        {!isEditingSchedule && showScheduler && anyNeedsSchedule && (
          <div className="capacityUrgencyCard">
            <CapacityUrgencyNotice />
          </div>
        )}
        {!isEditingSchedule && showScheduler && anyUnscheduled && (
          <p className="caption" style={{ marginBottom: 12 }}>
            {t('schedule.assignFirst')}
          </p>
        )}
        {N > 1 && showScheduler && (
          <p className="caption" style={{ marginBottom: 12 }}>
            {t('schedule.multiPlan', { count: N, max: N })}
          </p>
        )}

        {showPickupInfo && (
          <PickupReminderNotification
            justConfirmed={scheduleConfirmed}
            pickupId={kitchenPickupId}
            nextPickup={nextPickupSummary}
          />
        )}

        {canShowNotification && (
          <div className="pickupUpcomingSummary">
            {pickupSummaries.length > 0 && (
              <>
                <p className="pickupUpcomingTitle">{t('schedule.upcomingTitle')}</p>
                <ul className="pickupUpcomingList">
                  {pickupSummaries.map((summary) => (
                    <li key={summary.date}>
                      <span className="pickupUpcomingDate">{fullDate(summary.date)}</span>
                      <PickupPackColorSummary summary={summary} compact />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button
              type="button"
              className="btnSecondary pickupEditBtn"
              onClick={() => {
                setScheduleConfirmed(false);
                setIsEditingSchedule(true);
                setShowScheduler(true);
              }}
            >
              {t('schedule.changePickup')}
            </button>
          </div>
        )}

        {showScheduler && (
          <>
        {/* Credit summary — one flexible pool, spendable on lunch or dinner */}
        <div className="calCreditsSummary">
          <div className="calCreditBlock">
            <span className="calCreditIcon">🍱</span>
            <div className="calCreditDetail">
              <span className="calCreditLabel">{t('schedule.mealCreditLabel', { count: totalCredits })}</span>
              <span className="calCreditNumbers">
                {creditsConsumed  > 0 && <span className="calCreditUsed">{t('schedule.used', { count: creditsConsumed })}</span>}
                {creditsUpcoming  > 0 && <span className="calCreditUpcoming">{t('schedule.upcoming', { count: creditsUpcoming })}</span>}
                {creditsUnscheduled  > 0 && <span className="calCreditWarn">{t('schedule.unused', { count: creditsUnscheduled })}</span>}
                {creditsUnscheduled <= 0 && creditsUpcoming > 0 && <span className="calCreditDone">{t('schedule.allScheduled')}</span>}
                {creditsConsumed === 0 && creditsUpcoming === 0 && <span className="calCreditUpcoming">{t('schedule.ready')}</span>}
              </span>
              <span className="caption">{t('schedule.flexibleHint')}</span>
            </div>
          </div>
        </div>

        {anyUnscheduled && (
          <div className="calUnschedWarn">
            {t(viewMode === 'calendar' ? 'schedule.unusedWarnCalendar' : 'schedule.unusedWarnList')}
          </div>
        )}

        <div className="calViewToggle" role="tablist" aria-label={t('schedule.viewAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            className={`calViewBtn${viewMode === 'calendar' ? ' active' : ''}`}
            onClick={() => { setViewMode('calendar'); setRangeStart(null); }}
          >
            {t('common.calendar')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`calViewBtn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => { setViewMode('list'); setRangeStart(null); setSheetTarget(null); }}
          >
            {t('common.list')}
          </button>
        </div>

        {viewMode === 'calendar' ? (
          <>
        {/* Tap hint / range in-progress */}
        {rangeStart ? (
          <div className="calRangeHint">
            <span>{t('schedule.rangeHint', { start: shortDate(rangeStart) })}</span>
            <button type="button" className="calRangeCancel" onClick={() => setRangeStart(null)}>✕</button>
          </div>
        ) : (
          <p className="calTip">
            {t('schedule.tipCalendar')}
            {dailyCapacityPacks != null && t('schedule.tipCapacity', { count: dailyCapacityPacks })}
          </p>
        )}

        {/* Month nav */}
        <div className="calMonthNav">
          <button type="button" className="calNavBtn" disabled={!canGoPrev} onClick={prevMonth}>‹</button>
          <span className="calMonthName">{monthLabel(viewYear, viewMonth)}</span>
          <button type="button" className="calNavBtn" disabled={!canGoNext} onClick={nextMonth}>›</button>
        </div>

        <div className="calDayHeaders">
          {calendarDayHeaders().map(d => (
            <span key={d} className="calDayHeader">{d}</span>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="calGrid">
          {cells.map((iso, idx) => {
            if (!iso) return <span key={`p${idx}`} className="calCell calPad" />;
            const inDisplay   = displaySet.has(iso);
            const inWindow    = windowSet.has(iso);
            const closed      = isDateClosed(iso);
            const past        = isPast(iso);
            const locked      = !past && isPickupDateLocked(iso);
            const row         = getRow(iso);
            const hasSel      = row.lunchQty > 0 || row.dinnerQty > 0;
            const totalQty    = row.lunchQty + row.dinnerQty;
            const isStart     = iso === rangeStart;
            const interactive = isDayInteractive(iso);
            const atCapacity  = !hasSel && Boolean(capacityByDate.get(iso)?.isFull);
            const dayNum      = parseInt(iso.split('-')[2]!, 10);

            let stateClass = 'calOutside';
            if (inDisplay || inWindow) {
              if (closed)                        stateClass = 'calSunday';
              else if (past && hasSel)             stateClass = 'calConsumed';
              else if (past)                       stateClass = 'calPastEmpty';
              else if (isStart)                    stateClass = 'calRangeStart';
              else if (!isDateSchedulable(iso))    stateClass = 'calTooSoon';
              else if (locked && hasSel)           stateClass = 'calScheduledLocked';
              else if (locked)                     stateClass = 'calTooSoon';
              else if (atCapacity)                 stateClass = 'calFull';
              else if (hasSel)                     stateClass = 'calScheduled';
              else                                 stateClass = 'calAvailable';
            }

            return (
              <button
                key={iso}
                type="button"
                className={`calCell ${stateClass}`}
                disabled={!interactive}
                onClick={() => handleDayTap(iso)}
                title={atCapacity ? t('schedule.fullyBooked') : undefined}
              >
                <span className="calDayNum">{dayNum}</span>
                {atCapacity && <span className="calFullTag">{t('common.full')}</span>}
                {hasSel && !isStart && (
                  <span className="calDot">
                    {totalQty > 1 ? `×${totalQty}` : '●'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
          </>
        ) : (
          <>
            <p className="calTip">{t('schedule.tipList')}</p>
            <ul className="calListView">
              {listDates.map((iso) => {
                const row = getRow(iso);
                const interactive = isDayInteractive(iso);
                const status = dayStatusLabel(iso);
                const hasSel = row.lunchQty > 0 || row.dinnerQty > 0;
                const dayCapacity = capacityByDate.get(iso);
                const maxTotal = maxTotalPacksOnDay(row, dayCapacity);
                // Pooled credits: either meal can grow while the shared pool lasts.
                const rowLunchMax = Math.min(
                  row.lunchQty + poolLeft,
                  maxTotal - row.dinnerQty,
                );
                const rowDinnerMax = Math.min(
                  row.dinnerQty + poolLeft,
                  maxTotal - row.lunchQty,
                );

                if (!interactive && !hasSel && status !== t('schedule.status.full')) return null;

                return (
                  <li
                    key={iso}
                    className={`calListRow${!interactive ? ' calListRowOff' : ''}${hasSel ? ' calListRowSelected' : ''}${status === t('schedule.status.full') ? ' calListRowFull' : ''}`}
                  >
                    <div className="calListDate">
                      <strong>{shortDate(iso)}</strong>
                      <span className="calListDateIso">{iso}</span>
                      {status && <span className="calListStatus">{status}</span>}
                    </div>
                    <div className="calListMeals">
                      <div className="calListMeal">
                          <span className="calListMealLabel">🌞 {t('common.lunch')}</span>
                          {interactive ? (
                            <div className="calSheetQtyControl">
                              <button
                                type="button"
                                className="calSheetQtyBtn"
                                disabled={row.lunchQty <= 0}
                                onClick={() => setQty([iso], row.lunchQty - 1, null)}
                              >−</button>
                              <span className={`calSheetQtyValue${row.lunchQty > 0 ? ' active' : ''}`}>{row.lunchQty}</span>
                              <button
                                type="button"
                                className="calSheetQtyBtn"
                                disabled={row.lunchQty >= rowLunchMax}
                                onClick={() => setQty([iso], row.lunchQty + 1, null)}
                              >+</button>
                            </div>
                          ) : (
                            <span className="calListQtyReadonly">{row.lunchQty > 0 ? row.lunchQty : '—'}</span>
                          )}
                        </div>
                      <div className="calListMeal">
                          <span className="calListMealLabel">🌙 {t('common.dinner')}</span>
                          {interactive ? (
                            <div className="calSheetQtyControl">
                              <button
                                type="button"
                                className="calSheetQtyBtn"
                                disabled={row.dinnerQty <= 0}
                                onClick={() => setQty([iso], null, row.dinnerQty - 1)}
                              >−</button>
                              <span className={`calSheetQtyValue${row.dinnerQty > 0 ? ' active' : ''}`}>{row.dinnerQty}</span>
                              <button
                                type="button"
                                className="calSheetQtyBtn"
                                disabled={row.dinnerQty >= rowDinnerMax}
                                onClick={() => setQty([iso], null, row.dinnerQty + 1)}
                              >+</button>
                            </div>
                          ) : (
                            <span className="calListQtyReadonly">{row.dinnerQty > 0 ? row.dinnerQty : '—'}</span>
                          )}
                        </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}

        {/* Action buttons */}
        <div className="calActionRow">
          {canConfirmSchedule && (
            <button
              type="button"
              className="btnPrimary"
              disabled={loading}
              onClick={() => void handleConfirm()}
            >
              {loading
                ? t('schedule.saving')
                : changedSinceSave
                  ? t('schedule.saveChanges')
                  : t(confirmDayCount === 1 ? 'schedule.confirmDays' : 'schedule.confirmDaysPlural', { count: confirmDayCount })}
            </button>
          )}
          {isEditingSchedule && (
            <button
              type="button"
              className="btnSecondary calClearBtn"
              disabled={loading}
              onClick={cancelEditing}
            >
              {t('common.cancel')}
            </button>
          )}
          {!isEditingSchedule && hasFutureSelections && (
            <button
              type="button"
              className="btnSecondary calClearBtn"
              disabled={loading}
              onClick={clearAll}
            >
              {t('schedule.clearAll')}
            </button>
          )}
        </div>
          </>
        )}
      </section>

      {showIncompleteWarning && (
        <>
          <div className="calOverlay" onClick={() => setShowIncompleteWarning(false)} />
          <div className="scheduleWarningDialog" role="alertdialog" aria-labelledby="scheduleWarningTitle">
            <h3 id="scheduleWarningTitle">{t('schedule.warningTitle')}</h3>
            <p>
              {t('schedule.warningBody', { summary: incompleteSummary })}
            </p>
            <button
              type="button"
              className="btnPrimary"
              onClick={() => setShowIncompleteWarning(false)}
            >
              {t('schedule.continueScheduling')}
            </button>
          </div>
        </>
      )}

      {/* ── Bottom sheet ── */}
      {showScheduler && sheetTarget && (
        <>
          <div className="calOverlay" onClick={() => setSheetTarget(null)} />
          <div className="calBottomSheet">
            <div className="calSheetHandle" />

            {sheetTarget.kind === 'single' ? (
              <p className="calSheetDate">{fullDate(sheetTarget.date)}</p>
            ) : (
              <div className="calSheetRangeInfo">
                <p className="calSheetDate" style={{ margin: 0 }}>
                  {shortDate(sheetTarget.from)} → {shortDate(sheetTarget.to)}
                </p>
                <span className="calSheetRangeBadge">{t('schedule.daysBadge', { count: sheetTarget.dates.length })}</span>
              </div>
            )}

            {N > 1 && (
              <p className="caption" style={{ textAlign: 'center', marginBottom: 14, marginTop: -6 }}>
                {t('schedule.maxSets', { count: N })}
              </p>
            )}

            {/* Meal qty rows */}
            <div className="calSheetMealRows">
              {(() => {
                const dates = sheetTarget.kind === 'single' ? [sheetTarget.date] : sheetTarget.dates;
                const qty = sheetTarget.kind === 'single'
                  ? getRow(sheetTarget.date).lunchQty
                  : Math.min(...sheetTarget.dates.map(d => getRow(d).lunchQty));
                return (
                  <div className="calSheetMealRow">
                    <div className="calSheetMealInfo">
                      <span className="calSheetMealEmoji">🌞</span>
                      <div>
                        <span className="calSheetMealName">{t('common.lunch')}</span>
                        <span className="calSheetMealSub">
                          {qty > 0
                            ? t(qty > 1 ? 'schedule.setsLeftPlural' : 'schedule.setsLeft', {
                                qty,
                                left: poolLeft,
                              })
                            : t('schedule.creditsLeft', { count: poolLeft })}
                        </span>
                      </div>
                    </div>
                    <div className="calSheetQtyControl">
                      <button
                        type="button"
                        className="calSheetQtyBtn"
                        disabled={qty <= 0}
                        onClick={() => setQty(dates, qty - 1, null)}
                      >−</button>
                      <span className={`calSheetQtyValue${qty > 0 ? ' active' : ''}`}>{qty}</span>
                      <button
                        type="button"
                        className="calSheetQtyBtn"
                        disabled={qty >= maxLunchQty}
                        onClick={() => setQty(dates, qty + 1, null)}
                      >+</button>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const dates = sheetTarget.kind === 'single' ? [sheetTarget.date] : sheetTarget.dates;
                const qty = sheetTarget.kind === 'single'
                  ? getRow(sheetTarget.date).dinnerQty
                  : Math.min(...sheetTarget.dates.map(d => getRow(d).dinnerQty));
                return (
                  <div className="calSheetMealRow">
                    <div className="calSheetMealInfo">
                      <span className="calSheetMealEmoji">🌙</span>
                      <div>
                        <span className="calSheetMealName">{t('common.dinner')}</span>
                        <span className="calSheetMealSub">
                          {qty > 0
                            ? t(qty > 1 ? 'schedule.setsLeftPlural' : 'schedule.setsLeft', {
                                qty,
                                left: poolLeft,
                              })
                            : t('schedule.creditsLeft', { count: poolLeft })}
                        </span>
                      </div>
                    </div>
                    <div className="calSheetQtyControl">
                      <button
                        type="button"
                        className="calSheetQtyBtn"
                        disabled={qty <= 0}
                        onClick={() => setQty(dates, null, qty - 1)}
                      >−</button>
                      <span className={`calSheetQtyValue${qty > 0 ? ' active' : ''}`}>{qty}</span>
                      <button
                        type="button"
                        className="calSheetQtyBtn"
                        disabled={qty >= maxDinnerQty}
                        onClick={() => setQty(dates, null, qty + 1)}
                      >+</button>
                    </div>
                  </div>
                );
              })()}
            </div>

            <button
              type="button"
              className="btnPrimary"
              onClick={() => setSheetTarget(null)}
              style={{ marginTop: 16 }}
            >
              {t('common.done')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
