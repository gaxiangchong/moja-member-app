/** Parses bento pickup scan / manual input to a 6-digit code. */
export function extractBentoPickupCodeFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  const labeled = trimmed.match(/^BENTO:\s*([0-9]{6})$/i);
  if (labeled) return labeled[1];
  if (/^[0-9]{6}$/.test(trimmed)) return trimmed;
  const embedded = trimmed.match(/BENTO:\s*([0-9]{6})/i);
  if (embedded) return embedded[1];
  return null;
}
