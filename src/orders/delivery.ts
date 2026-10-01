/**
 * Delivery orders. Moja Maison does not run its own couriers or price the
 * delivery in the app: the member either books their own courier to collect
 * from the shop, or asks Moja Maison on WhatsApp to arrange one. Either way the
 * delivery charge is settled outside the order total, and has to be paid before
 * delivery can be arranged.
 */

export type DeliveryArrangement = 'SELF' | 'MOJA';

/** Who books the courier. */
export const DELIVERY_ARRANGEMENTS: DeliveryArrangement[] = ['SELF', 'MOJA'];

export type DeliverySettings = {
  /** Members can choose Delivery at checkout. */
  enabled: boolean;
  /**
   * Moja Maison's WhatsApp number for delivery help: digits only, with country
   * code (e.g. 60123456789). Empty means "not set" — the WhatsApp button is hidden.
   */
  whatsappNumber: string;
};

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  enabled: true,
  whatsappNumber: '',
};

export class DeliverySettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliverySettingsError';
  }
}

/**
 * Digits only, with a country code. A Malaysian number typed locally
 * ("012-345 6789") gets 60 in place of the leading 0.
 */
export function normalizeWhatsappNumber(raw: unknown): string {
  if (raw == null) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;
  if (digits.length < 9 || digits.length > 15) {
    throw new DeliverySettingsError(
      'WhatsApp number must include the country code, e.g. 60123456789.',
    );
  }
  return digits;
}

export function normalizeDeliverySettings(raw: unknown): DeliverySettings {
  if (raw == null) return { ...DEFAULT_DELIVERY_SETTINGS };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DeliverySettingsError('Delivery settings must be an object.');
  }
  const o = raw as Record<string, unknown>;
  if (o.enabled !== undefined && typeof o.enabled !== 'boolean') {
    throw new DeliverySettingsError('"enabled" must be true or false.');
  }
  return {
    enabled: o.enabled ?? DEFAULT_DELIVERY_SETTINGS.enabled,
    whatsappNumber: normalizeWhatsappNumber(o.whatsappNumber),
  };
}

export type DeliveryDetails = {
  address: string;
  contactName: string;
  contactPhone: string;
  arrangement: DeliveryArrangement;
};

export class DeliveryDetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryDetailsError';
  }
}

/** Checks what the member typed and tidies it. Throws a message fit to show them. */
export function validateDeliveryDetails(raw: unknown): DeliveryDetails {
  if (!raw || typeof raw !== 'object') {
    throw new DeliveryDetailsError(
      'Enter the delivery address and who to contact.',
    );
  }
  const o = raw as Record<string, unknown>;
  const address = String(o.address ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (address.length < 10) {
    throw new DeliveryDetailsError(
      'Enter the full delivery address (unit, street, area and postcode).',
    );
  }
  const contactName = String(o.contactName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!contactName) {
    throw new DeliveryDetailsError('Enter the name of the person to contact.');
  }
  const phoneRaw = String(o.contactPhone ?? '').trim();
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    throw new DeliveryDetailsError('Enter a valid contact phone number.');
  }
  const contactPhone = phoneRaw.startsWith('+')
    ? `+${phoneDigits}`
    : phoneDigits;
  const arrangement = o.arrangement;
  if (arrangement !== 'SELF' && arrangement !== 'MOJA') {
    throw new DeliveryDetailsError(
      'Choose who arranges the delivery: you, or Moja Maison.',
    );
  }
  return {
    address: address.slice(0, 400),
    contactName: contactName.slice(0, 120),
    contactPhone: contactPhone.slice(0, 32),
    arrangement,
  };
}

/**
 * The plain-text lines shown for the order everywhere — kitchen queue, admin
 * orders, the member's Orders tab. Built on the server so what staff see
 * always matches what was stored.
 */
export function deliverySummaryLines(
  details: DeliveryDetails,
  scheduledDate: string | null,
  scheduledSlot: string | null,
): string[] {
  return [
    'Delivery',
    `Date: ${scheduledDate ?? '—'}`,
    `Time: ${scheduledSlot ?? '—'}`,
    `Deliver to: ${details.address}`,
    `Contact: ${details.contactName} · ${details.contactPhone}`,
    details.arrangement === 'SELF'
      ? 'Delivery: customer books their own courier to collect from the shop'
      : 'Delivery: Moja Maison to help arrange a courier (via WhatsApp)',
    'Delivery charge is paid separately and must be settled before delivery is arranged',
  ];
}
