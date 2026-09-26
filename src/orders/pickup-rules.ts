/**
 * Shop pickup rules: lead time, per-slot cut-off, capacity, store hours,
 * and closed days. Pure functions — the service loads settings and counts.
 */

export const SHOP_TIME_ZONE = 'Asia/Kuala_Lumpur';

export type PickupSlotConfig = {
  /** Slot start, 24h HH:mm. Also the id stored on the order. */
  start: string;
  label: string;
  /** 0 = Sunday … 6 = Saturday. The slot is offered only on these days. */
  weekdays: number[];
  /** Orders must be placed at least this many minutes before the slot starts. */
  leadMinutes: number;
  /**
   * Clock time HH:mm on the pickup day after which the slot closes.
   * Null means the lead time is the only cut-off.
   */
  cutoffTime: string | null;
  /** Max orders in this slot on one day. Null means no cap. */
  capacity: number | null;
};

export type ShopPickupRules = {
  timeZone: string;
  /** Store opens, HH:mm. In-store orders and slot starts must fall inside. */
  openTime: string;
  /** Store closes, HH:mm. Exclusive: a slot may not start at this time. */
  closeTime: string;
  /** 0 = Sunday … 6 = Saturday. The whole day is shut. */
  closedWeekdays: number[];
  /** Extra closures, yyyy-mm-dd in the shop timezone. */
  closedDates: string[];
  /** How far ahead a pickup date may be chosen. */
  maxAdvanceDays: number;
  slots: PickupSlotConfig[];
};

export const DEFAULT_PICKUP_RULES: ShopPickupRules = {
  timeZone: SHOP_TIME_ZONE,
  openTime: '10:00',
  closeTime: '18:00',
  closedWeekdays: [],
  closedDates: [],
  maxAdvanceDays: 30,
  slots: [
    {
      start: '11:00',
      label: '11am – 1pm',
      weekdays: [1, 2, 3, 4, 5, 6],
      leadMinutes: 120,
      cutoffTime: null,
      capacity: null,
    },
    {
      start: '14:00',
      label: '2pm – 4pm',
      weekdays: [1, 2, 3, 4, 5, 6],
      leadMinutes: 120,
      cutoffTime: null,
      capacity: null,
    },
    {
      start: '16:00',
      label: '4pm – 6pm',
      weekdays: [1, 2, 3, 4, 5, 6],
      leadMinutes: 120,
      cutoffTime: null,
      capacity: null,
    },
    {
      start: '10:00',
      label: '10am – 12:30pm',
      weekdays: [0],
      leadMinutes: 120,
      cutoffTime: null,
      capacity: null,
    },
  ],
};

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class PickupRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PickupRulesError';
  }
}

export type PickupSlotOffer = {
  start: string;
  label: string;
  available: boolean;
  reason: string | null;
  /** Null when the slot has no cap. */
  remaining: number | null;
};

export type PickupDayQuote = {
  date: string;
  today: string;
  maxDate: string;
  timeZone: string;
  openTime: string;
  closeTime: string;
  maxAdvanceDays: number;
  closed: boolean;
  closedReason: string | null;
  storeOpen: boolean;
  storeClosedReason: string | null;
  leadTimeMessage: string | null;
  slots: PickupSlotOffer[];
};

export function normalizePickupRules(input: unknown): ShopPickupRules {
  const raw = (input ?? {}) as Partial<ShopPickupRules>;
  const timeZone = String(raw.timeZone ?? DEFAULT_PICKUP_RULES.timeZone).trim();
  assertTimeZone(timeZone);
  const openTime = requireHhmm(raw.openTime, 'openTime');
  const closeTime = requireHhmm(raw.closeTime, 'closeTime');
  if (minutesOf(openTime) >= minutesOf(closeTime)) {
    throw new PickupRulesError(
      'Store opening time must be before closing time.',
    );
  }
  const closedWeekdays = uniqueWeekdays(raw.closedWeekdays, 'closedWeekdays');
  const closedDates = uniqueDates(raw.closedDates);
  const maxRaw = Number(raw.maxAdvanceDays);
  const maxAdvanceDays =
    Number.isFinite(maxRaw) && maxRaw >= 1
      ? Math.min(Math.floor(maxRaw), 90)
      : DEFAULT_PICKUP_RULES.maxAdvanceDays;
  if (!Array.isArray(raw.slots) || raw.slots.length === 0) {
    throw new PickupRulesError('Add at least one pickup slot.');
  }
  if (raw.slots.length > 12) {
    throw new PickupRulesError('At most 12 pickup slots.');
  }
  const seen = new Set<string>();
  const slots = raw.slots.map((slot, index) =>
    normalizeSlot(slot, index, openTime, closeTime, seen),
  );
  return {
    timeZone,
    openTime,
    closeTime,
    closedWeekdays,
    closedDates,
    maxAdvanceDays,
    slots,
  };
}

