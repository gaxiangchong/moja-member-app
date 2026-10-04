import type { SavedAddressInput } from '../api';

export const MY_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Kuala Lumpur',
  'Labuan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Putrajaya',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
];

/** Why an address can't be saved yet, or null when it can. */
export function addressFormError(v: SavedAddressInput): string | null {
  if (!v.recipientName.trim()) return 'Enter the recipient name.';
  const digits = v.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'Enter a valid phone number.';
  if (v.line1.trim().length < 5) return 'Enter the street address (unit / house no., street, area).';
  if (!/^\d{5}$/.test(v.postcode.trim())) return 'Enter a 5-digit postcode.';
  if (!v.city.trim()) return 'Enter the city.';
  if (!v.state) return 'Choose the state.';
  return null;
}
