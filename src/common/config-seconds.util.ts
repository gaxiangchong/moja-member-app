import type { ConfigService } from '@nestjs/config';

/**
 * Reads a duration in seconds from config as a real number.
 *
 * Env values arrive as strings, and jsonwebtoken treats a unit-less string
 * `expiresIn` ("604800") as MILLISECONDS — a 7-day setting silently became
 * ~10 minutes. Always pass the result of this to `expiresIn`.
 */
export function configSeconds(
  config: ConfigService,
  keys: string | string[],
  fallback: number,
): number {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const raw = config.get<string | number>(key);
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return fallback;
}
