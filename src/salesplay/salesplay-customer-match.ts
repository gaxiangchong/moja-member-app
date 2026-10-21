import parsePhoneNumberFromString from 'libphonenumber-js';

/**
 * Every E.164 form a phone written on a SalesPlay receipt could match.
 *
 * Cashiers type numbers however they like ("012-345 6789", "60123456789",
 * "+60 12-345 6789"), and our pushed `customer_code` is the E.164 digits
 * without "+". A plain `"+" + digits` turned local numbers into "+0123…",
 * which never matched a member, so the receipt stayed unlinked.
 */
export function phoneCandidates(
  raw: string | null | undefined,
  defaultRegion = 'MY',
): string[] {
  const trimmed = (raw ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return [];

  const out = new Set<string>();
  const add = (input: string, region?: string) => {
    const parsed = parsePhoneNumberFromString(input, region as never);
    if (parsed?.isValid()) out.add(parsed.number);
  };

  add(trimmed, defaultRegion); // as typed, in the shop's region
  add(`+${digits}`); // already includes a country code (our customer_code)
  if (defaultRegion !== 'MY') add(trimmed, 'MY');
  return [...out];
}
