/** Minimum calendar days before pickup for kitchen prep. */
export const BENTO_MIN_SCHEDULE_LEAD_DAYS = 1;

/**
 * Daily cutoff hour (0–23) in {@link BENTO_SCHEDULE_TIMEZONE}. Once the local
 * time passes this hour, the nearest lead day is no longer bookable and the
 * earliest schedulable date rolls forward by one. With a 1-day lead and an
 * 18:00 cutoff this gives "schedule for tomorrow only if you book before 6pm
 * today".
 */
export const BENTO_SCHEDULE_CUTOFF_HOUR = 18;

/** Timezone the lead/cutoff math is evaluated in (kitchen local time). */
export const BENTO_SCHEDULE_TIMEZONE = 'Asia/Kuala_Lumpur';
