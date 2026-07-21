/**
 * Days (0..365) until the customer's next birthday, computed in UTC.
 * Returns null when no birthday is recorded. 0 = birthday is today.
 */
export function daysUntilBirthdayUtc(birthday: Date | null): number | null {
  if (!birthday) return null;
  const now = new Date();
  const m = birthday.getUTCMonth();
  const d = birthday.getUTCDate();
  const y = now.getUTCFullYear();
  let next = Date.UTC(y, m, d);
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (next < todayUtc) {
    next = Date.UTC(y + 1, m, d);
  }
  return Math.round((next - todayUtc) / (24 * 60 * 60 * 1000));
}