export function evaluatePickupDay(input: {
  rules: ShopPickupRules;
  date: string;
  now: Date;
  bookedBySlot?: Record<string, number>;
}): PickupDayQuote {
  const { rules, date, now } = input;
  const booked = input.bookedBySlot ?? {};
  const today = zonedParts(now, rules.timeZone).ymd;
  const maxDate = addDaysYmd(today, rules.maxAdvanceDays);
  const store = evaluateStoreNow(rules, now);
  const base = {
    date,
    today,
    maxDate,
    timeZone: rules.timeZone,
    openTime: rules.openTime,
    closeTime: rules.closeTime,
    maxAdvanceDays: rules.maxAdvanceDays,
    storeOpen: store.open,
    storeClosedReason: store.reason,
  };

  if (!YMD.test(date)) {
    return {
      ...base,
      closed: true,
      closedReason: 'Choose a pickup date.',
      leadTimeMessage: null,
      slots: [],
    };
  }

  const weekday = weekdayOfYmd(date);
  if (date < today) {
    return {
      ...base,
      closed: true,
      closedReason: 'That date has already passed.',
      leadTimeMessage: null,
      slots: [],
    };
  }
  if (date > maxDate) {
    return {
      ...base,
      closed: true,
      closedReason: `Pickup can be scheduled up to ${rules.maxAdvanceDays} days ahead.`,
      leadTimeMessage: null,
      slots: [],
    };
  }
  if (
    rules.closedDates.includes(date) ||
    rules.closedWeekdays.includes(weekday)
  ) {
    const why = rules.closedDates.includes(date)
      ? 'The store is closed on this date.'
      : `The store is closed on ${WEEKDAY_NAMES[weekday]}s.`;
    return {
      ...base,
      closed: true,
      closedReason: why,
      leadTimeMessage: null,
      slots: [],
    };
  }

  const offered = rules.slots.filter((slot) => slot.weekdays.includes(weekday));
  const slots = offered.map((slot) =>
    offerSlot(rules, slot, date, now, booked[slot.start] ?? 0),
  );
  const leads = offered
    .map((slot) => slot.leadMinutes)
    .filter((minutes) => minutes > 0);
  const leadTimeMessage =
    leads.length === 0
      ? null
      : `Order at least ${formatLead(Math.min(...leads))} before your pickup time.`;

  return {
    ...base,
    closed: false,
    closedReason: null,
    leadTimeMessage,
    slots,
  };
}

export function evaluateStoreNow(
  rules: ShopPickupRules,
  now: Date,
): { open: boolean; reason: string | null; today: string } {
  const parts = zonedParts(now, rules.timeZone);
  if (
    rules.closedDates.includes(parts.ymd) ||
    rules.closedWeekdays.includes(parts.weekday)
  ) {
    const why = rules.closedDates.includes(parts.ymd)
      ? 'The store is closed today.'
      : `The store is closed on ${WEEKDAY_NAMES[parts.weekday]}s.`;
    return { open: false, reason: why, today: parts.ymd };
  }
  const open = minutesOf(rules.openTime);
  const close = minutesOf(rules.closeTime);
  if (parts.minutes < open || parts.minutes >= close) {
    return {
      open: false,
      reason: `In-store orders are accepted between ${formatClock(rules.openTime)} and ${formatClock(rules.closeTime)}.`,
      today: parts.ymd,
    };
  }
  return { open: true, reason: null, today: parts.ymd };
}

