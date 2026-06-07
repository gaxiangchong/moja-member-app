import { useEffect, useMemo, useState } from 'react';
import { scheduleBentoSubscription } from '../api';
import { isPickupDateLocked, PICKUP_LOCK_POLICY } from '../lib/pickupLock';
import {
  addDaysUtc,
  earliestSchedulableDateIso,
  formatDateOnly,
  isDateSchedulable,
  isSunday,
  parseDateOnly,
  schedulableWindowDates,
  todayUtc,
} from '../lib/dateUtils';
import { PickupReminderNotification } from './PickupReminderNotification';
import { PickupPackColorSummary } from './PickupPackColorSummary';
import { buildUpcomingPickupSummaries } from './pickupPackSummary';
import {
  allCreditsScheduled,
  unscheduledCreditSummary,
} from './scheduleCredits';
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

function monthLabel(y: number, m: number) {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-MY', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function shortDate(iso: string) {
  const d = parseDateOnly(iso);
  const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${D[d.getUTCDay()]} ${d.getUTCDate()} ${M[d.getUTCMonth()]}`;
}

function fullDate(iso: string) {
  const d = parseDateOnly(iso);
  const D = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${D[d.getUTCDay()]}, ${d.getUTCDate()} ${M[d.getUTCMonth()]}`;
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

/** Auto-fill eligible days with qty = min(maxQty, remaining credits). */
function buildAutoFill(
  windowDates: string[], allowLunch: boolean, allowDinner: boolean,
  totalLunch: number, totalDinner: number, maxQtyPerDay: number,
): DaySelection[] {
  const eligible = windowDates.filter(d => !isSunday(d) && isDateSchedulable(d));
  const result: DaySelection[] = [];
  let lL = totalLunch; let dL = totalDinner;
  for (const date of eligible) {
    if (lL <= 0 && dL <= 0) break;
    const lunchQty = allowLunch ? Math.min(maxQtyPerDay, lL) : 0;
    const dinnerQty = allowDinner ? Math.min(maxQtyPerDay, dL) : 0;
    if (lunchQty > 0 || dinnerQty > 0) {
      result.push({ date, lunchQty, dinnerQty });
      lL -= lunchQty; dL -= dinnerQty;
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
      if (d.includesLunch)  ex.lunchQty++;
      if (d.includesDinner) ex.dinnerQty++;
      map.set(d.deliveryDate, ex);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── component ──────────────────────────────────────────────────────────────

export function CalendarScheduler({ subscriptions, onScheduled, kitchenPickupId }: Props) {
  const N = subscriptions.length; // total sets

  // ── Aggregate across all subscriptions ──────────────────────────────────
  const totalLunch  = subscriptions.reduce((s, sub) => s + sub.lunchCredits, 0);
  const totalDinner = subscriptions.reduce((s, sub) => s + sub.dinnerCredits, 0);
  const allowLunch  = subscriptions.some(s => s.scheduling?.allowLunch  ?? s.mealOption !== 'DINNER');
  const allowDinner = subscriptions.some(s => s.scheduling?.allowDinner ?? s.mealOption !== 'LUNCH');

  const [showScheduler, setShowScheduler] = useState(
    () => !allCreditsScheduled(subscriptions, allowLunch, allowDinner),
  );

  const combinedWindow = useMemo(() => {
    const earlyDates = subscriptions.map(s => s.scheduling?.earliestDate ?? earliestSchedulableDateIso());
    const endDates   = subscriptions.map(s =>
      s.scheduling?.windowEndDate ?? s.endDate ?? formatDateOnly(addDaysUtc(todayUtc(), 30)),
    );
    return {
      earliestDate:  [...earlyDates].sort()[0]!,
      windowEndDate: [...endDates].sort().reverse()[0]!,
    };
  }, [subscriptions]);

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
    return buildAutoFill(windowDates, allowLunch, allowDinner, totalLunch, totalDinner, N);
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

  useEffect(() => {
    const merged = mergeDeliveries(subscriptions);
    if (merged.length > 0 && !changedSinceSave) {
      setSelections(merged);
    }
  }, [subscriptions, changedSinceSave]);

  // ── Credit counters ──────────────────────────────────────────────────────
  const todayIso       = formatDateOnly(todayUtc());
  const lunchConsumed  = selections.filter(s => s.date <  todayIso).reduce((n, s) => n + s.lunchQty,  0);
  const dinnerConsumed = selections.filter(s => s.date <  todayIso).reduce((n, s) => n + s.dinnerQty, 0);
  const lunchUpcoming  = selections.filter(s => s.date >= todayIso).reduce((n, s) => n + s.lunchQty,  0);
  const dinnerUpcoming = selections.filter(s => s.date >= todayIso).reduce((n, s) => n + s.dinnerQty, 0);
  const lunchUnscheduled  = totalLunch  - lunchConsumed  - lunchUpcoming;
  const dinnerUnscheduled = totalDinner - dinnerConsumed - dinnerUpcoming;
  const anyUnscheduled = (allowLunch && lunchUnscheduled > 0) || (allowDinner && dinnerUnscheduled > 0);

  const anyNeedsSchedule = subscriptions.some(s => s.needsSchedule);
  const hasSavedSchedule = subscriptions.some((s) => s.deliveries.length > 0);
  const allMealsScheduled = !anyUnscheduled;
  const canShowNotification =
    allMealsScheduled && !showScheduler && (scheduleConfirmed || hasSavedSchedule);
  const incompleteSummary = unscheduledCreditSummary(
    totalLunch,
    totalDinner,
    lunchConsumed + lunchUpcoming,
    dinnerConsumed + dinnerUpcoming,
    allowLunch,
    allowDinner,
  );

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

  const isDayInteractive = (iso: string): boolean =>
    windowSet.has(iso) && !isSunday(iso) && !isPast(iso) && !isPickupDateLocked(iso) && isDateSchedulable(iso);

  const dayStatusLabel = (iso: string): string | null => {
    if (isSunday(iso)) return 'Closed';
    if (isPast(iso)) return 'Past';
    if (!windowSet.has(iso)) return 'Outside plan';
    if (!isDateSchedulable(iso)) return 'Too soon';
    if (isPickupDateLocked(iso)) return 'Confirmed';
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
        return {
          date,
          lunchQty:  lunchQty  !== null ? Math.max(0, lunchQty)  : cur.lunchQty,
          dinnerQty: dinnerQty !== null ? Math.max(0, dinnerQty) : cur.dinnerQty,
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
    if (!windowSet.has(iso) || isSunday(iso) || !isDateSchedulable(iso) || isPickupDateLocked(iso)) return;
    if (rangeStart === null) {
      setRangeStart(iso);
    } else if (rangeStart === iso) {
      setRangeStart(null);
      setSheetTarget({ kind: 'single', date: iso });
    } else {
      const from = rangeStart < iso ? rangeStart : iso;
      const to   = rangeStart < iso ? iso : rangeStart;
      const dates = windowDates.filter(d =>
        d >= from && d <= to && !isSunday(d) && isDateSchedulable(d) && !isPickupDateLocked(d),
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

        const dateMap = new Map<string, { includeLunch: boolean; includeDinner: boolean }>();
        myLunch.forEach(d => {
          const e = dateMap.get(d) ?? { includeLunch: false, includeDinner: false };
          e.includeLunch = true; dateMap.set(d, e);
        });
        myDinner.forEach(d => {
          const e = dateMap.get(d) ?? { includeLunch: false, includeDinner: false };
          e.includeDinner = true; dateMap.set(d, e);
        });

        const slots = [...dateMap.entries()]
          .map(([date, m]) => ({ date, ...m }))
          .filter(s => s.includeLunch || s.includeDinner);

        await scheduleBentoSubscription(sub.id, { slots });
      }

      setChangedSinceSave(false);
      onScheduled();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
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
  // Remaining credits available (excluding what this day already uses)
  const sheetLunchBase  = sheetRow ? lunchUpcoming  - sheetRow.lunchQty  : lunchUpcoming;
  const sheetDinnerBase = sheetRow ? dinnerUpcoming - sheetRow.dinnerQty : dinnerUpcoming;
  const maxLunchQty  = Math.min(N, Math.max(0, totalLunch  - lunchConsumed  - sheetLunchBase));
  const maxDinnerQty = Math.min(N, Math.max(0, totalDinner - dinnerConsumed - sheetDinnerBase));

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
            ? 'Pickup reminder'
            : isEditingSchedule
              ? 'Change pickup days'
              : 'Schedule'}
        </h2>
        {(isEditingSchedule || showScheduler) && (
          <p className="caption calLockPolicy">{PICKUP_LOCK_POLICY}</p>
        )}
        {isEditingSchedule && (
          <p className="caption" style={{ marginBottom: 12 }}>
            Update your pickup days below, then tap Confirm to save.
          </p>
        )}
        {!isEditingSchedule && showScheduler && anyUnscheduled && (
          <p className="caption" style={{ marginBottom: 12 }}>
            Schedule all purchased meals before continuing to your pickup reminder.
          </p>
        )}
        {N > 1 && showScheduler && (
          <p className="caption" style={{ marginBottom: 12 }}>
            {N} active plans · up to {N} sets per day
          </p>
        )}

        {canShowNotification && (
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
                <p className="pickupUpcomingTitle">Your upcoming pickups</p>
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
              Change pickup days
            </button>
          </div>
        )}

        {showScheduler && (
          <>
        {/* Credit summary */}
        <div className="calCreditsSummary">
          {allowLunch && (
            <div className="calCreditBlock">
              <span className="calCreditIcon">🌞</span>
              <div className="calCreditDetail">
                <span className="calCreditLabel">Lunch · {totalLunch} credits</span>
                <span className="calCreditNumbers">
                  {lunchConsumed  > 0 && <span className="calCreditUsed">{lunchConsumed} used</span>}
                  {lunchUpcoming  > 0 && <span className="calCreditUpcoming">{lunchUpcoming} upcoming</span>}
                  {lunchUnscheduled  > 0 && <span className="calCreditWarn">{lunchUnscheduled} unused ⚠️</span>}
                  {lunchUnscheduled <= 0 && lunchUpcoming > 0 && <span className="calCreditDone">all scheduled ✓</span>}
                  {lunchConsumed === 0 && lunchUpcoming === 0 && <span className="calCreditUpcoming">ready to schedule</span>}
                </span>
              </div>
            </div>
          )}
          {allowDinner && (
            <div className="calCreditBlock">
              <span className="calCreditIcon">🌙</span>
              <div className="calCreditDetail">
                <span className="calCreditLabel">Dinner · {totalDinner} credits</span>
                <span className="calCreditNumbers">
                  {dinnerConsumed  > 0 && <span className="calCreditUsed">{dinnerConsumed} used</span>}
                  {dinnerUpcoming  > 0 && <span className="calCreditUpcoming">{dinnerUpcoming} upcoming</span>}
                  {dinnerUnscheduled  > 0 && <span className="calCreditWarn">{dinnerUnscheduled} unused ⚠️</span>}
                  {dinnerUnscheduled <= 0 && dinnerUpcoming > 0 && <span className="calCreditDone">all scheduled ✓</span>}
                  {dinnerConsumed === 0 && dinnerUpcoming === 0 && <span className="calCreditUpcoming">ready to schedule</span>}
                </span>
              </div>
            </div>
          )}
        </div>

        {anyUnscheduled && (
          <div className="calUnschedWarn">
            You have unused meal credits — {viewMode === 'calendar' ? 'tap days below' : 'use the list below'} to assign them.
          </div>
        )}

        <div className="calViewToggle" role="tablist" aria-label="Schedule view">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            className={`calViewBtn${viewMode === 'calendar' ? ' active' : ''}`}
            onClick={() => { setViewMode('calendar'); setRangeStart(null); }}
          >
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`calViewBtn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => { setViewMode('list'); setRangeStart(null); setSheetTarget(null); }}
          >
            List
          </button>
        </div>

        {viewMode === 'calendar' ? (
          <>
        {/* Tap hint / range in-progress */}
        {rangeStart ? (
          <div className="calRangeHint">
            <span>📅 {shortDate(rangeStart)} — now tap the end date</span>
            <button type="button" className="calRangeCancel" onClick={() => setRangeStart(null)}>✕</button>
          </div>
        ) : (
          <p className="calTip">Tap once to start a range · tap same day again to edit just that day</p>
        )}

        {/* Month nav */}
        <div className="calMonthNav">
          <button type="button" className="calNavBtn" disabled={!canGoPrev} onClick={prevMonth}>‹</button>
          <span className="calMonthName">{monthLabel(viewYear, viewMonth)}</span>
          <button type="button" className="calNavBtn" disabled={!canGoNext} onClick={nextMonth}>›</button>
        </div>

        <div className="calDayHeaders">
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
            <span key={d} className="calDayHeader">{d}</span>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="calGrid">
          {cells.map((iso, idx) => {
            if (!iso) return <span key={`p${idx}`} className="calCell calPad" />;
            const inDisplay   = displaySet.has(iso);
            const inWindow    = windowSet.has(iso);
            const sun         = isSunday(iso);
            const past        = isPast(iso);
            const locked      = !past && isPickupDateLocked(iso);
            const row         = getRow(iso);
            const hasSel      = row.lunchQty > 0 || row.dinnerQty > 0;
            const totalQty    = row.lunchQty + row.dinnerQty;
            const isStart     = iso === rangeStart;
            const interactive = isDayInteractive(iso);
            const dayNum      = parseInt(iso.split('-')[2]!, 10);

            let stateClass = 'calOutside';
            if (inDisplay || inWindow) {
              if (sun)                             stateClass = 'calSunday';
              else if (past && hasSel)             stateClass = 'calConsumed';
              else if (past)                       stateClass = 'calPastEmpty';
              else if (isStart)                    stateClass = 'calRangeStart';
              else if (!isDateSchedulable(iso))    stateClass = 'calTooSoon';
              else if (locked && hasSel)           stateClass = 'calScheduledLocked';
              else if (locked)                     stateClass = 'calTooSoon';
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
              >
                <span className="calDayNum">{dayNum}</span>
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
            <p className="calTip">Pick lunch and dinner sets for each day — easier if you prefer a checklist over the calendar.</p>
            <ul className="calListView">
              {listDates.map((iso) => {
                const row = getRow(iso);
                const interactive = isDayInteractive(iso);
                const status = dayStatusLabel(iso);
                const hasSel = row.lunchQty > 0 || row.dinnerQty > 0;
                const rowLunchMax = Math.min(N, Math.max(0, totalLunch - lunchConsumed - lunchUpcoming + row.lunchQty));
                const rowDinnerMax = Math.min(N, Math.max(0, totalDinner - dinnerConsumed - dinnerUpcoming + row.dinnerQty));

                if (!interactive && !hasSel) return null;

                return (
                  <li
                    key={iso}
                    className={`calListRow${!interactive ? ' calListRowOff' : ''}${hasSel ? ' calListRowSelected' : ''}`}
                  >
                    <div className="calListDate">
                      <strong>{shortDate(iso)}</strong>
                      <span className="calListDateIso">{iso}</span>
                      {status && <span className="calListStatus">{status}</span>}
                    </div>
                    <div className="calListMeals">
                      {allowLunch && (
                        <div className="calListMeal">
                          <span className="calListMealLabel">🌞 Lunch</span>
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
                      )}
                      {allowDinner && (
                        <div className="calListMeal">
                          <span className="calListMealLabel">🌙 Dinner</span>
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
                      )}
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
                ? 'Saving…'
                : changedSinceSave
                  ? 'Save changes'
                  : `Confirm ${confirmDayCount} day${confirmDayCount === 1 ? '' : 's'}`}
            </button>
          )}
          {isEditingSchedule && (
            <button
              type="button"
              className="btnSecondary calClearBtn"
              disabled={loading}
              onClick={cancelEditing}
            >
              Cancel
            </button>
          )}
          {!isEditingSchedule && hasFutureSelections && (
            <button
              type="button"
              className="btnSecondary calClearBtn"
              disabled={loading}
              onClick={clearAll}
            >
              Clear all
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
            <h3 id="scheduleWarningTitle">Meals still unscheduled</h3>
            <p>
              You still have{' '}
              <strong>{incompleteSummary.join(' and ')}</strong>{' '}
              to assign. Please schedule every purchased meal before viewing your pickup reminder.
            </p>
            <button
              type="button"
              className="btnPrimary"
              onClick={() => setShowIncompleteWarning(false)}
            >
              Continue scheduling
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
                <span className="calSheetRangeBadge">{sheetTarget.dates.length} days</span>
              </div>
            )}

            {N > 1 && (
              <p className="caption" style={{ textAlign: 'center', marginBottom: 14, marginTop: -6 }}>
                Max {N} sets per day
              </p>
            )}

            {/* Meal qty rows */}
            <div className="calSheetMealRows">
              {allowLunch && (() => {
                const dates = sheetTarget.kind === 'single' ? [sheetTarget.date] : sheetTarget.dates;
                const qty = sheetTarget.kind === 'single'
                  ? getRow(sheetTarget.date).lunchQty
                  : Math.min(...sheetTarget.dates.map(d => getRow(d).lunchQty));
                return (
                  <div className="calSheetMealRow">
                    <div className="calSheetMealInfo">
                      <span className="calSheetMealEmoji">🌞</span>
                      <div>
                        <span className="calSheetMealName">Lunch</span>
                        <span className="calSheetMealSub">
                          {qty > 0
                            ? `${qty} set${qty > 1 ? 's' : ''} · ${Math.max(0, totalLunch - lunchConsumed - lunchUpcoming + (sheetTarget.kind === 'single' ? qty : 0))} left`
                            : `${Math.max(0, totalLunch - lunchConsumed - lunchUpcoming)} credits left`}
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

              {allowDinner && (() => {
                const dates = sheetTarget.kind === 'single' ? [sheetTarget.date] : sheetTarget.dates;
                const qty = sheetTarget.kind === 'single'
                  ? getRow(sheetTarget.date).dinnerQty
                  : Math.min(...sheetTarget.dates.map(d => getRow(d).dinnerQty));
                return (
                  <div className="calSheetMealRow">
                    <div className="calSheetMealInfo">
                      <span className="calSheetMealEmoji">🌙</span>
                      <div>
                        <span className="calSheetMealName">Dinner</span>
                        <span className="calSheetMealSub">
                          {qty > 0
                            ? `${qty} set${qty > 1 ? 's' : ''} · ${Math.max(0, totalDinner - dinnerConsumed - dinnerUpcoming + (sheetTarget.kind === 'single' ? qty : 0))} left`
                            : `${Math.max(0, totalDinner - dinnerConsumed - dinnerUpcoming)} credits left`}
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
              Done
            </button>
          </div>
        </>
      )}
    </>
  );
}
