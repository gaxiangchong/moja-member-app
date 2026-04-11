export function envFlagTrue(value: string | undefined): boolean {
  const s = (value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}
