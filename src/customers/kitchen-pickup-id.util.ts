/** Kitchen label ID: first email letter + last 4 phone digits (e.g. J5432). */
export function buildKitchenPickupId(
  email: string | null | undefined,
  phoneE164: string,
): string {
  const trimmedEmail = email?.trim() ?? '';
  const letter = (trimmedEmail[0] ?? 'X').toUpperCase();
  const digits = phoneE164.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '0');
  return `${letter}${last4}`;
}