function offerSlot(
  rules: ShopPickupRules,
  slot: PickupSlotConfig,
  date: string,
  now: Date,
  booked: number,
): PickupSlotOffer {
  const startAt = zonedWallToUtc(date, slot.start, rules.timeZone);
  const remaining =
    slot.capacity == null ? null : Math.max(0, slot.capacity - booked);
  const unavailable = (reason: string): PickupSlotOffer => ({
    start: slot.start,
    label: slot.label,
    available: false,
    reason,
    remaining,
  });

  if (now.getTime() >= startAt.getTime()) {
    return unavailable('This pickup time has already started.');
  }
  if (slot.cutoffTime) {
    const cutoffAt = zonedWallToUtc(date, slot.cutoffTime, rules.timeZone);
    if (now.getTime() >= cutoffAt.getTime()) {
      return unavailable(
        `Orders for this slot close at ${formatClock(slot.cutoffTime)}.`,
      );
    }
  }
  if (slot.leadMinutes > 0) {
    const latest = startAt.getTime() - slot.leadMinutes * 60_000;
    if (now.getTime() > latest) {
      return unavailable(
        `Order at least ${formatLead(slot.leadMinutes)} before this pickup time.`,
      );
    }
  }
  if (slot.capacity != null && booked >= slot.capacity) {
    return unavailable('This slot is full.');
  }
  return {
    start: slot.start,
    label: slot.label,
    available: true,
    reason: null,
    remaining,
  };
}

function normalizeSlot(
  input: unknown,
  index: number,
  openTime: string,
  closeTime: string,
  seen: Set<string>,
): PickupSlotConfig {
  const raw = (input ?? {}) as Partial<PickupSlotConfig>;
  const labelAt = `Slot ${index + 1}`;
  const start = requireHhmm(raw.start, `${labelAt} start`);
  if (seen.has(start)) {
    throw new PickupRulesError(`${labelAt} repeats ${start}.`);
  }
  seen.add(start);
  if (
    minutesOf(start) < minutesOf(openTime) ||
    minutesOf(start) >= minutesOf(closeTime)
  ) {
    throw new PickupRulesError(
      `${labelAt} (${start}) is outside store hours ${openTime}–${closeTime}.`,
    );
  }
  const label = String(raw.label ?? '').trim();
  if (!label || label.length > 80) {
    throw new PickupRulesError(`${labelAt} needs a label.`);
  }
  const weekdays = uniqueWeekdays(raw.weekdays, `${labelAt} weekdays`);
  if (weekdays.length === 0) {
    throw new PickupRulesError(
      `${labelAt} must be offered on at least one day.`,
    );
  }
  const leadRaw = Number(raw.leadMinutes);
  if (!Number.isFinite(leadRaw) || leadRaw < 0 || leadRaw > 24 * 60) {
    throw new PickupRulesError(
      `${labelAt} lead time must be between 0 and 1440 minutes.`,
    );
  }
  const cutoffRaw = raw.cutoffTime;
  const cutoffTime =
    cutoffRaw == null || String(cutoffRaw).trim() === ''
      ? null
      : requireHhmm(cutoffRaw, `${labelAt} cut-off`);
  let capacity: number | null = null;
  if (raw.capacity != null && String(raw.capacity).trim() !== '') {
    const cap = Number(raw.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) {
      throw new PickupRulesError(
        `${labelAt} capacity must be a whole number from 1 to 500, or empty for no cap.`,
      );
    }
    capacity = cap;
  }
  return {
    start,
    label,
    weekdays,
    leadMinutes: Math.floor(leadRaw),
    cutoffTime,
    capacity,
  };
}

function uniqueWeekdays(input: unknown, label: string): number[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new PickupRulesError(`${label} must be a list of weekdays.`);
  }
  const days = new Set<number>();
  for (const value of input) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      throw new PickupRulesError(
        `${label} must use 0 (Sunday) through 6 (Saturday).`,
      );
    }
    days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

function uniqueDates(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new PickupRulesError(
      'closedDates must be a list of yyyy-mm-dd dates.',
    );
  }
  const dates = new Set<string>();
  for (const value of input) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    if (!YMD.test(text)) {
      throw new PickupRulesError(`Closed date "${text}" must be yyyy-mm-dd.`);
    }
    dates.add(text);
  }
  return [...dates].sort();
}

function requireHhmm(value: unknown, label: string): string {
  const textSource =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  let text = textSource.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) text = text.slice(0, 5);
  if (!HHMM.test(text)) {
    throw new PickupRulesError(`${label} must be HH:mm.`);
  }
  return text;
}

function assertTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new PickupRulesError(`Unknown timezone "${timeZone}".`);
  }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function formatClock(hhmm: string): string {
  const [hour, minute] = hhmm.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = String(minute).padStart(2, '0');
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatLead(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(
  instant: Date,
  timeZone: string,
): { ymd: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: hour * 60 + minute,
  };
}

/** Wall-clock time in `timeZone` as a UTC instant. */
export function zonedWallToUtc(
  ymd: string,
  hhmm: string,
  timeZone: string,
): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let instant = utcGuess;
  for (let i = 0; i < 2; i += 1) {
    instant = utcGuess - zoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}
