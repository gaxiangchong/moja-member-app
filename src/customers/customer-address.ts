/** Pure rules for a member's saved addresses, kept apart from the database so they can be tested. */

export const MAX_ADDRESSES_PER_MEMBER = 10;

export type AddressInput = {
  label?: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
};

export class AddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressError';
  }
}

const tidy = (v: unknown) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();

/** Checks and tidies what the member typed. Throws a message fit to show them. */
export function validateAddressInput(raw: unknown): AddressInput {
  const o =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const recipientName = tidy(o.recipientName);
  if (!recipientName) throw new AddressError('Enter the recipient name.');
  const phoneRaw = tidy(o.phone);
  const digits = phoneRaw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new AddressError('Enter a valid phone number.');
  }
  const line1 = tidy(o.line1);
  if (line1.length < 5) {
    throw new AddressError(
      'Enter the street address (unit / house no., street, area).',
    );
  }
  const postcode = tidy(o.postcode);
  if (!/^\d{5}$/.test(postcode)) {
    throw new AddressError('Enter a 5-digit postcode.');
  }
  const city = tidy(o.city);
  if (!city) throw new AddressError('Enter the city.');
  const state = tidy(o.state);
  if (!state) throw new AddressError('Choose the state.');
  const label = tidy(o.label);
  return {
    label: label ? label.slice(0, 40) : null,
    recipientName: recipientName.slice(0, 120),
    phone: (phoneRaw.startsWith('+') ? `+${digits}` : digits).slice(0, 32),
    line1: line1.slice(0, 300),
    city: city.slice(0, 80),
    state: state.slice(0, 60),
    postcode,
  };
}

/** The one-line address stored on an order and shown to staff. */
export function composeAddress(a: {
  line1: string;
  city: string;
  state: string;
  postcode: string;
}): string {
  return `${a.line1}, ${a.postcode} ${a.city}, ${a.state}`;
}
