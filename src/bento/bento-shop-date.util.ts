/** Calendar day (yyyy-mm-dd) in the shop timezone (default Malaysia). */
export function shopCalendarYmd(
  ref = new Date(),
  timeZone = 'Asia/Kuala_Lumpur',
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !mo || !d) return ref.toISOString().slice(0, 10);
  return `${y}-${mo}-${d}`;
}
